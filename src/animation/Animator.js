/**
 * @file Animator — layered skeletal animation for a Character:
 *   1. locomotion blend space (idle / walk / run / sprint, phase-synced to
 *      the distance travelled), crouch, stairs, jump / fall, slide, landing
 *   2. action layers played on demand: full body (dodge roll, sit, stun,
 *      broom poses…), upper body (spell casts, shield, wave, fidgets) and
 *      additive (hit reactions), each with fades and timed events
 *   3. procedural layer: breathing, lean into acceleration, bank into turns
 *   4. IK: feet planted on uneven ground and steps (hips drop, foot tilt),
 *      head / eye look-at, wand arm aimed at a world point.
 *
 * Emits events through `onEvent(name, clipName)` (e.g. 'release' of a cast).
 */
import * as THREE from 'three';
import { ANIMATOR, IK as IKC, CAST_CLIPS } from '../data/animations.js';
import { CLIP_LIBRARY, Pose, sampleClip, BONE_COUNT } from './Clips.js';
import { BONE_INDEX } from '../procgen/characters/Skeleton.js';
import { solveTwoBone, alignFoot, lookAngles, turnBone, rotateBoneWorld } from './IK.js';

const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const DEG = Math.PI / 180;

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _root = new THREE.Vector3();
const _rootQ = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _hit = { y: 0, normal: new THREE.Vector3(0, 1, 0) };
const _angles = { yaw: 0, pitch: 0 };

/** Per-bone mask for upper-body layers. */
const UPPER_MASK = (() => {
  const m = new Float32Array(BONE_COUNT);
  for (const [name, w] of Object.entries(ANIMATOR.upperMask)) m[BONE_INDEX[name]] = w;
  return m;
})();

/**
 * @typedef {Object} AnimInput
 * @property {number} speed horizontal speed (m/s)
 * @property {boolean} grounded
 * @property {number} vy vertical speed
 * @property {boolean} crouching
 * @property {boolean} aiming
 * @property {number} turnRate rad/s
 * @property {number} accel forward acceleration (m/s²)
 * @property {number} climb ground rise per metre travelled
 * @property {boolean} sliding
 * @property {boolean} [swimming]
 * @property {THREE.Vector3|null} lookTarget
 * @property {THREE.Vector3|null} aimTarget
 * @property {((x:number, y:number, z:number, len:number, out:{y:number, normal:THREE.Vector3}) => boolean)|null} ground
 */

export class Animator {
  /**
   * @param {import('../procgen/characters/Character.js').Character} character
   * @param {import('./FaceAnimator.js').FaceAnimator} [face]
   */
  constructor(character, face) {
    this.c = character;
    this.face = face ?? null;
    this.phase = 0;
    this.time = 0;
    this.w = { move: 0, air: 0, crouch: 0, stairs: 0, slide: 0, land: 0, aim: 0, foot: 0, look: 0, swim: 0 };
    /** @type {{clip:any, name:string, t:number, w:number, fadeIn:number, fadeOut:number, speed:number, loop:boolean, out:boolean, fired:Set<string>}[]} */
    this.actions = [];
    this.pose = new Pose();
    this._a = new Pose();
    this._b = new Pose();
    this._c = new Pose();
    this.lean = 0;
    this.bank = 0;
    this.hipsDrop = 0;
    this.footOffset = { L: 0, R: 0 };
    this.look = { yaw: 0, pitch: 0 };
    this._idleTime = 0;
    this._fidgetAt = this._nextFidget();
    this.onEvent = null;
    this.ikEnabled = true;
    this.lookEnabled = true;
    this.locomotionLabel = 'idle';
    this._saved = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  }

  _nextFidget() {
    const [a, b] = ANIMATOR.fidget.after;
    return a + Math.random() * (b - a);
  }

  // ------------------------------------------------------------- actions

