/**
 * @file HousePoints — the House Cup. Four houses start with some points;
 * the player's own house earns (or loses) points through lessons, quests,
 * duels and matches; the other houses gain a little every game day so the
 * race stays alive. Saved with the story.
 *
 * Events: house:points {house, amount, total, reason}
 */
import { HOUSES } from '../../data/character.js';
import { HOUSE_CUP } from '../../data/story.js';

const rand = ([a, b]) => Math.round(a + Math.random() * (b - a));

export class HousePoints {
  /**
   * @param {import('../../core/EventBus.js').EventBus} bus
   * @param {() => string} playerHouse
   */
  constructor(bus, playerHouse) {
    this.bus = bus;
    this.playerHouse = playerHouse;
    this.reset();
  }

  reset() {
    /** @type {Record<string, number>} */
    this.points = {};
    for (const h of Object.keys(HOUSES)) if (h !== 'none') this.points[h] = rand(HOUSE_CUP.start);
    this.lastDay = null;
  }

  /** The house the player plays for ('none' counts as Gryffindor). */
  get house() {
    const h = this.playerHouse();
    return h in this.points ? h : 'gryffindor';
  }

  /** Give (or take) points to the player's house. */
  award(amount, reason) {
    this.add(this.house, amount, reason);
  }

  add(house, amount, reason = '') {
    if (!(house in this.points) || !amount) return;
    this.points[house] = Math.max(0, this.points[house] + amount);
    this.bus.emit('house:points', { house, label: HOUSES[house].label, amount, total: this.points[house], reason });
  }

  /** Rivals' daily gains (call on each new game day). */
  newDay(day) {
    if (this.lastDay === day) return;
    const first = this.lastDay === null;
    this.lastDay = day;
    if (first) return;
    for (const h of Object.keys(this.points)) if (h !== this.house) this.points[h] += rand(HOUSE_CUP.rivalDaily);
  }

  /** Houses sorted by points. */
  get standings() {
    return Object.entries(this.points)
      .map(([id, pts]) => ({ id, label: HOUSES[id].label, color: HOUSES[id].primary, points: pts, mine: id === this.house }))
      .sort((a, b) => b.points - a.points);
  }

  serialize() {
    return { points: { ...this.points }, lastDay: this.lastDay };
  }

  deserialize(d) {
    this.reset();
    if (!d) return;
    for (const [h, v] of Object.entries(d.points ?? {})) if (h in this.points && Number.isFinite(v)) this.points[h] = v;
    this.lastDay = Number.isFinite(d.lastDay) ? d.lastDay : null;
  }
}
