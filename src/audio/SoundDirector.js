/**
 * @file SoundDirector — decides what is heard. Listens to game events
 * (spells, combat, flight, races, Quidditch, doors, weather, the clock…)
 * and plays the matching synthesised effects in 3D; drives footsteps from
 * the walk cycle and the surface underfoot; keeps ambience beds (wind,
 * rain, night crickets, lake water, castle room tone, Great Hall crowd)
 * and gameplay loops (broom wind, Snitch wings, the Solgun's aura) at the
 * right level; plays a heartbeat when hurt; routes character speech to
 * the voice synth; and picks the music mood from the game state.
 */
import * as THREE from 'three';
import { AUDIO } from '../data/sounds.js';
import { MUSIC } from '../data/music.js';
import { SPELLS } from '../data/spells.js';

const _v = new THREE.Vector3();

/** Spell → cast sound. */
function castSound(id) {
  const S = SPELLS[id];
  if (!S) return 'cast';
  if (id === 'patronus') return 'castPatronus';
  if (id === 'protego') return 'shieldUp';
  if (S.effect === 'heal') return 'heal';
  if (S.effect === 'repair') return 'repair';
  if (S.effect === 'light') return 'castLight';
  if (S.element === 'fire') return 'castFire';
  if (S.element === 'ice') return 'castIce';
  if (['stun', 'disarm', 'petrify'].includes(S.effect)) return 'castStun';
  if (['push', 'pull', 'slam', 'explode'].includes(S.effect)) return 'castForce';
  return 'cast';
}

/** Enemy type → sound when it spots the player / strikes. */
const SPOT = { troll: 'trollRoar', werewolf: 'howl', spider: 'spiderChitter', spiderling: 'spiderChitter', wraith: 'wraith', armor: 'armorClank', pixie: 'pixie', spiderQueen: 'bossRoar' };
const STRIKE = { slam: 'slam', sweep: 'growl', bite: 'bite', leap: 'growl', claw: 'bite', slash: 'armorClank', charge: 'bossRoar', volley: 'spiderChitter', spit: 'spiderChitter' };