  /**
   * Play a clip on its layer.
   * @param {string} name clip name
   * @param {{fadeIn?:number, fadeOut?:number, speed?:number, loop?:boolean}} [o]
   */
  play(name, o = {}) {
    const clip = CLIP_LIBRARY[name];
    if (!clip) return false;
    const existing = this.actions.find((a) => a.name === name);
    if (existing) {
      existing.t = 0;
      existing.out = false;
      existing.fired.clear();
      return true;
    }
    // Only one upper-body action at a time (casts replace each other).
    if (clip.mask === 'upper') for (const a of this.actions) if (a.clip.mask === 'upper') a.out = true;
    this.actions.push({
      clip, name, t: 0, w: 0,
      fadeIn: o.fadeIn ?? ANIMATOR.fade.in,
      fadeOut: o.fadeOut ?? ANIMATOR.fade.out,
      speed: o.speed ?? 1,
      loop: o.loop ?? clip.loop,
      out: false,
      fired: new Set(),
    });
    return true;
  }

  /** Fade out a playing clip. @param {string} name */
  stop(name) {
    for (const a of this.actions) if (a.name === name) a.out = true;
  }

  stopAll() {
    for (const a of this.actions) a.out = true;
  }

  /** @param {string} name */
  isPlaying(name) {
    return this.actions.some((a) => a.name === name && !a.out);
  }

  /** Random cast animation (debug / creator preview). */
  playRandomCast() {
    this.play(CAST_CLIPS[Math.floor(Math.random() * CAST_CLIPS.length)]);
  }

  /** Landing impact 0..1. */
  land(strength) {
    this.w.land = Math.max(this.w.land, THREE.MathUtils.clamp(strength, 0, 1) * ANIMATOR.land.maxWeight);
  }

  // -------------------------------------------------------------- update

