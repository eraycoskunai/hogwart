/**
 * @file Ghost — an original castle ghost: a generated figure rendered with
 * the translucent mist shader, floating a little above the floor along a
 * looping path that passes straight through walls. It stops, turns to a
 * player who comes close and speaks a line now and then.
 */
import * as THREE from 'three';
import { Character } from '../procgen/characters/Character.js';
import { Animator } from '../animation/Animator.js';
import { FaceAnimator } from '../animation/FaceAnimator.js';
import { randomAppearance, mulberry } from '../procgen/characters/Appearance.js';
import { createGhostMaterial } from '../render/EffectMaterials.js';

export const GHOST = Object.freeze({
  bob: 0.09,
  bobRate: 0.9,
  turnRate: 3,
  noticeRange: 3.6,
  talkCooldown: 18,
  opacity: 0.62,
  rim: 1.8,
  headHeight: 1.55,
});

function angleDelta(a, b) {
  return THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI;
}

export class Ghost {
  /**
   * @param {{scene:THREE.Scene, library:any, preset:any}} ctx
   * @param {{id:string, name:string, seed:number, color:number, speed:number, height:number, path:number[][], lines:string[]}} spec
   * @param {(name:string, text:string) => void} onSay
   */
  constructor(ctx, spec, onSay) {
    this.ctx = ctx;
    this.spec = spec;
    this.name = spec.name;
    this.onSay = onSay;
    const rnd = mulberry(spec.seed);
    this._rnd = rnd;
    this.character = new Character({ library: ctx.library, preset: { ...ctx.preset, characterTexture: Math.min(256, ctx.preset.characterTexture), headDetail: Math.min(0.6, ctx.preset.headDetail) }, name: spec.name });
    this.character.build({ firstName: spec.name, lastName: '', house: 'none', outfit: 'uniform', appearance: randomAppearance(rnd) });
    this.character.simulateCloth = true;
    this._tex = ctx.library.acquireTextures('ghost');
    this.material = createGhostMaterial(this._tex.albedo, ctx.library.shared, { color: spec.color, opacity: GHOST.opacity, rim: GHOST.rim });
    this.character.root.traverse((o) => {
      if (o.isMesh) {
        o.material = this.material;
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    ctx.scene.add(this.character.root);
    this.face = new FaceAnimator(this.character);
    this.animator = new Animator(this.character, this.face);
    this.animator.ikEnabled = false;
    this.path = spec.path.map((p) => new THREE.Vector3().fromArray(p));
    this.index = 0;
    this.position = this.path[0].clone();
    this.yaw = 0;
    this.time = rnd() * 10;
    this._talk = 2 + rnd() * 4;
    this._line = 0;
    this.visible = true;
  }

  headPoint(out) {
    return out.copy(this.position).setY(this.position.y + this.spec.height + GHOST.headHeight);
  }

  /**
   * @param {number} dt
   * @param {{camera:THREE.Camera, player:THREE.Vector3, playerHead:THREE.Vector3, wind:THREE.Vector3}} env
   */
  update(dt, env) {
    this.time += dt;
    this._talk -= dt;
    const toPlayer = new THREE.Vector3().subVectors(env.player, this.position).setY(0);
    const near = toPlayer.length() < GHOST.noticeRange && Math.abs(env.player.y - this.position.y) < 3;
    let face;
    let speed = 0;
    if (near) {
      face = Math.atan2(-toPlayer.x, -toPlayer.z);
      if (this._talk <= 0) {
        this._talk = GHOST.talkCooldown;
        const L = this.spec.lines;
        this.onSay(this.name, L[this._line++ % L.length]);
        this.face.say(L[(this._line - 1) % L.length]);
      }
    } else {
      const target = this.path[(this.index + 1) % this.path.length];
      const to = new THREE.Vector3().subVectors(target, this.position);
      const d = to.length();
      if (d < 0.2) this.index = (this.index + 1) % this.path.length;
      else {
        speed = this.spec.speed;
        this.position.addScaledVector(to.normalize(), Math.min(d, speed * dt));
        face = Math.atan2(-to.x, -to.z);
      }
    }
    if (face !== undefined) this.yaw += angleDelta(this.yaw, face) * (1 - Math.exp(-GHOST.turnRate * dt));
    const root = this.character.root;
    root.visible = this.visible;
    if (!this.visible) return;
    root.position.copy(this.position);
    root.position.y += this.spec.height + Math.sin(this.time * GHOST.bobRate) * GHOST.bob;
    root.rotation.set(0, this.yaw, 0);
    this.face.update(dt);
    this.animator.update(dt, {
      speed: 0, grounded: true, vy: 0, crouching: false, aiming: false, turnRate: 0, accel: 0, climb: 0,
      sliding: false, lookTarget: near ? env.playerHead : null, aimTarget: null, ground: null,
    });
    this.character.update(dt, { camera: env.camera, wind: env.wind, groundY: -Infinity });
  }

  get debugState() {
    return `${this.visible ? 'görünür' : 'gizli'} · hedef ${this.index}`;
  }

  dispose() {
    this.character.dispose();
    this.material.dispose();
    this.ctx.library.releaseTextures('ghost');
  }
}
