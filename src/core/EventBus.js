/**
 * @file EventBus — minimal publish/subscribe hub that decouples all modules.
 *
 * Modules never import each other to "notify"; they emit events here and
 * whoever cares subscribes. Event names are namespaced strings such as
 * `player:landed`, `trigger:enter`, `game:state`.
 */

/**
 * @callback EventHandler
 * @param {*} payload
 * @param {string} type
 */

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<EventHandler>>} */
    this._handlers = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} type
   * @param {EventHandler} handler
   * @returns {() => void} unsubscribe function
   */
  on(type, handler) {
    let set = this._handlers.get(type);
    if (!set) {
      set = new Set();
      this._handlers.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  /**
   * Subscribe for a single emission.
   * @param {string} type
   * @param {EventHandler} handler
   * @returns {() => void}
   */
  once(type, handler) {
    const wrapper = (payload, t) => {
      this.off(type, wrapper);
      handler(payload, t);
    };
    return this.on(type, wrapper);
  }

  /**
   * @param {string} type
   * @param {EventHandler} handler
   */
  off(type, handler) {
    const set = this._handlers.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this._handlers.delete(type);
  }

  /**
   * Emit an event. Handler exceptions are isolated so one faulty listener
   * cannot break the rest of the frame.
   * @param {string} type
   * @param {*} [payload]
   */
  emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload, type);
      } catch (err) {
        console.error(`[EventBus] handler for "${type}" failed`, err);
      }
    }
  }

  /** Remove every handler (used on full teardown). */
  clear() {
    this._handlers.clear();
  }
}

/** Shared application-wide bus. */
export const bus = new EventBus();