  /**
   * @param {number} dt
   * @param {AnimInput} s
   */
  update(dt, s) {
    const A = ANIMATOR;
    const W = this.w;
    this.time += dt;
    const sp = A.speeds;

    // ---- layer weights
    W.move += ((s.grounded ? Math.min(1, s.speed / sp.walk) : 0) - W.move) * damp(A.blend.move, dt);
    W.air += ((s.grounded || s.swimming ? 0 : 1) - W.air) * damp(A.blend.air, dt);
    W.swim += ((s.swimming ? 1 : 0) - W.swim) * damp(A.blend.swim, dt);
    W.crouch += ((s.crouching ? 1 : 0) - W.crouch) * damp(A.blend.crouch, dt);
    const climbing = s.grounded ? THREE.MathUtils.smoothstep(s.climb, A.stairsRise[0], A.stairsRise[1]) : 0;
    W.stairs += (climbing - W.stairs) * damp(A.blend.stairs, dt);
    W.slide += ((s.sliding ? 1 : 0) - W.slide) * damp(A.blend.slide, dt);
    W.land *= Math.exp(-A.land.recover * dt);
    W.aim += ((s.aiming && s.aimTarget ? 1 : 0) - W.aim) * damp(IKC.aim.rate, dt);

    // ---- locomotion blend space (phase synced)
    const C = CLIP_LIBRARY;
    const v = s.speed;
    let a1;
    let a2;
    let k;
    if (v <= sp.walk) [a1, a2, k] = ['idle', 'walk', v / sp.walk];
    else if (v <= sp.run) [a1, a2, k] = ['walk', 'run', (v - sp.walk) / (sp.run - sp.walk)];
    else [a1, a2, k] = ['run', 'sprint', Math.min(1, (v - sp.run) / (sp.sprint - sp.run))];
    const strideOf = (n) => (n === 'idle' ? C.walk.stride : C[n].stride);
    let stride = THREE.MathUtils.lerp(strideOf(a1), strideOf(a2), k);
    if (W.crouch > 0.5) stride = C.crouchWalk.stride;
    else if (W.stairs > 0.5) stride = C.stairsUp.stride;
    if (W.swim > 0.5) stride = C.swim.stride;
    if (s.grounded || s.swimming) this.phase = (this.phase + (v / stride) * dt) % 1;
    this.locomotionLabel = k > 0.5 ? a2 : a1;

    const pose = this.pose;
    const sampleLoco = (name, out) => (name === 'idle' ? sampleClip(C.idle, this.time / C.idle.duration, out) : sampleClip(C[name], this.phase, out));
    sampleLoco(a1, pose);
    if (k > 0) pose.blend(sampleLoco(a2, this._a), k);
    if (W.stairs > 0.01) pose.blend(sampleClip(C.stairsUp, this.phase, this._a), W.stairs * Math.min(1, v / sp.walk));
    if (W.crouch > 0.01) {
      sampleClip(C.crouchIdle, this.time / C.crouchIdle.duration, this._a);
      const kc = Math.min(1, v / A.crouchSpeed);
      if (kc > 0) this._a.blend(sampleClip(C.crouchWalk, this.phase, this._b), kc);
      pose.blend(this._a, W.crouch);
    }
    if (W.slide > 0.01) pose.blend(sampleClip(C.slide, this.time / C.slide.duration, this._a), W.slide);
    if (W.air > 0.01) {
      sampleClip(C.jump, 0, this._a);
      const kf = THREE.MathUtils.clamp((A.jumpToFall[0] - s.vy) / (A.jumpToFall[0] - A.jumpToFall[1]), 0, 1);
      if (kf > 0) this._a.blend(sampleClip(C.fall, this.time / C.fall.duration, this._b), kf);
      pose.blend(this._a, W.air);
    }
    if (W.swim > 0.01) {
      sampleClip(C.swimTread, this.time / C.swimTread.duration, this._a);
      const ks = Math.min(1, v / A.swimSpeed);
      if (ks > 0) this._a.blend(sampleClip(C.swim, this.phase, this._b), ks);
      pose.blend(this._a, W.swim);
    }
    if (W.land > 0.01) pose.blend(sampleClip(C.land, 0, this._a), W.land);

    // ---- actions
    let fullW = 0;
    for (const act of this.actions) {
      const clip = act.clip;
      act.t += (dt * act.speed) / clip.duration;
      if (!act.loop && act.t >= 1 && !clip.hold) act.out = true;
      const fade = act.out ? -dt / Math.max(1e-3, act.fadeOut) : dt / Math.max(1e-3, act.fadeIn);
      act.w = THREE.MathUtils.clamp(act.w + fade, 0, 1);
      for (const [ev, at] of Object.entries(clip.events)) {
        if (!act.fired.has(ev) && act.t >= at) {
          act.fired.add(ev);
          this.onEvent?.(ev, act.name);
        }
      }
      const tt = act.loop ? act.t : Math.min(1, act.t);
      sampleClip(clip, tt, this._a);
      const w = act.w * act.w * (3 - 2 * act.w);
      if (clip.mask === 'full') {
        pose.blend(this._a, w);
        fullW = Math.max(fullW, w);
      } else if (clip.mask === 'upper') pose.blend(this._a, w, UPPER_MASK, 0);
      else pose.add(this._a, w);
    }
    this.actions = this.actions.filter((a) => !(a.out && a.w <= 0));

    // Idle fidgets.
    const idle = s.grounded && v < 0.15 && !s.aiming && !s.crouching && this.actions.length === 0;
    this._idleTime = idle ? this._idleTime + dt : 0;
    if (this._idleTime > this._fidgetAt) {
      const list = ANIMATOR.fidget.clips;
      this.play(list[Math.floor(Math.random() * list.length)]);
      this._idleTime = 0;
      this._fidgetAt = this._nextFidget();
    }

    // ---- procedural: breathing, lean, bank
    const B = A.breathe;
    const breath = Math.sin(this.time * B.rate * Math.PI * 2);
    const calm = 1 - W.move * 0.6;
    this._addEuler(BONE_INDEX.chest, breath * B.chest * calm * DEG, 0, 0);
    this._addEuler(BONE_INDEX.clavicleL, 0, 0, -breath * B.clavicle * calm * DEG);
    this._addEuler(BONE_INDEX.clavicleR, 0, 0, breath * B.clavicle * calm * DEG);
    const L = A.lean;
    const targetLean = THREE.MathUtils.clamp(-s.accel * L.perAccel, -L.max, L.max) * (1 - fullW);
    this.lean += (targetLean - this.lean) * damp(L.rate, dt);
    this._addEuler(BONE_INDEX.spine, this.lean, 0, 0);
    const Bk = A.bank;
    const targetBank = THREE.MathUtils.clamp(s.turnRate * Bk.perTurn, -Bk.max, Bk.max) * W.move * (1 - fullW);
    this.bank += (targetBank - this.bank) * damp(Bk.rate, dt);
    this._addEuler(BONE_INDEX.hips, 0, 0, this.bank);
    this._addEuler(BONE_INDEX.chest, 0, 0, -this.bank * 0.5);

    // ---- write the pose
    const bones = this.c.bones;
    const rest = this.c.restPositions;
    for (let i = 0; i < bones.length; i++) {
      bones[i].quaternion.fromArray(pose.q, i * 4);
      bones[i].position.copy(rest[i]);
    }
    bones[BONE_INDEX.hips].position.add(pose.hips);
    this.c.root.updateMatrixWorld(true);

    // ---- IK
    const footTarget = this.ikEnabled && s.ground && s.grounded ? 1 - fullW : 0;
    W.foot += (footTarget - W.foot) * damp(IKC.foot.footRate, dt);
    if (W.foot > 0.01 && s.ground) this._footIK(dt, s);
    else this.hipsDrop += (0 - this.hipsDrop) * damp(IKC.foot.hipsRate, dt);
    this._lookAt(dt, s, fullW);
    if (W.aim > 0.01 && s.aimTarget) this._aimIK(s.aimTarget, W.aim);
  }