export class SoundDirector {
  /**
   * @param {{engine:import('./AudioEngine.js').AudioEngine, music:import('./MusicDirector.js').MusicDirector, voice:import('./Voice.js').Voice,
   *          bus:any, player:any, game:any}} o game: getters for room, fsm, flight, races, match, duel, combat, atmosphere, clock
   */
  constructor(o) {
    this.o = o;
    this.E = o.engine;
    this.loops = {};
    this._phase = 0;
    this._hurtT = 0;
    this._bird = 0;
    this._beat = 0;
    this._combatT = 0;
    this._dmgT = 0;
    this._boosting = false;
    this._swimT = 0;
    const on = (ev, fn) => o.bus.on(ev, fn);
    const P = () => o.player.position;
    const at = (p) => (p ? { x: p.x, y: p.y, z: p.z } : null);
    const play = (name, opts) => this.E.play(name, opts);
    this._offs = [
      on('audio:ready', () => {
        // The first click can come after the region loaded: apply its space now.
        if (o.game.room) this.E.setRegion(o.game.room.id);
        this._startBeds();
      }),
      on('region:loaded', ({ id }) => {
        this.E.setRegion(id);
        this.E.stopAll();
        this.loops = {};
        this._startBeds();
      }),
      // Player.
      on('player:jumped', () => play('jump', { pos: at(P()) })),
      on('player:landed', ({ fallHeight }) => fallHeight > 0.4 && play('land', { pos: at(P()), gain: Math.min(1.4, 0.4 + fallHeight / 6) })),
      on('player:damaged', ({ source }) => source !== 'wraith' && this._hurt()),
      on('player:died', () => play('death', { bus: 'ui' })),
      on('player:healed', ({ amount }) => amount > 2 && play('heal', { pos: at(P()) })),
      on('player:dodged', () => play('roll', { pos: at(P()) })),
      on('player:swim', ({ swimming }) => swimming && play('splash', { pos: at(P()) })),
      on('player:stunned', () => play('stagger', { pos: at(P()) })),
      // Magic.
      on('spell:cast', ({ id }) => play(castSound(id), { pos: at(P()) })),
      on('spell:launched', ({ owner, pos, id }) => {
        if (owner === 'player') return;
        play(owner === 'ally' ? castSound(id) : 'darkCast', { pos: at(pos), gain: 0.8 });
      }),
      on('spell:burst', ({ spell, pos }) => play(spell.element === 'ice' ? 'impactIce' : spell.element === 'fire' ? 'castFire' : 'impact', { pos: at(pos), gain: spell.element === 'fire' ? 0.5 : 0.8 })),
      on('spell:explosion', ({ pos, power }) => play('explosion', { pos: at(pos), gain: Math.min(1.3, 0.6 + power * 0.3) })),
      on('spell:shatter', ({ pos, cause }) => play(cause === 'explode' ? 'impactIce' : 'breakWood', { pos: at(pos) })),
      on('spell:blocked', ({ parry }) => play(parry ? 'parry' : 'shieldHit', { pos: at(P()) })),
      on('spell:combo', () => play('combo', { bus: 'ui' })),
      on('spell:levelUp', () => play('levelUp')),
      on('spell:fail', () => play('fizzle', { bus: 'ui' })),
      on('spell:patronus', ({ pos }) => play('castPatronus', { pos: at(pos) })),
      on('spell:damage', ({ pos }) => {
        if (this._dmgT > 0) return;
        this._dmgT = 0.08;
        play('enemyHurt', { pos: at(pos), gain: 0.6 });
      }),
      // Combat.
      on('combat:spotted', ({ enemy }) => SPOT[enemy.type] && play(SPOT[enemy.type], { pos: at(enemy.position) })),
      on('combat:windup', ({ enemy, telegraph }) => telegraph && play('telegraph', { pos: at(enemy.position), gain: 0.7 })),
      on('combat:strike', ({ enemy, name }) => STRIKE[name] && play(STRIKE[name], { pos: at(enemy.position) })),
      on('combat:killed', ({ enemy }) => play(enemy.type === 'wraith' ? 'castLight' : 'enemyDie', { pos: at(enemy.position) })),
      on('combat:staggered', ({ enemy }) => play('stagger', { pos: at(enemy.position) })),
      on('combat:parried', ({ player }) => player && play('parry', { pos: at(P()) })),
      on('combat:blocked', () => play('shieldHit', { pos: at(P()) })),
      on('combat:shieldBroken', ({ enemy }) => play('impactIce', { pos: at(enemy.position) })),
      on('combat:enemyShield', ({ enemy }) => play('shieldUp', { pos: at(enemy.position), gain: 0.6 })),
      on('combat:finisher', ({ enemy }) => play('finisher', { pos: at(enemy.position) })),
      on('combat:bossPhase', ({ enemy }) => play('bossRoar', { pos: at(enemy.position) })),
      on('combat:bossDefeated', () => play('fanfare')),
      on('combat:dodged', () => play('roll', { pos: at(P()), gain: 0.5 })),
      // Flight, races, Quidditch, duels.
      on('flight:mounted', () => play('mount', { pos: at(P()) })),
      on('flight:dismounted', ({ reason }) => play(reason === 'crash' ? 'land' : 'mount', { pos: at(P()), gain: 0.6 })),
      on('flight:crash', ({ speed }) => play('crash', { pos: at(P()), gain: Math.min(1.4, speed / 20) })),
      on('flight:roll', () => play('roll', { pos: at(P()) })),
      on('race:countdown', ({ n }) => play(n > 0 ? 'beep' : 'go')),
      on('quidditch:countdown', ({ n }) => play(n > 0 ? 'beep' : 'whistle')),
      on('duel:countdown', ({ n }) => play(n > 0 ? 'beep' : 'go')),
      on('race:ring', () => play('ring')),
      on('race:finish', ({ medal }) => play(medal >= 0 ? 'fanfare' : 'notice')),
      on('race:abort', () => play('fizzle', { bus: 'ui' })),
      on('quidditch:goal', () => {
        play('whistle');
        play('cheer');
      }),
      on('quidditch:save', () => play('shieldHit', { bus: 'ui', gain: 0.5 })),
      on('quidditch:bludger', ({ hit }) => play(hit ? 'bludger' : 'roll', { pos: at(P()) })),
      on('quidditch:snitch', () => play('castLight', { bus: 'ui' })),
      on('quidditch:end', ({ won }) => {
        play('whistle');
        play(won ? 'fanfare' : 'cheer', { gain: won ? 1 : 0.5 });
      }),
      on('duel:result', ({ won }) => play(won ? 'fanfare' : 'fizzle', { bus: 'ui' })),
      // World, UI, social.
      on('interaction:used', ({ id }) => play(String(id).startsWith('door') ? 'doorOpen' : 'uiClick', { pos: at(P()) })),
      on('stairs:moving', () => play('stairs', { pos: at(P()) })),
      on('weather:thunder', ({ intensity, distance }) => play('thunder', { gain: Math.min(1.2, intensity * (1 - Math.min(0.8, distance / 3000))) })),
      on('clock:hour', ({ hour }) => this._chime(hour)),
      on('inventory:galleons', ({ amount }) => amount > 0 && play('coin')),
      on('social:level', ({ up }) => up && play('levelUp')),
      on('social:talk', () => play('uiOpen')),
      on('shop:bought', () => play('coin')),
    ];
  }

