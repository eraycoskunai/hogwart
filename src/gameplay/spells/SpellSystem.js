/**
 * @file SpellSystem — the world side of magic: physical projectiles (speed,
 * gravity, bounces, reflection off shields), what each spell does to what
 * it hits (rigid bodies, dummies, doors, water, fire, ice), element rules
 * (fire melts ice and ignites wood, water and frost put fire out), combos,
 * breakable objects and Reparo, levitation, explosions, the Patronus, and
 * all the particles / trails / lights that go with them.
 *
 * Events: spell:impact {strength}, spell:hit {id, owner}, spell:combo {name},
 *         spell:damage {pos, amount, color}, spell:message {text},
 *         spell:blocked {parry}, spell:patronus {pos}
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ParticleSystem, SHAPE } from '../../render/ParticleSystem.js';
import { TrailRibbons } from '../../render/TrailRibbons.js';
import { SpellVisuals } from '../../render/SpellVisuals.js';
import { SPELLS, COMBOS, ELEMENTS, CASTING, PATRONUS } from '../../data/spells.js';

export const SPELL_FX = Object.freeze({
  particles: 6000,
  smoke: 1500,
  trails: 24,
  trailPoints: 14,
  /** Player capsule for hostile bolts. */
  playerRadius: 0.45,
  playerChest: 1.2,
  /** Hit-stop and camera shake for strong impacts. */
  hitStop: { threshold: 20, duration: 0.05, scale: 0.1 },
});

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };
const UP = new THREE.Vector3(0, 1, 0);
/** _impact result: the bolt was parried back and keeps flying. */
const REFLECTED = 'reflected';

const _su = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _sw = new THREE.Vector3();

/** Closest distance between segment ab and segment cd. */
function segSegDist(a, b, c, d) {
  const u = _su.subVectors(b, a);
  const v = _sv.subVectors(d, c);
  const w = _sw.subVectors(a, c);
  const A = u.dot(u);
  const B = u.dot(v);
  const C = v.dot(v);
  const D = u.dot(w);
  const E = v.dot(w);
  const den = A * C - B * B;
  let s = den > 1e-8 ? THREE.MathUtils.clamp((B * E - C * D) / den, 0, 1) : 0;
  let t = C > 1e-8 ? (B * s + E) / C : 0;
  t = THREE.MathUtils.clamp(t, 0, 1);
  s = A > 1e-8 ? THREE.MathUtils.clamp((B * t - D) / A, 0, 1) : 0;
  const px = a.x + u.x * s - (c.x + v.x * t);
  const py = a.y + u.y * s - (c.y + v.y * t);
  const pz = a.z + u.z * s - (c.z + v.z * t);
  return Math.hypot(px, py, pz);
}

export class SpellSystem {
  /**
   * @param {{bus:any, physics:any, lights:any, targets:import('./SpellTargets.js').SpellTargets, scene:THREE.Scene, shared:any, time:any}} o
   */
  constructor(o) {
    this.bus = o.bus;
    this.physics = o.physics;
    this.lights = o.lights;
    this.targets = o.targets;
    this.gameTime = o.time;
    this.clock = { value: 0 };
    this.root = new THREE.Group();
    this.root.name = 'Büyü efektleri';
    o.scene.add(this.root);
    this.glow = new ParticleSystem(SPELL_FX.particles, { additive: true, time: this.clock });
    this.smoke = new ParticleSystem(SPELL_FX.smoke, { additive: false, time: this.clock });
    this.trails = new TrailRibbons(SPELL_FX.trails, SPELL_FX.trailPoints);
    this.visuals = new SpellVisuals(this.root, o.shared);
    this.root.add(this.glow.mesh, this.smoke.mesh, this.trails.mesh);

    this.projectiles = [];
    /** Rigid-body statuses: DynamicBody → {burning, frozen, levitated…} */
    this.bodyStatus = new Map();
    /** Broken objects waiting for Reparo. */
    this.broken = [];
    this.floes = [];
    this.flashes = [];
    this.patroni = [];
    this.levitated = null;
    this.region = null;
    this.player = null;
    /** Shield state provided by the caster: {center, radius, since} or null. */
    this.shield = null;
    this.stats = { projectiles: 0, broken: 0, floes: 0 };
  }

  setRegion(region) {
    this.region = region;
  }

  setPlayer(player) {
    this.player = player;
  }

  // ------------------------------------------------------------------ cast

  /**
   * Launch a bolt.
   * @param {any} spell spell data (SPELLS entry or PRACTICE_BOLT)
   * @param {{id:string, from:THREE.Vector3, dir:THREE.Vector3, power?:number, owner?:any, ignore?:Set<number>}} o owner: 'player', 'ally' (companions: never hits the player) or an enemy
   */
  launch(spell, o) {
    const p = {
      spell,
      id: o.id,
      pos: o.from.clone(),
      vel: o.dir.clone().normalize().multiplyScalar(spell.speed),
      life: spell.life,
      bounces: spell.bounces ?? 0,
      power: o.power ?? 1,
      owner: o.owner ?? 'player',
      ignore: o.ignore ?? null,
      trail: this.trails.acquire(spell.trail ?? spell.color, spell.radius * 0.9),
      light: spell.light ? this.lights.add({ position: o.from.clone(), color: spell.light.color, intensity: spell.light.intensity, distance: spell.light.distance, priority: 3 }) : null,
      age: 0,
    };
    this.trails.push(p.trail, p.pos);
    this.projectiles.push(p);
    this.bus.emit('spell:launched', { id: o.id, spell, owner: p.owner, pos: o.from });
    // Muzzle burst at the wand.
    this.glow.burst(10, o.from, { speed: [0.5, 2], life: 0.25, size: 0.12, color: spell.color, dir: o.dir, spread: 0.8 });
    return p;
  }

