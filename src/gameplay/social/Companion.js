/**
 * @file Companion — one befriendable classmate in the world. At a routine
 * place they sit, read, practise spells, watch or stand about (placed
 * exactly, like the background students). Between places they walk when
 * the way is short and clear, otherwise they slip away out of sight and
 * turn up at the next place. When following the player they walk or run
 * behind with a capsule controller, wait while you fly, catch up through
 * doors and stairs, fight beside you (casting from their own spell list)
 * and — the healer — patch you up when you are hurt.
 */
import * as THREE from 'three';
import { Character } from '../../procgen/characters/Character.js';
import { Animator } from '../../animation/Animator.js';
import { FaceAnimator } from '../../animation/FaceAnimator.js';
import { makeGroundProbe } from '../../animation/GroundProbe.js';
import { CharacterController } from '../../physics/CharacterController.js';
import { PLAYER } from '../../data/physics.js';
import { randomAppearance, mulberry } from '../../procgen/characters/Appearance.js';
import { SPELLS } from '../../data/spells.js';
import { COMPANION } from '../../data/companions.js';

const _v = new THREE.Vector3();
const _to = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
/** _fight result: moving for a clear line of sight this step. */
const BLOCKED = 'blocked';
const _hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };

function angleDelta(a, b) {
  return THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI;
}

export class Companion {
  /**
   * @param {{scene:THREE.Scene, physics:any, library:any, preset:any, spells:any, bus:any}} ctx
   * @param {string} id
   * @param {any} spec COMPANIONS entry
   */
  constructor(ctx, id, spec) {
    this.ctx = ctx;
    this.id = id;
    this.spec = spec;
    this.name = spec.name;
    const rnd = mulberry(spec.seed);
    const [first, ...rest] = spec.name.split(' ');
    this.character = new Character({ library: ctx.library, preset: { ...ctx.preset, characterTexture: Math.min(1024, ctx.preset.characterTexture) }, name: spec.name });
    this.character.build({ firstName: first, lastName: rest.join(' '), house: spec.house, outfit: spec.outfit, appearance: randomAppearance(rnd) });
    ctx.scene.add(this.character.root);
    this.face = new FaceAnimator(this.character);
    this.animator = new Animator(this.character, this.face);
    this._ground = makeGroundProbe(ctx.physics);
    this.controller = new CharacterController(ctx.physics, PLAYER);
    this.position = this.controller.position;
    this.yaw = 0;
    this.speed = 0;
    this._turnRate = 0;
    /** place | walk | follow | away */
    this.mode = 'away';
    this.place = null;
    this.placeKey = null;
    this._pending = null;
    this._walkT = 0;
    this._act = 0;
    this._cast = 1 + Math.random();
    this._heal = 0;
    this._bark = 0;
    this._greet = 0;
    this.rnd = rnd;
    this.character.root.visible = false;
  }

  // ------------------------------------------------------------ geometry

  headPoint(out) {
    const sitting = this.mode === 'place' && this.place?.activity === 'sit';
    return out.copy(this.position).setY(this.position.y + COMPANION.headHeight * (this.character.height / 1.5) * (sitting ? 0.72 : 1));
  }

  /** Is the companion inside the camera's view (and near enough to notice)? */
  seenBy(camera) {
    if (!this.character.root.visible || !camera) return false;
    if (this.position.distanceTo(camera.position) > 60) return false;
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    return _frustum.containsPoint(this.headPoint(_v));
  }

  // ------------------------------------------------------------- places

  /** Stand exactly at a place (world position, activity). */
  _settle(place) {
    this.mode = 'place';
    this.place = place;
    this.controller.teleport(place.world);
    this.yaw = place.yaw;
    this.character.root.visible = true;
    this._startActivity();
  }

  _startActivity() {
    const a = this.animator;
    a.stop('sit');
    a.stop('flightHover');
    if (this.place?.activity === 'sit') a.play('sit', { loop: true, fadeIn: 0.3 });
  }

  /**
   * Go to a routine place. Walk if it is close and on the same floor,
   * otherwise re-appear there once nobody is looking.
   * @param {string} key
   * @param {{world:THREE.Vector3, yaw:number, activity:string, label:string}} place
   * @param {boolean} instant
   */
  goTo(key, place, instant) {
    this.placeKey = key;
    if (instant || this.mode === 'away') {
      this._settle(place);
      return;
    }
    const d = this.position.distanceTo(place.world);
    if (d < COMPANION.walkRange && Math.abs(place.world.y - this.position.y) < 1) {
      this.animator.stop('sit');
      this.mode = 'walk';
      this.place = place;
      this._walkT = 0;
      this.controller.teleport(this.position.clone().setY(this.position.y + 0.05));
    } else this._pending = { place, leave: false };
  }

