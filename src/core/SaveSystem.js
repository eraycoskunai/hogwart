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
 * @property {any} meta   summary for menus: place, chapter, playtime, name, house, galleons, thumb (JPEG data URL)
 * @property {any} data
 */

export class SaveSystem {
  /**
   * Slots: 'quick', rotating autosaves 'auto' → 'auto2' → 'auto3', and manual 1…N.
   * @param {{prefix:string, version:number, slots:number, autos?:number}} cfg
   * @param {Record<number,(data:any)=>any>} [migrations] map "from version" → migrate fn
   */
  constructor(cfg, migrations = {}) {
    this.prefix = cfg.prefix;
    this.version = cfg.version;
    this.slotCount = cfg.slots;
    this.autoCount = cfg.autos ?? 1;
    /** Last failure reason ('quota' | 'storage' | null). */
    this.error = null;
    this.migrations = migrations;
  }

  /** @param {string|number} slot */
  _key(slot) {
    return `${this.prefix}:save:${slot}`;
  }

  /** Autosave slot ids, newest first. */
  get autoIds() {
    const ids = ['auto'];
    for (let i = 2; i <= this.autoCount; i++) ids.push(`auto${i}`);
    return ids;
  }

  /** All slot identifiers: quick, autos, manual 1..N. */
  get slotIds() {
    const ids = ['quick', ...this.autoIds];
    for (let i = 1; i <= this.slotCount; i++) ids.push(i);
    return ids;
  }

  /**
   * @param {string|number} slot
   * @param {any} data serialisable game state
   * @param {string} [label]
   * @returns {boolean}
   */
  save(slot, data, label = '', meta = null) {
    /** @type {SaveEnvelope} */
    const envelope = { version: this.version, timestamp: Date.now(), label, meta, data };
    let text;
    try {
      text = JSON.stringify(envelope);
    } catch {
      this.error = 'storage';
      return false;
    }
    let ok = SafeStorage.set(this._key(slot), text);
    // Full storage: retry without the thumbnail.
    if (!ok && meta?.thumb) {
      envelope.meta = { ...meta, thumb: null };
      ok = SafeStorage.set(this._key(slot), JSON.stringify(envelope));
    }
    this.error = ok ? null : 'quota';
    return ok;
  }

  /** Autosave: older autosaves move down the rotation. */
  autosave(data, label, meta) {
    const ids = this.autoIds;
    for (let i = ids.length - 1; i > 0; i--) {
      const prev = SafeStorage.get(this._key(ids[i - 1]));
      if (prev != null) SafeStorage.set(this._key(ids[i]), prev);
    }
    return this.save('auto', data, label, meta);
  }

  /** Raw JSON text of a slot (export to a file). */
  exportSlot(slot) {
    return SafeStorage.get(this._key(slot));
  }

  /**
   * Store a save file's text in a slot (import). Validates the envelope.
   * @returns {boolean}
   */
  importSlot(slot, text) {
    let env;
    try {
      env = JSON.parse(text);
    } catch {
      return false;
    }
    if (!env || typeof env !== 'object' || typeof env.version !== 'number' || env.version > this.version || !env.data || typeof env.data !== 'object') return false;
    env.timestamp = Number(env.timestamp) || Date.now();
    return SafeStorage.setJSON(this._key(slot), env);
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
      return env ? { slot, empty: false, timestamp: env.timestamp, label: env.label, meta: env.meta ?? null } : { slot, empty: true };
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
