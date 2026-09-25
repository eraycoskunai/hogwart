/**
 * @file CharacterController — kinematic capsule controller.
 *
 * Features: acceleration/friction, slope limit (steep surfaces slide),
 * step climbing (up–forward–down probe), ground snapping, coyote time,
 * jump buffering, variable jump height, crouching with head-room check,
 * moving-platform carry (kinematic + dynamic bodies), pushing rigid bodies,
 * fall height tracking (for fall damage) and a debug noclip mode.
 *
 * The controller is deterministic per fixed step and exposes `prevPosition`
 * so renderers can interpolate.
 */
import * as THREE from 'three';
import { PLAYER } from '../data/physics.js';

const UP = new THREE.Vector3(0, 1, 0);
/** Contact points must lie this far below the bottom sphere centre to count as ledge support (m). */
const EDGE_MARGIN = 0.01;
/** Ground penetration deeper than this is resolved before walls (m). */
const GROUND_FIRST_DEPTH = 1e-4;

/**
 * @typedef {Object} MoveState
 * @property {boolean} grounded
 * @property {THREE.Vector3} groundNormal
 * @property {import('./Collider.js').Collider|null} groundCollider
 * @property {boolean} hitWall
 * @property {boolean} ceiling
 * @property {boolean} steep
 * @property {THREE.Vector3[]} walls horizontal unit normals of blocking surfaces
 * @property {{d:any, nx:number, nz:number}[]} dynamicHits
 */

function makeState() {
  return {
    grounded: false,
    groundNormal: new THREE.Vector3(0, 1, 0),
    groundCollider: null,
    /** Height of the supporting contact point (ledge/floor height). */
    groundY: -Infinity,
    hitWall: false,
    ceiling: false,
    steep: false,
    walls: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    wallCount: 0,
    dynamicHits: [],
  };
}

/** @param {ReturnType<typeof makeState>} s */
function resetState(s) {
  s.grounded = false;
  s.groundNormal.set(0, 1, 0);
  s.groundCollider = null;
  s.groundY = -Infinity;
  s.hitWall = false;
  s.ceiling = false;
  s.steep = false;
  s.wallCount = 0;
  s.dynamicHits.length = 0;
  return s;
}

/** Copy b's ground info + walls into a. */
function mergeState(a, b) {
  if (b.grounded) {
    a.grounded = true;
    a.groundNormal.copy(b.groundNormal);
    a.groundCollider = b.groundCollider;
    a.groundY = Math.max(a.groundY, b.groundY);
  }
  a.hitWall = a.hitWall || b.hitWall;
  a.ceiling = a.ceiling || b.ceiling;
  a.steep = a.steep || b.steep;
  for (let i = 0; i < b.wallCount && a.wallCount < a.walls.length; i++) a.walls[a.wallCount++].copy(b.walls[i]);
  for (const h of b.dynamicHits) a.dynamicHits.push(h);
}

export class CharacterController {
  /**
   * @param {import('./PhysicsWorld.js').PhysicsWorld} physics
   * @param {typeof PLAYER} [cfg]
   */
  constructor(physics, cfg = PLAYER) {
    this.physics = physics;
    this.world = physics.collision;
    this.cfg = cfg;

    /** Feet position (bottom of the capsule). */
    this.position = new THREE.Vector3();
    this.prevPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = cfg.radius;
    this.height = cfg.height;

    this.grounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    /** @type {import('./Collider.js').Collider|null} */
    this.groundCollider = null;
    this.onSteepSlope = false;
    this.walkableCos = Math.cos(THREE.MathUtils.degToRad(cfg.maxSlopeDeg));

    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.jumpHeld = false;
    this.wantCrouch = false;
    this.crouching = false;
    this.noclip = false;

    /** Highest Y reached since leaving the ground. */
    this.airPeakY = 0;
    /** Velocity inherited from the platform we stand on. */
    this.platformVelocity = new THREE.Vector3();
    /** Yaw rotation applied by a rotating platform this step (radians). */
    this.yawDelta = 0;
    /** Visual-only vertical offset that smooths step-ups (decays to 0). */
    this.stepOffset = 0;

    /** Events produced by the last step: {type:'jump'|'land'|'leaveGround'|'step', ...} */
    this.events = [];

    this._filter = {};
    this._st = makeState();
    this._stUp = makeState();
    this._stFwd = makeState();
    this._stDown = makeState();
    this._stProbe = makeState();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._push = new THREE.Vector3();
    this._start = new THREE.Vector3();
    this._test = new THREE.Vector3();
    this._stepPos = new THREE.Vector3();
    this._delta = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._euler = new THREE.Euler();
  }

