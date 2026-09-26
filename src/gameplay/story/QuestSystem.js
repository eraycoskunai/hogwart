/**
 * @file QuestSystem — the main story line and side quests. Quests are
 * data (story.js): ordered steps with objectives that complete from game
 * events (talks, lessons, kills, races, matches, purchases…) or from
 * polling the world (reaching a place, entering a room, a boss beaten,
 * the Room of Requirement's shape). Story items glow in the world while
 * their step is active and are picked up with E. Finishing a quest pays
 * house points, Galleons and flags, and the next chapter starts.
 *
 * Each objective also reports a target (region + position) for the
 * tracker's waypoint.
 *
 * Events: quest:started {id}, quest:step {id, step, text}, quest:completed {id, name, reward}, quest:item {id}
 */
import * as THREE from 'three';
import { QUESTS, STORY_ITEMS, WHISPERS } from '../../data/story.js';
import { PROFESSORS } from '../../data/lessons.js';
import { ENCOUNTERS, BOSS } from '../../data/combat.js';
import { INTERIOR } from '../../data/interior.js';
import { glowMaterial } from '../../render/SpellVisuals.js';

const BY_ID = new Map(QUESTS.map((q) => [q.id, q]));
/** Item look: size, float height and spin. */
const ITEM = Object.freeze({ size: 0.28, float: 1.1, spin: 1.4, bob: 0.12, reach: 2.6 });

/** Where the fights of an enemy type happen (for waypoints). */
function zoneOf(enemy) {
  for (const [region, list] of Object.entries(ENCOUNTERS)) {
    for (const z of list) if (z.spawns.some(([t]) => t === enemy)) return { region, pos: [z.center[0], z.y ?? null, z.center[1]] };
  }
  return null;
}

export class QuestSystem {
  /**
   * @param {{bus:any, game:any, inventory:any, relationships:any, housePoints:import('./HousePoints.js').HousePoints, worldState:any,
   *          scene:THREE.Scene, interactions:any, particles:{glow:any}, ui:{notice:Function, toast:Function}}} o
   */
  constructor(o) {
    this.o = o;
    this.bus = o.bus;
    this.reset();
    this.items = new Map();
    this.time = 0;
    this._itemGeo = new THREE.OctahedronGeometry(ITEM.size, 0);
    const on = (ev, fn) => this.bus.on(ev, fn);
    this._offs = [
      on('social:talk', ({ id }) => this._event('talk', id)),
      on('lesson:complete', ({ id }) => this._event('lesson', id)),
      on('combat:killed', ({ enemy }) => this._event('kill', enemy.type)),
      on('race:finish', ({ medal }) => medal >= 0 && this._event('medal')),
      on('quidditch:end', ({ won }) => won && this._event('quidditch')),
      on('shop:bought', () => this._event('broom')),
      on('story:villain', () => this._event('villain')),
    ];
  }

  reset() {
    /** @type {Record<string, {step:number, progress:number, done:boolean}>} */
    this.quests = {};
    this.flags = {};
    this.taken = [];
    this.tracked = null;
  }

  // ------------------------------------------------------------- control

  /** Begin the story (new game) and the side quests. */
  begin() {
    this.start('main1');
    for (const q of QUESTS) if (!q.main) this.start(q.id, true);
  }

  start(id, silent = false) {
    if (this.quests[id]) return;
    const q = BY_ID.get(id);
    this.quests[id] = { step: 0, progress: 0, done: false };
    if (q.main) this.tracked = id;
    this.bus.emit('quest:started', { id, name: q.name, main: !!q.main, silent });
    if (WHISPERS[id]) this.o.ui.toast(WHISPERS[id], 8);
    this._announce(id);
  }

  _announce(id) {
    const s = this.step(id);
    if (s) this.bus.emit('quest:step', { id, step: this.quests[id].step, text: s.text });
  }

  /** Current step of a quest (null when done / not started). */
  step(id) {
    const st = this.quests[id];
    if (!st || st.done) return null;
    return BY_ID.get(id).steps[st.step] ?? null;
  }

  active(id) {
    return !!this.quests[id] && !this.quests[id].done;
  }

  done(id) {
    return !!this.quests[id]?.done;
  }

  /** Current main-line quest id. */
  get mainQuest() {
    return QUESTS.filter((q) => q.main).find((q) => this.active(q.id))?.id ?? null;
  }