  _addEuler(i, x, y, z) {
    if (!x && !y && !z) return;
    _e.set(x, y, z, 'YXZ');
    _q.setFromEuler(_e);
    this.pose.getQ(i, _q2).multiply(_q);
    this.pose.setQ(i, _q2);
  }

  _footIK(dt, s) {
    const c = this.c;
    const b = c.bone;
    const F = IKC.foot;
    const w = this.w.foot;
    c.root.getWorldPosition(_root);
    c.root.getWorldQuaternion(_rootQ);
    _up.set(0, 1, 0).applyQuaternion(_rootQ);
    const ankleRest = c.joints.footL.y;
    const res = {};
    let drop = 0;
    for (const side of ['L', 'R']) {
      const foot = b[`foot${side}`];
      foot.getWorldPosition(_v);
      const hit = s.ground(_v.x, _root.y + F.rayUp, _v.z, F.rayLength, _hit);
      const gy = hit ? _hit.y : _root.y;
      const off = THREE.MathUtils.clamp(gy - _root.y, -F.maxAdjust, F.maxAdjust);
      this.footOffset[side] += (off - this.footOffset[side]) * damp(F.footRate, dt);
      const lift = _v.y - (_root.y + ankleRest);
      res[side] = { lift, normal: hit ? _hit.normal.clone() : _up.clone() };
      drop = Math.min(drop, this.footOffset[side]);
    }
    this.hipsDrop += (drop - this.hipsDrop) * damp(F.hipsRate, dt);
    b.hips.position.y += this.hipsDrop * w;
    b.hips.updateMatrixWorld(true);
    _axis.set(1, 0, 0).applyQuaternion(_rootQ);
    for (const side of ['L', 'R']) {
      const foot = b[`foot${side}`];
      foot.getWorldPosition(_v);
      const r = res[side];
      const desired = _root.y + ankleRest + Math.max(r.lift, 0) + this.footOffset[side];
      const dy = (desired - _v.y) * w;
      if (Math.abs(dy) > 1e-4) {
        _v2.copy(_v);
        _v2.y += dy;
        solveTwoBone(b[`thigh${side}`], b[`shin${side}`], foot, _v2, _axis);
      }
      const plant = 1 - THREE.MathUtils.clamp(r.lift / 0.08, 0, 1);
      alignFoot(foot, r.normal, _up, F.maxTilt, plant * w);
    }
  }