  /** Current capsule segment endpoints (bottom/top sphere centres). */
  segment(outA, outB, pos = this.position, height = this.height) {
    outA.set(pos.x, pos.y + this.radius, pos.z);
    outB.set(pos.x, pos.y + Math.max(this.radius, height - this.radius), pos.z);
  }

  /**
   * Instantly move the controller (spawn, teleport, load).
   * @param {THREE.Vector3} pos
   */
  teleport(pos) {
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.groundCollider = null;
    this.airPeakY = pos.y;
    this.stepOffset = 0;
    this.platformVelocity.set(0, 0, 0);
  }

  /** Buffer a jump request (consumed when grounded or within coyote time). */
  requestJump() {
    this.jumpBufferTimer = this.cfg.jumpBuffer;
  }

  get jumpVelocity() {
    return Math.sqrt(2 * this.cfg.gravity * this.cfg.jumpHeight);
  }

  // ---------------------------------------------------------------- resolve

  /**
   * Push the capsule out of all penetrations at `pos`.
   * @param {THREE.Vector3} pos (modified)
   * @param {ReturnType<typeof makeState>} st
   * @param {boolean} rising true while moving upward (no grounding)
   */
  _resolve(pos, st, rising) {
    const r = this.radius;
    const cfg = this.cfg;
    for (let it = 0; it < cfg.collisionIterations; it++) {
      this.segment(this._a, this._b, pos);
      const contacts = this.world.capsuleContacts(this._a, this._b, r, this._filter);
      if (contacts.length === 0) break;
      // Classify first so ground support is resolved before walls: a stair
      // nosing yields both a wall contact (riser) and a ground contact (tread)
      // at the same point, and the tread must win.
      for (const c of contacts) {
        const onEdge = c.normal.dot(c.faceNormal) < 0.999;
        c.onEdge = onEdge;
        // Support comes from walkable faces only. Face contacts count directly;
        // edge/corner contacts (stair nosing, ledge lip) count when the point
        // lies below the bottom sphere centre. Edge contacts on steep faces —
        // including artefacts on the diagonal of a split quad — never lift us.
        c.ground = c.faceNormal.y >= this.walkableCos && (!onEdge || c.point.y < this._a.y - EDGE_MARGIN);
      }
      contacts.sort((x, y) => (x.ground === y.ground ? y.depth - x.depth : x.ground ? -1 : 1));
      // While real ground penetration exists, lift first and re-query: after a
      // vertical lift, riser contacts that shared the nosing point usually
      // vanish, whereas a linear depth estimate would wrongly push us back.
      const lastIter = it === cfg.collisionIterations - 1;
      const groundFirst = !lastIter && contacts.some((c) => c.ground && c.depth > GROUND_FIRST_DEPTH);
      const push = this._push.set(0, 0, 0);
      for (const c of contacts) {
        if (groundFirst && !c.ground) continue;
        const n = c.normal;
        const rem = c.depth - push.dot(n);
        if (rem <= 1e-6) continue;
        if (c.ground) {
          // Resolve vertically so we never slide down gentle slopes.
          let lift;
          if (c.onEdge) {
            // Exact vertical separation from a point: sphere centre must rise
            // until its distance to the point equals the radius.
            const d = r - c.depth;
            const cx = c.point.x + n.x * d, cy = c.point.y + n.y * d, cz = c.point.z + n.z * d;
            const dh2 = (cx - c.point.x) ** 2 + (cz - c.point.z) ** 2;
            lift = Math.sqrt(Math.max(0, r * r - dh2)) - (cy - c.point.y) - push.y;
          } else {
            lift = rem / n.y;
          }
          if (lift > 0) push.y += lift;
          if (!rising) {
            if (!st.grounded || c.faceNormal.y > st.groundNormal.y) {
              st.groundNormal.copy(c.faceNormal);
              st.groundCollider = c.collider;
            }
            st.grounded = true;
            st.groundY = Math.max(st.groundY, c.point.y);
          }
        } else if (n.y <= cfg.ceilingNormalY) {
          push.addScaledVector(n, rem);
          st.ceiling = true;
        } else {
          // Wall or steep slope: resolve horizontally only, gravity makes steep slopes slide.
          const l = Math.hypot(n.x, n.z);
          if (l < 1e-4) continue;
          const amt = Math.min(rem / l, rem * 4);
          const nx = n.x / l;
          const nz = n.z / l;
          push.x += nx * amt;
          push.z += nz * amt;
          st.hitWall = true;
          if (n.y > 0.05) st.steep = true;
          if (st.wallCount < st.walls.length) st.walls[st.wallCount++].set(nx, 0, nz);
          if (c.collider.kind === 'dynamic' && c.collider.body) {
            st.dynamicHits.push({ d: c.collider.body, nx, nz });
          }
        }
      }
      if (push.lengthSq() < 1e-12) break;
      pos.add(push);
    }
  }

