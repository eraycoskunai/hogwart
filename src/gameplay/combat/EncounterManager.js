/**
 * @file EncounterManager — brings regions to life with enemies: activates
 * encounter zones as the player approaches (respecting night-only and
 * room-streaming conditions), builds each zone's nav grid over a few
 * frames, spawns the squad, despawns when the player leaves and respawns
 * cleared camps later. It resolves every enemy strike on the player
 * (dodge i-frames, Protego block, parry → enemy staggered), the Solgun's
 * draining aura, Patronus banishing, noises, the finisher move offered on
 * staggered foes, and debug spawning.
 *
 * Events: combat:engaged, combat:killed, combat:dodged, combat:blocked,
 *         combat:parried, combat:playerStunned, combat:finisher,
 *         combat:bossPhase, combat:bossDefeated, combat:zone {name, state}
 */
import * as THREE from 'three';
import { ENCOUNTERS, ENEMIES, COMBAT, AI_DIFFICULTY, PERCEPTION, NAV, BOSS } from '../../data/combat.js';
import { NavGrid } from '../ai/NavGrid.js';
import { Squad } from '../ai/Squad.js';
import { ENEMY_CLASSES } from './EnemyTypes.js';
import { SpiderQueen } from './SpiderQueen.js';
import { ModelCache } from '../../procgen/creatures/EnemyModels.js';
import { Telegraphs } from '../../render/Telegraphs.js';

import { CASTING } from '../../data/spells.js';

const DOWN = new THREE.Vector3(0, -1, 0);
/** Atmosphere night factor above which night-only encounters appear. */
const NIGHT = 0.55;
/** Despawn when the player is this many activation radii away. */
const DESPAWN_FACTOR = 1.5;
/** Player melee parry: enemy stun (s), damage, share of the stun bar; focus lost per blocked point. */
const PARRY = Object.freeze({ stun: 1.2, damage: 4, poise: 0.5, blockFocus: 0.6 });
/** Debug spawning zone around the player. */
const DEBUG_ZONE = Object.freeze({ half: 22, patrol: 6, above: 4, below: 3, reuse: 20 });
const _o = new THREE.Vector3();
const _v = new THREE.Vector3();
const _hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };

export class EncounterManager {
  /**
   * @param {{ctx:any, physics:any, spells:any, caster:any, targets:any, bus:any, player:any, interactions:any,
   *          atmosphere:any, settings:any, time:import('../../core/Time.js').Time, state:any}} o
   */
  constructor(o) {
    this.o = o;
    this.ctx = o.ctx;
    this.physics = o.physics;
    this.spells = o.spells;
    this.caster = o.caster;
    this.targets = o.targets;
    this.bus = o.bus;
    this.player = o.player;
    this.state = o.state;
    this.chill = 0;
    this.boss = null;
    this.time = { value: 0 };
    /** Seconds of simulated combat time (respawn timers). */
    this.clock = 0;
    this.root = new THREE.Group();
    this.root.name = 'Düşmanlar';
    o.ctx.scene.add(this.root);
    this.cache = new ModelCache();
    this.telegraphs = new Telegraphs(this.root, this.time);
    this.enemies = [];
    this.zones = [];
    this.region = null;
    this.timers = [];
    this.enabled = true;
    this.debugZone = null;
    this._finisher = o.interactions.addProvider((pos, fwd) => this._finisherCandidate(pos, fwd));
    this._offCast = this.bus.on('spell:cast', () => this._noise(this.player.position, PERCEPTION.castLoudness));
    this._offLanded = this.bus.on('spell:landed', ({ pos }) => this._noise(pos, PERCEPTION.impactLoudness));
    this._offPatronus = this.bus.on('spell:patronus', ({ pos, radius }) => this._repel(pos, radius));
    // After the player respawns, foes lose track of them.
    this._offRespawn = this.bus.on('player:respawned', () => {
      for (const e of this.enemies) {
        e.engaged = false;
        e.awareness = 0;
        e.lastSeen = e.noise = null;
        e.squad?.releaseAttack(e);
      }
    });
    this.spells.onPlayerHit = (p) => this._playerHitBy(p);
  }

  get difficulty() {
    return AI_DIFFICULTY[this.o.settings.get('difficulty')] ?? AI_DIFFICULTY.normal;
  }

  // ---------------------------------------------------------------- region

  setRegion(region) {
    this.clear();
    this.region = region;
    this.zones = (ENCOUNTERS[region.id] ?? []).map((def) => ({ def, state: 'idle', nav: null, squad: null, members: [], clearedAt: -1e9 }));
  }

