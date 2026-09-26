/**
 * @file Enemy — shared body of every foe: health, stun bar (poise) and
 * stagger, an optional spell shield with shield-breaking, spell statuses
 * (stunned, frozen, petrified, burning, knocked down), perception (sight
 * cone + line of sight, hearing, awareness that builds and decays),
 * behaviour-tree ticking, grid navigation and a kinematic collider so
 * spells and the player collide with it. Subclasses provide the model,
 * the tree and the attacks.
 *
 * Also a SpellTargets handler: onSpell(ev) → true when affected
 * (ev.blocked when a shield absorbed it, ev.reflect when parried back).
 */
import * as THREE from 'three';
import { CharacterController } from '../../physics/CharacterController.js';
import { PLAYER } from '../../data/physics.js';
import { COMBAT, PERCEPTION, NAV } from '../../data/combat.js';
import { ELEMENTS } from '../../data/spells.js';
import { tick, SUCCESS, FAILURE, RUNNING } from '../ai/BehaviorTree.js';

const Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };

export function angleDelta(a, b) {
  return THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI;
}

let _ids = 0;

export class Enemy {
  /**
   * @param {import('./EncounterManager.js').EncounterManager} mgr
   * @param {string} type ENEMIES key
   * @param {any} def stats
   * @param {THREE.Vector3} pos
   * @param {{fly?:boolean, name?:string, faction?:string}} [o]
   */
  constructor(mgr, type, def, pos, o = {}) {
    this.id = ++_ids;
    this.mgr = mgr;
    this.type = type;
    this.def = def;
    this.name = o.name ?? def.name;
    this.faction = o.faction ?? 'dark';
    this.hostile = true;
    this.takesDamage = true;
    /** hurt() shows its own damage numbers. */
    this.reportsDamage = true;
    const D = mgr.difficulty;
    this.maxHealth = Math.round(def.health * (o.healthScale ?? D.health));
    this.health = this.maxHealth;
    this.maxPoise = def.poise;
    this.poise = 0;
    this._poiseIdle = 0;
    this.status = { stunned: 0, frozen: 0, petrified: 0, burning: 0, staggered: 0, knocked: 0 };
    this.dead = false;
    this.deadTime = 0;
    this.fly = !!o.fly;
    this.home = pos.clone();
    this.yaw = o.yaw ?? 0;
    this.speed = 0;
    this.awareness = 0;
    this.engaged = false;
    this.lastSeen = null;
    this.lastSeenTime = -1e9;
    this.noise = null;
    this.btState = 'devriye';
    this.time = 0;
    this._perceive = Math.random() * PERCEPTION.tick;
    this.path = null;
    this._pathTo = new THREE.Vector3(1e9, 0, 0);
    this._repath = 0;
    this.action = null;
    this.shield = null;
    this.rnd = Math.random;
    this._wishDir = new THREE.Vector3();
    this._wishSpeed = 0;

    if (this.fly) {
      this.position = pos.clone();
      this.velocity = new THREE.Vector3();
    } else {
      const cfg = { ...PLAYER, radius: def.radius, height: def.height, stepHeight: Math.min(0.6, def.height * 0.35), groundAccel: 30, groundDecel: 30 };
      this.controller = new CharacterController(mgr.physics, cfg);
      this.controller.teleport(pos);
      this.position = this.controller.position;
      this.velocity = this.controller.velocity;
    }
    // Kinematic collider: spells and the player collide with it.
    const size = new THREE.Vector3(def.radius * 1.7, def.height, def.radius * 1.7);
    this.colliderOffset = def.height / 2;
    this.body = mgr.physics.addKinematicBox(size, null, pos.clone().setY(pos.y + this.colliderOffset), new THREE.Quaternion(), { surface: 'flesh', name: this.name });
    this.collider = this.body.collider;
    if (this.controller) this.controller._filter.ignore = new Set([this.collider.id]);
    mgr.targets.add(this.collider, this);
    this.tree = null;
  }

  // ------------------------------------------------------------ geometry

  center(out) {
    return out.set(this.position.x, this.position.y + this.def.height * 0.6, this.position.z);
  }

  headPoint(out) {
    return out.set(this.position.x, this.position.y + this.def.height * 0.92, this.position.z);
  }

  // LockTarget interface (camera lock-on).
  getLockPoint(out) {
    return this.center(out);
  }

  isLockable() {
    return !this.dead;
  }

