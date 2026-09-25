/**
 * @file pipeline.js — worker-safe texture build pipeline.
 *
 * A generator paints float fields into a TexContext (albedo in sRGB 0..1,
 * height 0..1, roughness, optional metalness / emissive / alpha / explicit
 * AO). The pipeline then derives:
 *   - normal map from height (Sobel, tile-wrapped, resolution independent)
 *   - ambient occlusion from height (multi-scale cavity estimate) × explicit AO
 * and packs everything into RGBA8 buffers:
 *   albedo (RGB + alpha) · normal (RGB) · ORM (R = AO, G = rough, B = metal)
 *   · emissive (RGB, optional)
 * ORM matches three.js channel conventions for aoMap / roughnessMap / metalnessMap.
 */
import { Noise, clamp01 } from './noise.js';

/** Helpers for colour handling in generators. */
export function hex(c) {
  const n = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Linear interpolation between two rgb arrays into `out`. */
export function mixRGB(a, b, t, out = [0, 0, 0]) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

/**
 * Sample a multi-stop gradient. stops: [[t, [r,g,b]], ...] sorted by t.
 */
export function gradient(stops, t, out = [0, 0, 0]) {
  if (t <= stops[0][0]) return mixRGB(stops[0][1], stops[0][1], 0, out);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return mixRGB(c0, c1, (t - t0) / (t1 - t0), out);
    }
  }
  const last = stops[stops.length - 1][1];
  return mixRGB(last, last, 0, out);
}

/** Create a 2D canvas usable in workers (OffscreenCanvas) or on the main thread. */
export function createCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

export class TexContext {
  /**
   * @param {number} size power of two
   * @param {number} seed
   * @param {string} [variant]
   */
  constructor(size, seed, variant = '') {
    this.size = size;
    this.n = size * size;
    this.seed = seed;
    this.variant = variant;
    this.N = new Noise(seed);
    this.albedo = new Float32Array(this.n * 3);
    this.height = new Float32Array(this.n);
    this.rough = new Float32Array(this.n).fill(0.8);
    /** @type {Float32Array|null} */ this.metal = null;
    /** @type {Float32Array|null} */ this.ao = null;
    /** @type {Float32Array|null} */ this.emissive = null;
    /** @type {Float32Array|null} */ this.alpha = null;
  }

  /** Allocate a scratch float field. */
  field(fill = 0) {
    return new Float32Array(this.n).fill(fill);
  }

  useMetal() {
    if (!this.metal) this.metal = new Float32Array(this.n);
    return this.metal;
  }

  useAO() {
    if (!this.ao) this.ao = new Float32Array(this.n).fill(1);
    return this.ao;
  }

  useEmissive() {
    if (!this.emissive) this.emissive = new Float32Array(this.n * 3);
    return this.emissive;
  }

  useAlpha() {
    if (!this.alpha) this.alpha = new Float32Array(this.n).fill(1);
    return this.alpha;
  }

  /**
   * Iterate all pixels. Pixel centres map to u, v ∈ (0, 1).
   * @param {(i:number, u:number, v:number, x:number, y:number) => void} fn
   */
  each(fn) {
    const s = this.size;
    const inv = 1 / s;
    let i = 0;
    for (let y = 0; y < s; y++) {
      const v = (y + 0.5) * inv;
      for (let x = 0; x < s; x++, i++) fn(i, (x + 0.5) * inv, v, x, y);
    }
  }

  /** @param {number} i @param {number[]} rgb */
  setAlbedo(i, rgb) {
    const o = i * 3;
    this.albedo[o] = rgb[0];
    this.albedo[o + 1] = rgb[1];
    this.albedo[o + 2] = rgb[2];
  }

  /** @param {number} i @param {number[]} rgb @param {number} [k] */
  setEmissive(i, rgb, k = 1) {
    const e = this.useEmissive();
    const o = i * 3;
    e[o] = rgb[0] * k;
    e[o + 1] = rgb[1] * k;
    e[o + 2] = rgb[2] * k;
  }

  /** Separable wrapped box blur of a field. @returns {Float32Array} */
  blur(src, radius) {
    return boxBlur(src, this.size, Math.max(1, Math.round(radius)));
  }

  /**
   * Rasterise shapes with Canvas 2D and read back a mask (0..1 from alpha).
   * Draw with the usual canvas orientation (y down = towards v = 0).
   * @param {(g:CanvasRenderingContext2D, size:number) => void} draw
   * @returns {Float32Array|null} null when no canvas is available
   */
  canvasMask(draw) {
    const c = createCanvas(this.size, this.size);
    if (!c) return null;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    draw(g, this.size);
    const data = g.getImageData(0, 0, this.size, this.size).data;
    const out = new Float32Array(this.n);
    // Canvas row 0 is the top of the image (v = 1); field row 0 is v = 0.
    const s = this.size;
    for (let y = 0; y < s; y++) {
      const src = (s - 1 - y) * s;
      for (let x = 0; x < s; x++) out[y * s + x] = data[(src + x) * 4 + 3] / 255;
    }
    return out;
  }
}