  /**
   * Sweep by sub-steps and resolve after each.
   * @param {THREE.Vector3} pos (modified)
   * @param {THREE.Vector3} delta
   * @param {ReturnType<typeof makeState>} st
   * @param {boolean} rising
   * @param {number} [fraction] max sub-step as a fraction of the radius
   */
  _move(pos, delta, st, rising, fraction = this.cfg.substepFraction) {
    const len = delta.length();
    const maxStep = this.radius * fraction;
    const n = Math.max(1, Math.ceil(len / maxStep));
    const sx = delta.x / n, sy = delta.y / n, sz = delta.z / n;
    for (let i = 0; i < n; i++) {
      pos.x += sx;
      pos.y += sy;
      pos.z += sz;
      this._resolve(pos, st, rising);
    }
  }

  /**
   * Try climbing a step: move up, forward, then down.
   * @returns {boolean} true when the step result was applied to `this._test`
   */
  _tryStep(start, delta, normalProgress) {
    const cfg = this.cfg;
    const hx = delta.x, hz = delta.z;
    const hl = Math.hypot(hx, hz);
    if (hl < 1e-5) return false;

    const p = this._stepPos.copy(start);
    const up = resetState(this._stUp);
    this._move(p, this._tmp.set(0, cfg.stepHeight, 0), up, true);
    const raised = p.y - start.y;
    if (raised < 0.05) return false;

    const fwd = resetState(this._stFwd);
    this._move(p, this._tmp.set(hx, 0, hz), fwd, true);

    const down = resetState(this._stDown);
    this._move(p, this._tmp.set(0, -(raised + cfg.groundSnap), 0), down, false, cfg.probeSubstepFraction);
    if (!down.grounded) return false;

    // Judge by the height of what supports us (a ledge lip can hold the
    // capsule below the ledge top), never by the capsule position alone.
    const rise = Math.max(p.y, down.groundY) - start.y;
    if (rise > cfg.stepHeight + 0.01) return false;
    const progress = ((p.x - start.x) * hx + (p.z - start.z) * hz) / hl;
    if (progress <= normalProgress + cfg.stepMinProgress) return false;

    this._test.copy(p);
    resetState(this._st);
    mergeState(this._st, down);
    mergeState(this._st, fwd);
    this._st.grounded = true;
    this._st.groundNormal.copy(down.groundNormal);
    this._st.groundCollider = down.groundCollider;
    if (rise > 0.02) this.stepOffset -= rise;
    this.events.push({ type: 'step', height: rise });
    return true;
  }