  get forward() {
    return _d.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  distanceToPlayer() {
    const p = this.mgr.player.position;
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  // ------------------------------------------------------------ perception

  canSee() {
    const player = this.mgr.player;
    if (player.dead) return false;
    const p = player.position;
    const dist = this.position.distanceTo(p);
    if (dist > this.def.sight) return false;
    if (dist > PERCEPTION.closeRange) {
      _v.subVectors(p, this.position).setY(0).normalize();
      const cos = _v.dot(this.forward);
      if (cos < Math.cos(THREE.MathUtils.degToRad(this.def.fov / 2))) return false;
    }
    const eye = this.headPoint(new THREE.Vector3());
    const target = _v.set(p.x, p.y + 1.4, p.z);
    _d.subVectors(target, eye);
    const len = _d.length();
    _d.divideScalar(len);
    const hit = this.mgr.physics.raycast(eye, _d, len, { dynamic: false, kinematic: false }, _hit);
    return !hit;
  }

  _perception(dt) {
    this._perceive -= dt;
    if (this._perceive > 0) return;
    const step = PERCEPTION.tick;
    this._perceive = step;
    const P = PERCEPTION;
    if (this.canSee()) {
      const dist = this.distanceToPlayer();
      const gain = P.gain * Math.max(0.25, 1 - dist / this.def.sight) * this.mgr.difficulty.aggression;
      this.awareness = Math.min(1, this.awareness + gain * step);
      if (this.awareness >= 1) {
        const was = this.engaged;
        this.engaged = true;
        this.lastSeen = this.mgr.player.position.clone();
        this.lastSeenTime = this.time;
        if (!was) {
          this.mgr.bus.emit('combat:spotted', { enemy: this });
          this.squad?.alert(this, this.lastSeen);
          this.onSpotted?.();
        }
      } else if (this.awareness > P.suspicious) this.noise = this.mgr.player.position.clone();
    } else {
      this.awareness = Math.max(this.engaged ? 0.6 : 0, this.awareness - P.decay * step);
      if (this.engaged && this.time - this.lastSeenTime > P.forget) {
        this.engaged = false;
        this.squad?.releaseAttack(this);
      }
    }
  }

  /** A squad-mate spotted the player. */
  hearAlly(pos) {
    if (this.dead) return;
    this.awareness = Math.max(this.awareness, 0.95);
    this.engaged = true;
    this.lastSeen = pos.clone();
    this.lastSeenTime = this.time;
  }

  /** A noise (spell impact, cast) at `pos` with loudness 0..1. */
  hear(pos, loudness) {
    if (this.dead || this.engaged) return;
    if (pos.distanceTo(this.position) > this.def.hearing * loudness) return;
    this.noise = pos.clone();
    this.awareness = Math.max(this.awareness, PERCEPTION.suspicious + 0.05);
  }

  // ------------------------------------------------------------- damage

  /** Is the enemy unable to act? */
  get disabled() {
    const S = this.status;
    return this.dead || S.frozen > 0 || S.petrified > 0 || S.staggered > 0 || S.knocked > 0 || S.stunned > 0;
  }

  /**
   * Spell hit (SpellTargets interface).
   * @param {any} ev
   */
  onSpell(ev) {
    if (this.dead) return false;
    const id = ev.id;
    const S = ev.spell;
    if (this.def.immune) return this.onImmuneSpell?.(ev) ?? false;
    // Raised shield: absorb, break or parry.
    if (this.shield && this.shield.time > 0) {
      const brk = COMBAT.shieldBreak[id] ?? 1;
      const parryWindow = this.shield.age < 0.3 && this.rnd() < this.mgr.difficulty.parry;
      if (parryWindow && S.kind === 'bolt') {
        ev.reflect = true;
        this.mgr.bus.emit('combat:parried', { enemy: this });
        return true;
      }
      this.shield.health -= (S.damage ?? 5) * ev.power * brk + 4;
      ev.blocked = true;
      this.mgr.spells.visuals.aura(this.center(new THREE.Vector3()), '#7aa8ff', this.def.height * 0.6, 0.3);
      if (this.shield.health <= 0) {
        this.shield.time = 0;
        this.status.stunned = 1.4;
        this.mgr.bus.emit('combat:shieldBroken', { enemy: this });
      }
      return true;
    }
    const mult = (this.def.resist?.[id] ?? 1) * (this.def.weak?.[id] ?? 1) * (this.status.staggered > 0 ? COMBAT.stagger.vulnerability : 1);
    const dmg = (S.damage ?? 0) * ev.power * mult;
    const E = ELEMENTS;
    switch (ev.effect) {
      case 'stun':
      case 'disarm':
        this.status.stunned = Math.max(this.status.stunned, E.stun.duration * mult * 0.6);
        break;
      case 'freeze':
        if (this.status.burning > 0) this.status.burning = 0;
        else this.status.frozen = E.freeze.duration * 0.6 * Math.min(1, mult + 0.3);
        break;
      case 'petrify':
        this.status.petrified = E.petrify.duration * 0.5 * mult;
        break;
      case 'ignite':
        if (this.status.frozen > 0) this.status.frozen = 0;
        else this.status.burning = E.burn.duration * 0.6;
        break;
      case 'push':
      case 'pull':
      case 'slam':
      case 'explode':
        this._shove(ev);
        break;
      case 'finite':
        this.status.frozen = this.status.petrified = this.status.burning = 0;
        return true;
      case 'unlock':
      case 'repair':
        return false;
      default:
        break;
    }
    this.hurt(dmg, (COMBAT.poiseBonus[id] ?? 0) + dmg * COMBAT.poisePerDamage);
    // Getting hit always reveals the attacker.
    this.hearAlly(this.mgr.player.position);
    this.squad?.alert(this, this.mgr.player.position);
    return true;
  }

  _shove(ev) {
    const k = (ev.spell.impulse ?? 0) * ev.power / Math.max(1, this.def.radius * 2);
    if (this.fly) this.velocity.addScaledVector(ev.dir, k * 0.6);
    else if (ev.effect === 'pull') {
      const to = _v.subVectors(this.mgr.player.position, this.position).setY(0).normalize();
      this.controller.velocity.addScaledVector(to, k * 0.7);
    } else if (ev.effect === 'slam') this.status.knocked = Math.max(this.status.knocked, 1.6);
    else this.controller.velocity.addScaledVector(_v.copy(ev.dir).setY(0).normalize(), k * 0.8).add(_d.set(0, Math.min(6, k * 0.25), 0));
  }

  /**
   * @param {number} amount health
   * @param {number} poise stun-bar damage
   */
  hurt(amount, poise = amount) {
    if (this.dead || amount <= 0) return;
    this.health -= amount;
    this.mgr.bus.emit('spell:damage', { pos: this.headPoint(new THREE.Vector3()).setY(this.position.y + this.def.height + 0.3), amount: Math.round(amount), color: this.status.staggered > 0 ? '#ffd24a' : '#ffffff' });
    if (this.health <= 0) {
      this.die();
      return;
    }
    if (this.status.staggered <= 0) {
      this.poise += poise;
      this._poiseIdle = 0;
      if (this.poise >= this.maxPoise) {
        this.poise = 0;
        this.status.staggered = COMBAT.stagger.duration;
        this.cancelAction();
        this.mgr.bus.emit('combat:staggered', { enemy: this });
      }
    }
    this.onHurt?.(amount);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this.deadTime = 0;
    this.cancelAction();
    this.collider.enabled = false;
    this.squad?.releaseAttack(this);
    this.mgr.bus.emit('combat:killed', { enemy: this });
    this.onDeath?.();
  }

  // ----------------------------------------------------------- movement

  /**
   * Walk toward `point` along a nav path.
   * @returns {boolean} arrived
   */
  moveTo(point, speed, dt, arrive = 0.8) {
    if (this.fly) return this.flyTo(point, speed, dt, arrive);
    const flat = Math.hypot(point.x - this.position.x, point.z - this.position.z);
    if (flat < arrive) {
      this.walk(null, 0);
      return true;
    }
    const nav = this.mgr.navFor(this);
    this._repath -= dt;
    if (nav?.ready && (this._repath <= 0 || !this.path || this._pathTo.distanceTo(point) > 1.5)) {
      this._repath = NAV.repath;
      this._pathTo.copy(point);
      this.path = nav.findPath(this.position, point);
    }
    let next = point;
    if (this.path?.length) {
      while (this.path.length > 1 && Math.hypot(this.path[0].x - this.position.x, this.path[0].z - this.position.z) < 0.6) this.path.shift();
      next = this.path[0];
    }
    _v.set(next.x - this.position.x, 0, next.z - this.position.z);
    if (_v.lengthSq() < 1e-6) _v.set(point.x - this.position.x, 0, point.z - this.position.z);
    this.walk(_v.normalize(), speed);
    this.faceDir(_v, dt);
    return false;
  }

  /** Flying movement (no nav, gentle obstacle avoidance by height). */
  flyTo(point, speed, dt, arrive = 0.5) {
    _v.subVectors(point, this.position);
    const d = _v.length();
    if (d < arrive) {
      this.velocity.multiplyScalar(Math.exp(-4 * dt));
      return true;
    }
    _v.divideScalar(d);
    this.velocity.lerp(_v.multiplyScalar(speed), 1 - Math.exp(-3 * dt));
    this.faceDir(_d.copy(this.velocity).setY(0), dt);
    return false;
  }

  /** Step the controller (ground enemies). dir may be null (stop). */
  walk(dir, speed) {
    if (this.fly) return;
    if (dir) this._wishDir.copy(dir);
    else this._wishDir.set(0, 0, 0);
    this._wishSpeed = dir ? speed : 0;
  }

  faceDir(dir, dt, rate = 6) {
    if (dir.lengthSq() < 1e-6) return;
    const target = Math.atan2(-dir.x, -dir.z);
    this.yaw += angleDelta(this.yaw, target) * (1 - Math.exp(-rate * dt));
  }

  facePoint(p, dt, rate = 8) {
    this.faceDir(_v.set(p.x - this.position.x, 0, p.z - this.position.z), dt, rate);
  }

  /** How squarely we face `p` (cos of the angle). */
  facing(p) {
    _v.set(p.x - this.position.x, 0, p.z - this.position.z).normalize();
    return _v.dot(this.forward);
  }

  // ------------------------------------------------------- behaviours

  /** Wander between random points around home. */
  patrol(dt) {
    const S = this.def.speed;
    if (this._wait > 0) {
      this._wait -= dt;
      this.walk(null, 0);
      return RUNNING;
    }
    if (!this._patrolTo) {
      const nav = this.mgr.navFor(this);
      const r = this.patrolRadius ?? 8;
      this._patrolTo = this.fly
        ? this.home.clone().add(new THREE.Vector3((this.rnd() - 0.5) * r * 2, (this.rnd() - 0.5) * 1.5, (this.rnd() - 0.5) * r * 2))
        : nav?.ready ? nav.randomPoint(this.home, r, this.rnd) : null;
      if (!this._patrolTo) {
        this._wait = 1;
        return RUNNING;
      }
    }
    if (this.moveTo(this._patrolTo, S[0], dt)) {
      this._patrolTo = null;
      this._wait = 1.5 + this.rnd() * 3;
    }
    return RUNNING;
  }

  /** Walk carefully to a noise, look around, forget it. */
  investigate(dt) {
    if (!this.noise) return FAILURE;
    if (this.moveTo(this.noise, this.def.speed[0] * 1.2, dt, 1.5)) {
      this._look = (this._look ?? 2.5) - dt;
      this.yaw += dt * 1.2;
      if (this._look <= 0) {
        this._look = null;
        this.noise = null;
      }
    }
    return RUNNING;
  }

  /** Go to where the player was last seen and search around. */
  search(dt) {
    if (!this.lastSeen) return FAILURE;
    if (this.moveTo(this.lastSeen, this.def.speed[1] * 0.8, dt, 1.5)) {
      this._searchT = (this._searchT ?? PERCEPTION.searchTime) - dt;
      this.yaw += dt * 1.6;
      if (this._searchT <= 0) {
        this._searchT = null;
        this.lastSeen = null;
        this.awareness = 0;
      }
    }
    return RUNNING;
  }

  shouldRetreat() {
    return !!this.def.lowHealthRetreat && this.health < this.maxHealth * this.def.lowHealthRetreat && !this._retreated;
  }

  /** Back off to cover (or simply away) once. */
  retreat(dt) {
    if (!this._retreatTo) {
      const nav = this.mgr.navFor(this);
      this._retreatTo = nav?.ready ? nav.cover(this.position, this.mgr.player.position, 14) : null;
      if (!this._retreatTo) {
        const away = _v.subVectors(this.position, this.mgr.player.position).setY(0).normalize().multiplyScalar(8);
        this._retreatTo = this.position.clone().add(away);
      }
      this.mgr.bus.emit('combat:retreat', { enemy: this });
    }
    if (this.moveTo(this._retreatTo, this.def.speed[1], dt, 1)) {
      this._retreated = true;
      this._retreatTo = null;
      return SUCCESS;
    }
    return RUNNING;
  }

  // ------------------------------------------------------------- actions

  /**
   * Start a timed attack: windup (telegraph) → strike → recovery.
   * @param {{name:string, windup:number, active?:number, recovery:number, onStrike:(e:Enemy)=>void, onWindup?:(e:Enemy)=>void, telegraph?:any}} a
   */
  startAction(a) {
    this.action = { ...a, t: 0, struck: false };
    this.mgr.bus.emit('combat:windup', { enemy: this, name: a.name, telegraph: !!a.telegraph });
    if (a.telegraph) this.action.tg = this.mgr.telegraphs.show(a.telegraph.shape, a.telegraph.pos ?? this.position.clone(), { ...a.telegraph, windup: a.windup });
    a.onStart?.(this);
  }

  cancelAction() {
    if (this.action?.tg) this.action.tg.cancel();
    this.action = null;
  }

  _stepAction(dt) {
    const a = this.action;
    if (!a) return false;
    a.t += dt;
    if (!a.struck && a.t < a.windup) a.onWindup?.(this, a.t / a.windup, dt);
    if (!a.struck && a.t >= a.windup) {
      a.struck = true;
      this.mgr.bus.emit('combat:strike', { enemy: this, name: a.name });
      a.onStrike(this);
    } else if (a.struck && a.onActive && a.t < a.windup + (a.active ?? 0)) a.onActive(this, a.t - a.windup, dt);
    if (a.t >= a.windup + (a.active ?? 0) + a.recovery) this.action = null;
    return true;
  }

  /**
   * Melee strike: hits the player inside range/angle unless dodging or shielded.
   * @returns {'hit'|'blocked'|'parried'|'miss'}
   */
  meleeHit(range, angleDeg, damage, stun = null, origin = this.position) {
    const player = this.mgr.player;
    if (player.dead) return 'miss';
    const p = player.position;
    const dist = Math.hypot(p.x - origin.x, p.z - origin.z);
    if (dist > range + 0.4 || Math.abs(p.y - origin.y) > 2.5) return 'miss';
    if (angleDeg < 360) {
      _v.set(p.x - origin.x, 0, p.z - origin.z).normalize();
      if (_v.dot(this.forward) < Math.cos(THREE.MathUtils.degToRad(angleDeg / 2))) return 'miss';
    }
    return this.mgr.strikePlayer(this, damage, stun);
  }

  // --------------------------------------------------------------- update

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    this.time += dt;
    if (this.dead) {
      this.deadTime += dt;
      if (this.controller) {
        this.controller.step(dt, _d.set(0, 0, 0), 0);
      }
      return;
    }
    const S = this.status;
    for (const k of Object.keys(S)) if (S[k] > 0) S[k] = Math.max(0, S[k] - dt);
    if (S.burning > 0) this.hurt(ELEMENTS.burn.dps * dt, 0);
    if (this.shield) {
      this.shield.time = Math.max(0, this.shield.time - dt);
      this.shield.age += dt;
      this.shield.cooldown = Math.max(0, this.shield.cooldown - dt);
    }
    this._poiseIdle += dt;
    if (this._poiseIdle > COMBAT.poiseDecay.delay) this.poise = Math.max(0, this.poise - COMBAT.poiseDecay.rate * dt);
    this._perception(dt);

    this._wishDir.set(0, 0, 0);
    this._wishSpeed = 0;
    if (this.disabled) {
      if (this.action) this.cancelAction();
      this.btState = S.staggered > 0 ? 'sersem (bitirici!)' : S.frozen > 0 ? 'donmuş' : S.petrified > 0 ? 'taşlaşmış' : S.knocked > 0 ? 'yerde' : 'sersem';
    } else if (!this._stepAction(dt) && this.tree) {
      tick(this.tree, this, dt);
    }
    // Integrate.
    if (this.fly) {
      if (this.disabled) this.velocity.multiplyScalar(Math.exp(-3 * dt));
      this.position.addScaledVector(this.velocity, dt);
      this.speed = this.velocity.length();
    } else {
      const frozen = S.frozen > 0 || S.petrified > 0;
      this.controller.step(dt, this._wishDir, frozen ? 0 : this._wishSpeed);
      this.speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (this.position.y < -50) this.die();
    }
    _q.setFromAxisAngle(Y, 0);
    this.mgr.physics.moveKinematic(this.body, _v.copy(this.position).setY(this.position.y + this.colliderOffset), _q);
  }

  /** Visual update (subclass). @param {number} dt */
  render(dt, env) {} // eslint-disable-line no-unused-vars

  /** Remove the corpse after a while. */
  get gone() {
    return this.dead && this.deadTime > COMBAT.corpseTime;
  }

  get debugState() {
    return `${this.btState} · can ${Math.ceil(this.health)}/${this.maxHealth} · sersem ${Math.round((this.poise / this.maxPoise) * 100)}% · farkındalık ${this.awareness.toFixed(2)}`;
  }

  dispose() {
    this.cancelAction();
    this.mgr.targets.remove(this);
    this.mgr.physics.removeKinematic(this.body);
  }
}
