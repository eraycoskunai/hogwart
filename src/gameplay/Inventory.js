/**
 * @file Inventory — the student's purse and progress outside the world
 * state: Galleons, owned brooms and the one in use, race records (best
 * time, medal, ghost of the best run) and the Quidditch record. Saved as
 * its own section so spending money never forces a region rebuild.
 *
 * Events: inventory:galleons {amount, total, reason}, inventory:broom {id}
 */
import { BROOMS, ECONOMY } from '../data/flight.js';

export class Inventory {
  /** @param {import('../core/EventBus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.galleons = ECONOMY.start;
    /** @type {string[]} */
    this.brooms = ['school'];
    this.broom = 'school';
    /** @type {Record<string, {best:number, medal:number, ghost:number[]|null}>} */
    this.races = {};
    this.quidditch = { played: 0, won: 0, snitches: 0 };
  }

  /** @param {number} amount @param {string} [reason] */
  earn(amount, reason = '') {
    if (!(amount > 0)) return;
    this.galleons += Math.round(amount);
    this.bus.emit('inventory:galleons', { amount: Math.round(amount), total: this.galleons, reason });
  }

  /** @returns {boolean} paid */
  spend(amount, reason = '') {
    if (amount > this.galleons) return false;
    this.galleons -= amount;
    this.bus.emit('inventory:galleons', { amount: -amount, total: this.galleons, reason });
    return true;
  }

  owns(id) {
    return this.brooms.includes(id);
  }

  /** Buy a broom (and use it). @returns {'ok'|'owned'|'poor'} */
  buy(id) {
    if (this.owns(id)) return 'owned';
    if (!this.spend(BROOMS[id].price, BROOMS[id].name)) return 'poor';
    this.brooms.push(id);
    this.equip(id);
    return 'ok';
  }

  equip(id) {
    if (!this.owns(id)) return;
    this.broom = id;
    this.bus.emit('inventory:broom', { id });
  }

  get broomSpec() {
    return BROOMS[this.broom] ?? BROOMS.school;
  }

  /**
   * Record a race result.
   * @returns {{best:boolean, medal:number, prevMedal:number}}
   */
  recordRace(id, time, medal, ghost) {
    const r = this.races[id] ?? { best: Infinity, medal: -1, ghost: null };
    const prevMedal = r.medal;
    const best = time < r.best;
    if (best) {
      r.best = time;
      r.ghost = ghost;
    }
    if (medal >= 0 && (r.medal < 0 || medal < r.medal)) r.medal = medal;
    this.races[id] = r;
    return { best, medal: r.medal, prevMedal };
  }

  serialize() {
    const races = {};
    for (const [k, r] of Object.entries(this.races)) races[k] = { best: Number.isFinite(r.best) ? r.best : null, medal: r.medal, ghost: r.ghost };
    return { galleons: this.galleons, brooms: [...this.brooms], broom: this.broom, races, quidditch: { ...this.quidditch } };
  }

  /** @param {any} d */
  deserialize(d) {
    this.reset();
    if (!d || typeof d !== 'object') return;
    if (Number.isFinite(d.galleons)) this.galleons = Math.max(0, Math.round(d.galleons));
    if (Array.isArray(d.brooms)) this.brooms = [...new Set(['school', ...d.brooms.filter((b) => b in BROOMS)])];
    if (this.owns(d.broom)) this.broom = d.broom;
    for (const [k, r] of Object.entries(d.races ?? {})) {
      if (!r || typeof r !== 'object') continue;
      this.races[k] = { best: Number.isFinite(r.best) ? r.best : Infinity, medal: Number.isInteger(r.medal) ? r.medal : -1, ghost: Array.isArray(r.ghost) ? r.ghost.filter(Number.isFinite) : null };
    }
    const q = d.quidditch ?? {};
    for (const k of Object.keys(this.quidditch)) if (Number.isFinite(q[k])) this.quidditch[k] = q[k];
  }
}