  clear() {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    for (const z of this.zones) this._resetZone(z);
    this.zones = [];
    this.telegraphs.clear();
    this.timers.length = 0;
    this.boss = null;
  }

  _resetZone(z) {
    z.state = 'idle';
    z.nav = null;
    z.squad = null;
    z.members = [];
  }

  /** Ground height below (x, z) (static world), or `fallback`. */
  groundAt(x, z, fallback) {
    _o.set(x, fallback + 30, z);
    const hit = this.physics.raycast(_o, DOWN, 80, { dynamic: false, kinematic: false }, _hit);
    return hit ? hit.point.y : fallback;
  }

  /** Run fn after `delay` seconds of game time. */
  later(delay, fn) {
    this.timers.push({ t: delay, fn });
  }

  navFor(enemy) {
    return enemy.zone?.nav ?? null;
  }

  /** Collider ids an enemy's spells pass through (itself and allies). */
  allyIgnore(e) {
    const set = new Set();
    for (const m of this.enemies) if (m.faction === e.faction) set.add(m.collider.id);
    return set;
  }

  // -------------------------------------------------------------- zones

  /** Conditions to spawn (and, unless engaged, to stay): night, boss not yet beaten, room built. */
  _conditionsMet(def) {
    if (def.night && (this.o.atmosphere.night ?? 0) < NIGHT) return false;
    if (def.boss && this.state.bosses?.[def.boss]) return false;
    return this._geometryReady(def);
  }

  /** Interior encounters need their room's colliders streamed in. */
  _geometryReady(def) {
    if (!def.cell) return true;
    return !!this.region.cellState?.get(def.cell)?.cell;
  }

  _zoneCenterY(def) {
    if (def.y != null) return def.y;
    const t = this.physics.terrainHeight(def.center[0], def.center[1]);
    return this.groundAt(def.center[0], def.center[1], Number.isFinite(t) ? t : 0);
  }

  _activate(z) {
    const def = z.def;
    const y = this._zoneCenterY(def);
    z.y = y;
    z.nav = new NavGrid(this.physics, { center: def.center, half: def.half, cell: def.interior ? NAV.interiorCell : NAV.cell, top: y + (def.interior ? 4 : 40), bottom: y - (def.interior ? 1.5 : 40) });
    z.squad = new Squad(def.id, this.difficulty);
    z.state = 'building';
  }

  _spawnZone(z) {
    const def = z.def;
    for (const [type, x, zz] of def.spawns) {
      const count = type === 'pixie' ? ENEMIES.pixie.flock : 1;
      for (let k = 0; k < count; k++) {
        const jx = count > 1 ? (Math.random() - 0.5) * 3 : 0;
        const jz = count > 1 ? (Math.random() - 0.5) * 3 : 0;
        const y = def.interior ? def.y : this.groundAt(x + jx, zz + jz, z.y);
        this.spawnEnemy(type, new THREE.Vector3(x + jx, y + 0.05, zz + jz), z, { wake: def.wake });
      }
    }
    if (def.boss === 'spiderQueen') {
      const B = BOSS.spiderQueen;
      const y = this.groundAt(B.arena.center[0], B.arena.center[1], z.y);
      const q = new SpiderQueen(this, new THREE.Vector3(B.arena.center[0], y + 0.1, B.arena.center[1]), {});
      this.register(q, z);
      this.boss = q;
    }
    z.state = 'active';
    this.bus.emit('combat:zone', { name: def.name, state: 'active' });
  }

  /**
   * Spawn one enemy (also used by the boss and debug tools).
   * @param {string} type
   * @param {THREE.Vector3} pos
   * @param {any} [zone]
   */
  spawnEnemy(type, pos, zone = this.debugZone, o = {}) {
    const Cls = ENEMY_CLASSES[type];
    if (!Cls) throw new Error(`Bilinmeyen düşman: ${type}`);
    const e = new Cls(this, pos, { ...o, type });
    this.register(e, zone);
    return e;
  }

  /** Add an enemy built elsewhere (duels) to the simulation. */
  register(e, zone) {
    e.zone = zone;
    e.patrolRadius = zone?.def?.patrol ?? 6;
    zone?.squad?.add(e);
    zone?.members.push(e);
    this.enemies.push(e);
  }

  /** Remove and dispose one enemy. */
  remove(e) {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    e.zone?.squad?.remove(e);
    if (e.zone) e.zone.members = e.zone.members.filter((m) => m !== e);
    if (this.boss === e) this.boss = null;
    e.dispose();
  }

