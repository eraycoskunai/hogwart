/**
 * @file ProceduralAnimator — code-driven locomotion for the mannequin rig:
 * stride-synchronised feet, counter-swinging arms, body bob, lean into
 * acceleration and turns, crouch compression, airborne pose, landing squash,
 * breathing idle and an aim pose that raises the wand arm.
 */
import * as THREE from 'three';

export const ANIM = Object.freeze({
  walkStride: 1.25,
  runStride: 2.1,
  stepLift: 0.09,
  armSwing: 0.55,
  bob: 0.035,
  leanPerSpeed: 0.022,
  bankPerTurn: 0.045,
  crouchCompress: 0.34,
  breatheRate: 1.7,
  breatheAmount: 0.012,
  landSquash: 0.13,
  landRecover: 7,
  blendRate: 10,
});

const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export class ProceduralAnimator {
  /** @param {import('../procgen/characters/Mannequin.js').MannequinRig} rig */
  constructor(rig) {
    this.rig = rig;
    this.phase = 0;
    this.time = 0;
    this.moveBlend = 0;
    this.airBlend = 0;
    this.crouchBlend = 0;
    this.aimBlend = 0;
    this.squash = 0;
    this.lean = 0;
    this.bank = 0;
  }

  /** Trigger a landing squash. @param {number} strength 0..1 */
  land(strength) {
    this.squash = Math.max(this.squash, THREE.MathUtils.clamp(strength, 0, 1));
  }

  /**
   * @param {number} dt
   * @param {{speed:number, runSpeed:number, grounded:boolean, vy:number, crouching:boolean,
   *          aiming:boolean, turnRate:number}} s
   */
  update(dt, s) {
    const A = ANIM;
    const r = this.rig;
    this.time += dt;

    const moveT = THREE.MathUtils.clamp(s.speed / s.runSpeed, 0, 1.6);
    this.moveBlend += ((s.grounded ? Math.min(1, moveT) : 0) - this.moveBlend) * damp(A.blendRate, dt);
    this.airBlend += ((s.grounded ? 0 : 1) - this.airBlend) * damp(A.blendRate, dt);
    this.crouchBlend += ((s.crouching ? 1 : 0) - this.crouchBlend) * damp(A.blendRate, dt);
    this.aimBlend += ((s.aiming ? 1 : 0) - this.aimBlend) * damp(A.blendRate * 1.4, dt);
    this.squash += (0 - this.squash) * damp(A.landRecover, dt);

    const stride = THREE.MathUtils.lerp(A.walkStride, A.runStride, Math.min(1, moveT));
    if (s.grounded) this.phase += (s.speed / stride) * Math.PI * 2 * dt * 0.5;
    const ph = this.phase;
    const amp = this.moveBlend;

    // Feet
    const reach = stride * 0.22 * amp;
    const lift = A.stepLift * amp * (0.6 + 0.4 * Math.min(1, moveT));
    const tuck = this.airBlend;
    r.footL.position.z = -0.02 - Math.sin(ph) * reach;
    r.footR.position.z = -0.02 + Math.sin(ph) * reach;
    r.footL.position.y = 0.04 + Math.max(0, Math.cos(ph)) * lift + tuck * 0.12;
    r.footR.position.y = 0.04 + Math.max(0, -Math.cos(ph)) * lift + tuck * 0.08;
    r.footL.rotation.x = Math.sin(ph) * 0.35 * amp;
    r.footR.rotation.x = -Math.sin(ph) * 0.35 * amp;

    // Crouch compression
    const cr = this.crouchBlend * A.crouchCompress;
    const squash = this.squash * A.landSquash;
    const compress = 1 - cr - squash;
    r.robe.scale.set(1 + squash * 0.35, compress, 1 + squash * 0.35);
    const bob = Math.abs(Math.sin(ph)) * A.bob * amp - A.bob * 0.5 * amp;
    const breathe = Math.sin(this.time * A.breatheRate * Math.PI) * A.breatheAmount * (1 - amp);
    const yScale = compress;
    r.head.position.y = r.base.headY * yScale + bob + breathe * 0.5;
    r.base.scarf.position.y = r.base.scarfY * yScale + bob;
    r.armL.shoulder.position.y = r.base.shoulderY * yScale + bob + breathe;
    r.armR.shoulder.position.y = r.base.shoulderY * yScale + bob + breathe;
    r.robe.position.y = bob * 0.5;

    // Lean / bank
    const targetLean = -Math.min(1.2, moveT) * A.leanPerSpeed * 4 - this.crouchBlend * 0.18;
    this.lean += (targetLean - this.lean) * damp(6, dt);
    this.bank += (THREE.MathUtils.clamp(-s.turnRate * A.bankPerTurn, -0.25, 0.25) * amp - this.bank) * damp(6, dt);
    r.body.rotation.x = this.lean;
    r.body.rotation.z = this.bank;
    r.head.rotation.x = -this.lean * 0.6 + Math.sin(this.time * 0.9) * 0.02 * (1 - amp);

    // Arms: swing opposite to legs, raise when airborne.
    const swing = Math.sin(ph) * A.armSwing * amp;
    const air = this.airBlend;
    r.armL.shoulder.rotation.x = swing - air * 0.5;
    r.armL.shoulder.rotation.z = -0.09 - air * 0.55;
    r.armL.elbow.rotation.x = 0.15 + amp * 0.45 + air * 0.3;

    const aim = this.aimBlend;
    const rSwing = -swing - air * 0.5;
    // Positive X rotation swings an arm forward; the hand counter-rotates so the wand points ahead.
    r.armR.shoulder.rotation.x = THREE.MathUtils.lerp(rSwing, 1.42, aim);
    r.armR.shoulder.rotation.z = THREE.MathUtils.lerp(0.09 + air * 0.55, 0.05, aim);
    r.armR.elbow.rotation.x = THREE.MathUtils.lerp(0.15 + amp * 0.45 + air * 0.3, 0.08, aim);
    r.armR.hand.rotation.x = THREE.MathUtils.lerp(0, -1.4, aim);
  }
}
