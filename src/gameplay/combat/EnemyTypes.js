/**
 * @file EnemyTypes — every regular foe: dark wizards (spells, shields,
 * dodges, cover), Duelling Club opponents, giant spiders and spiderlings
 * (lunging bites, web spit), the mountain troll (telegraphed slam and
 * sweep), the werewolf (leap and claw combo, night only), the Solgun
 * wraith (life-draining aura, only a Patronus drives it off), animated
 * armour (wakes when you trespass) and pixie swarms.
 */
import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { ENEMIES, ENEMY_SPELLS, COMBAT } from '../../data/combat.js';
import { selector, sequence, condition, action, SUCCESS, FAILURE, RUNNING } from '../ai/BehaviorTree.js';
import { Character } from '../../procgen/characters/Character.js';
import { Animator } from '../../animation/Animator.js';
import { FaceAnimator } from '../../animation/FaceAnimator.js';
import { randomAppearance, randomName, mulberry } from '../../procgen/characters/Appearance.js';
import { spiderModel, trollModel, werewolfModel, wraithModel, armorModel, pixieModel } from '../../procgen/creatures/EnemyModels.js';
import { glowMaterial } from '../../render/SpellVisuals.js';

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const rand = (r, [a, b]) => a + r() * (b - a);

/** Weighted pick from [[id, weight], …]. */
function pick(rnd, list) {
  let t = rnd() * list.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of list) if ((t -= w) <= 0) return id;
  return list[0][0];
}

/**
 * The common tree: fight when engaged (retreat first if hurt), otherwise
 * search where the player vanished, investigate noises, patrol.
 */
export function standardTree(fight) {
  return selector(
    sequence(
      condition((e) => e.engaged && !e.mgr.player.dead),
      selector(sequence(condition((e) => e.shouldRetreat()), action((e, dt) => e.retreat(dt), 'geri çekilme')), fight),
    ),
    sequence(condition((e) => !!e.lastSeen), action((e, dt) => e.search(dt), 'arama')),
    sequence(condition((e) => !!e.noise), action((e, dt) => e.investigate(dt), 'şüphelenme')),
    action((e, dt) => e.patrol(dt), 'devriye'),
  );
}

// ------------------------------------------------------------ dark wizard

export class DarkWizard extends Enemy {
  constructor(mgr, pos, o = {}) {
    const def = o.def ?? ENEMIES.darkWizard;
    super(mgr, o.type ?? 'darkWizard', def, pos, o);
    const rnd = mulberry(o.seed ?? Math.floor(Math.random() * 1e6));
    this.rnd = rnd;
    const nm = randomName(rnd);
    if (!o.name) this.name = `${def.name} (${nm.firstName})`;
    const ctx = mgr.ctx;
    this.character = new Character({ library: ctx.library, preset: { ...ctx.preset, characterTexture: Math.min(512, ctx.preset.characterTexture), headDetail: Math.min(0.7, ctx.preset.headDetail) }, name: this.name });
    this.character.build({ ...nm, house: o.house ?? 'none', outfit: 'uniform', appearance: randomAppearance(rnd) });
    mgr.root.add(this.character.root);
    this.face = new FaceAnimator(this.character);
    this.animator = new Animator(this.character, this.face);
    this.animator.ikEnabled = false;
    this.shield = def.shield ? { health: def.shield.health, time: 0, age: 9, cooldown: 0 } : null;
    this.accuracy = o.accuracy ?? mgr.difficulty.accuracy;
    this.castEvery = def.castEvery;
    this.spellList = o.spells ?? def.spells;
    this.shieldChance = o.shieldChance ?? def.shield?.react ?? 0;
    this.dodgeChance = o.dodgeChance ?? def.dodge?.chance ?? 0;
    this._cast = rand(rnd, this.castEvery);
    this._dodgeCd = 0;
    this._coverCd = 4;
    this._reacted = new WeakSet();
    this._strafe = rnd() < 0.5 ? 1 : -1;
    const bubbleMat = glowMaterial('#6a9aff', 0.7);
    this.bubble = new THREE.Mesh(mgr.spells.visuals.sphere, bubbleMat);
    this.bubble.visible = false;
    mgr.root.add(this.bubble);
    this.tree = standardTree(selector(
      sequence(condition((e) => e.def.cover && e._wantCover()), action((e, dt) => e.takeCover(dt), 'siper alma')),
      action((e, dt) => e.duel(dt), 'saldırı'),
    ));
  }

