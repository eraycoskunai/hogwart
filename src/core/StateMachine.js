/**
 * @file StateMachine — tiny finite state machine used for game flow,
 * AI behaviours and locomotion states.
 */

/**
 * @typedef {Object} State
 * @property {(owner:any, prev:string|null, data?:any) => void} [enter]
 * @property {(owner:any, next:string) => void} [exit]
 * @property {(owner:any, dt:number) => void} [update]
 * @property {(owner:any, dt:number) => void} [fixedUpdate]
 */

export class StateMachine {
  /**
   * @param {any} owner object passed to every state callback
   * @param {Record<string, State>} states
   * @param {(from:string|null, to:string) => void} [onChange]
   */
  constructor(owner, states, onChange) {
    this.owner = owner;
    this.states = states;
    this.onChange = onChange;
    /** @type {string|null} */
    this.current = null;
    /** @type {string|null} */
    this.previous = null;
    /** Seconds spent in the current state. */
    this.time = 0;
  }

  /**
   * Transition to another state (re-entering the same state is ignored unless forced).
   * @param {string} name
   * @param {any} [data]
   * @param {boolean} [force]
   */
  change(name, data, force = false) {
    if (!this.states[name]) throw new Error(`StateMachine: unknown state "${name}"`);
    if (this.current === name && !force) return;
    const prev = this.current;
    if (prev) this.states[prev].exit?.(this.owner, name);
    this.previous = prev;
    this.current = name;
    this.time = 0;
    this.states[name].enter?.(this.owner, prev, data);
    this.onChange?.(prev, name);
  }

  /** @param {string} name */
  is(name) {
    return this.current === name;
  }

  /** @param {number} dt */
  update(dt) {
    this.time += dt;
    if (this.current) this.states[this.current].update?.(this.owner, dt);
  }

  /** @param {number} dt */
  fixedUpdate(dt) {
    if (this.current) this.states[this.current].fixedUpdate?.(this.owner, dt);
  }
}