  _despawnZone(z) {
    for (const e of [...z.members]) this.remove(e);
    this._resetZone(z);
  }

  /**
   * A debug zone around a point (nav grid only) for spawning tests.
   * @param {THREE.Vector3} center
   */
  ensureDebugZone(center) {
    if (this.debugZone && this.debugZone.center.distanceTo(center) < DEBUG_ZONE.reuse) return this.debugZone;
    if (this.debugZone) this.zones.splice(this.zones.indexOf(this.debugZone), 1);
    const def = { id: 'debug', name: 'Test', center: [center.x, center.z], half: DEBUG_ZONE.half, patrol: DEBUG_ZONE.patrol };
    const z = { def, state: 'active', members: [], clearedAt: -1e9, center: center.clone(), y: center.y };
    z.nav = new NavGrid(this.physics, { center: def.center, half: def.half, cell: NAV.interiorCell, top: center.y + DEBUG_ZONE.above, bottom: center.y - DEBUG_ZONE.below });
    while (!z.nav.buildStep(NAV.cellsPerFrame * 8));
    z.squad = new Squad('debug', this.difficulty);
    this.zones.push(z);
    this.debugZone = z;
    return z;
  }

  // ------------------------------------------------------------- strikes

  /**
   * An enemy's melee / area attack reaches the player.
   * @returns {'hit'|'blocked'|'parried'|'miss'}
   */
  strikePlayer(enemy, damage, stun) {
    const p = this.player;
    if (p.dead) return 'miss';
    if (p.invulnerable > 0) {
      this.bus.emit('combat:dodged', { enemy });
      return 'miss';
    }
    const c = this.caster;
    if (c.shieldAge >= 0) {
      if (c.shieldAge < CASTING.shield.parry && enemy.status) {
        // Parry: the attacker reels.
        enemy.status.stunned = Math.max(enemy.status.stunned, PARRY.stun);
        enemy.hurt(PARRY.damage, enemy.maxPoise * PARRY.poise);
        this.bus.emit('combat:parried', { enemy, player: true });
        this.bus.emit('spell:blocked', { parry: true });
        return 'parried';
      }
      c.focus = Math.max(0, c.focus - damage * PARRY.blockFocus);
      this.bus.emit('combat:blocked', { enemy });
      this.bus.emit('spell:blocked', { parry: false });
      this.spells.visuals.shieldHit(_v.subVectors(enemy.position, p.position).normalize());
      return 'blocked';
    }
    p.damage(damage, enemy.type);
    if (stun) p.stun(COMBAT.playerStun[stun]);
    this.bus.emit('spell:impact', { strength: Math.min(0.9, damage / 35) });
    return 'hit';
  }

  /** Enemy spell bolts that reach the player (called by the spell system). */
  _playerHitBy(proj) {
    const S = proj.spell;
    if (S.effect === 'web') {
      this.player.slow(S.slow ?? 3);
      this.bus.emit('spell:message', { text: 'Ağa yakalandın — yavaşladın!' });
    } else if (S.playerStun) this.player.stun(COMBAT.playerStun[S.playerStun]);
  }

  // ------------------------------------------------------------- finisher

  _finisherCandidate(pos, fwd) {
    let best = null;
    let bestD = COMBAT.stagger.finisherRange;
    for (const e of this.enemies) {
      if (e.dead || e.status.staggered <= 0) continue;
      const d = e.position.distanceTo(pos);
      if (d > bestD) continue;
      _v.subVectors(e.position, pos).setY(0).normalize();
      if (_v.dot(fwd) < 0.3) continue;
      best = e;
      bestD = d;
    }
    if (!best) return null;
    return { id: `finisher:${best.id}`, position: best.position, radius: COMBAT.stagger.finisherRange, label: `Bitirici büyü → ${best.name}`, action: () => this.finisher(best) };
  }