  _wantCover() {
    return this._coverCd <= 0 && (this.health < this.maxHealth * 0.55 || (this.shield && this.shield.health <= 0)) && this.rnd() < 0.02;
  }

  takeCover(dt) {
    if (!this._coverTo) {
      const nav = this.mgr.navFor(this);
      this._coverTo = nav?.ready ? nav.cover(this.position, this.mgr.player.position, 12) : null;
      this._coverCd = 14;
      if (!this._coverTo) return FAILURE;
      this.mgr.bus.emit('combat:cover', { enemy: this });
    }
    if (this.moveTo(this._coverTo, this.def.speed[1], dt, 0.8)) {
      this._coverWait = (this._coverWait ?? 2.2) - dt;
      if (this.shield) this.shield.health = Math.min(this.def.shield.health, this.shield.health + 15 * dt);
      if (this._coverWait <= 0) {
        this._coverWait = null;
        this._coverTo = null;
        return SUCCESS;
      }
    }
    return RUNNING;
  }

  /** Keep range, strafe, cast when it is our turn. */
  duel(dt) {
    const player = this.mgr.player;
    const pp = player.position;
    const dist = this.distanceToPlayer();
    const [near, far] = this.def.range;
    this.facePoint(pp, dt, 7);
    if (dist > far) this.moveTo(this.squad ? this.squad.slot(this, pp, (near + far) / 2) : pp, this.def.speed[1], dt, 1.5);
    else {
      // Strafe around the player, backing off when too close.
      _v.set(pp.x - this.position.x, 0, pp.z - this.position.z).normalize();
      const side = _p.set(-_v.z, 0, _v.x).multiplyScalar(this._strafe);
      if (dist < near) side.addScaledVector(_v, -1.2);
      if (this.rnd() < dt * 0.3) this._strafe *= -1;
      this.walk(side.normalize(), this.def.speed[0]);
    }
    this._cast -= dt;
    if (this._cast <= 0 && dist < far + 4 && this.canSee()) {
      if (this.squad && !this.squad.requestAttack(this)) {
        this._cast = 0.4;
        return RUNNING;
      }
      this._cast = rand(this.rnd, this.castEvery);
      this.castAt(pick(this.rnd, this.spellList));
    }
    return RUNNING;
  }

  /** Play a cast, release the bolt a moment later (telegraphed by the pose). */
  castAt(spellId) {
    const S = ENEMY_SPELLS[spellId];
    this.animator.play(spellId === 'darkFire' ? 'castSweep' : 'castThrust');
    this.face.say(S.name, 1.8);
    this.startAction({
      name: 'cast',
      windup: 0.45,
      recovery: 0.35,
      onWindup: (e, k, dt) => e.facePoint(e.mgr.player.position, dt, 10),
      onStrike: (e) => {
        const from = e.character.getWandTip(new THREE.Vector3());
        const target = e.mgr.player.position.clone().setY(e.mgr.player.position.y + 1.1);
        // Lead the target a little, miss by (1 - accuracy).
        target.addScaledVector(e.mgr.player.controller.velocity, from.distanceTo(target) / S.speed * 0.6);
        const miss = (1 - e.accuracy) * 2.4;
        target.x += (e.rnd() - 0.5) * miss;
        target.y += (e.rnd() - 0.5) * miss * 0.5;
        target.z += (e.rnd() - 0.5) * miss;
        e.mgr.spells.launch(S, { id: spellId, from, dir: target.sub(from).normalize(), owner: e, ignore: e.mgr.allyIgnore(e) });
        e.squad?.releaseAttack(e);
      },
    });
  }