  /** Leave the region / go to bed (vanish out of sight). */
  leave() {
    this.placeKey = null;
    if (this.mode === 'away') return;
    this._pending = { place: null, leave: true };
  }

  /** Start following the player. */
  follow(player) {
    this.mode = 'follow';
    this._pending = null;
    this.animator.stop('sit');
    if (!this.character.root.visible) this._behind(player);
    else this.controller.teleport(this.position.clone().setY(this.position.y + 0.1));
    this.character.root.visible = true;
  }

  /** Put the companion a few metres behind the player. */
  _behind(player) {
    _fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const p = player.position.clone().addScaledVector(_fwd, -COMPANION.follow.near);
    p.y += 0.2;
    this.controller.teleport(p);
    this.yaw = player.yaw;
    this.character.root.visible = true;
  }

  // -------------------------------------------------------------- update

  /**
   * @param {number} dt fixed step
   * @param {{player:any, camera:THREE.Camera, enemies:any[], bark:(text:string)=>void}} env
   */
  fixedUpdate(dt, env) {
    const player = env.player;
    this.speed = 0;
    const prevYaw = this.yaw;
    // Pending move: happens when unseen.
    if (this._pending && !this.seenBy(env.camera)) {
      const p = this._pending;
      this._pending = null;
      if (p.leave) {
        this.mode = 'away';
        this.character.root.visible = false;
      } else this._settle(p.place);
    }
    if (this.mode === 'walk') this._walk(dt);
    else if (this.mode === 'follow') this._follow(dt, env);
    this._turnRate = angleDelta(prevYaw, this.yaw) / dt;
    this._greet -= dt;
    void player;
  }

  _walk(dt) {
    const target = this.place.world;
    _to.subVectors(target, this.position).setY(0);
    const d = _to.length();
    this._walkT += dt;
    if (d < 0.35 || this._walkT > COMPANION.walkTimeout) {
      this._settle(this.place);
      return;
    }
    _to.divideScalar(d);
    this.yaw += angleDelta(this.yaw, Math.atan2(-_to.x, -_to.z)) * (1 - Math.exp(-6 * dt));
    this.controller.step(dt, _to, COMPANION.walkSpeed);
    this.speed = Math.hypot(this.controller.velocity.x, this.controller.velocity.z);
  }

  _follow(dt, env) {
    const F = COMPANION.follow;
    const player = env.player;
    const c = this.controller;
    const pp = player.position;
    const d = Math.hypot(pp.x - this.position.x, pp.z - this.position.z);
    // Too far (stairs, doors, teleports): catch up out of sight.
    if (d > F.teleport || Math.abs(pp.y - this.position.y) > 5) {
      if (!player.mount && player.controller.grounded) this._behind(player);
      return;
    }
    // While the player flies, wait.
    if (player.mount) {
      c.step(dt, _to.set(0, 0, 0), 0);
      this._faceTo(pp, dt);
      return;
    }
    const foe = this._fight(dt, env);
    if (foe === BLOCKED) return;
    if (foe) {
      c.step(dt, _to.set(0, 0, 0), 0);
      this._faceTo(foe.position, dt, 10);
      return;
    }
    if (d > F.near) {
      _to.set(pp.x - this.position.x, 0, pp.z - this.position.z).normalize();
      const speed = d > F.far ? F.run : F.walk;
      c.step(dt, _to, speed);
      this.yaw += angleDelta(this.yaw, Math.atan2(-_to.x, -_to.z)) * (1 - Math.exp(-8 * dt));
    } else {
      c.step(dt, _to.set(0, 0, 0), 0);
      this._faceTo(pp, dt, 3);
    }
    this.speed = Math.hypot(c.velocity.x, c.velocity.z);
    if (this.position.y < -80) this._behind(player);
  }

  _faceTo(p, dt, rate = 6) {
    _to.set(p.x - this.position.x, 0, p.z - this.position.z);
    if (_to.lengthSq() > 1e-4) this.yaw += angleDelta(this.yaw, Math.atan2(-_to.x, -_to.z)) * (1 - Math.exp(-rate * dt));
  }

