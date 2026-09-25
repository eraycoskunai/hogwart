/**
 * @file RegionManager — owns the active world region (Hogwarts grounds, the
 * engine test hall, later interiors). Loading a region fetches its
 * materials, builds it and disposes the previous one so GPU memory, physics
 * colliders, lights, flames and grading zones never leak between regions.
 *
 * Events: region:loading {id}, region:loaded {id, ms}
 */
import { TEST_ROOM } from '../data/testRoom.js';
import { GROUNDS } from '../data/grounds.js';
import { TestRoom } from './TestRoom.js';
import { HogwartsGrounds } from './grounds/HogwartsGrounds.js';
import { CHARACTER_MATERIAL_KEYS } from '../procgen/characters/Character.js';

/** Registry: id → how to list its materials and build it. */
const REGIONS = Object.freeze({
  [GROUNDS.id]: {
    name: GROUNDS.name,
    keys: () => HogwartsGrounds.materialKeys(),
    create: async (ctx, progress) => {
      const r = new HogwartsGrounds(ctx);
      await r.build(progress);
      return r;
    },
  },
  [TEST_ROOM.id]: {
    name: TEST_ROOM.name,
    keys: () => TestRoom.materialKeys(TEST_ROOM),
    create: async (ctx) => new TestRoom(ctx, TEST_ROOM).build(),
  },
});

/** Share of the progress bar spent on textures (the rest is building). */
const TEXTURE_SHARE = 0.6;

export class RegionManager {
  /**
   * @param {object} ctx region build context (scene, physics, triggers, bus, preset, library,
   *        lights, flames, grading, sky, renderer)
   */
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {any} */
    this.current = null;
    this.loading = false;
  }

  /** Default region at boot. */
  static get defaultId() {
    return GROUNDS.id;
  }

  /** @returns {{id:string, name:string}[]} */
  static list() {
    return Object.entries(REGIONS).map(([id, r]) => ({ id, name: r.name }));
  }

  /** @param {string} id */
  static has(id) {
    return id in REGIONS;
  }

  /**
   * Unload the current region and build `id`.
   * @param {string} id
   * @param {(label:string, t:number) => void} [progress] 0…1
   * @returns {Promise<any>} the new region
   */
  async load(id, progress = () => {}) {
    const def = REGIONS[id];
    if (!def) throw new Error(`Bilinmeyen bölge: ${id}`);
    if (this.loading) throw new Error('Bölge zaten yükleniyor');
    this.loading = true;
    const ctx = this.ctx;
    const t0 = performance.now();
    ctx.bus.emit('region:loading', { id });
    try {
      this.unload();
      const off = ctx.bus.on('textures:progress', ({ done, total }) => {
        progress(`Dokular üretiliyor… ${done} / ${total}`, TEXTURE_SHARE * (total ? done / total : 1));
      });
      const keys = [...new Set([...def.keys(), ...CHARACTER_MATERIAL_KEYS])];
      try {
        await ctx.library.load(keys, def.name);
      } finally {
        off();
      }
      this.current = await def.create(ctx, (label, t) => progress(label, TEXTURE_SHARE + (1 - TEXTURE_SHARE) * t));
      ctx.library.purgeUnused(keys);
      progress('Hazır', 1);
      ctx.bus.emit('region:loaded', { id, ms: performance.now() - t0 });
      return this.current;
    } finally {
      this.loading = false;
    }
  }

  /** Dispose the active region and everything it registered globally. */
  unload() {
    const r = this.current;
    if (!r) return;
    this.current = null;
    r.dispose();
    this.ctx.grading?.clearZones();
    this.ctx.flames?.clear();
  }
}