  /** React to player bolts: shield or sidestep. */
  _defend(dt) {
    this._dodgeCd -= dt;
    this._coverCd -= dt;
    if (!this.engaged || this.disabled) return;
    for (const p of this.mgr.spells.projectiles) {
      if ((p.owner !== 'player' && p.owner !== 'ally') || this._reacted.has(p)) continue;
      const to = _v.subVectors(this.position, p.pos);
      const d = to.length();
      if (d > 12) continue;
      if (to.normalize().dot(_p.copy(p.vel).normalize()) < 0.9) continue;
      this._reacted.add(p);
      const delay = this.mgr.difficulty.reaction;
      const r = this.rnd();
      if (this.shield && this.shield.cooldown <= 0 && r < this.shieldChance) {
        this._pendingDefense = { t: delay, kind: 'shield' };
      } else if (this._dodgeCd <= 0 && r < this.shieldChance + this.dodgeChance) {
        this._pendingDefense = { t: delay, kind: 'dodge' };
      }
      break;
    }
    const pd = this._pendingDefense;
    if (pd) {
      pd.t -= dt;
      if (pd.t <= 0) {
        this._pendingDefense = null;
        if (pd.kind === 'shield') this.raiseShield();
        else this.dodge();
      }
    }
  }

  raiseShield() {
    const D = this.def.shield;
    this.shield.time = D.duration;
    this.shield.age = 0;
    this.shield.cooldown = D.cooldown;
    if (this.shield.health <= 0) this.shield.health = D.health * 0.6;
    this.animator.play('shield');
    this.mgr.bus.emit('combat:enemyShield', { enemy: this });
  }

  dodge() {
    this._dodgeCd = this.def.dodge?.cooldown ?? 3;
    const f = this.forward;
    const side = _v.set(-f.z, 0, f.x).multiplyScalar(this.rnd() < 0.5 ? 1 : -1);
    this.controller.velocity.addScaledVector(side, 8);
    this.animator.play('dodgeRoll');
  }

  fixedUpdate(dt) {
    if (!this.dead) this._defend(dt);
    super.fixedUpdate(dt);
  }

  onDeath() {
    this.animator.stopAll();
    this.animator.play('collapse');
    this.bubble.visible = false;
  }

  render(dt, env) {
    const root = this.character.root;
    root.position.copy(this.position);
    root.rotation.set(0, this.yaw, 0);
    const S = this.status;
    const stunned = !this.dead && (S.stunned > 0 || S.staggered > 0);
    if (stunned && !this.animator.isPlaying('stun')) this.animator.play('stun', { loop: true });
    if (!stunned && this.animator.isPlaying('stun')) this.animator.stop('stun');
    const frozen = S.frozen > 0 || S.petrified > 0;
    this.face.setExpression(this.dead ? 'pain' : this.engaged ? 'frown' : 'neutral');
    this.face.update(dt);
    if (!frozen) {
      this.animator.update(dt, {
        speed: this.speed, grounded: this.controller.grounded, vy: this.controller.velocity.y, crouching: false, aiming: false,
        turnRate: 0, accel: 0, climb: 0, sliding: false, lookTarget: this.engaged ? env.playerHead : null, aimTarget: null, ground: null,
      });
    }
    this.character.update(dt, { camera: env.camera, wind: env.wind, groundY: this.position.y });
    const up = this.shield && this.shield.time > 0 && !this.dead;
    this.bubble.visible = up;
    if (up) {
      this.bubble.position.copy(this.position).setY(this.position.y + 1);
      this.bubble.scale.setScalar(1.1);
      this.bubble.material.uniforms.uOpacity.value = 0.35 + (this.shield.age < 0.3 ? 0.5 : 0) + Math.max(0, 1 - this.shield.health / this.def.shield.health) * 0.3;
    }
    root.visible = !(this.dead && this.deadTime > COMBAT.corpseTime - 0.2);
  }

  dispose() {
    super.dispose();
    this.character.dispose();
    this.bubble.material.dispose();
    this.bubble.removeFromParent();
  }
}

// ---------------------------------------------------------------- duelist

