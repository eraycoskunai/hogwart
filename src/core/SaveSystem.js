/**
 * @file SaveSystem — versioned save slots and settings persisted in localStorage.
 *
 * Every storage access is wrapped in try/catch: storage may be disabled
 * (private mode, blocked site data) or return garbage. In those cases we
 * fall back to "no save" and the game starts fresh.
 */

/** Safe wrappers around localStorage. */
export const SafeStorage = {
  /** @param {string} key @returns {string|null} */
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  /** @param {string} key @param {string} value @returns {boolean} */
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  /** @param {string} key */
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  /** @param {string} key @returns {any|null} */
  getJSON(key) {
    const raw = SafeStorage.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  /** @param {string} key @param {any} value */
  setJSON(key, value) {
    try {
      return SafeStorage.set(key, JSON.stringify(value));
    } catch {
      return false;
    }
  },
};

/**
 * @typedef {Object} SaveEnvelope
 * @property {number} version
 * @property {number} timestamp
 * @property {string} label
 * @property {any} data
 */

export class SaveSystem {
  /**
   * @param {{prefix:string, version:number, slots:number}} cfg
   * @param {Record<number,(data:any)=>any>} [migrations] map "from version" → migrate fn
   */
  constructor(cfg, migrations = {}) {
    this.prefix = cfg.prefix;
    this.version = cfg.version;
    this.slotCount = cfg.slots;
    this.migrations = migrations;
  }

  /** @param {string|number} slot */
  _key(slot) {
    return `${this.prefix}:save:${slot}`;
  }

  /** All slot identifiers: 'auto' + 1..N */
  get slotIds() {
    const ids = ['auto'];
    for (let i = 1; i <= this.slotCount; i++) ids.push(i);
    return ids;
  }

  /**
   * @param {string|number} slot
   * @param {any} data serialisable game state
   * @param {string} [label]
   * @returns {boolean}
   */
  save(slot, data, label = '') {
    /** @type {SaveEnvelope} */
    const envelope = { version: this.version, timestamp: Date.now(), label, data };
    return SafeStorage.setJSON(this._key(slot), envelope);
  }

  /**
   * Load and migrate a slot. Returns null for empty/corrupt slots.
   * @param {string|number} slot
   * @returns {SaveEnvelope|null}
   */
  load(slot) {
    const env = SafeStorage.getJSON(this._key(slot));
    if (!env || typeof env !== 'object' || typeof env.version !== 'number' || !('data' in env)) return null;
    let { version, data } = env;
    if (version > this.version) return null; // written by a newer build
    try {
      while (version < this.version) {
        const migrate = this.migrations[version];
        if (!migrate) return null;
        data = migrate(data);
        version++;
      }
    } catch {
      return null;
    }
    return { ...env, version, data };
  }

  /** @param {string|number} slot */
  delete(slot) {
    SafeStorage.remove(this._key(slot));
  }

  /**
   * Metadata for all slots (for save/load menus).
   * @returns {{slot:string|number, empty:boolean, timestamp?:number, label?:string}[]}
   */
  list() {
    return this.slotIds.map((slot) => {
      const env = this.load(slot);
      return env ? { slot, empty: false, timestamp: env.timestamp, label: env.label } : { slot, empty: true };
    });
  }

  /** @returns {string|number|null} slot id of the newest save */
  latestSlot() {
    let best = null;
    let bestTime = -1;
    for (const meta of this.list()) {
      if (!meta.empty && meta.timestamp > bestTime) {
        bestTime = meta.timestamp;
        best = meta.slot;
      }
    }
    return best;
  }
}