  // ------------------------------------------------------------ platform

  _carry(dt) {
    const col = this.groundCollider;
    this.platformVelocity.set(0, 0, 0);
    if (!col) return;
    if (col.kind === 'kinematic') {
      const p = this._tmp.copy(this.position).applyMatrix4(col.deltaMatrix);
      this.platformVelocity.subVectors(p, this.position).divideScalar(dt);
      this.position.copy(p);
      this._q.setFromRotationMatrix(col.deltaMatrix);
      this._euler.setFromQuaternion(this._q, 'YXZ');
      this.yawDelta = this._euler.y;
    } else if (col.kind === 'dynamic' && col.body) {
      const v = col.body.body.velocity;
      this.platformVelocity.set(v.x, 0, v.z);
      this.position.x += v.x * dt;
      this.position.z += v.z * dt;
    }
  }

  // ---------------------------------------------------------------- crouch

  _updateHeight() {
    const cfg = this.cfg;
    const target = this.wantCrouch ? cfg.crouchHeight : cfg.height;
    if (target < this.height - 1e-4) {
      this.height = target;
      this.crouching = true;
    } else if (target > this.height + 1e-4) {
      this.segment(this._a, this._b, this.position, target);
      const contacts = this.world.capsuleContacts(this._a, this._b, this.radius * 0.94, { dynamic: false });
      if (contacts.length === 0) {
        this.height = target;
        this.crouching = false;
      }
    }
  }

  /** True if the capsule could stand up right now. */
  canStand() {
    this.segment(this._a, this._b, this.position, this.cfg.height);
    return this.world.capsuleContacts(this._a, this._b, this.radius * 0.94, { dynamic: false }).length === 0;
  }

  // ------------------------------------------------------------------ step

  /**
   * Advance one fixed step.
   * @param {number} dt
   * @param {THREE.Vector3} wishDir desired direction (horizontal unit vector; 3D in noclip)
   * @param {number} wishSpeed desired speed (m/s)
   */
  step(dt, wishDir, wishSpeed) {
    const cfg = this.cfg;
    this.prevPosition.copy(this.position);
    this.events.length = 0;
    this.yawDelta = 0;
    this.stepOffset *= Math.exp(-cfg.stepSmoothRate * dt);
    if (Math.abs(this.stepOffset) < 1e-4) this.stepOffset = 0;

    if (this.noclip) {
      this.velocity.copy(wishDir).multiplyScalar(wishSpeed);
      this.position.addScaledVector(this.velocity, dt);
      this.grounded = false;
      this.groundCollider = null;
      this.airPeakY = this.position.y;
      return;
    }

    // 1. Ride platforms.
    if (this.grounded) this._carry(dt);

    // 2. Crouch / stand.
    this._updateHeight();

    // 3. Timers.
    if (this.grounded) this.coyoteTimer = cfg.coyoteTime;
    else this.coyoteTimer -= dt;
    this.jumpBufferTimer -= dt;

    // 4. Horizontal acceleration toward the wish velocity.
    const v = this.velocity;
    const tx = wishDir.x * wishSpeed;
    const tz = wishDir.z * wishSpeed;
    const hasInput = wishSpeed > 0.01;
    if (this.grounded || hasInput) {
      const accel = this.grounded ? (hasInput ? cfg.groundAccel : cfg.groundDecel) : cfg.airAccel;
      const dx = tx - v.x;
      const dz = tz - v.z;
      const dl = Math.hypot(dx, dz);
      const maxChange = accel * dt;
      if (dl <= maxChange || dl < 1e-6) {
        v.x = tx;
        v.z = tz;
      } else {
        v.x += (dx / dl) * maxChange;
        v.z += (dz / dl) * maxChange;
      }
    }

    // 5. Vertical: jump / gravity.
    let jumped = false;
    const wasGrounded = this.grounded;
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && !this.crouching) {
      v.y = this.jumpVelocity;
      v.x += this.platformVelocity.x;
      v.z += this.platformVelocity.z;
      jumped = true;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.grounded = false;
      this.groundCollider = null;
      this.airPeakY = this.position.y;
      this.events.push({ type: 'jump' });
    } else if (this.grounded) {
      v.y = 0;
    } else {
      let g = cfg.gravity;
      if (v.y > 0 && !this.jumpHeld) g *= cfg.jumpCutGravity;
      v.y = Math.max(v.y - g * dt, -cfg.maxFallSpeed);
    }
    const vyBefore = v.y;
    const supported = wasGrounded && !jumped;