/** Duelling Club opponent: a wizard with a ladder profile who yields at zero. */
export class Duelist extends DarkWizard {
  constructor(mgr, pos, profile, o = {}) {
    const def = {
      ...ENEMIES.darkWizard,
      name: profile.name,
      health: profile.health,
      castEvery: profile.castEvery,
      range: [5, 11],
      cover: false,
      lowHealthRetreat: 0,
      shield: { ...ENEMIES.darkWizard.shield, cooldown: 4 },
    };
    super(mgr, pos, { ...o, type: 'duelist', def, name: `${profile.name} (${profile.title})`, seed: profile.seed, faction: 'duel', healthScale: 1, accuracy: profile.accuracy, spells: profile.spells, shieldChance: profile.shield, dodgeChance: profile.dodge, house: o.house });
    this.profile = profile;
    this.engaged = false;
    this.awareness = 0;
    this.bounds = o.bounds;
    this.tree = selector(action((e, dt) => (e.fighting ? e.duel(dt) : e._ready(dt)), 'düello'));
  }

  _ready(dt) {
    this.facePoint(this.mgr.player.position, dt, 6);
    return RUNNING;
  }

  duel(dt) {
    const r = super.duel(dt);
    // Stay on the stage.
    const B = this.bounds;
    if (B) {
      const p = this.position;
      const c = _v.set((B.minX + B.maxX) / 2, 0, (B.minZ + B.maxZ) / 2);
      if (p.x < B.minX + 0.6 || p.x > B.maxX - 0.6 || p.z < B.minZ + 0.8 || p.z > B.maxZ - 0.8) this.walk(c.sub(p).setY(0).normalize(), this.def.speed[0]);
    }
    return r;
  }

  canSee() {
    return this.fighting && !this.mgr.player.dead;
  }

  // The duel ends at zero health: they yield.
  onDeath() {
    this.animator.stopAll();
    this.animator.play('collapse');
    this.bubble.visible = false;
    this.mgr.bus.emit('duel:opponentDown', { enemy: this });
  }

  get gone() {
    return false;
  }
}

// ------------------------------------------------------------------ spider

export class Spider extends Enemy {
  constructor(mgr, pos, o = {}) {
    const type = o.type ?? 'spider';
    const def = ENEMIES[type];
    super(mgr, type, def, pos, o);
    this.model = spiderModel(mgr.cache, def);
    mgr.root.add(this.model.root);
    this._biteCd = 0;
    this._spitCd = 2 + Math.random() * 3;
    this.tree = standardTree(selector(
      sequence(condition((e) => e._biteCd <= 0 && e.distanceToPlayer() < e.def.bite.range + e.def.radius + 0.6), action((e) => e.bite(), 'ısırma')),
      sequence(condition((e) => e.def.spit && e._spitCd <= 0 && e.distanceToPlayer() > 5 && e.distanceToPlayer() < e.def.spit.range && e.canSee()), action((e) => e.spit(), 'ağ tükürme')),
      action((e, dt) => e.chase(dt), 'saldırı'),
    ));
  }

  chase(dt) {
    const pp = this.mgr.player.position;
    const token = !this.squad || this.squad.requestAttack(this);
    const target = token ? pp : this.squad.slot(this, pp, 4.5, _p);
    this.moveTo(target, this.def.speed[1], dt, token ? this.def.bite.range : 0.8);
    if (!token) this.facePoint(pp, dt);
    return RUNNING;
  }

  bite() {
    const B = this.def.bite;
    this._biteCd = B.cooldown;
    this.startAction({
      name: 'bite',
      windup: B.windup,
      active: 0.25,
      recovery: 0.45,
      telegraph: { shape: 'cone', radius: B.range + this.def.radius, angle: 80, yaw: this.yaw, color: 0xff5020 },
      onWindup: (e, k, dt) => e.facePoint(e.mgr.player.position, dt, 10),
      onStrike: (e) => {
        e.controller.velocity.addScaledVector(e.forward, B.lunge);
      },
      onActive: (e, t) => {
        if (!e._bitten && t > 0.1) {
          e._bitten = true;
          e.meleeHit(B.range + e.def.radius, 110, B.damage);
        }
      },
    });
    this._bitten = false;
    this.squad?.releaseAttack(this);
    return SUCCESS;
  }

