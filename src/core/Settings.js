/**
 * @file Settings — user preferences persisted in localStorage, broadcast via EventBus.
 */
import { DEFAULT_SETTINGS, SETTING_RANGES } from '../data/settings.js';
import { QUALITY_PRESETS } from '../data/quality.js';
import { SafeStorage } from './SaveSystem.js';

export class Settings {
  /**
   * @param {import('./EventBus.js').EventBus} bus
   * @param {string} prefix storage prefix
   */
  constructor(bus, prefix) {
    this.bus = bus;
    this.key = `${prefix}:settings`;
    /** @type {typeof DEFAULT_SETTINGS & Record<string, any>} */
    this.values = structuredClone(DEFAULT_SETTINGS);
    this.load();
  }

  load() {
    const stored = SafeStorage.getJSON(this.key);
    if (stored && typeof stored === 'object') {
      for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (k in stored && typeof stored[k] === typeof DEFAULT_SETTINGS[k]) {
          this.values[k] = k === 'volume' || k === 'fx' ? { ...DEFAULT_SETTINGS[k], ...stored[k] } : stored[k];
        }
      }
    }
    this._validate();
  }

  _validate() {
    const v = this.values;
    if (!QUALITY_PRESETS[v.quality]) v.quality = DEFAULT_SETTINGS.quality;
    for (const [k, r] of Object.entries(SETTING_RANGES)) {
      if (!Number.isFinite(v[k])) v[k] = DEFAULT_SETTINGS[k];
      v[k] = Math.min(r.max, Math.max(r.min, v[k]));
    }
    if (!Number.isFinite(v.renderScale) || v.renderScale <= 0) v.renderScale = DEFAULT_SETTINGS.renderScale;
  }

  save() {
    SafeStorage.setJSON(this.key, this.values);
  }

  /** @param {string} key */
  get(key) {
    return this.values[key];
  }

  /**
   * Update one setting, persist and notify (`settings:changed`).
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    this.values[key] = value;
    this._validate();
    this.save();
    this.bus.emit('settings:changed', { key, value: this.values[key], settings: this.values });
  }

  resetToDefaults() {
    this.values = structuredClone(DEFAULT_SETTINGS);
    this.save();
    this.bus.emit('settings:changed', { key: '*', value: null, settings: this.values });
  }
}
