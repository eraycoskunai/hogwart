/**
 * @file Relationships — friendship state with every companion: affinity
 * 0…100 and its named level, topics already talked about, the game day of
 * the last chat and gift, the favour's progress, and who is currently
 * following the player. Saved as its own section.
 *
 * Events: social:affinity {id, amount, value, level}, social:level {id, level, name}
 */
import { AFFINITY, COMPANIONS } from '../../data/companions.js';

/** Favour states. */
export const FAVOUR = Object.freeze({ none: 0, active: 1, done: 2 });

export class Relationships {
  /** @param {import('../../core/EventBus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    this.reset();
  }

  reset() {
    /** @type {Record<string, {affinity:number, topics:number[], talkDay:number, giftDay:number, favour:number, progress:number, met:boolean}>} */
    this.people = {};
    for (const id of Object.keys(COMPANIONS)) this.people[id] = { affinity: 0, topics: [], talkDay: -1, giftDay: -1, favour: FAVOUR.none, progress: 0, met: false };
    /** Companion id walking with the player, or null. */
    this.following = null;
  }

  get(id) {
    return this.people[id];
  }

  /** Level index 0…4 for an affinity value. */
  static levelOf(value) {
    let lvl = 0;
    AFFINITY.levels.forEach((l, i) => {
      if (value >= l.at) lvl = i;
    });
    return lvl;
  }

  level(id) {
    return Relationships.levelOf(this.people[id].affinity);
  }

  levelName(id) {
    return AFFINITY.levels[this.level(id)].name;
  }

  /** Progress 0…1 toward the next level. */
  progress(id) {
    const a = this.people[id].affinity;
    const L = AFFINITY.levels;
    const i = this.level(id);
    if (i >= L.length - 1) return 1;
    return (a - L[i].at) / (L[i + 1].at - L[i].at);
  }

  /** Change affinity; announces level changes. */
  add(id, amount) {
    const p = this.people[id];
    if (!p || !amount) return;
    const before = this.level(id);
    p.affinity = Math.max(0, Math.min(AFFINITY.max, p.affinity + amount));
    const after = this.level(id);
    this.bus.emit('social:affinity', { id, amount, value: p.affinity, level: after });
    if (after !== before) this.bus.emit('social:level', { id, level: after, name: AFFINITY.levels[after].name, up: after > before });
  }

  serialize() {
    return { people: structuredClone(this.people), following: this.following };
  }

  /** @param {any} d */
  deserialize(d) {
    this.reset();
    if (!d || typeof d !== 'object') return;
    for (const [id, p] of Object.entries(d.people ?? {})) {
      const t = this.people[id];
      if (!t || !p || typeof p !== 'object') continue;
      if (Number.isFinite(p.affinity)) t.affinity = Math.max(0, Math.min(AFFINITY.max, p.affinity));
      if (Array.isArray(p.topics)) t.topics = p.topics.filter(Number.isInteger);
      for (const k of ['talkDay', 'giftDay', 'favour', 'progress']) if (Number.isFinite(p[k])) t[k] = p[k];
      t.met = !!p.met;
    }
    this.following = d.following in COMPANIONS ? d.following : null;
  }
}