  spit() {
    const S = this.def.spit;
    this._spitCd = S.cooldown;
    this.startAction({
      name: 'spit',
      windup: S.windup,
      recovery: 0.4,
      onWindup: (e, k, dt) => e.facePoint(e.mgr.player.position, dt, 10),
      onStrike: (e) => {
        const from = e.center(new THREE.Vector3()).addScaledVector(e.forward, e.def.radius + 0.4);
        const to = e.mgr.player.position.clone().setY(e.mgr.player.position.y + 1);
        e.mgr.spells.launch(ENEMY_SPELLS.web, { id: 'web', from, dir: to.sub(from).normalize().add(new THREE.Vector3(0, 0.12, 0)).normalize(), owner: e, ignore: e.mgr.allyIgnore(e) });
      },
    });
    return SUCCESS;
  }

  fixedUpdate(dt) {
    this._biteCd -= dt;
    this._spitCd -= dt;
    super.fixedUpdate(dt);
  }

  render(dt) {
    const m = this.model;
    m.root.position.copy(this.position);
    m.root.rotation.y = this.yaw;
    const a = this.action;
    m.update(dt, { speed: this.speed, action: a ? (a.struck ? 'strike' : 'windup') : null, k: a ? Math.min(1, a.t / a.windup) : 0, dead: this.dead, deadT: this.deadTime, time: this.time });
    m.root.visible = !(this.dead && this.deadTime > COMBAT.corpseTime - 0.2);
  }

  dispose() {
    super.dispose();
    this.model.dispose();
  }
}

// ------------------------------------------------------------------- troll

export class Troll extends Enemy {
  constructor(mgr, pos, o = {}) {
    super(mgr, 'troll', ENEMIES.troll, pos, o);
    this.model = trollModel(mgr.cache, this.def);
    mgr.root.add(this.model.root);
    this._cd = 0;
    this.tree = standardTree(selector(
      sequence(condition((e) => e._cd <= 0 && e.distanceToPlayer() < e.def.slam.reach + e.def.slam.radius), action((e) => e.smash(), 'ezme')),
      action((e, dt) => {
        e.moveTo(e.mgr.player.position, e.def.speed[1], dt, e.def.slam.reach + 1);
        return RUNNING;
      }, 'saldırı'),
    ));
  }

  smash() {
    const d = this.distanceToPlayer();
    const facing = this.facing(this.mgr.player.position);
    if (d < this.def.sweep.range && facing > 0.3 && this.rnd() < 0.5) {
      const S = this.def.sweep;
      this._cd = S.cooldown;
      this.startAction({
        name: 'sweep',
        windup: S.windup,
        recovery: 0.8,
        telegraph: { shape: 'cone', radius: S.range + this.def.radius, angle: S.angle, yaw: this.yaw, color: 0xff3a10 },
        onStrike: (e) => {
          e.meleeHit(S.range + e.def.radius, S.angle, S.damage, 'light');
          e.mgr.bus.emit('spell:impact', { strength: 0.3 });
        },
      });
      return SUCCESS;
    }
    const S = this.def.slam;
    this._cd = S.cooldown;
    const at = this.position.clone().addScaledVector(this.forward, S.reach);
    this.startAction({
      name: 'slam',
      windup: S.windup,
      recovery: 1.2,
      telegraph: { shape: 'circle', pos: at, radius: S.radius, color: 0xff2a0a },
      onStrike: (e) => {
        e.meleeHit(S.radius, 360, S.damage, S.stun, at);
        e.mgr.spells.visuals.shockwave(at.clone().setY(at.y + 0.1), '#c8a070', S.radius * 1.3, 0.5);
        e.mgr.spells.smoke.burst(24, at, { speed: [1, 4], life: 1.4, size: 0.5, endSize: 1.6, color: '#6a5a48', alpha: 0.45, endAlpha: 0, shape: 2, lift: 0.8, drag: 1.5 });
        e.mgr.bus.emit('spell:impact', { strength: 0.7, hitStop: true });
      },
    });
    return SUCCESS;
  }

