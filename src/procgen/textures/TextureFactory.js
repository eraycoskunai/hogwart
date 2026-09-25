/**
 * @file TextureFactory — schedules material map generation on a pool of
 * module Web Workers, de-duplicates in-flight requests, and caches results
 * in memory and IndexedDB. Falls back to main-thread generation (yielding
 * between materials) when module workers are unavailable.
 *
 * Emits `textures:progress` {done, total, label} while batches load.
 */
import { hash2i } from './noise.js';
import { TextureCache } from './TextureCache.js';

/**
 * @typedef {Object} MapSet
 * @property {number} size
 * @property {Record<string, Uint8Array>} maps  albedo, normal, orm, [emissive]
 * @property {boolean} [cached]
 * @property {number} [ms]
 */

/** Stable seed from a material key. */
export function seedFor(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = hash2i(h, key.charCodeAt(i), 0x5bd1e995);
  return h | 0;
}

export class TextureFactory {
  /**
   * @param {import('../../core/EventBus.js').EventBus} bus
   * @param {{version:number, dbName:string, maxWorkers:number}} cfg
   */
  constructor(bus, cfg) {
    this.bus = bus;
    this.version = cfg.version;
    this.cache = new TextureCache(cfg.dbName);
    /** @type {Map<string, MapSet>} */
    this.memory = new Map();
    /** @type {Map<string, Promise<MapSet>>} */
    this.inflight = new Map();
    this.queue = [];
    this.workers = [];
    this.idle = [];
    this.jobs = new Map();
    this._jobId = 1;
    this.useWorkers = false;
    this.generatedMs = 0;
    this.generatedCount = 0;
    this._startWorkers(cfg.maxWorkers);
  }

  _startWorkers(max) {
    const hw = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
    const count = Math.max(1, Math.min(max, hw - 1));
    try {
      for (let i = 0; i < count; i++) {
        const w = new Worker(new URL('./texture.worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this._onMessage(w, e.data);
        w.onerror = (e) => this._onWorkerError(w, e);
        this.workers.push(w);
      }
      this.useWorkers = this.workers.length > 0;
    } catch {
      this._disableWorkers();
    }
  }

  _disableWorkers() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
    this.useWorkers = false;
  }

  _onWorkerError(worker, e) {
    // A worker that fails to load (e.g. no module worker support) disables the pool;
    // queued and running jobs are re-run on the main thread.
    e.preventDefault?.();
    const orphaned = [...this.jobs.values()].filter((j) => j.worker === worker);
    this._disableWorkers();
    for (const j of orphaned) this.queue.unshift(j);
    this._pump();
  }

  _onMessage(worker, msg) {
    if (msg.type === 'ready') {
      if (!this.idle.includes(worker)) this.idle.push(worker);
      this._pump();
      return;
    }
    const job = this.jobs.get(msg.jobId);
    if (!job) return;
    this.jobs.delete(msg.jobId);
    this.idle.push(worker);
    if (msg.type === 'done') job.resolve({ size: msg.size, maps: msg.maps, ms: msg.ms });
    else job.reject(new Error(msg.message));
    this._pump();
  }

  _pump() {
    if (this.useWorkers) {
      while (this.queue.length && this.idle.length) {
        const job = this.queue.shift();
        const w = this.idle.pop();
        job.worker = w;
        this.jobs.set(job.jobId, job);
        w.postMessage({ type: 'job', jobId: job.jobId, id: job.id, variant: job.variant, size: job.size, seed: job.seed });
      }
      return;
    }
    if (this._mainBusy || !this.queue.length) return;
    this._mainBusy = true;
    const job = this.queue.shift();
    // Main-thread fallback: generate after yielding a frame so the loading UI updates.
    setTimeout(async () => {
      try {
        const [{ buildMaps }, { GENERATORS }] = await Promise.all([import('./pipeline.js'), import('./materials/index.js')]);
        const gen = GENERATORS[job.id];
        if (!gen) throw new Error(`Unknown material generator "${job.id}"`);
        const t0 = performance.now();
        const res = buildMaps(gen, job.size, job.seed, job.variant);
        job.resolve({ ...res, ms: performance.now() - t0 });
      } catch (err) {
        job.reject(err);
      }
      this._mainBusy = false;
      this._pump();
    }, 0);
  }

  _key(key, size) {
    return `v${this.version}:${key}:${size}`;
  }

  /**
   * Look up a map set in memory / IndexedDB without generating it.
   * @param {string} key
   * @param {number} size
   * @returns {Promise<MapSet|null>}
   */
  async peek(key, size) {
    const k = this._key(key, size);
    const mem = this.memory.get(k);
    if (mem) return mem;
    const stored = await this.cache.get(k);
    if (!stored) return null;
    const set = { size: stored.size, maps: stored.maps, cached: true };
    this.memory.set(k, set);
    return set;
  }

  /**
   * Get the map set for a material key ("id" or "id:variant").
   * @param {string} key
   * @param {number} size
   * @param {boolean} [background] queue behind foreground work
   * @returns {Promise<MapSet>}
   */
  request(key, size, background = false) {
    const k = this._key(key, size);
    const mem = this.memory.get(k);
    if (mem) return Promise.resolve(mem);
    const pending = this.inflight.get(k);
    if (pending) return pending;
    const [id, variant = ''] = key.split(':');
    const p = (async () => {
      const stored = await this.cache.get(k);
      if (stored) {
        const set = { size: stored.size, maps: stored.maps, cached: true };
        this.memory.set(k, set);
        return set;
      }
      const res = await new Promise((resolve, reject) => {
        const job = { jobId: this._jobId++, id, variant, size, seed: seedFor(key), resolve, reject, worker: null, background };
        if (background) this.queue.push(job);
        else {
          // Foreground jobs jump ahead of background upgrades.
          const at = this.queue.findIndex((j) => j.background);
          if (at < 0) this.queue.push(job);
          else this.queue.splice(at, 0, job);
        }
        this._pump();
      });
      this.generatedMs += res.ms ?? 0;
      this.generatedCount++;
      const set = { size: res.size, maps: res.maps, ms: res.ms };
      this.memory.set(k, set);
      this.cache.put(k, { size: set.size, maps: set.maps });
      return set;
    })();
    this.inflight.set(k, p);
    p.finally(() => this.inflight.delete(k));
    return p;
  }

  /**
   * Load many materials, reporting progress on the bus.
   * @param {string[]} keys
   * @param {number} size
   * @param {string} [label]
   */
  async prefetch(keys, size, label = 'Dokular üretiliyor') {
    let done = 0;
    const total = keys.length;
    this.bus.emit('textures:progress', { done, total, label });
    await Promise.all(keys.map((key) => this.request(key, size).then(() => {
      done++;
      this.bus.emit('textures:progress', { done, total, label, key });
    })));
  }

  /** Drop a map set from memory (GPU textures are owned by the library). */
  forget(key, size) {
    this.memory.delete(this._key(key, size));
  }

  async clearPersistentCache() {
    this.memory.clear();
    return this.cache.clear();
  }

  get stats() {
    return {
      workers: this.workers.length,
      queued: this.queue.length,
      running: this.jobs.size,
      memory: this.memory.size,
      cacheHits: this.cache.hits,
      generated: this.generatedCount,
      generatedMs: this.generatedMs,
    };
  }

  dispose() {
    this._disableWorkers();
    this.memory.clear();
  }
}