  _lookAt(dt, s, fullW) {
    const c = this.c;
    const b = c.bone;
    const L = IKC.look;
    c.root.getWorldQuaternion(_rootQ);
    let wantW = 0;
    let yaw = 0;
    let pitch = 0;
    if (this.lookEnabled && s.lookTarget) {
      b.head.getWorldPosition(_v);
      lookAngles(_v, s.lookTarget, _rootQ, _angles);
      if (Math.abs(_angles.yaw) < L.yawLimit * 1.4) {
        wantW = 1 - fullW;
        yaw = THREE.MathUtils.clamp(_angles.yaw, -L.yawLimit, L.yawLimit);
        pitch = THREE.MathUtils.clamp(_angles.pitch, -L.pitchLimit, L.pitchLimit);
      }
    }
    const k = damp(L.rate, dt);
    this.w.look += (wantW - this.w.look) * k;
    this.look.yaw += (yaw - this.look.yaw) * k;
    this.look.pitch += (pitch - this.look.pitch) * k;
    const w = this.w.look;
    if (w > 0.01) {
      for (const [name, share] of Object.entries(L.split)) turnBone(b[name], _rootQ, this.look.yaw * share * w, this.look.pitch * share * w);
    }
    // Eyes: whatever the head did not cover, plus small darts.
    const sac = this.face?.saccade;
    for (const side of ['L', 'R']) {
      const eye = b[`eye${side}`];
      let ey = sac ? sac.x : 0;
      let ep = sac ? sac.y : 0;
      if (s.lookTarget && w > 0.01) {
        eye.getWorldPosition(_v);
        b.head.getWorldQuaternion(_q);
        lookAngles(_v, s.lookTarget, _q, _angles);
        ey = THREE.MathUtils.lerp(ey, _angles.yaw, w);
        ep = THREE.MathUtils.lerp(ep, _angles.pitch, w);
      }
      _e.set(THREE.MathUtils.clamp(ep, -L.eyeLimit, L.eyeLimit), THREE.MathUtils.clamp(ey, -L.eyeLimit, L.eyeLimit), 0, 'YXZ');
      eye.quaternion.setFromEuler(_e);
      eye.updateMatrixWorld(true);
    }
  }

  _aimIK(target, w) {
    const c = this.c;
    const b = c.bone;
    const chain = [b.upperArmR, b.foreArmR, b.handR];
    chain.forEach((bone, i) => this._saved[i].copy(bone.quaternion));
    b.upperArmR.getWorldPosition(_v);
    const reach = (c.joints.upperArmR.y - c.joints.handR.y) * IKC.aim.reach;
    _v2.subVectors(target, _v).normalize();
    const handTarget = _v.clone().addScaledVector(_v2, reach);
    c.root.getWorldQuaternion(_rootQ);
    _axis.set(-1, 0, 0).applyQuaternion(_rootQ);
    solveTwoBone(b.upperArmR, b.foreArmR, b.handR, handTarget, _axis);
    // Point the wand at the target.
    b.handR.getWorldQuaternion(_q);
    const wandDir = c.wandAxis.clone().applyQuaternion(_q);
    b.handR.getWorldPosition(_v);
    const want = _v2.subVectors(target, _v).normalize();
    rotateBoneWorld(b.handR, _q2.setFromUnitVectors(wandDir, want));
    if (w < 0.999) {
      chain.forEach((bone, i) => {
        _q.copy(this._saved[i]).slerp(bone.quaternion, w);
        bone.quaternion.copy(_q);
      });
      b.upperArmR.updateMatrixWorld(true);
    }
  }

  /** Debug summary. */
  get summary() {
    const acts = this.actions.map((a) => `${a.name} ${(a.w * 100).toFixed(0)}%`).join(', ');
    return {
      locomotion: this.locomotionLabel,
      phase: this.phase,
      actions: acts || '—',
      ik: `ayak ${(this.w.foot * 100).toFixed(0)}% · bakış ${(this.w.look * 100).toFixed(0)}% · nişan ${(this.w.aim * 100).toFixed(0)}%`,
      hipsDrop: this.hipsDrop,
    };
  }
}