  fixedUpdate(dt) {
    this._cd -= dt;
    super.fixedUpdate(dt);
  }

  render(dt) {
    const m = this.model;
    m.root.position.copy(this.position);
    m.root.rotation.y = this.yaw;
    const a = this.action;
    const name = a ? (a.struck ? a.name : `${a.name}Windup`) : null;
    m.update(dt, { speed: this.speed, action: name, k: a ? Math.min(1, a.t / a.windup) : 0, dead: this.dead, deadT: this.deadTime, time: this.time, stagger: this.status.staggered > 0 });
    m.root.visible = !(this.dead && this.deadTime > COMBAT.corpseTime - 0.2);
  }

  dispose() {
    super.dispose();
    this.model.dispose();
  }
}

// ---------------------------------------------------------------- werewolf

export class Werewolf extends Enemy {
  constructor(mgr, pos, o = {}) {
    super(mgr, 'werewolf', ENEMIES.werewolf, pos, o);
    this.model = werewolfModel(mgr.cache, this.def);
    mgr.root.add(this.model.root);
    this._leapCd = 1;
    this._clawCd = 0;
    this._howl = 0;
    this.tree = standardTree(selector(
      sequence(condition((e) => e._clawCd <= 0 && e.distanceToPlayer() < e.def.claw.range + 0.4), action((e) => e.claw(), 'pençe')),
      sequence(condition((e) => {
        const d = e.distanceToPlayer();
        return e._leapCd <= 0 && d > e.def.leap.range[0] && d < e.def.leap.range[1] && e.canSee();
      }), action((e) => e.leap(), 'sıçrama')),
      action((e, dt) => {
        e.moveTo(e.mgr.player.position, e.def.speed[1], dt, e.def.claw.range);
        return RUNNING;
      }, 'saldırı'),
    ));
  }

  onSpotted() {
    this._howl = 1.1;
    this.mgr.bus.emit('spell:message', { text: 'Uzaklardan tüyler ürpertici bir uluma yükseliyor…' });
  }

  leap() {
    const L = this.def.leap;
    this._leapCd = L.cooldown;
    const pp = this.mgr.player.position;
    const dist = this.distanceToPlayer();
    this.facePoint(pp, 1, 50);
    this.startAction({
      name: 'leap',
      windup: L.windup,
      active: 0.55,
      recovery: 0.6,
      telegraph: { shape: 'lane', length: dist + 1.5, width: 1.8, yaw: this.yaw, color: 0xffa020 },
      onStrike: (e) => {
        e.controller.velocity.copy(e.forward).multiplyScalar(dist / 0.5);
        e.controller.velocity.y = 5;
        e._leapHit = false;
      },
      onActive: (e) => {
        if (!e._leapHit && e.distanceToPlayer() < 1.8) {
          e._leapHit = true;
          e.meleeHit(2.2, 360, L.damage, 'light');
        }
      },
    });
    return SUCCESS;
  }

  claw() {
    const C = this.def.claw;
    this._clawCd = C.cooldown;
    this._hits = 0;
    this.startAction({
      name: 'claw',
      windup: C.windup,
      active: 0.5,
      recovery: 0.3,
      telegraph: { shape: 'cone', radius: C.range + 0.4, angle: 110, yaw: this.yaw, color: 0xffa020 },
      onStrike: (e) => {
        e.meleeHit(C.range + 0.4, 120, C.damage);
        e._hits = 1;
      },
      onActive: (e, t) => {
        if (e._hits < C.hits && t > 0.3) {
          e._hits++;
          e.meleeHit(C.range + 0.4, 120, C.damage);
        }
      },
    });
    return SUCCESS;
  }

  fixedUpdate(dt) {
    this._leapCd -= dt;
    this._clawCd -= dt;
    this._howl -= dt;
    super.fixedUpdate(dt);
  }

