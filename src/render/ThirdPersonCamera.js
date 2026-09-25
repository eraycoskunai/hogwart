/**
 * @file ThirdPersonCamera — over-the-shoulder follow camera with
 * collision (never enters walls), aim mode, shoulder swap, lock-on,
 * trauma-based shake and blending back from cinematics.
 */
import * as THREE from 'three';
import { CAMERA } from '../data/camera.js';

/**
 * @typedef {Object} LockTarget
 * @property {string} name
 * @property {(out:THREE.Vector3) => THREE.Vector3} getLockPoint
 * @property {() => boolean} isLockable
 * @property {import('../physics/Collider.js').Collider} [collider] ignored by line-of-sight checks
 */

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };

/** Smooth exponential approach factor. */
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Deterministic pseudo-noise for camera shake. */
function shakeNoise(t, seed) {
  return (
    Math.sin(t * 1.0 + seed) * 0.5 +
    Math.sin(t * 2.3 + seed * 1.7) * 0.3 +
    Math.sin(t * 4.1 + seed * 3.1) * 0.2
  );
}

export class ThirdPersonCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physics
   * @param {import('../core/Settings.js').Settings} settings
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(camera, physics, settings, bus) {
    this.camera = camera;
    this.physics = physics;
    this.settings = settings;
    this.bus = bus;

    this.yaw = 0;
    this.pitch = CAMERA.defaultPitch;
    /** +1 right shoulder, -1 left shoulder */
    this.shoulderSide = 1;
    this._shoulderBlend = 1;
    this.aiming = false;
    this.aimBlend = 0;
    this.sprinting = false;
    this.crouchBlend = 0;

    this.pivot = new THREE.Vector3();
    this._pivotInit = false;
    this.distance = CAMERA.distance;
    this._fov = settings.get('fov');

    /** @type {LockTarget|null} */
    this.lockTarget = null;
    this._losTimer = 0;
    this._switchAccum = 0;
    this._switchCooldown = 0;
    this._lockPoint = new THREE.Vector3();

    this.trauma = 0;
    this._shakeTime = 0;

    this._blend = null; // {pos, quat, fov, t, duration}
    this._probeOffsets = [];
    for (let i = 0; i < CAMERA.collisionProbes; i++) {
      const a = (i / CAMERA.collisionProbes) * Math.PI * 2;
      this._probeOffsets.push([Math.cos(a), Math.sin(a)]);
    }
    this._filter = { cameraOnly: true, dynamic: false };
    this._losFilter = { cameraOnly: true, dynamic: false, ignore: null };
    this._ignore = new Set();
    this.collisionDistance = CAMERA.distance;
  }

  /** Snap behind a yaw instantly (spawn / teleport). */
  snapTo(feet, yaw, pitch = CAMERA.defaultPitch) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.pivot.set(feet.x, feet.y + CAMERA.pivotHeight, feet.z);
    this._pivotInit = true;
    this.distance = CAMERA.distance;
  }

  // ------------------------------------------------------------------ input

  /**
   * Apply look input (called every rendered frame).
   * @param {import('../core/Input.js').Input} input
   * @param {number} dt real frame delta
   * @param {LockTarget[]} targets candidates for lock switching
   * @param {THREE.Vector3} playerPos
   */
  handleLook(input, dt, targets, playerPos) {
    const sensMouse = CAMERA.mouseRadPerPixel * this.settings.get('mouseSensitivity');
    const sensStick = CAMERA.stickRadPerSecond * this.settings.get('gamepadSensitivity');
    const aimScale = THREE.MathUtils.lerp(1, CAMERA.aimSensitivityScale, this.aimBlend);
    const invert = this.settings.get('invertY') ? -1 : 1;
    const dx = input.mouseDelta.x * sensMouse + input.lookStick.x * sensStick * dt;
    const dy = input.mouseDelta.y * sensMouse + input.lookStick.y * sensStick * dt;

    this._switchCooldown = Math.max(0, this._switchCooldown - dt);
    if (this.lockTarget) {
      // Look input flicks between targets instead of rotating freely.
      this._switchAccum += input.mouseDelta.x + (Math.abs(input.lookStick.x) > CAMERA.lockOn.switchStick ? Math.sign(input.lookStick.x) * CAMERA.lockOn.switchPixels : 0);
      this._switchAccum *= Math.exp(-6 * dt);
      if (Math.abs(this._switchAccum) > CAMERA.lockOn.switchPixels && this._switchCooldown <= 0) {
        this.switchLock(targets, Math.sign(this._switchAccum), playerPos);
        this._switchAccum = 0;
        this._switchCooldown = CAMERA.lockOn.switchCooldown;
      }
      return;
    }
    this.yaw -= dx * aimScale;
    this.pitch -= dy * aimScale * invert;
    this.pitch = THREE.MathUtils.clamp(this.pitch, CAMERA.pitchMin, CAMERA.pitchMax);
    this.yaw = THREE.MathUtils.euclideanModulo(this.yaw + Math.PI, Math.PI * 2) - Math.PI;
  }

  swapShoulder() {
    this.shoulderSide *= -1;
  }

  // ---------------------------------------------------------------- lock-on

  /**
   * Toggle lock-on: acquire the best target in view or release.
   * @param {LockTarget[]} targets
   * @param {THREE.Vector3} playerPos
   * @returns {boolean} locked after the call
   */
  toggleLock(targets, playerPos) {
    if (this.lockTarget) {
      this.releaseLock();
      return false;
    }
    const best = this._findTarget(targets, playerPos, null, 0);
    if (best) {
      this.lockTarget = best;
      this._losTimer = 0;
      this.bus.emit('camera:lock', { target: best });
    }
    return !!best;
  }

  releaseLock() {
    if (!this.lockTarget) return;
    this.lockTarget = null;
    this.bus.emit('camera:lock', { target: null });
  }

  /**
   * @param {LockTarget[]} targets
   * @param {number} side -1 left / +1 right
   * @param {THREE.Vector3} playerPos
   */
  switchLock(targets, side, playerPos) {
    const next = this._findTarget(targets, playerPos, this.lockTarget, side);
    if (next) {
      this.lockTarget = next;
      this._losTimer = 0;
      this.bus.emit('camera:lock', { target: next });
    }
  }

  /**
   * @param {THREE.Vector3} from
   * @param {THREE.Vector3} to
   * @param {LockTarget} target its own collider is ignored
   */
  _hasLineOfSight(from, to, target) {
    _dir.subVectors(to, from);
    const len = _dir.length();
    if (len < 1e-4) return true;
    _dir.divideScalar(len);
    this._losFilter.ignore = target?.collider ? this._ignoreSet(target.collider.id) : null;
    const hit = this.physics.raycast(from, _dir, len, this._losFilter, _hit);
    return !hit;
  }

  _ignoreSet(id) {
    this._ignore.clear();
    this._ignore.add(id);
    return this._ignore;
  }

  /**
   * Choose a target. With `current` + `side`, pick the nearest target to the
   * given side of the current one in screen space.
   */
  _findTarget(targets, playerPos, current, side) {
    const cam = this.camera;
    cam.getWorldDirection(_fwd);
    let best = null;
    let bestScore = Infinity;
    let curScreenX = 0;
    if (current) {
      current.getLockPoint(_tmp);
      curScreenX = _tmp.project(cam).x;
    }
    for (const t of targets) {
      if (t === current || !t.isLockable()) continue;
      t.getLockPoint(_tmp);
      const dist = _tmp.distanceTo(playerPos);
      if (dist > CAMERA.lockOn.range) continue;
      _dir.subVectors(_tmp, cam.position).normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(_dir.dot(_fwd), -1, 1));
      if (!current && angle > CAMERA.lockOn.maxAngle) continue;
      if (!this._hasLineOfSight(cam.position, _tmp, t)) continue;
      let score;
      if (current) {
        const sx = _tmp2.copy(_tmp).project(cam).x;
        const dxs = (sx - curScreenX) * side;
        if (dxs <= 0.001) continue;
        score = dxs + dist / CAMERA.lockOn.range * 0.2;
      } else {
        score = angle * 2 + dist / CAMERA.lockOn.range;
      }
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  /** @param {THREE.Vector3} out */
  getLockPoint(out) {
    return this.lockTarget ? out.copy(this._lockPoint) : null;
  }

  // ------------------------------------------------------------------ shake

  /** @param {number} amount 0..1 */
  addTrauma(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  // ---------------------------------------------------------------- update

  /**
   * Start blending from the camera's current transform back to gameplay.
   * @param {number} duration
   */
  blendFromCurrent(duration) {
    this._blend = {
      pos: this.camera.position.clone(),
      quat: this.camera.quaternion.clone(),
      fov: this.camera.fov,
      t: 0,
      duration,
    };
  }

  /**
   * Position the camera for this frame.
   * @param {number} dt real frame delta
   * @param {THREE.Vector3} feet interpolated player feet position
   * @param {{crouching:boolean, speed:number}} state
   */
  update(dt, feet, state) {
    const C = CAMERA;
    this._shoulderBlend += (this.shoulderSide - this._shoulderBlend) * damp(C.shoulderSwapSpeed, dt);
    this.aimBlend += ((this.aiming ? 1 : 0) - this.aimBlend) * damp(C.aimBlendSpeed, dt);
    this.crouchBlend += ((state.crouching ? 1 : 0) - this.crouchBlend) * damp(10, dt);

    // Pivot follows the player: fast horizontally, softer vertically (steps, landings).
    const pivotH = THREE.MathUtils.lerp(C.pivotHeight, C.crouchPivotHeight, this.crouchBlend);
    _tmp.set(feet.x, feet.y + pivotH, feet.z);
    if (!this._pivotInit) {
      this.pivot.copy(_tmp);
      this._pivotInit = true;
    }
    const hk = damp(C.horizontalFollow, dt);
    const vk = damp(C.verticalFollow, dt);
    this.pivot.x += (_tmp.x - this.pivot.x) * hk;
    this.pivot.z += (_tmp.z - this.pivot.z) * hk;
    this.pivot.y += (_tmp.y - this.pivot.y) * vk;

    // Lock-on steering.
    if (this.lockTarget) this._updateLock(dt, feet);

    // Orientation vectors.
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _fwd.set(-sy * cp, sp, -cy * cp);
    _right.set(cy, 0, -sy);
    _up.crossVectors(_right, _fwd).normalize();

    const shoulder = THREE.MathUtils.lerp(C.shoulderOffset, C.aimShoulderOffset, this.aimBlend) * this._shoulderBlend;
    const desiredDist = THREE.MathUtils.lerp(C.distance, C.aimDistance, this.aimBlend);

    // 1) pivot → shoulder point (so the offset never pokes through a wall).
    const origin = _origin.copy(this.pivot).addScaledVector(_up, C.pivotUp);
    _dir.copy(_right).multiplyScalar(Math.sign(shoulder) || 1);
    const sideLen = Math.abs(shoulder);
    let side = sideLen;
    const sideHit = this.physics.raycast(origin, _dir, sideLen + C.collisionRadius, this._filter, _hit);
    if (sideHit) side = Math.max(0, sideHit.distance - C.collisionRadius);
    const shoulderPt = _tmp2.copy(origin).addScaledVector(_dir, side);

    // 2) shoulder point → back along the view direction with a probe ring.
    _dir.copy(_fwd).negate();
    let allowed = desiredDist;
    const probe = (ox, oy) => {
      _tmp.copy(shoulderPt).addScaledVector(_right, ox).addScaledVector(_up, oy);
      const h = this.physics.raycast(_tmp, _dir, desiredDist + C.collisionRadius, this._filter, _hit);
      if (h) allowed = Math.min(allowed, h.distance - C.collisionRadius);
    };
    probe(0, 0);
    const pr = C.collisionRadius * 0.9;
    for (const [ox, oy] of this._probeOffsets) probe(ox * pr, oy * pr);
    allowed = Math.max(C.minDistance, allowed);

    if (allowed < this.distance) this.distance = allowed;
    else this.distance += (Math.min(allowed, desiredDist) - this.distance) * damp(C.collisionReturnSpeed, dt);
    this.collisionDistance = this.distance;

    const cam = this.camera;
    cam.position.copy(shoulderPt).addScaledVector(_dir, this.distance);
    _tmp.copy(cam.position).add(_fwd);
    cam.up.set(0, 1, 0);
    cam.lookAt(_tmp);

    // Shake (trauma²).
    this._shakeTime += dt;
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const f = C.shake.frequency * this._shakeTime;
      cam.rotateY(shakeNoise(f, 1) * C.shake.maxYaw * s);
      cam.rotateX(shakeNoise(f, 7) * C.shake.maxPitch * s);
      cam.rotateZ(shakeNoise(f, 13) * C.shake.maxRoll * s);
      cam.position.addScaledVector(_up, shakeNoise(f, 21) * C.shake.maxOffset * s * 0.5);
      this.trauma = Math.max(0, this.trauma - C.shake.decay * dt);
    }

    // FOV: base setting + aim zoom + sprint kick.
    const base = this.settings.get('fov');
    const targetFov = base + C.aimFovDelta * this.aimBlend + (this.sprinting && state.speed > 5 ? C.sprintFovDelta : 0);
    this._fov += (targetFov - this._fov) * damp(C.fovLerp, dt);
    cam.fov = this._fov;

    // Blend back from a cinematic.
    if (this._blend) {
      const b = this._blend;
      b.t += dt;
      const k = THREE.MathUtils.smootherstep(Math.min(1, b.t / b.duration), 0, 1);
      cam.position.lerpVectors(b.pos, cam.position, k);
      _q.copy(cam.quaternion);
      cam.quaternion.slerpQuaternions(b.quat, _q, k);
      cam.fov = THREE.MathUtils.lerp(b.fov, cam.fov, k);
      if (b.t >= b.duration) this._blend = null;
    }
    cam.updateProjectionMatrix();
  }

  _updateLock(dt, feet) {
    const L = CAMERA.lockOn;
    const t = this.lockTarget;
    if (!t.isLockable()) {
      this.releaseLock();
      return;
    }
    t.getLockPoint(this._lockPoint);
    const dist = this._lockPoint.distanceTo(feet);
    if (dist > L.breakRange) {
      this.releaseLock();
      return;
    }
    if (!this._hasLineOfSight(this.pivot, this._lockPoint, t)) {
      this._losTimer += dt;
      if (this._losTimer > L.losGrace) {
        this.releaseLock();
        return;
      }
    } else this._losTimer = 0;

    _dir.subVectors(this._lockPoint, this.pivot);
    const horiz = Math.hypot(_dir.x, _dir.z);
    const targetYaw = Math.atan2(-_dir.x, -_dir.z);
    const targetPitch = THREE.MathUtils.clamp(Math.atan2(_dir.y, Math.max(horiz, 0.01)) + L.pitchBias, CAMERA.pitchMin, CAMERA.pitchMax);
    let dy = THREE.MathUtils.euclideanModulo(targetYaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
    this.yaw += dy * damp(L.yawLerp, dt);
    this.pitch += (targetPitch - this.pitch) * damp(L.pitchLerp, dt);
  }

  // --------------------------------------------------------------- helpers

  /** Horizontal forward vector of the camera yaw. @param {THREE.Vector3} out */
  flatForward(out) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Horizontal right vector. @param {THREE.Vector3} out */
  flatRight(out) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /**
   * Ray through the screen centre (used for aiming spells).
   * @param {THREE.Vector3} outOrigin
   * @param {THREE.Vector3} outDir
   */
  getAimRay(outOrigin, outDir) {
    outOrigin.copy(this.camera.position);
    this.camera.getWorldDirection(outDir);
  }
}
