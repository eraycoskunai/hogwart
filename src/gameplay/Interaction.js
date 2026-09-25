/**
 * @file Interaction — "press E" system. Regions register interactables
 * (doors, chests, portraits, secret bricks …) as fixed points or as
 * providers that return the best candidate near the player. Each frame the
 * nearest usable candidate in front of the player becomes the prompt; the
 * interact action triggers it.
 *
 * Events: interaction:used {id}
 */
import * as THREE from 'three';

export const INTERACT = Object.freeze({
  /** Minimum cosine between the player's facing and the target (flat). */
  facing: 0.2,
  /** Vertical tolerance around the player's chest. */
  height: 2.2,
  chest: 1.2,
});

const _to = new THREE.Vector3();

/**
 * @typedef {object} Interactable
 * @property {string} id
 * @property {THREE.Vector3} position
 * @property {number} radius
 * @property {string|(() => string)} label
 * @property {() => void} action
 * @property {() => boolean} [enabled]
 */

export class Interaction {
  /** @param {import('../core/EventBus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    /** @type {Set<Interactable>} */
    this.items = new Set();
    /** @type {Set<(pos:THREE.Vector3, fwd:THREE.Vector3) => Interactable|null>} */
    this.providers = new Set();
    /** @type {Interactable|null} */
    this.current = null;
  }

  /** @param {Interactable} item @returns {Interactable} */
  add(item) {
    this.items.add(item);
    return item;
  }

  remove(item) {
    this.items.delete(item);
    if (this.current === item) this.current = null;
  }

  addProvider(fn) {
    this.providers.add(fn);
    return fn;
  }

  removeProvider(fn) {
    this.providers.delete(fn);
  }

  clear() {
    this.items.clear();
    this.providers.clear();
    this.current = null;
  }

  /**
   * @param {THREE.Vector3} pos player feet
   * @param {THREE.Vector3} fwd player facing (flat, normalised)
   */
  update(pos, fwd) {
    let best = null;
    let bestScore = Infinity;
    const consider = (it) => {
      if (!it || (it.enabled && !it.enabled())) return;
      _to.subVectors(it.position, pos);
      if (Math.abs(_to.y - INTERACT.chest) > INTERACT.height) return;
      _to.y = 0;
      const d = _to.length();
      if (d > it.radius) return;
      const cos = d > 0.3 ? _to.dot(fwd) / d : 1;
      if (cos < INTERACT.facing) return;
      const score = d * (1.5 - cos);
      if (score < bestScore) {
        best = it;
        bestScore = score;
      }
    };
    for (const it of this.items) consider(it);
    for (const p of this.providers) consider(p(pos, fwd));
    this.current = best;
    return best;
  }

  /** Prompt text for the current candidate ('' when none). */
  get label() {
    const c = this.current;
    if (!c) return '';
    return typeof c.label === 'function' ? c.label() : c.label;
  }

  /** Use the current candidate. */
  trigger() {
    const c = this.current;
    if (!c) return false;
    c.action();
    this.bus.emit('interaction:used', { id: c.id });
    return true;
  }
}