/** Separable wrapped box blur (sliding window, O(n)). */
export function boxBlur(src, size, r) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + ((k % size) + size) % size];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = acc * inv;
      const add = (x + r + 1) % size;
      const sub = ((x - r) % size + size) % size;
      acc += src[row + add] - src[row + sub];
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[(((k % size) + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = acc * inv;
      const add = (y + r + 1) % size;
      const sub = ((y - r) % size + size) % size;
      acc += tmp[add * size + x] - tmp[sub * size + x];
    }
  }
  return out;
}

/**
 * Tangent-space normal map from height with a wrapped Sobel filter.
 * @param {Float32Array} h heights 0..1 over one tile
 * @param {number} size
 * @param {number} strength relief strength (resolution independent)
 * @returns {Uint8Array} RGBA
 */
export function normalFromHeight(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  const s = strength * (size / 256);
  const w = (x) => (x + size) % size;
  for (let y = 0; y < size; y++) {
    const ym = w(y - 1) * size, y0 = y * size, yp = w(y + 1) * size;
    for (let x = 0; x < size; x++) {
      const xm = w(x - 1), xp = w(x + 1);
      const dx = (h[ym + xp] + 2 * h[y0 + xp] + h[yp + xp]) - (h[ym + xm] + 2 * h[y0 + xm] + h[yp + xm]);
      const dy = (h[yp + xm] + 2 * h[yp + x] + h[yp + xp]) - (h[ym + xm] + 2 * h[ym + x] + h[ym + xp]);
      let nx = (-dx * s) / 8;
      let ny = (-dy * s) / 8;
      let nz = 1;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= l;
      ny *= l;
      nz *= l;
      const o = (y0 + x) * 4;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Ambient occlusion estimated from height: how far each texel sits below
 * its neighbourhood average at two scales.
 * @returns {Float32Array} 0..1
 */
export function aoFromHeight(h, size, strength, radius = 1) {
  const r1 = Math.max(1, Math.round((size / 128) * radius));
  const r2 = Math.max(2, Math.round((size / 32) * radius));
  const b1 = boxBlur(h, size, r1);
  const b2 = boxBlur(h, size, r2);
  const out = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) {
    const occ = Math.max(0, b1[i] - h[i]) * 2.2 + Math.max(0, b2[i] - h[i]) * 1.2;
    out[i] = clamp01(1 - occ * strength);
  }
  return out;
}

const to8 = (x) => (x <= 0 ? 0 : x >= 1 ? 255 : Math.round(x * 255));

/**
 * Run a generator and produce packed RGBA8 maps.
 * @param {{generate:(ctx:TexContext)=>void, normalStrength?:number, aoStrength?:number, aoRadius?:number}} gen
 * @param {number} size
 * @param {number} seed
 * @param {string} [variant]
 * @returns {{size:number, maps:Record<string, Uint8Array>}}
 */
export function buildMaps(gen, size, seed, variant = '') {
  const ctx = new TexContext(size, seed, variant);
  gen.generate(ctx);
  const n = ctx.n;

  const albedo = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    albedo[i * 4] = to8(ctx.albedo[i * 3]);
    albedo[i * 4 + 1] = to8(ctx.albedo[i * 3 + 1]);
    albedo[i * 4 + 2] = to8(ctx.albedo[i * 3 + 2]);
    albedo[i * 4 + 3] = ctx.alpha ? to8(ctx.alpha[i]) : 255;
  }

  const normal = normalFromHeight(ctx.height, size, gen.normalStrength ?? 4);
  const aoH = aoFromHeight(ctx.height, size, gen.aoStrength ?? 3, gen.aoRadius ?? 1);
  const orm = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const ao = aoH[i] * (ctx.ao ? ctx.ao[i] : 1);
    orm[i * 4] = to8(ao);
    orm[i * 4 + 1] = to8(ctx.rough[i]);
    orm[i * 4 + 2] = ctx.metal ? to8(ctx.metal[i]) : 0;
    orm[i * 4 + 3] = 255;
  }

  /** @type {Record<string, Uint8Array>} */
  const maps = { albedo, normal, orm };
  if (ctx.emissive) {
    const em = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      em[i * 4] = to8(ctx.emissive[i * 3]);
      em[i * 4 + 1] = to8(ctx.emissive[i * 3 + 1]);
      em[i * 4 + 2] = to8(ctx.emissive[i * 3 + 2]);
      em[i * 4 + 3] = 255;
    }
    maps.emissive = em;
  }
  return { size, maps };
}
