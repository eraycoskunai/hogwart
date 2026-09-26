/**
 * @file BroomFlight — riding a broom. The broom turns toward where the
 * camera looks (limited by the model's handling), W / S open and close the
 * throttle, A / D drift sideways, Space / C climb and sink, Shift boosts
 * (stamina), F barrel-rolls with invulnerability frames. Diving trades
 * height for speed, the velocity lags the heading (drift), walls and the
 * ground are solid (hard crashes hurt and can throw you off), water is
 * skimmed, and there is a soft ceiling. Summoning works mid-fall.
 *
 * While flying it takes over the player's fixed step (player.mount) and
 * poses the avatar (lean, bank, bob) with the broom under it.
 *
 * Events: flight:mounted, flight:dismounted {reason}, flight:crash {speed, damage},
 *         flight:denied {reason}, flight:roll
 */
import * as THREE from 'three';
import { FLIGHT } from '../../data/flight.js';
import { buildBroom } from '../../procgen/geometry/BroomKit.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _want = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _off = new THREE.Vector3();

function angleDelta(a, b) {
  return THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI;
}

export class BroomFlight {
  /**
   * @param {{bus:any, player:import('../Player.js').Player, inventory:import('../Inventory.js').Inventory,
   *          scene:THREE.Scene, cameraRig:any, particles:{glow:any, smoke:any}}} o
   */
  constructor(o) {
    this.o = o;
    this.bus = o.bus;
    this.player = o.player;
    /** ground | mounting | flying | dismounting */
    this.state = 'ground';
    this.t = 0;
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.stamina = FLIGHT.boost.max;
    this._boostDelay = 0;
    this.boosting = false;
    this.rollT = 0;
    this._rollCd = 0;
    this._rollDir = 1;
    this._landHold = 0;
    this._bobT = 0;
    this._clip = null;
    this.lastImpact = 0;
    /** Region permission, set by the game on region change. */
    this.allowed = false;
    this.broom = null;
    this._broomId = null;
    this._offBroom = this.bus.on('inventory:broom', () => this._buildBroom());
    this._buildBroom();
  }

  get active() {
    return this.state !== 'ground';
  }

  get spec() {
    return this.o.inventory.broomSpec;
  }

  /** Top speed right now (boost included). */
  get topSpeed() {
    return this.spec.speed * (this.boosting ? FLIGHT.boost.mult : 1);
  }

  _buildBroom() {
    const id = this.o.inventory.broom;
    if (id === this._broomId) return;
    this.broom?.dispose();
    this._broomId = id;
    this.broom = buildBroom(this.spec, id.length * 97 + 13);
    this.broom.group.visible = this.active;
    this.o.scene.add(this.broom.group);
  }

  // -------------------------------------------------------------- mount

  /** Why mounting is not possible now, or null. */
  denyReason() {
    const p = this.player;
    if (!this.allowed) return 'Burada uçamazsın — süpürgeye yalnızca açık havada binilir.';
    if (p.dead) return 'Önce ayağa kalkmalısın.';
    if (p.controller.swimming) return 'Suyun içinden süpürgeye binemezsin.';
    if (p.stunned > 0) return 'Sersemken süpürgeye binemezsin.';
    return null;
  }

  /** Toggle: mount when on foot, land / jump off when flying. */
  toggle() {
    if (this.state === 'flying') this.dismount('manual');
    else if (this.state === 'ground') this.mount();
  }

  mount() {
    if (this.state !== 'ground') return false;
    const why = this.denyReason();
    if (why) {
      this.bus.emit('flight:denied', { reason: why });
      return false;
    }
    const p = this.player;
    const c = p.controller;
    this.state = 'mounting';
    this.t = 0;
    this.yaw = p.yaw;
    this.pitch = 0;
    this.bank = 0;
    this.rollT = 0;
    // Keep momentum (catching yourself mid-fall), but kill most of the drop.
    this.velocity.copy(c.velocity);
    this.velocity.y = Math.max(this.velocity.y, -4);
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    p.mount = this;
    p.clearCombat();
    c.wantCrouch = false;
    this.broom.group.visible = true;
    this._sparkle(1);
    this._playClip('broomMount');
    this.bus.emit('flight:mounted', { broom: this.o.inventory.broom });
    return true;
  }