  // ---------------------------------------------------------------- beds

  _startBeds() {
    if (!this.E.ready) return;
    const L = this.loops;
    const want = ['wind', 'rain', 'crickets', 'water', 'room', 'crowd', 'broom', 'snitch', 'aura'];
    for (const k of want) if (!L[k]) L[k] = this.E.loop(k, { gain: 0, pos: k === 'snitch' ? { x: 0, y: 0, z: 0 } : undefined });
  }

  _chime(hour) {
    const h = Math.round(hour) % 24;
    if (![7, 12, 18, 22].includes(h)) return;
    const strokes = h % 12 || 12;
    for (let i = 0; i < Math.min(strokes, 6); i++) this.E.play('chime', { delay: i * 1.8, gain: 0.8 });
  }

  _hurt() {
    if (this._hurtT > 0) return;
    this._hurtT = 0.25;
    this.E.play('hurt', { pos: this.o.player.position });
  }

  // -------------------------------------------------------------- update

  /**
   * @param {number} dt real frame delta
   * @param {THREE.Camera} camera
   */
  update(dt, camera) {
    const E = this.E;
    const G = this.o.game;
    this.o.music.setMood(this.mood());
    E.update();
    this.o.music.update();
    if (!E.ready) return;
    E.setListener(camera);
    this._hurtT -= dt;
    this._dmgT -= dt;
    const fsm = G.fsm;
    const paused = fsm.is('pause') || fsm.is('loading');
    const talking = fsm.is('dialogue') || fsm.is('choice');
    const D = AUDIO.duck;
    E.setDuck(paused ? D.pause : talking ? D.dialogue : 1, paused ? D.pause : 1);
    if (!fsm.is('play') && !fsm.is('cinematic') && !talking) return;
    this._footsteps(dt);
    this._ambience(dt);
    this._gameplayLoops(dt);
  }

  _footsteps(dt) {
    const p = this.o.player;
    const c = p.controller;
    if (p.mount || p.dead) return;
    if (c.swimming) {
      this._swimT -= dt;
      if (p.speed > 0.4 && this._swimT <= 0) {
        this._swimT = 0.9;
        this.E.play('swim', { pos: p.position });
      }
      return;
    }
    if (!c.grounded || p.speed < 0.5) {
      this._phase = p.animator.phase;
      return;
    }
    const ph = p.animator.phase;
    const prev = this._phase;
    this._phase = ph;
    // A foot lands at phase 0 and 0.5.
    const crossed = (prev > ph) || (prev < 0.5 && ph >= 0.5);
    if (!crossed) return;
    const surface = c.groundCollider?.surface ?? 'stone';
    const wet = (p.waterLevelAt?.(p.position.x, p.position.z) ?? -Infinity) > p.position.y - 0.25;
    const name = wet ? 'stepWater' : AUDIO.steps[surface] ?? 'stepStone';
    const gain = (c.crouching ? 0.35 : p.speed > 6 ? 1.2 : p.speed < 2.5 ? 0.6 : 0.9);
    this.E.play(name, { pos: _v.copy(p.position), gain });
  }