  // ---------------------------------------------------------------- update

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!this._stepProjectile(p, dt)) {
        this._retire(p);
        this.projectiles.splice(i, 1);
      }
    }
    this._stepLevitation(dt);
    this._stepStatuses(dt);
    this._stepFloes(dt);
    this._stepPatroni(dt);
  }

  _retire(p) {
    this.trails.release(p.trail);
    if (p.light) this.lights.remove(p.light);
  }

  _stepProjectile(p, dt) {
    const S = p.spell;
    p.age += dt;
    p.life -= dt;
    if (p.life <= 0) {
      this._fizzle(p);
      return false;
    }
    p.vel.y -= (S.gravity ?? 0) * dt;
    const from = p.pos;
    const step = p.vel.length() * dt;
    _d.copy(p.vel).normalize();
    const to = _v.copy(from).addScaledVector(_d, step).clone();

    // Shields (hostile bolts vs the player's Protego).
    const hostile = p.owner !== 'player' && p.owner !== 'ally';
    if (hostile && this.shield && this._hitsShield(p, from, to)) return p.life > 0;
    // Hostile bolts vs the player.
    if (hostile && this.player && !this.player.dead && !(this.player.invulnerable > 0)) {
      const feet = this.player.position;
      const a = new THREE.Vector3(feet.x, feet.y + 0.35, feet.z);
      const b = new THREE.Vector3(feet.x, feet.y + 1.55, feet.z);
      if (segSegDist(from, to, a, b) < SPELL_FX.playerRadius + S.radius) {
        this._hitPlayer(p, to);
        return false;
      }
    }
    // Water surface (Glacius freezes, fire fizzles).
    const level = this.region?.waterLevelAt?.(to.x, to.z) ?? -Infinity;
    const hit = this.physics.raycast(from, _d, step + S.radius, { ignore: p.ignore ?? null }, _hit);
    if (level > -Infinity && from.y >= level && to.y < level && (!hit || hit.point.y < level)) {
      const t = (from.y - level) / Math.max(1e-6, from.y - to.y);
      const wp = from.clone().lerp(to, t);
      this._hitWater(p, wp);
      return false;
    }
    if (hit) {
      const point = hit.point.clone();
      const normal = hit.normal.clone();
      const consumed = this._impact(p, hit.collider, point, normal);
      if (consumed === REFLECTED) return true;
      if (consumed) return false;
      // Bounce.
      if (p.bounces > 0) {
        p.bounces--;
        p.vel.reflect(normal).multiplyScalar(0.8);
        p.pos.copy(point).addScaledVector(normal, 0.05);
        this.glow.burst(6, point, { speed: [1, 3], life: 0.3, size: 0.08, color: S.color, shape: SHAPE.spark });
        this.trails.push(p.trail, p.pos);
        return true;
      }
      return false;
    }
    p.pos.copy(to);
    this.trails.push(p.trail, p.pos);
    if (p.light) p.light.position.copy(p.pos);
    this._flightParticles(p);
    return true;
  }

  _flightParticles(p) {
    const S = p.spell;
    const back = _v2.copy(p.vel).multiplyScalar(-0.05);
    if (S.element === 'fire') {
      for (let k = 0; k < 3; k++) {
        this.glow.spawn(
          { x: p.pos.x + (Math.random() - 0.5) * 0.15, y: p.pos.y + (Math.random() - 0.5) * 0.15, z: p.pos.z + (Math.random() - 0.5) * 0.15 },
          { x: back.x + (Math.random() - 0.5), y: back.y + 0.8 + Math.random(), z: back.z + (Math.random() - 0.5) },
          { life: 0.45, size: S.radius * 2.2, endSize: 0.05, color: '#ffd070', endColor: '#ff3000', alpha: 0.9, shape: SHAPE.glow, drag: 2 },
        );
      }
      if (Math.random() < 0.3) this.smoke.spawn(p.pos, { x: 0, y: 0.6, z: 0 }, { life: 1.2, size: 0.2, endSize: 0.7, color: '#403830', alpha: 0.35, endAlpha: 0, shape: SHAPE.smoke, drag: 1 });
    } else if (S.element === 'ice') {
      this.glow.spawn(p.pos, { x: (Math.random() - 0.5) * 1.5, y: (Math.random() - 0.5) * 1.5, z: (Math.random() - 0.5) * 1.5 }, { life: 0.5, size: 0.07, color: '#e8fbff', shape: SHAPE.chip, spin: 8, gravity: 2 });
      this.glow.spawn(p.pos, back, { life: 0.3, size: S.radius * 2.5, endSize: 0.05, color: S.color, alpha: 0.7 });
    } else {
      this.glow.spawn(p.pos, back, { life: 0.28, size: S.radius * 2.6, endSize: 0.04, color: S.color, alpha: 0.85 });
      if (Math.random() < 0.5) this.glow.spawn(p.pos, { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 }, { life: 0.35, size: 0.05, color: '#ffffff', shape: SHAPE.spark, drag: 3 });
    }
  }

  _fizzle(p) {
    this.glow.burst(8, p.pos, { speed: [0.3, 1.2], life: 0.4, size: 0.08, color: p.spell.color, shape: SHAPE.spark });
  }

  // -------------------------------------------------------------- shields

  _hitsShield(p, from, to) {
    const sh = this.shield;
    if (segSegDist(from, to, sh.center, sh.center) > sh.radius + p.spell.radius) return false;
    const parry = sh.age < CASTING.shield.parry;
    const dir = _n.subVectors(from, sh.center).normalize();
    this.visuals.shieldHit(dir);
    this.glow.burst(18, from, { speed: [1, 4], life: 0.4, size: 0.1, color: '#bfe0ff', shape: SHAPE.spark, dir, spread: 0.9 });
    this.bus.emit('spell:blocked', { parry });
    if (parry && p.owner?.center) {
      // Reflect back at the caster, stronger and now ours.
      const target = p.owner.center(new THREE.Vector3());
      p.vel.subVectors(target, from).normalize().multiplyScalar(p.spell.speed * CASTING.shield.reflectBoost);
      p.power *= CASTING.shield.reflectBoost;
      p.owner = 'player';
      p.ignore = null;
      p.id = 'reflect';
      p.pos.copy(from);
      p.life = p.spell.life;
      this.bus.emit('spell:message', { text: 'Mükemmel savuşturma! Büyü geri yansıdı.' });
      return true;
    }
    p.life = 0;
    return true;
  }

  _hitPlayer(p, at) {
    const S = p.spell;
    this.player.damage(Math.round(S.damage * p.power), 'spell');
    this._impactBurst(p, at, _n.copy(p.vel).normalize().negate());
    this.onPlayerHit?.(p);
    this.bus.emit('spell:impact', { strength: 0.35 });
  }

  // --------------------------------------------------------------- impacts

  /** @returns {boolean} consumed (no bounce) */
  _impact(p, collider, point, normal) {
    const S = p.spell;
    const effect = S.effect;
    const handler = this.targets.get(collider);
    const body = collider?.kind === 'dynamic' ? collider.body : null;
    const dir = _v.copy(p.vel).normalize().clone();
    const ev = { id: p.id, spell: S, effect, power: p.power, dir, point, normal, owner: p.owner, system: this };
    let hitSomething = false;

    if (effect === 'explode') {
      this.explode(point, S, p.power, p.id, handler ?? body);
      return true;
    }
    if (effect === 'repair') {
      this.repairAround(point, S.blast);
      this._impactBurst(p, point, normal);
      return true;
    }
    if (handler) {
      hitSomething = this._applyToHandler(handler, ev);
      if (ev.reflect) {
        // Parried by an enemy shield: the bolt flies back at the player.
        const head = _v2.copy(this.player.position);
        head.y += 1.2;
        p.vel.subVectors(head, point).normalize().multiplyScalar(S.speed * CASTING.shield.reflectBoost);
        p.owner = handler;
        p.ignore = new Set([collider.id]);
        p.pos.copy(point);
        p.life = S.life;
        this.glow.burst(18, point, { speed: [1, 4], life: 0.4, size: 0.1, color: '#bfe0ff', shape: SHAPE.spark, dir: normal, spread: 0.9 });
        return REFLECTED;
      }
      if (ev.blocked) {
        this.glow.burst(14, point, { speed: [1, 3], life: 0.35, size: 0.09, color: '#9ac0ff', shape: SHAPE.spark, dir: normal, spread: 1 });
        return true;
      }
    } else if (body) {
      hitSomething = this._applyToBody(body, ev);
    } else {
      // Scenery: fire and frost leave their mark only as particles.
      if (effect === 'finite') this.finiteAround(point, S.blast);
    }
    this._impactBurst(p, point, normal);
    if (hitSomething && p.owner === 'player') this.bus.emit('spell:hit', { id: p.id, owner: p.owner });
    if (p.owner === 'player') this.bus.emit('spell:landed', { pos: point });
    if (S.damage * p.power >= SPELL_FX.hitStop.threshold) this.bus.emit('spell:impact', { strength: 0.25, hitStop: true });
    return p.bounces <= 0 || hitSomething;
  }

  _impactBurst(p, point, normal) {
    const S = p.spell;
    this.bus.emit('spell:burst', { id: p.id, spell: S, pos: point });
    const n = normal ?? UP;
    if (S.element === 'fire') {
      this.glow.burst(26, point, { speed: [1, 4], life: 0.5, size: 0.3, endSize: 0.05, color: '#ffc060', endColor: '#ff2000', dir: n, spread: 1, lift: 1, drag: 2 });
      this.smoke.burst(6, point, { speed: [0.3, 1], life: 1.5, size: 0.4, endSize: 1.1, color: '#3a3430', alpha: 0.4, endAlpha: 0, shape: SHAPE.smoke, lift: 0.8, drag: 1 });
    } else if (S.element === 'ice') {
      this.glow.burst(24, point, { speed: [1, 4], life: 0.7, size: 0.08, color: '#e8fbff', shape: SHAPE.chip, dir: n, spread: 1.2, gravity: 6, spin: 10 });
      this.glow.burst(8, point, { speed: [0.2, 0.8], life: 0.6, size: 0.35, endSize: 0.05, color: S.color, alpha: 0.6 });
    } else {
      this.glow.burst(22, point, { speed: [1.5, 5], life: 0.45, size: 0.07, color: S.color, shape: SHAPE.spark, dir: n, spread: 1, gravity: 4, drag: 1.5 });
      this.glow.burst(4, point, { speed: [0.1, 0.4], life: 0.25, size: 0.45, endSize: 0.1, color: S.color, alpha: 0.8 });
    }
    this._lightFlash(point, S.light?.color ?? S.color, 8, 0.18);
  }

  _lightFlash(pos, color, intensity, life) {
    const src = this.lights.add({ position: pos.clone(), color, intensity, distance: 8, priority: 2 });
    this.flashes.push({ src, life, t: 0, intensity });
  }

  _combo(status, spellId) {
    const c = COMBOS.find((x) => x.then === spellId && status?.[x.first] > 0);
    if (!c) return 1;
    this.bus.emit('spell:combo', { name: c.name });
    return c.bonus;
  }

  // ------------------------------------------------------- living targets

  _applyToHandler(handler, ev) {
    const bonus = this._combo(handler.status, ev.id);
    ev.power *= bonus;
    ev.combo = bonus > 1;
    const ok = handler.onSpell(ev);
    const dmg = Math.round((ev.spell.damage ?? 0) * ev.power);
    if (ok && dmg > 0 && handler.takesDamage && !handler.reportsDamage && !ev.blocked) this.bus.emit('spell:damage', { pos: handler.center(new THREE.Vector3()).setY(handler.center(new THREE.Vector3()).y + 0.6), amount: dmg, color: ev.spell.color });
    return ok;
  }

  // ---------------------------------------------------------- rigid bodies

  _status(body) {
    let s = this.bodyStatus.get(body);
    if (!s) {
      s = { burning: 0, frozen: 0, petrified: 0, levitate: 0, char: 0 };
      this.bodyStatus.set(body, s);
    }
    return s;
  }

  _flammable(body) {
    return body.collider.surface === 'wood';
  }

  _applyToBody(body, ev) {
    const st = this._status(body);
    const E = ELEMENTS;
    const massK = 1 / Math.max(1, body.mass / 10);
    const bonus = this._combo(st, ev.id);
    const power = ev.power * bonus;
    switch (ev.effect) {
      case 'push':
      case 'disarm': {
        if (this.levitated?.body === body) this.releaseLevitation(false);
        const imp = ev.dir.clone().multiplyScalar(ev.spell.impulse * power * Math.max(4, body.mass) * 0.35).add(new THREE.Vector3(0, ev.spell.impulse * 0.15 * body.mass, 0));
        this._unfreezeBody(body, st, false);
        this.physics.applyImpulse(body, imp);
        return true;
      }
      case 'pull': {
        if (!this.player) return false;
        const to = this.player.position.clone().setY(this.player.position.y + 1.2).sub(body.body.position).normalize();
        this.physics.applyImpulse(body, to.multiplyScalar(ev.spell.impulse * body.mass * 0.9).add(new THREE.Vector3(0, body.mass * 2.5, 0)));
        return true;
      }
      case 'slam': {
        const lev = this.levitated?.body === body;
        if (lev) this.releaseLevitation(false);
        this.physics.applyImpulse(body, new THREE.Vector3(0, -ev.spell.impulse * body.mass * power * (lev ? 1.5 : 0.6), 0));
        if (lev || power > 1.5) this._shatterBody(body, 'slam');
        return true;
      }
      case 'ignite':
        if (st.frozen > 0) {
          this._unfreezeBody(body, st, true);
          return true;
        }
        if (this._flammable(body)) {
          st.burning = E.burn.duration;
          return true;
        }
        this.physics.applyImpulse(body, ev.dir.clone().multiplyScalar(body.mass * 1.5));
        return true;
      case 'freeze':
        if (st.burning > 0) {
          st.burning = 0;
          this.bus.emit('spell:message', { text: 'Buz ateşi söndürdü.' });
          return true;
        }
        this._freezeBody(body, st);
        return true;
      case 'petrify':
        this._freezeBody(body, st, 'petrified');
        return true;
      case 'stun':
        this.physics.applyImpulse(body, ev.dir.clone().multiplyScalar(ev.spell.impulse * body.mass * massK + body.mass));
        return true;
      case 'finite':
        this._finiteBody(body, st);
        return true;
      case 'unlock':
        return false;
      default:
        return false;
    }
  }

  _freezeBody(body, st, kind = 'frozen') {
    if (this.levitated?.body === body) this.releaseLevitation(false);
    st[kind] = kind === 'frozen' ? ELEMENTS.freeze.duration : ELEMENTS.petrify.duration;
    const b = body.body;
    if (b.type !== CANNON.Body.STATIC) {
      b.velocity.setZero();
      b.angularVelocity.setZero();
      b.type = CANNON.Body.STATIC;
      b.mass = 0;
      b.updateMassProperties();
    }
    if (!st.shell && body.mesh?.geometry) {
      st.shell = new THREE.Mesh(body.mesh.geometry, kind === 'frozen' ? this.visuals.iceMat : this.visuals.stoneMat);
      st.shell.scale.setScalar(1.08);
      body.mesh.add(st.shell);
    }
  }

  _unfreezeBody(body, st, melt) {
    if (!(st.frozen > 0 || st.petrified > 0)) return;
    st.frozen = 0;
    st.petrified = 0;
    const b = body.body;
    b.type = CANNON.Body.DYNAMIC;
    b.mass = body.mass;
    b.updateMassProperties();
    b.wakeUp();
    if (st.shell) {
      st.shell.removeFromParent();
      st.shell = null;
    }
    if (melt) {
      this.smoke.burst(10, body.mesh.position, { speed: [0.3, 1], life: 1.4, size: 0.3, endSize: 0.9, color: '#e8f0f4', alpha: 0.35, endAlpha: 0, shape: SHAPE.smoke, lift: 1 });
      this.bus.emit('spell:message', { text: 'Ateş buzu eritti.' });
    }
  }

  _finiteBody(body, st) {
    if (this.levitated?.body === body) this.releaseLevitation(false);
    this._unfreezeBody(body, st, false);
    st.burning = 0;
    this.visuals.aura(body.mesh.position, '#ffffff', 0.9, 0.6);
  }

  // -------------------------------------------------------------- breaking

  /** Is this body a breakable object (wooden, not too heavy)? */
  breakable(body) {
    return body.collider.surface === 'wood' && body.mass <= ELEMENTS.shatter.maxMass && body.collider.shape === 'box' && body.mesh;
  }

  _shatterBody(body, cause, silent = false) {
    if (!this.breakable(body) || this.broken.some((b) => b.body === body)) return false;
    this.bus.emit('spell:shatter', { pos: body.body.position, cause });
    const st = this._status(body);
    this._unfreezeBody(body, st, false);
    st.burning = 0;
    const b = body.body;
    const size = body.collider.size.clone();
    const pos = new THREE.Vector3(b.position.x, b.position.y, b.position.z);
    const quat = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const n = ELEMENTS.shatter.pieces;
    const piece = size.clone().divideScalar(n).multiplyScalar(0.96);
    const pieces = [];
    const geo = new THREE.BoxGeometry(piece.x, piece.y, piece.z);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          const off = new THREE.Vector3((i + 0.5) / n - 0.5, (j + 0.5) / n - 0.5, (k + 0.5) / n - 0.5).multiply(size).applyQuaternion(quat);
          const p = pos.clone().add(off);
          const mesh = new THREE.Mesh(geo, st.char > 0 ? this.visuals.charMat : body.mesh.material);
          mesh.castShadow = mesh.receiveShadow = true;
          mesh.position.copy(p);
          this.root.add(mesh);
          const d = this.physics.addDynamicBox({ size: piece, mass: Math.max(0.5, body.mass / (n * n * n)), position: p, quaternion: quat, mesh, surface: 'wood', name: 'Kırık parça' });
          this.physics.applyImpulse(d, off.clone().normalize().multiplyScalar(d.mass * (cause === 'explode' ? 6 : 3)).add(new THREE.Vector3(0, d.mass * 2, 0)));
          pieces.push({ d, mesh, off });
        }
      }
    }
    // Park the original out of the world (the region still owns it).
    b.type = CANNON.Body.STATIC;
    b.mass = 0;
    b.updateMassProperties();
    b.position.set(pos.x, -1000, pos.z);
    body.mesh.visible = false;
    this.broken.push({ body, pos, quat, pieces, geo, repairing: 0 });
    this.smoke.burst(8, pos, { speed: [0.3, 1.2], life: 1.3, size: 0.3, endSize: 1, color: '#6a5a48', alpha: 0.45, endAlpha: 0, shape: SHAPE.smoke, lift: 0.6 });
    this.glow.burst(16, pos, { speed: [2, 5], life: 0.8, size: 0.06, color: '#c8a070', shape: SHAPE.chip, gravity: 9, spin: 12 });
    if (!silent) this.bus.emit('spell:message', { text: 'Kırıldı! (Reparo ile onarabilirsin)' });
    return true;
  }

  /** Reparo: pull broken objects near `point` back together. */
  repairAround(point, radius) {
    let any = false;
    for (const br of this.broken) {
      if (br.repairing > 0) continue;
      const near = br.pieces.some((p) => p.mesh.position.distanceTo(point) < radius + 1) || br.pos.distanceTo(point) < radius + 1;
      if (!near) continue;
      any = true;
      br.repairing = ELEMENTS.shatter.repairTime;
      br.from = br.pieces.map((p) => ({ pos: p.mesh.position.clone(), quat: p.mesh.quaternion.clone() }));
      for (const p of br.pieces) this.physics.removeDynamic(p.d);
    }
    if (any) this.bus.emit('spell:hit', { id: 'reparo', owner: 'player' });
    return any;
  }

  _stepRepairs(dt) {
    for (let i = this.broken.length - 1; i >= 0; i--) {
      const br = this.broken[i];
      if (br.repairing <= 0) continue;
      br.repairing -= dt;
      const k = 1 - Math.max(0, br.repairing) / ELEMENTS.shatter.repairTime;
      const e = k * k * (3 - 2 * k);
      br.pieces.forEach((p, j) => {
        const target = br.pos.clone().add(p.off);
        p.mesh.position.lerpVectors(br.from[j].pos, target, e);
        p.mesh.quaternion.slerpQuaternions(br.from[j].quat, br.quat, e);
      });
      if (Math.random() < 0.6) this.glow.burst(2, br.pos, { speed: [0.5, 1.5], life: 0.6, size: 0.08, color: '#ffd27a', jitter: 1 });
      if (br.repairing <= 0) {
        for (const p of br.pieces) p.mesh.removeFromParent();
        br.geo.dispose();
        const b = br.body.body;
        b.position.set(br.pos.x, br.pos.y, br.pos.z);
        b.quaternion.set(br.quat.x, br.quat.y, br.quat.z, br.quat.w);
        b.type = CANNON.Body.DYNAMIC;
        b.mass = br.body.mass;
        b.updateMassProperties();
        b.velocity.setZero();
        b.angularVelocity.setZero();
        b.wakeUp();
        br.body.prevPos.copy(br.pos);
        br.body.mesh.visible = true;
        const st = this.bodyStatus.get(br.body);
        if (st) st.char = 0;
        this.visuals.aura(br.pos, '#ffd27a', 1, 0.7);
        this.broken.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ explosions

  /**
   * Confringo blast.
   * @param {THREE.Vector3} point
   */
  explode(point, spell, power, id, direct) {
    this.bus.emit('spell:explosion', { pos: point, power });
    const R = spell.blast;
    // Combos on whatever was hit directly (frozen → shatter).
    for (const [body, st] of this.bodyStatus) {
      if (body === direct && st.frozen > 0) this._combo(st, id);
    }
    let shattered = 0;
    for (const d of [...this.physics.dynamics]) {
      const bp = d.body.position;
      const dist = Math.hypot(bp.x - point.x, bp.y - point.y, bp.z - point.z);
      if (dist > R) continue;
      const k = 1 - dist / R;
      const st = this._status(d);
      if (this.levitated?.body === d) this.releaseLevitation(false);
      if ((st.frozen > 0 || k > 0.45) && this._shatterBody(d, 'explode', true)) {
        shattered++;
        continue;
      }
      this._unfreezeBody(d, st, true);
      const dir = new THREE.Vector3(bp.x - point.x, bp.y - point.y + 0.5, bp.z - point.z).normalize();
      this.physics.applyImpulse(d, dir.multiplyScalar(spell.impulse * power * k * Math.max(3, d.mass) * 0.6));
      if (this._flammable(d) && k > 0.2) st.burning = ELEMENTS.burn.duration * 0.6;
    }
    for (const h of this.targets.handlers) {
      const c = h.center(new THREE.Vector3());
      const dist = c.distanceTo(point);
      if (dist > R + 0.5) continue;
      const k = 1 - Math.min(1, dist / (R + 0.5));
      const ev = { id, spell, effect: 'explode', power: power * k, dir: c.clone().sub(point).normalize(), point, owner: 'player', system: this };
      this._applyToHandler(h, ev);
    }
    if (shattered) this.bus.emit('spell:message', { text: `${shattered} nesne parçalandı (Reparo ile onarabilirsin)` });
    // Floes melt.
    for (const f of this.floes) if (f.pos.distanceTo(point) < R + f.radius) f.life = Math.min(f.life, 0.8);
    // Player gets shoved (and hurt) when too close.
    if (this.player) {
      const d = this.player.position.distanceTo(point);
      if (d < R * 0.7) this.player.damage(Math.round(spell.damage * 0.4 * (1 - d / (R * 0.7))), 'spell');
    }
    // Visuals.
    this.visuals.flash(point, '#ffb040', R * 0.8, 0.4);
    this.visuals.shockwave(point.clone().setY(point.y + 0.05), '#ffd090', R * 1.3, 0.5);
    this.glow.burst(70, point, { speed: [2, 9], life: 0.7, size: 0.5, endSize: 0.08, color: '#fff0b0', endColor: '#ff3000', drag: 2.5, lift: 1 });
    this.glow.burst(40, point, { speed: [4, 12], life: 0.9, size: 0.06, color: '#ffc070', shape: SHAPE.spark, gravity: 9, drag: 1 });
    this.smoke.burst(28, point, { speed: [0.8, 3], life: 2.6, size: 0.6, endSize: 2.4, color: '#2e2a26', alpha: 0.5, endAlpha: 0, shape: SHAPE.smoke, lift: 1.2, drag: 1.2 });
    this.smoke.burst(20, point, { speed: [3, 8], life: 1.4, size: 0.1, color: '#4a4038', shape: SHAPE.chip, gravity: 9.8, spin: 12, alpha: 0.9 });
    this._lightFlash(point, 0xff8a30, 40, 0.45);
    this.bus.emit('spell:impact', { strength: 0.8, hitStop: true });
    this.bus.emit('spell:hit', { id, owner: 'player' });
  }

  /** Finite on an area: dispel statuses nearby. */
  finiteAround(point, radius) {
    for (const [body, st] of this.bodyStatus) {
      const bp = body.body.position;
      if (Math.hypot(bp.x - point.x, bp.y - point.y, bp.z - point.z) < radius + 0.5) this._finiteBody(body, st);
    }
    for (const f of this.floes) if (f.pos.distanceTo(point) < radius + f.radius) f.life = Math.min(f.life, 0.8);
  }

  // ----------------------------------------------------------------- water

  _hitWater(p, point) {
    const S = p.spell;
    if (S.effect === 'freeze') {
      this.addFloe(point);
      this.bus.emit('spell:hit', { id: p.id, owner: p.owner });
      this.bus.emit('spell:message', { text: 'Suyun yüzeyi dondu — buzun üstünde yürüyebilirsin.' });
    } else if (S.element === 'fire') {
      this.smoke.burst(14, point, { speed: [0.3, 1.2], life: 1.6, size: 0.3, endSize: 1.2, color: '#e8eef0', alpha: 0.4, endAlpha: 0, shape: SHAPE.smoke, lift: 1.2 });
    }
    this.glow.burst(16, point, { speed: [1, 3], life: 0.6, size: 0.08, color: '#bfe8ff', shape: SHAPE.chip, dir: UP, spread: 0.6, gravity: 9 });
  }

  addFloe(point) {
    const F = ELEMENTS.freeze;
    const y = point.y;
    const geo = this.visuals.floeGeometry(F.floeRadius, F.floeThickness, 1 + Math.floor(Math.random() * 99999));
    const mesh = new THREE.Mesh(geo, this.visuals.floeMat.clone());
    mesh.position.set(point.x, y + 0.08, point.z);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    const collider = this.physics.addStaticCylinder(F.floeRadius * 0.9, F.floeThickness, new THREE.Matrix4().makeTranslation(point.x, y + 0.08 - F.floeThickness / 2, point.z), { surface: 'stone', name: 'Buz tabakası', rigid: false });
    const floe = { pos: new THREE.Vector3(point.x, y, point.z), radius: F.floeRadius, mesh, collider, life: F.floeLife };
    floe.handler = {
      name: 'Buz tabakası',
      center: (out) => out.copy(floe.pos),
      onSpell: (ev) => {
        if (ev.effect === 'ignite' || ev.effect === 'explode' || ev.effect === 'finite') {
          floe.life = Math.min(floe.life, 0.8);
          return true;
        }
        if (ev.effect === 'freeze') {
          floe.life = F.floeLife;
          return true;
        }
        return false;
      },
    };
    this.targets.add(collider, floe.handler);
    this.floes.push(floe);
    this.visuals.shockwave(floe.pos.clone().setY(y + 0.1), '#dff6ff', F.floeRadius * 1.2, 0.5);
    this.glow.burst(30, floe.pos, { speed: [1, 3], life: 0.8, size: 0.1, color: '#e8fbff', shape: SHAPE.chip, dir: UP, spread: 1, gravity: 6, jitter: F.floeRadius });
  }

  _stepFloes(dt) {
    const F = ELEMENTS.freeze;
    for (let i = this.floes.length - 1; i >= 0; i--) {
      const f = this.floes[i];
      f.life -= dt;
      if (f.life < F.floeFade) {
        const k = Math.max(0, f.life / F.floeFade);
        f.mesh.material.opacity = 0.85 * k;
        f.mesh.position.y = f.pos.y + 0.08 - (1 - k) * 0.3;
      }
      if (f.life <= 0) this._removeFloe(f, i);
    }
  }

  _removeFloe(f, i) {
    this.physics.removeCollider(f.collider);
    this.targets.remove(f.handler);
    f.mesh.removeFromParent();
    f.mesh.geometry.dispose();
    f.mesh.material.dispose();
    this.floes.splice(i, 1);
  }

  // ------------------------------------------------------------ levitation

  /**
   * Grab a body for Wingardium Leviosa.
   * @param {any} body DynamicBody
   * @param {() => THREE.Vector3} anchor where the body should float
   */
  levitate(body, anchor) {
    if (body.mass > CASTING.levitate.maxMass) {
      this.bus.emit('spell:message', { text: 'Bu nesne kaldırılamayacak kadar ağır.' });
      return false;
    }
    const st = this._status(body);
    this._unfreezeBody(body, st, false);
    this.levitated = { body, anchor };
    st.levitate = 1;
    return true;
  }

  /** Drop (or throw, when `thrown`) the levitated body. */
  releaseLevitation(thrown) {
    const L = this.levitated;
    if (!L) return;
    const st = this._status(L.body);
    st.levitate = thrown ? 0.6 : 0;
    this.levitated = null;
    this.visuals.setBeam(null);
  }

  _stepLevitation(dt) {
    const L = this.levitated;
    if (!L) return;
    const C = CASTING.levitate;
    const b = L.body.body;
    const target = L.anchor();
    const to = new THREE.Vector3(target.x - b.position.x, target.y - b.position.y, target.z - b.position.z);
    const v = to.multiplyScalar(C.stiffness);
    if (v.length() > C.maxSpeed) v.setLength(C.maxSpeed);
    // Hold against gravity: set velocity directly (critically damped follow).
    b.velocity.set(v.x, v.y + 9.82 * dt, v.z);
    b.angularVelocity.scale(0.9, b.angularVelocity);
    b.wakeUp();
    if (Math.random() < 0.5) this.glow.spawn({ x: b.position.x + (Math.random() - 0.5) * 0.8, y: b.position.y - 0.3, z: b.position.z + (Math.random() - 0.5) * 0.8 }, { x: 0, y: -0.4, z: 0 }, { life: 0.7, size: 0.07, color: '#ffe8a0', shape: SHAPE.spark });
  }

  // -------------------------------------------------------------- statuses

  _stepStatuses(dt) {
    const E = ELEMENTS;
    for (const [body, st] of this.bodyStatus) {
      if (!this.physics.dynamics.includes(body)) {
        if (st.shell) st.shell.removeFromParent();
        if (st.light) this.lights.remove(st.light);
        this.bodyStatus.delete(body);
        continue;
      }
      const b = body.body;
      if (st.levitate > 0 && this.levitated?.body !== body) st.levitate -= dt;
      if (st.frozen > 0 || st.petrified > 0) {
        const f = st.frozen - dt;
        const pt = st.petrified - dt;
        if (f <= 0 && pt <= 0) this._unfreezeBody(body, st, false);
        else {
          st.frozen = Math.max(0, f);
          st.petrified = Math.max(0, pt);
        }
      }
      if (st.burning > 0) {
        st.burning -= dt;
        st.char += dt;
        const level = this.region?.waterLevelAt?.(b.position.x, b.position.z) ?? -Infinity;
        if (b.position.y < level) {
          st.burning = 0;
          this.smoke.burst(12, body.mesh.position, { speed: [0.3, 1], life: 1.4, size: 0.3, endSize: 1, color: '#e8eef0', alpha: 0.4, endAlpha: 0, shape: SHAPE.smoke, lift: 1 });
          this.bus.emit('spell:message', { text: 'Su ateşi söndürdü.' });
        }
        const p = body.mesh.position;
        const s = body.collider.size?.x ?? body.collider.radius ?? 0.5;
        for (let k = 0; k < 2; k++) {
          this.glow.spawn({ x: p.x + (Math.random() - 0.5) * s, y: p.y + (Math.random() - 0.2) * s * 0.6, z: p.z + (Math.random() - 0.5) * s }, { x: (Math.random() - 0.5) * 0.3, y: 1.2 + Math.random(), z: (Math.random() - 0.5) * 0.3 }, { life: 0.6, size: s * 0.45, endSize: 0.04, color: '#ffd060', endColor: '#ff2a00', alpha: 0.9, drag: 1.5 });
        }
        if (Math.random() < 0.25) this.smoke.spawn({ x: p.x, y: p.y + s * 0.5, z: p.z }, { x: 0, y: 0.8, z: 0 }, { life: 2.2, size: s * 0.4, endSize: s * 1.6, color: '#2a2622', alpha: 0.35, endAlpha: 0, shape: SHAPE.smoke, drag: 0.8 });
        if (!st.light) st.light = this.lights.add({ position: p.clone(), color: 0xff7a20, intensity: 6, distance: 6, flicker: 'torch', priority: 2 });
        st.light.position.copy(p);
        if (st.burning <= 0) {
          this.lights.remove(st.light);
          st.light = null;
          // Burnt through: crumbles to charred pieces.
          if (st.char >= E.burn.charTime && this.breakable(body)) this._shatterBody(body, 'burn');
        }
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      f.src.intensity = f.intensity * Math.max(0, 1 - f.t / f.life);
      if (f.t >= f.life) {
        this.lights.remove(f.src);
        this.flashes.splice(i, 1);
      }
    }
    this._stepRepairs(dt);
  }

  // --------------------------------------------------------------- patronus

  /**
   * @param {THREE.Vector3} from
   * @param {THREE.Vector3} dir flat direction
   * @param {string} form
   */
  patronus(from, dir, form) {
    const spell = SPELLS.patronus;
    const P = this.visuals.patronus(form, spell.color);
    P.group.position.copy(from).setY(from.y - 1.1);
    P.group.rotation.y = Math.atan2(-dir.x, -dir.z);
    this.root.add(P.group);
    const light = this.lights.add({ position: from.clone(), color: spell.light.color, intensity: spell.light.intensity, distance: spell.light.distance, priority: 4 });
    this.patroni.push({ P, dir: dir.clone().setY(0).normalize(), t: 0, light, flies: !!P.group.userData.flies });
    this.visuals.flash(from, '#dff0ff', 1.6, 0.5);
    this.bus.emit('spell:patronus', { pos: from.clone(), radius: PATRONUS.repel });
  }

  _stepPatroni(dt) {
    for (let i = this.patroni.length - 1; i >= 0; i--) {
      const pa = this.patroni[i];
      pa.t += dt;
      const g = pa.P.group;
      g.position.addScaledVector(pa.dir, PATRONUS.speed * dt);
      const gait = pa.t * 9;
      if (pa.flies) {
        g.position.y += Math.sin(pa.t * 3) * 0.01 + dt * 0.3;
        pa.P.legs.forEach((w, k) => (w.rotation.z = (k ? -1 : 1) * Math.sin(gait) * 0.6));
      } else {
        pa.P.legs.forEach((leg, k) => (leg.rotation.x = Math.sin(gait + (k % 2 ? Math.PI : 0) + (k > 1 ? 0.6 : 0)) * 0.7));
        g.position.y += Math.abs(Math.sin(gait)) * 0.012;
      }
      const fade = pa.t > PATRONUS.life - PATRONUS.fade ? Math.max(0, (PATRONUS.life - pa.t) / PATRONUS.fade) : Math.min(1, pa.t * 3);
      pa.P.material.uniforms.uOpacity.value = fade;
      pa.light.position.copy(g.position).setY(g.position.y + 1);
      pa.light.intensity = SPELLS.patronus.light.intensity * fade;
      if (Math.random() < 0.8) this.glow.spawn({ x: g.position.x + (Math.random() - 0.5), y: g.position.y + Math.random() * 1.4, z: g.position.z + (Math.random() - 0.5) }, { x: -pa.dir.x, y: 0.3, z: -pa.dir.z }, { life: 1, size: 0.1, color: '#e0f0ff', alpha: fade });
      if (pa.t >= PATRONUS.life) {
        this.lights.remove(pa.light);
        pa.P.dispose();
        this.patroni.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ frame

  /**
   * @param {number} dt
   * @param {THREE.Camera} camera
   */
  update(dt, camera) {
    this.clock.value += dt;
    this.glow.update();
    this.smoke.update();
    this.trails.update(dt, camera);
    this.visuals.update(dt);
    if (this.levitated && this.player) {
      const b = this.levitated.body.body;
      this.visuals.setBeam(this.player.character.getWandTip(new THREE.Vector3()), new THREE.Vector3(b.position.x, b.position.y, b.position.z), SPELLS.leviosa.color);
    }
    this.stats = { projectiles: this.projectiles.length, broken: this.broken.length, floes: this.floes.length, statuses: this.bodyStatus.size, emitted: this.glow.emitted + this.smoke.emitted };
  }

  /** Forget everything tied to the old region. */
  clear() {
    for (const p of this.projectiles) this._retire(p);
    this.projectiles.length = 0;
    this.releaseLevitation(false);
    for (const [, st] of this.bodyStatus) {
      if (st.shell) st.shell.removeFromParent();
      if (st.light) this.lights.remove(st.light);
    }
    this.bodyStatus.clear();
    for (const br of this.broken) {
      for (const p of br.pieces) {
        if (this.physics.dynamics.includes(p.d)) this.physics.removeDynamic(p.d);
        p.mesh.removeFromParent();
      }
      br.geo.dispose();
    }
    this.broken.length = 0;
    for (let i = this.floes.length - 1; i >= 0; i--) this._removeFloe(this.floes[i], i);
    for (const f of this.flashes) this.lights.remove(f.src);
    this.flashes.length = 0;
    for (const pa of this.patroni) {
      this.lights.remove(pa.light);
      pa.P.dispose();
    }
    this.patroni.length = 0;
    this.glow.clear();
    this.smoke.clear();
    this.trails.clear();
    this.visuals.clear();
    this.shield = null;
  }

  dispose() {
    this.clear();
    this.glow.dispose();
    this.smoke.dispose();
    this.trails.dispose();
    this.visuals.dispose();
    this.root.removeFromParent();
  }
}