  /**
   * @param {'manual'|'land'|'crash'|'water'|'forced'|'died'} reason
   */
  dismount(reason) {
    if (this.state === 'ground' || this.state === 'dismounting') return;
    const p = this.player;
    const c = p.controller;
    const high = !this._nearGround(2.2);
    if (reason === 'land' || (reason === 'manual' && !high)) {
      // Step down gently.
      this.state = 'dismounting';
      this.t = 0;
      this._playClip('broomDismount');
      return;
    }
    // Thrown or jumped off in the air: fall with the current momentum.
    c.velocity.copy(this.velocity);
    this._finish(reason);
  }

  /** Drop everything at once (region change, death, debug). */
  reset() {
    if (this.state === 'ground') return;
    this.player.controller.velocity.set(0, 0, 0);
    this._finish('forced');
  }

  _finish(reason) {
    const p = this.player;
    this.state = 'ground';
    p.mount = null;
    p.controller.airPeakY = p.position.y;
    this.broom.group.visible = false;
    this._sparkle(0.6);
    this._stopClip();
    this.speed = 0;
    this.boosting = false;
    this.bus.emit('flight:dismounted', { reason });
  }

  _nearGround(dist) {
    const p = this.player.position;
    const hit = this.player.physics.raycast(_v.set(p.x, p.y + 0.3, p.z), _fwd.set(0, -1, 0), dist + 0.3, { dynamic: false }, { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null });
    return !!hit;
  }

  _sparkle(k) {
    const g = this.o.particles.glow;
    const p = this.player.position;
    g.burst(Math.round(30 * k), _v.set(p.x, p.y + FLIGHT.seatHeight, p.z), { speed: [0.5, 2.5], life: 0.7, size: 0.08, color: '#ffe6a0', shape: 1, drag: 2, jitter: 1.2 });
  }

  // ------------------------------------------------------------- dodge

  /** Barrel roll with invulnerability. @param {number} side -1 left, +1 right */
  roll(side) {
    if (this.state !== 'flying' || this.rollT > 0 || this._rollCd > 0) return false;
    const R = FLIGHT.roll;
    this.rollT = R.duration;
    this._rollCd = R.duration + R.cooldown;
    this._rollDir = side || (Math.random() < 0.5 ? -1 : 1);
    this.player.invulnerable = Math.max(this.player.invulnerable, R.iframes);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.velocity.addScaledVector(_right, R.shove * this._rollDir);
    this.bus.emit('flight:roll', {});
    return true;
  }

  // -------------------------------------------------------------- step

  /** Player fixed step while mounted. @param {number} dt */
  fixedUpdate(dt) {
    const p = this.player;
    const c = p.controller;
    this.t += dt;
    this._rollCd = Math.max(0, this._rollCd - dt);
    if (p.dead) {
      c.velocity.copy(this.velocity);
      this._finish('died');
      return;
    }
    if (this.state === 'mounting') {
      const k = Math.min(1, this.t / FLIGHT.mountTime);
      this.velocity.x *= Math.exp(-2 * dt);
      this.velocity.z *= Math.exp(-2 * dt);
      this.velocity.y += ((FLIGHT.liftOff / FLIGHT.mountTime) * 1.6 * (1 - k) - this.velocity.y) * (1 - Math.exp(-6 * dt));
      c.flyStep(dt, this.velocity);
      if (k >= 1) {
        this.state = 'flying';
        this.speed = Math.hypot(this.velocity.x, this.velocity.z);
      }
      return;
    }
    if (this.state === 'dismounting') {
      // Settle onto the ground, then step off.
      this.velocity.multiplyScalar(Math.exp(-6 * dt));
      this.velocity.y = -2.5;
      c.flyStep(dt, this.velocity);
      if (this.t >= FLIGHT.dismountTime) {
        c.velocity.set(0, 0, 0);
        this._finish('land');
      }
      return;
    }
    this._fly(dt);
  }