  /** Fight beside the player. @returns {any} the foe being fought, BLOCKED, or null */
  _fight(dt, env) {
    const C = COMPANION.combat;
    const player = env.player;
    // The healer tends to the player first.
    const H = this.spec.healer;
    this._heal -= dt;
    if (H && this._heal <= 0 && !player.dead && player.health < player.maxHealth * H.below) {
      this._heal = H.cooldown;
      player.heal(player.maxHealth * (H.amount / 100));
      this.animator.play('castCircle');
      this.face.say('Episkey!', 1.4);
      this.ctx.spells.glow.burst(30, player.position.clone().setY(player.position.y + 1), { speed: [0.5, 2], life: 0.9, size: 0.1, color: '#7affb0', shape: 1, lift: 1.2, drag: 1.5, jitter: 0.8 });
      env.bark(this.spec.first, 'Dayan, iyileştiriyorum!');
    }
    let foe = null;
    let best = C.range;
    for (const e of env.enemies) {
      if (e.dead || !e.engaged || e.def?.immune || e.faction === 'duel') continue;
      const d = e.position.distanceTo(this.position);
      if (d < best) {
        best = d;
        foe = e;
      }
    }
    if (!foe) return null;
    // Blocked view (columns, doorways): step sideways instead of wasting a spell.
    const eye = this.headPoint(_v);
    const aim = foe.center(_to);
    const len = eye.distanceTo(aim);
    _fwd.subVectors(aim, eye).divideScalar(len);
    if (this.ctx.physics.raycast(eye, _fwd, len - 0.8, { dynamic: false, kinematic: false }, _hit)) {
      this._sidestep = this._sidestep ?? (this.rnd() < 0.5 ? -1 : 1);
      _fwd.set(-_fwd.z * this._sidestep, 0, _fwd.x * this._sidestep).normalize();
      this.controller.step(dt, _fwd, COMPANION.follow.walk * 1.5);
      this.speed = Math.hypot(this.controller.velocity.x, this.controller.velocity.z);
      return BLOCKED;
    }
    this._sidestep = null;
    this._cast -= dt;
    if (this._cast <= 0) {
      const [a, b] = C.castEvery;
      this._cast = a + this.rnd() * (b - a);
      const list = this.spec.spells;
      const id = list[Math.floor(this.rnd() * list.length)];
      const S = SPELLS[id];
      const from = this.character.getWandTip(new THREE.Vector3());
      const to = foe.center(new THREE.Vector3()).addScaledVector(foe.velocity ?? _v.set(0, 0, 0), C.lead * (from.distanceTo(foe.position) / S.speed));
      this.animator.play(S.clip ?? 'castFlick');
      this.face.say(S.name, 1.6);
      this.ctx.spells.launch(S, { id, from, dir: to.sub(from).normalize(), owner: 'ally', power: 0.8 });
      this._bark -= 1;
      if (this._bark <= 0) {
        this._bark = 3 + Math.floor(this.rnd() * 3);
        env.bark(this.spec.first, null);
      }
    }
    return foe;
  }

  /**
   * @param {number} dt
   * @param {{camera:THREE.Camera, playerHead:THREE.Vector3, player:THREE.Vector3, wind:THREE.Vector3, visible:(p:THREE.Vector3)=>boolean}} env
   */
  render(dt, env) {
    const root = this.character.root;
    if (this.mode === 'away') {
      root.visible = false;
      return;
    }
    const inView = env.visible(this.position);
    root.visible = inView;
    if (!inView) return;
    const dist = this.position.distanceTo(env.player);
    root.position.copy(this.position);
    root.rotation.set(0, this.yaw, 0);
    const sitting = this.mode === 'place' && this.place?.activity === 'sit';
    const look = dist < COMPANION.lookRange ? env.playerHead : null;
    // Activity flavour: practice casts, page turning glances.
    this._act -= dt;
    if (this.mode === 'place' && this._act <= 0) {
      this._act = 3 + this.rnd() * 4;
      if (this.place.activity === 'cast') this.animator.playRandomCast();
      else if (this.place.activity === 'watch' && this.rnd() < 0.3) this.animator.play('wave');
    }
    if (dist < COMPANION.greetRange && this._greet <= 0 && this.mode === 'place') {
      this._greet = 20;
      this.face.setExpression('smile');
      if (!sitting) this.animator.play('wave');
    }
    this.face.update(dt);
    const moving = this.mode === 'walk' || this.mode === 'follow';
    this.animator.update(dt, {
      speed: this.speed, grounded: moving ? this.controller.grounded : true, vy: moving ? this.controller.velocity.y : 0, crouching: false, aiming: false,
      turnRate: this._turnRate, accel: 0, climb: 0, sliding: false, lookTarget: look, aimTarget: null, ground: sitting ? null : this._ground,
    });
    this.character.update(dt, { camera: env.camera, wind: env.wind, groundY: this.position.y });
  }

  get debugState() {
    return `${this.mode}${this.place ? ` · ${this.place.label}` : ''}${this._pending ? ' · (gidecek)' : ''}`;
  }

  dispose() {
    this.character.dispose();
    this.character.root.removeFromParent();
  }
}