  render(dt) {
    const m = this.model;
    m.root.position.copy(this.position);
    m.root.rotation.y = this.yaw;
    const a = this.action;
    const name = this._howl > 0 ? 'howl' : a ? (a.struck ? a.name : `${a.name}Windup`) : null;
    m.update(dt, { speed: this.speed, action: name, k: a ? Math.min(1, a.struck ? (a.t - a.windup) / 0.5 : a.t / a.windup) : 0, dead: this.dead, deadT: this.deadTime, time: this.time });
    m.root.visible = !(this.dead && this.deadTime > COMBAT.corpseTime - 0.2);
  }

  dispose() {
    super.dispose();
    this.model.dispose();
  }
}

// ------------------------------------------------------------------ wraith

export class Wraith extends Enemy {
  constructor(mgr, pos, o = {}) {
    super(mgr, 'wraith', ENEMIES.wraith, pos.clone().setY(pos.y + ENEMIES.wraith.float), { ...o, fly: true });
    this.model = wraithModel(mgr.cache, mgr.time);
    mgr.root.add(this.model.root);
    this.banished = false;
    this._warned = 0;
    this.tree = standardTree(action((e, dt) => e.haunt(dt), 'emme'));
  }

  haunt(dt) {
    const pp = this.mgr.player.position;
    const target = _p.set(pp.x, pp.y + this.def.float + 0.4, pp.z);
    _v.subVectors(this.position, target).setY(0);
    if (_v.length() < 2.5) this.flyTo(this.position, 0, dt);
    else this.flyTo(target, this.def.speed[1], dt, 2.5);
    this.facePoint(pp, dt);
    return RUNNING;
  }

  /** Any spell other than the Patronus just passes through. */
  onImmuneSpell() {
    if (this.time - this._warned > 4) {
      this._warned = this.time;
      this.mgr.bus.emit('spell:message', { text: 'Büyü Solgun\'un içinden geçip gitti — onu yalnızca bir Patronus kovabilir!' });
    }
    return false;
  }

  /** Driven off by a Patronus. */
  banish() {
    if (this.banished || this.dead) return;
    this.banished = true;
    this.velocity.set(0, 4, 0);
    this.mgr.bus.emit('spell:message', { text: 'Patronus Solgun\'u kovdu!' });
    this.die();
  }

  render(dt) {
    const m = this.model;
    if (this.dead) this.position.addScaledVector(this.velocity, dt);
    m.root.position.copy(this.position).setY(this.position.y - this.def.float);
    m.root.rotation.y = this.yaw;
    m.update(dt, { action: this.engaged && this.distanceToPlayer() < this.def.aura.radius ? 'drain' : null, dead: this.dead, deadT: this.deadTime, time: this.time });
  }

  dispose() {
    super.dispose();
    this.model.dispose();
  }
}

// ------------------------------------------------------------------ armour

export class ArmorKnight extends Enemy {
  constructor(mgr, pos, o = {}) {
    super(mgr, 'armor', ENEMIES.armor, pos, o);
    this.model = armorModel(mgr.cache);
    mgr.root.add(this.model.root);
    this.dormant = !!o.wake;
    this.wake = o.wake ?? null;
    this._cd = 0;
    const fight = selector(
      sequence(condition((e) => e._cd <= 0 && e.distanceToPlayer() < e.def.slash.range + 0.3), action((e) => e.slash(), 'kılıç')),
      action((e, dt) => {
        e.moveTo(e.mgr.player.position, e.def.speed[1], dt, e.def.slash.range);
        return RUNNING;
      }, 'saldırı'),
    );
    this.tree = selector(sequence(condition((e) => e.dormant), action((e) => e._sleep(), 'bekçi (uyuyor)')), standardTree(fight));
  }

  _sleep() {
    const p = this.mgr.player.position;
    const W = this.wake;
    if (W && p.z >= W.minZ && p.z <= W.maxZ && Math.abs(p.y - this.position.y) < 3) {
      this.dormant = false;
      this.hearAlly(p);
      this.squad?.alert(this, p);
      this.mgr.bus.emit('spell:message', { text: 'Zırhlar gıcırdayarak canlandı: "Yasak Bölüm\'e izinsiz giriş!"' });
    }
    return RUNNING;
  }