  _ambience(dt) {
    const G = this.o.game;
    const L = this.loops;
    const room = G.room;
    const outdoor = !!room?.outdoor;
    const atm = G.atmosphere;
    const w = atm.weather;
    const c = w.current;
    const night = atm.night ?? 0;
    const pp = this.o.player.position;
    const set = (k, v) => L[k]?.set(Math.max(0, v), 0.6);
    if (outdoor) {
      const wind = Math.min(1, w.wind.length() / 6);
      set('wind', 0.25 + wind * 0.75 + Math.min(1, pp.y / 150) * 0.3);
      L.wind?.filter(0.7 + wind * 1.2);
      set('rain', c.rain * 1.1);
      set('crickets', night > 0.5 && c.rain < 0.1 ? (night - 0.5) * 1.6 : 0);
      const depth = room.waterDepth ? room.waterDepth(pp.x, pp.z) : 0;
      const near = room.waterLevelAt?.(pp.x, pp.z) > -Infinity ? 1 : 0;
      set('water', near ? 0.35 + Math.min(0.4, depth / 10) : 0);
      set('room', 0);
      set('crowd', 0);
      // Birds by day, owls by night, around the listener.
      this._bird -= dt;
      if (this._bird <= 0) {
        this._bird = 1;
        const rate = night > 0.5 ? AUDIO.owls : c.rain > 0.2 ? 0 : AUDIO.birds;
        if (Math.random() < rate) {
          const a = Math.random() * Math.PI * 2;
          const r = 12 + Math.random() * 25;
          this.E.play(night > 0.5 ? 'owl' : 'bird', { pos: { x: pp.x + Math.cos(a) * r, y: pp.y + 6 + Math.random() * 8, z: pp.z + Math.sin(a) * r } });
        }
      }
    } else {
      set('wind', 0.06);
      set('rain', c.rain * 0.15);
      set('crickets', 0);
      set('water', 0);
      set('room', 0.8);
      const hall = room?.streamer?.playerCell === 'greatHall';
      set('crowd', hall ? 0.7 : 0);
    }
  }

  _gameplayLoops(dt) {
    const G = this.o.game;
    const L = this.loops;
    const f = G.flight;
    // Broom: wind rises with speed.
    const v = f.active ? f.velocity.length() : 0;
    L.broom?.set(f.active ? 0.08 + Math.min(1, v / 35) * 0.9 : 0, 0.2);
    L.broom?.filter(0.6 + Math.min(2.5, v / 12));
    if (f.boosting && !this._boosting) this.E.play('boost', { pos: this.o.player.position });
    this._boosting = f.boosting;
    // Snitch wings near the Snitch.
    const s = G.match?.snitch;
    if (s?.out && G.match.phase === 'play') {
      L.snitch?.pos(s.pos);
      L.snitch?.set(0.9, 0.1);
    } else L.snitch?.set(0, 0.2);
    // The Solgun's cold aura.
    L.aura?.set(G.combat.chill * 1.1, 0.3);
    // Heartbeat when badly hurt.
    const p = this.o.player;
    if (!p.dead && p.health < p.maxHealth * AUDIO.heartbeat) {
      this._beat -= dt;
      if (this._beat <= 0) {
        this._beat = 0.55 + (p.health / p.maxHealth) * 1.5;
        this.E.play('heartbeat', { gain: 1 - p.health / p.maxHealth });
      }
    }
  }

  // --------------------------------------------------------------- music

  /** Music mood for the current game state. */
  mood() {
    if (this.forced) return this.forced;
    const G = this.o.game;
    const fsm = G.fsm;
    if (fsm.is('boot') || fsm.is('creator') || fsm.is('gallery')) return 'menu';
    if (fsm.is('loading')) return null;
    if (fsm.is('dialogue')) return 'calm';
    if (G.match?.active) return 'quidditch';
    if (G.duel?.phase === 'fight' || G.duel?.phase === 'countdown') return 'duel';
    const combat = G.combat;
    const pp = this.o.player.position;
    if (combat.boss?.engaged && !combat.boss.dead) return 'boss';
    const fighting = combat.enemies.some((e) => e.engaged && !e.dead && e.faction !== 'duel' && e.position.distanceTo(pp) < MUSIC.combatRange);
    const now = performance.now() / 1000;
    if (fighting) this._combatT = now;
    if (now - this._combatT < MUSIC.combatHold && this._combatT > 0) return 'combat';
    if (G.races.race || G.flight.active) return 'flight';
    const room = G.room;
    if (!room?.outdoor) return 'castle';
    return (G.atmosphere.night ?? 0) > 0.55 ? 'night' : 'day';
  }

  get stats() {
    return { ...this.E.stats, ...this.o.music.stats, Konuşma: `${this.o.voice.mode} · ${this.o.voice.spoken} satır` };
  }

  dispose() {
    for (const off of this._offs) off();
  }
}