  /** Advance the active step of quest `id`. */
  advance(id) {
    const st = this.quests[id];
    const q = BY_ID.get(id);
    st.step++;
    st.progress = 0;
    if (st.step >= q.steps.length) {
      this._complete(id);
      return;
    }
    this._announce(id);
    if (WHISPERS[`${id}:${st.step}`]) this.o.ui.toast(WHISPERS[`${id}:${st.step}`], 8);
  }

  _complete(id) {
    const st = this.quests[id];
    const q = BY_ID.get(id);
    st.done = true;
    const R = q.reward ?? {};
    if (R.points) this.o.housePoints.award(R.points, q.name);
    if (R.galleons) this.o.inventory.earn(R.galleons, q.name);
    if (R.flag) {
      this.flags[R.flag] = true;
      // Regions read story flags from the world state (the Room of Requirement).
      (this.o.worldState.story ??= {})[R.flag] = true;
    }
    this.bus.emit('quest:completed', { id, name: q.name, main: !!q.main, reward: R });
    // Next chapter.
    if (q.main) {
      const next = QUESTS.find((x) => x.main && x.chapter === q.chapter + 1);
      if (next) this.start(next.id);
      else this.tracked = null;
    }
    if (this.tracked === id) this.tracked = this.mainQuest;
  }

  // ------------------------------------------------------------ events

  _event(kind, arg) {
    for (const id of Object.keys(this.quests)) {
      const s = this.step(id);
      if (!s || s.kind !== kind) continue;
      const st = this.quests[id];
      if (kind === 'lesson' && s.lesson !== arg) continue;
      if (kind === 'kill') {
        if (s.enemy !== arg) continue;
        st.progress++;
        if (st.progress < s.count) {
          this.bus.emit('quest:progress', { id, text: `${s.text} (${st.progress}/${s.count})` });
          continue;
        }
      }
      this.advance(id);
    }
  }

  /** Polled objectives. */
  _check(id, s) {
    const G = this.o.game;
    const room = G.room;
    const p = G.player.position;
    switch (s.kind) {
      case 'reach':
        return room?.id === s.region && Math.hypot(p.x - s.pos[0], p.z - s.pos[2]) < s.radius && Math.abs(p.y - s.pos[1]) < 4;
      case 'cell':
        return room?.id === 'castle' && room.streamer?.playerCell === s.cell;
      case 'boss':
        return !!this.o.worldState.bosses?.[s.boss];
      case 'friend':
        return Object.keys(this.o.relationships.people).filter((c) => this.o.relationships.level(c) >= s.level).length >= (s.count ?? 1);
      case 'duel':
        return (this.o.worldState.duel?.rank ?? 0) >= s.rank;
      case 'requirement':
        return room?.id === 'castle' && this.o.worldState.castle?.variant === s.variant && room.streamer?.playerCell === 'requirement';
      case 'flag':
        return !!this.flags[s.flag];
      default:
        return false;
    }
  }

  // --------------------------------------------------------------- items

  _syncItems() {
    const G = this.o.game;
    const want = new Set();
    for (const id of Object.keys(this.quests)) {
      const s = this.step(id);
      if (s?.kind === 'item' && STORY_ITEMS[s.item].region === G.room?.id && !this.taken.includes(s.item)) want.add(s.item);
    }
    for (const [k, it] of this.items) {
      if (want.has(k)) continue;
      this._removeItem(it);
      this.items.delete(k);
    }
    for (const k of want) if (!this.items.has(k)) this.items.set(k, this._makeItem(k));
  }

  _makeItem(key) {
    const S = STORY_ITEMS[key];
    const G = this.o.game;
    const [x, y, z] = S.pos;
    const base = new THREE.Vector3(x, y ?? G.room.heightAt(x, z), z);
    const mat = glowMaterial(S.color, 0.9, 0.6);
    const mesh = new THREE.Mesh(this._itemGeo, mat);
    mesh.position.copy(base).setY(base.y + ITEM.float);
    this.o.scene.add(mesh);
    const item = this.o.interactions.add({
      id: `story:${key}`,
      position: mesh.position,
      radius: ITEM.reach,
      label: `Al: ${S.name}`,
      action: () => this._take(key),
    });
    return { key, mesh, mat, item, base };
  }

  _removeItem(it) {
    it.mesh.removeFromParent();
    it.mat.dispose();
    this.o.interactions.remove(it.item);
  }

  _take(key) {
    const S = STORY_ITEMS[key];
    const it = this.items.get(key);
    if (!it) return;
    this.taken.push(key);
    this.o.particles.glow.burst(60, it.mesh.position, { speed: [1, 5], life: 1, size: 0.1, color: S.color, shape: 1, drag: 1.5 });
    this._removeItem(it);
    this.items.delete(key);
    this.o.ui.toast(S.text, 9);
    this.bus.emit('quest:item', { id: key, name: S.name });
    for (const id of Object.keys(this.quests)) {
      const s = this.step(id);
      if (s?.kind === 'item' && s.item === key) this.advance(id);
    }
  }

