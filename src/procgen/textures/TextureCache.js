/**
 * @file TextureCache — persistent IndexedDB cache for generated map sets,
 * so the second launch skips generation entirely. Every operation is
 * guarded: when IndexedDB is unavailable (private mode, blocked storage,
 * quota) the cache silently behaves as empty.
 */

const DB_VERSION = 1;
const STORE = 'maps';

export class TextureCache {
  /** @param {string} dbName */
  constructor(dbName) {
    this.dbName = dbName;
    /** @type {Promise<IDBDatabase|null>|null} */
    this._db = null;
    this.hits = 0;
    this.misses = 0;
  }

  /** @returns {Promise<IDBDatabase|null>} */
  _open() {
    if (this._db) return this._db;
    this._db = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(this.dbName, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this._db;
  }

  /**
   * @param {string} key
   * @returns {Promise<{size:number, maps:Record<string, Uint8Array>}|null>}
   */
  async get(key) {
    const db = await this._open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = () => {
          const v = req.result;
          if (v && v.maps && v.size) {
            this.hits++;
            resolve(v);
          } else {
            this.misses++;
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * @param {string} key
   * @param {{size:number, maps:Record<string, Uint8Array>}} value
   */
  async put(key, value) {
    const db = await this._open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /** Delete every cached map set. */
  async clear() {
    const db = await this._open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }
}