    // 6. Move with collision, attempting a step-up when blocked.
    const start = this._start.copy(this.position);
    const delta = this._delta.copy(v).multiplyScalar(dt);
    const st = resetState(this._st);
    const test = this._test.copy(start);
    this._move(test, delta, st, v.y > 0);

    if (supported && st.hitWall) {
      const hl = Math.hypot(delta.x, delta.z);
      if (hl > 1e-5) {
        const normalProgress = ((test.x - start.x) * delta.x + (test.z - start.z) * delta.z) / hl;
        this._tryStep(start, delta, normalProgress);
      }
    }
    this.position.copy(this._test);

    // 7. Snap down to keep contact on slopes and stairs.
    if (supported && !st.grounded && v.y <= 0) {
      const probe = this._stepPos.copy(this.position);
      const ps = resetState(this._stProbe);
      this._move(probe, this._tmp.set(0, -cfg.groundSnap, 0), ps, false, cfg.probeSubstepFraction);
      if (ps.grounded) {
        this.position.copy(probe);
        mergeState(st, ps);
      }
    }

    // 8. Clip velocity against what we hit.
    for (let i = 0; i < st.wallCount; i++) {
      const n = st.walls[i];
      const d = v.x * n.x + v.z * n.z;
      if (d < 0) {
        v.x -= n.x * d;
        v.z -= n.z * d;
      }
    }
    if (st.ceiling && v.y > 0) v.y = 0;

    // 9. Ground state & events.
    if (st.grounded) {
      if (!wasGrounded || jumped) {
        this.events.push({
          type: 'land',
          fallHeight: Math.max(0, this.airPeakY - this.position.y),
          impactSpeed: Math.max(0, -vyBefore),
        });
      }
      v.y = 0;
      this.grounded = true;
      this.groundNormal.copy(st.groundNormal);
      this.groundCollider = st.groundCollider;
    } else {
      if (supported) {
        // Walked off a ledge: keep platform momentum, start tracking the fall.
        v.x += this.platformVelocity.x;
        v.z += this.platformVelocity.z;
        this.airPeakY = this.position.y;
        this.events.push({ type: 'leaveGround' });
      }
      this.grounded = false;
      this.groundCollider = null;
      this.groundNormal.copy(UP);
      this.airPeakY = Math.max(this.airPeakY, this.position.y);
    }
    this.onSteepSlope = !st.grounded && st.steep;

    // 10. Push rigid bodies we walked into.
    if (hasInput) {
      for (const hit of st.dynamicHits) {
        const dirX = -hit.nx;
        const dirZ = -hit.nz;
        const along = tx * dirX + tz * dirZ;
        if (along <= 0) continue;
        const massFactor = Math.min(1, cfg.pushStrength / Math.max(1, hit.d.mass));
        this.physics.pushBody(hit.d, this._tmp.set(dirX, 0, dirZ), along * cfg.pushSpeedFactor * massFactor);
      }
    }
  }

  /**
   * Interpolated feet position for rendering.
   * @param {number} alpha
   * @param {THREE.Vector3} out
   */
  getInterpolatedPosition(alpha, out) {
    return out.lerpVectors(this.prevPosition, this.position, alpha);
  }
}