  // --------------------------------------------------------------- update

  /** @param {number} dt */
  update(dt) {
    this.time += dt;
    for (const id of Object.keys(this.quests)) {
      const s = this.step(id);
      if (s && this._check(id, s)) this.advance(id);
    }
    this._syncItems();
    for (const it of this.items.values()) {
      it.mesh.rotation.y += dt * ITEM.spin;
      it.mesh.position.y = it.base.y + ITEM.float + Math.sin(this.time * 2) * ITEM.bob;
      if (Math.random() < 0.3) this.o.particles.glow.spawn(it.mesh.position, { x: (Math.random() - 0.5) * 0.6, y: 0.6, z: (Math.random() - 0.5) * 0.6 }, { life: 0.8, size: 0.05, color: STORY_ITEMS[it.key].color, shape: 1 });
    }
  }

  /** Clear world items (region change). */
  clearWorld() {
    for (const it of this.items.values()) this._removeItem(it);
    this.items.clear();
  }

  // ------------------------------------------------------------- tracker

  /** Waypoint of a step: {region, pos:[x,y|null,z]} or null. */
  target(s) {
    switch (s.kind) {
      case 'reach':
        return { region: s.region, pos: s.pos };
      case 'cell': {
        const c = INTERIOR.cells.find((x) => x.id === s.cell);
        return c ? { region: 'castle', pos: [(c.min[0] + c.max[0]) / 2, c.min[1], (c.min[2] + c.max[2]) / 2] } : null;
      }
      case 'lesson': {
        const P = PROFESSORS[s.lesson === 'patronus' ? 'dada' : s.lesson];
        return P ? { region: P.region, pos: P.pos } : null;
      }
      case 'item':
        return { region: STORY_ITEMS[s.item].region, pos: STORY_ITEMS[s.item].pos };
      case 'kill':
        return zoneOf(s.enemy);
      case 'boss':
        return { region: 'grounds', pos: [BOSS.spiderQueen.arena.center[0], null, BOSS.spiderQueen.arena.center[1]] };
      case 'requirement':
      case 'villain':
        return { region: 'castle', pos: [29, 21, -27] };
      case 'duel':
        return { region: 'castle', pos: [18.2, 0, 13.4] };
      case 'broom':
        return { region: 'grounds', pos: [370, null, -46] };
      case 'quidditch':
        return { region: 'grounds', pos: [412, null, -46] };
      default:
        return null;
    }
  }

  /** Tracker line for the tracked (or current main) quest. */
  get tracker() {
    const id = this.tracked && this.active(this.tracked) ? this.tracked : this.mainQuest;
    if (!id) return null;
    const q = BY_ID.get(id);
    const s = this.step(id);
    if (!s) return null;
    const st = this.quests[id];
    const count = s.count && s.kind === 'kill' ? ` (${st.progress}/${s.count})` : '';
    return { id, name: q.main ? `Bölüm ${q.chapter}: ${q.name}` : q.name, text: s.text + count, target: this.target(s) };
  }

  /** All quests for the journal. */
  get journal() {
    return QUESTS.filter((q) => this.quests[q.id]).map((q) => {
      const st = this.quests[q.id];
      return { id: q.id, main: !!q.main, chapter: q.chapter, name: q.name, desc: q.desc, done: st.done, steps: q.steps.map((s, i) => ({ text: s.text, done: st.done || i < st.step, current: !st.done && i === st.step })) };
    });
  }

  serialize() {
    return { quests: structuredClone(this.quests), flags: { ...this.flags }, taken: [...this.taken], tracked: this.tracked };
  }

  deserialize(d) {
    this.clearWorld();
    this.reset();
    if (!d) return;
    for (const [id, st] of Object.entries(d.quests ?? {})) {
      if (!BY_ID.has(id) || !st) continue;
      this.quests[id] = { step: Number(st.step) || 0, progress: Number(st.progress) || 0, done: !!st.done };
    }
    this.flags = { ...(d.flags ?? {}) };
    this.taken = Array.isArray(d.taken) ? d.taken.filter((k) => k in STORY_ITEMS) : [];
    this.tracked = BY_ID.has(d.tracked) ? d.tracked : null;
  }

  dispose() {
    this.clearWorld();
    for (const off of this._offs) off();
    this._itemGeo.dispose();
  }
}
