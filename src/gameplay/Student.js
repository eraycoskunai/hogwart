/**
 * @file Student — an original background student built with the character
 * generator. Simple showcase behaviours for now (full routines and dialogue
 * arrive with the NPC phase):
 *   idle   stands, fidgets, turns its head to the player nearby
 *   sit    sits on a bench / seat
 *   walk   paces between two points with walk animation and turns
 *   cast   practises spell casts toward a target point
 */
import * as THREE from 'three';
import { Character } from '../procgen/characters/Character.js';
import { Animator } from '../animation/Animator.js';
import { FaceAnimator } from '../animation/FaceAnimator.js';
import { makeGroundProbe } from '../animation/GroundProbe.js';
import { randomAppearance, randomName, mulberry } from '../procgen/characters/Appearance.js';
import { HOUSES } from '../data/character.js';

export const STUDENT = Object.freeze({
  lookRange: 6,
  walkSpeed: 1.35,
  turnRate: 5,
  pause: [1.2, 2.8],
  castEvery: [2.2, 4.2],
  greetRange: 2.6,
  greetCooldown: 12,
  headHeight: 1.45,
});

const _v = new THREE.Vector3();
const _to = new THREE.Vector3();

function angleDelta(a, b) {
  return THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI;
}

export class Student {
  /**
   * @param {{scene:THREE.Scene, physics:any, library:any, preset:any}} ctx
   * @param {{seed:number, behavior:string, pos:number[], yaw:number, to?:number[], target?:number[], house?:string, outfit?:string}} spec
   */
  constructor(ctx, spec) {
    const rnd = mulberry(spec.seed);
    const houses = Object.keys(HOUSES).filter((h) => h !== 'none');
    const name = randomName(rnd);
    this.data = {
      ...name,
      house: spec.house ?? houses[Math.floor(rnd() * houses.length)],
      outfit: spec.outfit ?? 'uniform',
      appearance: randomAppearance(rnd),
    };
    this.name = `${name.firstName} ${name.lastName}`;
    this.spec = spec;
    this.behavior = spec.behavior;
    this.character = new Character({ library: ctx.library, preset: { ...ctx.preset, characterTexture: Math.min(512, ctx.preset.characterTexture), headDetail: Math.min(0.75, ctx.preset.headDetail) }, name: this.name });
    this.character.build(this.data);
    ctx.scene.add(this.character.root);
    this.face = new FaceAnimator(this.character);
    this.animator = new Animator(this.character, this.face);
    this._ground = makeGroundProbe(ctx.physics);
    this.position = new THREE.Vector3().fromArray(spec.pos);
    this.yaw = spec.yaw;
    this.home = this.position.clone();
    this.away = spec.to ? new THREE.Vector3().fromArray(spec.to) : null;
    this.target = spec.target ? new THREE.Vector3().fromArray(spec.target) : null;
    this.goal = this.away;
    this.speed = 0;
    this._wait = 0;
    this._timer = 1 + rnd() * 2;
    this._greet = 0;
    this._turnRate = 0;
    this._rnd = rnd;
    this.state = this.behavior;
    if (this.behavior === 'sit') this.animator.play('sit', { loop: true, fadeIn: 0.01 });
    this.character.root.position.copy(this.position);
    this.character.root.rotation.y = this.yaw;
  }

  /** World point at eye height (others look at it). */
  headPoint(out) {
    return out.copy(this.position).setY(this.position.y + STUDENT.headHeight * (this.character.height / 1.5) * (this.behavior === 'sit' ? 0.72 : 1));
  }

  /**
   * @param {number} dt
   * @param {{camera:THREE.Camera, player:THREE.Vector3, playerHead:THREE.Vector3, wind:THREE.Vector3}} env
   */
  update(dt, env) {
    const S = STUDENT;
    let face = null;
    this.speed = 0;
    const prevYaw = this.yaw;
    if (this.behavior === 'walk' && this.goal) {
      if (this._wait > 0) this._wait -= dt;
      else {
        _to.subVectors(this.goal, this.position).setY(0);
        const d = _to.length();
        if (d < 0.15) {
          this.goal = this.goal === this.away ? this.home : this.away;
          const [a, b] = S.pause;
          this._wait = a + this._rnd() * (b - a);
        } else {
          face = Math.atan2(-_to.x, -_to.z);
          const step = Math.min(d, S.walkSpeed * dt);
          this.position.addScaledVector(_to.normalize(), step);
          this.speed = S.walkSpeed;
        }
      }
    }
    if (this.behavior === 'cast' && this.target) {
      _to.subVectors(this.target, this.position);
      face = Math.atan2(-_to.x, -_to.z);
      this._timer -= dt;
      if (this._timer <= 0) {
        const [a, b] = S.castEvery;
        this._timer = a + this._rnd() * (b - a);
        this.animator.playRandomCast();
      }
    }
    if (face !== null) this.yaw += angleDelta(this.yaw, face) * (1 - Math.exp(-S.turnRate * dt));
    this._turnRate = dt > 0 ? angleDelta(prevYaw, this.yaw) / dt : 0;

    // Keep the feet on the floor while walking.
    if (this.behavior === 'walk') {
      const hit = { y: 0, normal: _v };
      if (this._ground(this.position.x, this.position.y + 0.8, this.position.z, 2, hit)) this.position.y = hit.y;
    }

    // Look at and greet the player when close.
    const distToPlayer = this.position.distanceTo(env.player);
    const look = distToPlayer < S.lookRange ? env.playerHead : this.target;
    this._greet -= dt;
    if (distToPlayer < S.greetRange && this._greet <= 0 && this.behavior !== 'cast') {
      this._greet = S.greetCooldown;
      this.face.setExpression('smile');
      if (this.behavior === 'idle') this.animator.play('wave');
    } else if (distToPlayer > S.lookRange) this.face.setExpression('neutral');

    const root = this.character.root;
    root.position.copy(this.position);
    root.rotation.set(0, this.yaw, 0);
    this.face.update(dt);
    this.animator.update(dt, {
      speed: this.speed, grounded: true, vy: 0, crouching: false, aiming: false, turnRate: this._turnRate, accel: 0,
      climb: 0, sliding: false, lookTarget: look, aimTarget: null, ground: this.behavior === 'sit' ? null : this._ground,
    });
    this.character.update(dt, { camera: env.camera, wind: env.wind, groundY: this.position.y });
  }

  get debugState() {
    const a = this.animator.summary;
    return `${this.behavior} · ${a.locomotion} · ${a.actions}`;
  }

  dispose() {
    this.character.dispose();
  }
}