  _fly(dt) {
    const F = FLIGHT;
    const p = this.player;
    const c = p.controller;
    const it = p.intent;
    const S = this.spec;
    const rig = this.o.cameraRig;
    const stunned = p.stunned > 0;

    // Heading follows the view, limited by handling.
    const turn = S.handling * dt;
    const dyaw = stunned ? 0 : angleDelta(this.yaw, rig.yaw);
    const yawStep = THREE.MathUtils.clamp(dyaw * (1 - Math.exp(-8 * dt)), -turn, turn);
    this.yaw += yawStep;
    const turnRate = yawStep / dt;
    const targetPitch = THREE.MathUtils.clamp(rig.pitch + 0.12, -F.pitchLimit, F.pitchLimit);
    if (!stunned) this.pitch += THREE.MathUtils.clamp(targetPitch - this.pitch, -F.pitchRate * S.handling * 0.5 * dt, F.pitchRate * S.handling * 0.5 * dt);

    // Boost stamina.
    const B = F.boost;
    this.boosting = it.sprint && this.stamina > 1 && it.axis.y > 0.1 && !stunned;
    if (this.boosting) {
      this.stamina = Math.max(0, this.stamina - (B.drain / S.boost) * dt);
      this._boostDelay = B.delay;
    } else if ((this._boostDelay -= dt) <= 0) this.stamina = Math.min(B.max, this.stamina + B.regen * S.boost * dt);

    // Throttle: accelerate with W, coast without, brake with S.
    const top = this.topSpeed;
    const throttle = stunned ? 0 : it.axis.y;
    const sinP = Math.sin(this.pitch);
    if (throttle > 0.05) {
      const target = top * throttle;
      if (this.speed < target) this.speed = Math.min(target, this.speed + S.accel * (this.boosting ? 1.6 : 1) * dt);
      else this.speed = Math.max(target, this.speed - S.accel * 0.35 * dt);
    } else if (throttle < -0.05) this.speed -= S.accel * 1.6 * dt;
    else this.speed -= S.accel * 0.35 * dt;
    // Gravity along the path: dives speed up, climbs slow down.
    this.speed -= sinP * F.diveAccel * dt;
    const cap = top * (sinP < -0.2 ? F.diveBonus : 1);
    if (this.speed > cap) this.speed += (cap - this.speed) * (1 - Math.exp(-2 * dt));
    this.speed = Math.max(0, this.speed);

    // Desired velocity: along the heading, plus drift and climb.
    const cp = Math.cos(this.pitch);
    _fwd.set(-Math.sin(this.yaw) * cp, sinP, -Math.cos(this.yaw) * cp);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const slow = 1 - Math.min(1, this.speed / (S.speed * 0.6)) * 0.5;
    _want.copy(_fwd).multiplyScalar(this.speed);
    if (!stunned) {
      _want.addScaledVector(_right, it.axis.x * F.strafeSpeed * slow);
      _want.y += it.vertical * F.climbSpeed;
    }
    if (stunned) _want.y -= 3;
    const grip = 1 - Math.exp(-F.grip * S.handling * dt);
    this.velocity.lerp(_want, this.rollT > 0 ? grip * 0.3 : grip);

    // Soft ceiling.
    if (c.position.y > F.ceiling) this.velocity.y -= F.ceilingPush * dt * (1 + (c.position.y - F.ceiling) * 0.2);

    // Move with collision.
    const before = this.velocity.length();
    const res = c.flyStep(dt, this.velocity);
    this.lastImpact = res.impact;
    if (res.impact > F.crash.speed && p.invulnerable <= 0) {
      const dmg = (res.impact - F.crash.speed) * F.crash.damagePerSpeed;
      this.speed *= F.crash.bounce;
      this.velocity.multiplyScalar(F.crash.bounce);
      p.damage(dmg, 'crash');
      this.bus.emit('flight:crash', { speed: res.impact, damage: dmg });
      if (res.impact > F.crash.unseat || p.dead) {
        this.dismount('crash');
        return;
      }
    } else if (res.impact > 0.5) {
      // Scrape: lose the speed that went into the surface.
      this.speed = Math.min(this.speed, Math.max(0, before - res.impact));
    }

    // Skim the water.
    const wl = p.waterLevelAt ? p.waterLevelAt(c.position.x, c.position.z) : -Infinity;
    if (c.position.y < wl + F.waterClearance) {
      c.position.y = wl + F.waterClearance;
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (this.speed > 6 && Math.random() < 0.6) this.o.particles.glow.spawn({ x: c.position.x, y: wl + 0.05, z: c.position.z }, { x: (Math.random() - 0.5) * 2, y: 1.5 + Math.random() * 2, z: (Math.random() - 0.5) * 2 }, { life: 0.6, size: 0.12, color: '#dfefff', alpha: 0.6, gravity: 6, drag: 1 });
    }

    // Landing: touching the ground slowly while sinking.
    const flat = Math.hypot(this.velocity.x, this.velocity.z);
    if (res.grounded && flat < F.landSpeed && it.vertical < 0) {
      this._landHold += dt;
      if (this._landHold > F.landHold) {
        this.dismount('land');
        return;
      }
    } else this._landHold = 0;

    // Roll.
    if (this.rollT > 0) this.rollT = Math.max(0, this.rollT - dt);
    const targetBank = THREE.MathUtils.clamp(-turnRate * F.bankPerTurn - it.axis.x * 0.25, -F.bankMax, F.bankMax);
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-F.bankRate * dt));
    p.yaw = this.yaw;
    this._turnRate = turnRate;
  }

  // ------------------------------------------------------------- render

  _playClip(name) {
    const a = this.player.animator;
    if (this._clip === name) return;
    if (this._clip) a.stop(this._clip);
    this._clip = name;
    a.play(name, { loop: name !== 'broomMount' && name !== 'broomDismount', fadeIn: 0.25 });
  }

  _stopClip() {
    if (this._clip) this.player.animator.stop(this._clip);
    this._clip = null;
  }

  /**
   * Lean the avatar, place the broom and emit flight effects.
   * @param {number} dt
   * @param {THREE.Object3D} root the character root (already positioned)
   * @param {THREE.Camera} camera
   */
  pose(dt, root, camera) {
    const F = FLIGHT;
    this._bobT += dt;
    let pitchVis = 0;
    let rollVis = this.bank;
    let bob = 0;
    if (this.state === 'flying') {
      pitchVis = this.pitch * 0.55;
      if (this.rollT > 0) rollVis += (1 - this.rollT / F.roll.duration) * Math.PI * 2 * this._rollDir;
      const hover = 1 - Math.min(1, this.speed / 6);
      bob = Math.sin(this._bobT * F.bob[1] * Math.PI * 2) * F.bob[0] * (0.3 + hover);
      this._playClip(this.speed < 3 ? 'flightHover' : this.pitch < -0.35 && this.speed > 10 ? 'flightDive' : 'flightForward');
    } else if (this.state === 'mounting') {
      if (this.t > F.mountTime * 0.8) this._playClip('flightHover');
    }
    // Rotate about the seat instead of the feet.
    _e.set(pitchVis, this.state === 'ground' ? root.rotation.y : this.yaw, rollVis, 'YXZ');
    _q.setFromEuler(_e);
    _off.set(0, F.pivotHeight, 0);
    const piv = _v.copy(_off).applyQuaternion(_q);
    root.quaternion.copy(_q);
    root.position.add(_off).sub(piv);
    root.position.y += bob;
    // Broom under the rider.
    const b = this.broom.group;
    b.visible = true;
    b.quaternion.copy(_q);
    b.position.copy(root.position).add(_off.set(0, F.seatHeight, 0.02).applyQuaternion(_q));
    // Speed lines past the camera.
    if (this.state === 'flying' && this.speed > F.speedLines && camera) {
      const n = Math.min(4, Math.floor((this.speed - F.speedLines) / 5) + 1);
      camera.getWorldDirection(_fwd);
      for (let i = 0; i < n; i++) {
        const at = _v.copy(camera.position).addScaledVector(_fwd, 6 + Math.random() * 8);
        at.x += (Math.random() - 0.5) * 7;
        at.y += (Math.random() - 0.5) * 5;
        at.z += (Math.random() - 0.5) * 7;
        this.o.particles.glow.spawn(at, { x: -this.velocity.x * 1.4, y: -this.velocity.y * 1.4, z: -this.velocity.z * 1.4 }, { life: 0.22, size: 0.025, endSize: 0.01, color: '#ffffff', alpha: 0.35, endAlpha: 0, shape: 1 });
      }
    }
    // Twig sparks while boosting.
    if (this.boosting && Math.random() < 0.7) {
      const tail = _v.set(0, F.seatHeight, 1.1).applyQuaternion(_q).add(root.position);
      this.o.particles.glow.spawn(tail, { x: (Math.random() - 0.5), y: (Math.random() - 0.5), z: (Math.random() - 0.5) }, { life: 0.4, size: 0.07, endSize: 0.01, color: '#ffd27a', endColor: '#ff6020', shape: 1, drag: 2 });
    }
  }

  /** Relative wind on the robes (m/s). */
  clothWind(out) {
    return out.copy(this.velocity).multiplyScalar(-FLIGHT.clothWind);
  }

  get stats() {
    const p = this.player.position;
    return {
      Uçuş: `${this.state} · ${this.spec.name} · hız ${this.speed.toFixed(1)} / ${this.topSpeed.toFixed(0)} m/s`,
      'Yönelim': `sapma ${(this.yaw * 57.3).toFixed(0)}° · yunuslama ${(this.pitch * 57.3).toFixed(0)}° · yatış ${(this.bank * 57.3).toFixed(0)}°`,
      'Takviye / irtifa': `${this.stamina.toFixed(0)} · y ${p.y.toFixed(1)} · çarpma ${this.lastImpact.toFixed(1)}`,
    };
  }

  dispose() {
    this.reset();
    this._offBroom();
    this.broom?.dispose();
  }
}
