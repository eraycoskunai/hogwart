/**
 * @file SpellTargets — registry of things spells can act on besides plain
 * rigid bodies: training dummies, doors, ice floes (and enemies later).
 * Colliders map to a handler implementing:
 *   name:string
 *   center(out:THREE.Vector3): THREE.Vector3   aim / area-effect point
 *   onSpell(ev): boolean                       true when the spell had an effect
 *   status?: Record<string, number>            active statuses (seconds left)
 * The spell system also asks every handler within an explosion radius.
 */
export class SpellTargets {
  constructor() {
    /** @type {Map<any, any>} collider → handler */
    this.byCollider = new Map();
    /** @type {Set<any>} */
    this.handlers = new Set();
  }

  /**
   * @param {any} collider
   * @param {any} handler
   */
  add(collider, handler) {
    this.byCollider.set(collider, handler);
    this.handlers.add(handler);
  }

  /** Remove every collider of a handler. */
  remove(handler) {
    for (const [c, h] of this.byCollider) if (h === handler) this.byCollider.delete(c);
    this.handlers.delete(handler);
  }

  /** @param {any} collider */
  get(collider) {
    return this.byCollider.get(collider) ?? null;
  }

  clear() {
    this.byCollider.clear();
    this.handlers.clear();
  }
}