  _perception(dt) {
    if (!this.dormant) super._perception(dt);
  }

  slash() {
    const S = this.def.slash;
    this._cd = S.cooldown;
    this.startAction({
      name: 'slash',
      windup: S.windup,
      recovery: 0.7,
      telegraph: { shape: 'cone', radius: S.range + 0.3, angle: S.angle, yaw: this.yaw, color: 0x80b0ff },
      onWindup: (e, k, dt) => e.facePoint(e.mgr.player.position, dt, 4),
      onStrike: (e) => e.meleeHit(S.range + 0.3, S.angle, S.damage, 'light'),
    });
    return SUCCESS;
  }

  fixedUpdate(dt) {
    this._cd -= dt;
    super.fixedUpdate(dt);
  }

  render(dt) {
    const m = this.model;
    m.root.position.copy(this.position);
    m.root.rotation.y = this.yaw;
    const a = this.action;
    m.update(dt, { speed: this.speed, action: a ? (a.struck ? 'slash' : 'slashWindup') : null, k: a ? Math.min(1, a.t / a.windup) : 0, dead: this.dead, deadT: this.deadTime, time: this.time });
  }

  get gone() {
    return false;
  }

  dispose() {
    super.dispose();
    this.model.dispose();
  }
}

// ------------------------------------------------------------------ pixie

export class Pixie extends Enemy {
  constructor(mgr, pos, o = {}) {
    super(mgr, 'pixie', ENEMIES.pixie, pos.clone().setY(pos.y + ENEMIES.pixie.float), { ...o, fly: true });
    this.model = pixieModel(mgr.cache);
    mgr.root.add(this.model.root);
    this.phase = Math.random() * Math.PI * 2;
    this._pinch = 1 + Math.random() * 2;
    this._diving = false;
    this.patrolRadius = 4;
    this.tree = standardTree(action((e, dt) => e.pester(dt), 'saldırı'));
  }

  pester(dt) {
    const pp = this.mgr.player.position;
    this._pinch -= dt;
    this.phase += dt * 1.8;
    const head = _p.set(pp.x, pp.y + 1.6, pp.z);
    if (this._diving) {
      if (this.flyTo(head, this.def.speed[1], dt, this.def.pinch.range)) {
        this.mgr.strikePlayer(this, this.def.pinch.damage, null);
        this._diving = false;
        this._pinch = this.def.pinch.cooldown + Math.random() * 2;
        this.squad?.releaseAttack(this);
      }
    } else {
      const r = 2.2 + Math.sin(this.phase * 0.7) * 0.6;
      const orbit = _v.set(pp.x + Math.cos(this.phase) * r, pp.y + 1.8 + Math.sin(this.phase * 2.3) * 0.5, pp.z + Math.sin(this.phase) * r);
      this.flyTo(orbit, this.def.speed[0] * 1.3, dt, 0.2);
      if (this._pinch <= 0 && (!this.squad || this.squad.requestAttack(this))) this._diving = true;
    }
    return RUNNING;
  }

  render(dt) {
    const m = this.model;
    if (this.dead) {
      this.velocity.y -= 9 * dt;
      this.position.addScaledVector(this.velocity, dt);
    } else if (Math.random() < 0.4) {
      this.mgr.spells.glow.spawn(this.position, { x: 0, y: -0.2, z: 0 }, { life: 0.4, size: 0.05, color: '#8ac8ff', shape: 1 });
    }
    m.root.position.copy(this.position);
    m.root.rotation.y = this.yaw;
    m.update(dt, { dead: this.dead, deadT: this.deadTime, time: this.time });
    m.root.visible = !(this.dead && this.deadTime > 2);
  }

  dispose() {
    super.dispose();
    this.model.dispose();
  }
}

/** Type → class. */
export const ENEMY_CLASSES = Object.freeze({
  darkWizard: DarkWizard,
  spider: Spider,
  spiderling: Spider,
  troll: Troll,
  werewolf: Werewolf,
  wraith: Wraith,
  armor: ArmorKnight,
  pixie: Pixie,
});