  /** Slow-motion finishing spell on a staggered foe. */
  finisher(e) {
    if (e.dead) return;
    const F = COMBAT.finisher;
    const p = this.player;
    p.animator.play('castSlam', { speed: 1.4 });
    p.face.say('Confringo Maxima!', 2);
    this.o.time.hitStop(F.duration, F.timeScale);
    const from = p.character.getWandTip(new THREE.Vector3());
    const to = e.center(new THREE.Vector3());
    // A burst of gold along the line, then the blow.
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    for (let k = 0; k < 40; k++) this.spells.glow.spawn(from.clone().addScaledVector(dir, (k / 40) * len), { x: 0, y: 0, z: 0 }, { life: 0.5, size: 0.3, color: '#ffe08a', delay: k * 0.004 });
    const dmg = e.boss ? e.maxHealth * F.bossDamage : e.maxHealth * F.damage;
    e.status.staggered = 0;
    e.hurt(dmg, 0);
    if (!e.dead && e.controller) e.status.knocked = 2;
    this.spells.visuals.flash(to, '#ffe08a', 2.2, 0.5);
    this.spells.visuals.shockwave(to, '#ffd060', 5, 0.6);
    this.spells.glow.burst(60, to, { speed: [2, 8], life: 0.8, size: 0.12, color: '#ffe08a', shape: 1, drag: 2 });
    this.bus.emit('spell:impact', { strength: 1, hitStop: true });
    this.bus.emit('combat:finisher', { enemy: e });
  }

  // -------------------------------------------------------------- misc

  _noise(pos, loudness) {
    for (const e of this.enemies) e.hear(pos, loudness);
  }

  _repel(pos, radius) {
    for (const e of this.enemies) if (e.def.patronusOnly && e.position.distanceTo(pos) < radius) e.banish();
  }

  /** Solgun aura: cold, drain and slow damage near the wraiths. */
  _auras(dt) {
    let chill = 0;
    for (const e of this.enemies) {
      if (e.type !== 'wraith' || e.dead) continue;
      const A = e.def.aura;
      const d = e.position.distanceTo(this.player.position);
      // Patronus light on the field drives them off too.
      for (const pa of this.spells.patroni) if (pa.P.group.position.distanceTo(e.position) < A.radius * 0.7) e.banish();
      if (d > A.radius || e.dead) continue;
      const k = 1 - d / A.radius;
      chill = Math.max(chill, k);
      if (!this.player.dead) {
        this.player.damage(A.damage * k * dt, 'wraith', true);
        this.caster.focus = Math.max(0, this.caster.focus - A.focusDrain * k * dt);
      }
    }
    this.chill = chill;
  }

  // -------------------------------------------------------------- update

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    if (!this.region || !this.enabled) return;
    const pp = this.player.position;
    for (const z of this.zones) {
      if (z.def.id === 'debug') continue;
      const c = z.def.center;
      const d = Math.hypot(pp.x - c[0], pp.z - c[1]);
      if (z.state === 'idle') {
        if (d < z.def.activate && this.clock - z.clearedAt > COMBAT.respawnAfter && this._conditionsMet(z.def)) this._activate(z);
      } else {
        const engaged = z.members.some((m) => m.engaged && !m.dead);
        const leave = d > z.def.activate * DESPAWN_FACTOR || !this._geometryReady(z.def) || (!engaged && !this._conditionsMet(z.def));
        if (z.state === 'active' && z.members.length && z.members.every((m) => m.dead)) z.clearedAt = this.clock;
        if (leave) this._despawnZone(z);
      }
    }
    this.clock += dt;
    for (const e of this.enemies) e.fixedUpdate(dt);
    this._auras(dt);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }
    // Remove faded corpses.
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].gone) this.remove(this.enemies[i]);
  }

  /**
   * @param {number} dt
   * @param {{camera:THREE.Camera, playerHead:THREE.Vector3, wind:THREE.Vector3}} env
   */
  frame(dt, env) {
    this.time.value += dt;
    for (const z of this.zones) {
      if (z.state !== 'building') continue;
      if (z.nav.buildStep()) this._spawnZone(z);
      break;
    }
    for (const e of this.enemies) e.render(dt, env);
    this.telegraphs.update(dt);
  }

  /** Enemies the camera can lock on to. */
  get lockTargets() {
    return this.enemies.filter((e) => e.isLockable());
  }

  get stats() {
    const alive = this.enemies.filter((e) => !e.dead);
    return {
      'Düşman (canlı / toplam)': `${alive.length} / ${this.enemies.length}`,
      Bölgeler: this.zones.map((z) => `${z.def.name}: ${z.state}`).join(' · ') || '—',
      'Nav ızgarası': this.zones.filter((z) => z.nav).map((z) => z.nav.stats).join(' · ') || '—',
    };
  }

  get debugEntities() {
    return this.enemies.map((e) => ({ name: e.name, state: e.debugState }));
  }

  dispose() {
    this.clear();
    this._offCast();
    this._offLanded();
    this._offPatronus();
    this._offRespawn();
    this.o.interactions.removeProvider(this._finisher);
    this.telegraphs.dispose();
    this.cache.dispose();
    this.root.removeFromParent();
  }
}
