/**
 * @file noise.js — seeded, tileable noise library (worker-safe, no DOM, no three.js).
 *
 * All texture-space functions take normalised coordinates u, v ∈ [0, 1) and
 * integer frequencies, so every result tiles seamlessly:
 *   - perlin / fbm / ridged / turbulence: gradient noise on a wrapped lattice
 *   - worley: cellular noise with wrapped cells, F1/F2, cell id and the exact
 *     distance to the cell border (for mortar lines, leading, cracks)
 *   - torus: 4D simplex sampled on a torus (Clifford torus embedding), the
 *     classic seamless technique for fields that must not show lattice axes
 *   - warp: domain warping helper
 */

const TAU = Math.PI * 2;

/** 32-bit integer hash of two ints + seed (lowbias32 variant). */
export function hash2i(x, y, seed) {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hash → float in [0, 1). */
export function rand2(x, y, seed) {
  return hash2i(x, y, seed) / 4294967296;
}

const mod = (a, n) => ((a % n) + n) % n;
/** Fast integer wrap into [0, n) for values usually just outside the range. */
function wrapi(a, n) {
  if (a < 0) {
    a += n;
    return a < 0 ? mod(a, n) : a;
  }
  if (a >= n) {
    a -= n;
    return a >= n ? mod(a, n) : a;
  }
  return a;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// 16 unit gradients (evenly spaced) for 2D gradient noise.
const GX = new Float32Array(16);
const GY = new Float32Array(16);
for (let i = 0; i < 16; i++) {
  GX[i] = Math.cos((i / 16) * TAU);
  GY[i] = Math.sin((i / 16) * TAU);
}

// 4D simplex constants and gradient table (Gustavson).
const F4 = (Math.sqrt(5) - 1) / 4;
const G4 = (5 - Math.sqrt(5)) / 20;
const GRAD4 = new Float32Array([
  0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
  1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1, -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
  1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1, -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
  1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0,
]);

/**
 * @typedef {Object} WorleyResult
 * @property {number} f1    distance to the nearest feature (uv units)
 * @property {number} f2    distance to the second nearest feature
 * @property {number} edge  distance to the nearest cell border (uv units)
 * @property {number} id    integer hash of the nearest cell (stable across tiles)
 * @property {number} cx    nearest feature position (uv, unwrapped)
 * @property {number} cy
 */

export class Noise {
  /** @param {number} seed */
  constructor(seed = 1) {
    this.seed = seed | 0;
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = hash2i(i, 91, this.seed) % (i + 1);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    /** @type {WorleyResult} */
    this.cell = { f1: 0, f2: 0, edge: 0, id: 0, cx: 0, cy: 0 };
  }

  /** Derive an independent noise instance. @param {number} salt */
  fork(salt) {
    return new Noise(hash2i(this.seed, salt, 0x9e3779b9) | 0);
  }

  // ------------------------------------------------------------ gradient

  /**
   * Periodic 2D gradient (Perlin) noise. Tiles with period (px, py).
   * @returns {number} roughly in [-1, 1]
   */
  perlin(x, y, px, py) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    let x0 = xi % px;
    if (x0 < 0) x0 += px;
    let y0 = yi % py;
    if (y0 < 0) y0 += py;
    const x1 = x0 + 1 === px ? 0 : x0 + 1;
    const y1 = y0 + 1 === py ? 0 : y0 + 1;
    // Lattice hashing through the seeded permutation table (wrapped coords → periodic).
    const P = this.perm;
    const a0 = P[x0 & 255];
    const a1 = P[x1 & 255];
    const yy0 = y0 & 255;
    const yy1 = y1 & 255;
    const g00 = P[a0 + yy0] & 15;
    const g10 = P[a1 + yy0] & 15;
    const g01 = P[a0 + yy1] & 15;
    const g11 = P[a1 + yy1] & 15;
    const n00 = GX[g00] * fx + GY[g00] * fy;
    const n10 = GX[g10] * (fx - 1) + GY[g10] * fy;
    const n01 = GX[g01] * fx + GY[g01] * (fy - 1);
    const n11 = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = n00 + (n10 - n00) * u;
    const b = n01 + (n11 - n01) * u;
    return (a + (b - a) * v) * 1.4142;
  }

  /**
   * Fractal Brownian motion over periodic Perlin noise.
   * @param {number} u 0..1
   * @param {number} v 0..1
   * @param {number} freq integer base frequency (repeats per tile)
   * @param {number} [octaves]
   * @param {number} [gain]
   * @param {number} [lacunarity] integer
   * @returns {number} roughly in [-1, 1]
   */
  fbm(u, v, freq, octaves = 5, gain = 0.5, lacunarity = 2) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = freq;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.perlin(u * f + o * 17.31, v * f + o * 9.17, f, f);
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }

  /** fBm remapped to [0, 1]. */
  fbm01(u, v, freq, octaves, gain, lacunarity) {
    return Math.min(1, Math.max(0, this.fbm(u, v, freq, octaves, gain, lacunarity) * 0.5 + 0.5));
  }

  /**
   * Ridged multifractal (sharp crests, good for rock, cracks, veins).
   * @returns {number} 0..1
   */
  ridged(u, v, freq, octaves = 5, gain = 0.5, lacunarity = 2) {
    let sum = 0;
    let amp = 0.5;
    let weight = 1;
    let norm = 0;
    let f = freq;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.perlin(u * f + o * 31.7, v * f + o * 11.3, f, f));
      n *= n;
      n *= weight;
      weight = Math.min(1, Math.max(0, n * 2));
      sum += n * amp;
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }

  /** Turbulence (sum of |noise|). @returns {number} 0..1 */
  turbulence(u, v, freq, octaves = 5, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = freq;
    for (let o = 0; o < octaves; o++) {
      sum += amp * Math.abs(this.perlin(u * f + o * 5.3, v * f + o * 3.7, f, f));
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return Math.min(1, sum / norm);
  }

  /** Smooth periodic value noise (cheap blobs). @returns {number} 0..1 */
  value(u, v, freq) {
    const x = u * freq;
    const y = v * freq;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = fade(x - xi);
    const fy = fade(y - yi);
    const x0 = mod(xi, freq), x1 = mod(xi + 1, freq);
    const y0 = mod(yi, freq), y1 = mod(yi + 1, freq);
    const s = this.seed;
    const a = rand2(x0, y0, s), b = rand2(x1, y0, s), c = rand2(x0, y1, s), d = rand2(x1, y1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /**
   * Domain warp: returns offsets to add to (u, v).
   * @param {number[]} out length-2 array receiving [du, dv]
   */
  warp(u, v, freq, amount, octaves = 4, out = [0, 0]) {
    out[0] = this.fbm(u + 0.131, v + 0.717, freq, octaves) * amount;
    out[1] = this.fbm(u + 0.593, v + 0.271, freq, octaves) * amount;
    return out;
  }

  // ------------------------------------------------------------- cellular

  /**
   * Tileable Worley / Voronoi noise with optional brick-bond row offset.
   * Distances are measured in uv units (isotropic), so non-square cell
   * grids produce elongated cells (e.g. masonry blocks).
   * @param {number} u
   * @param {number} v
   * @param {number} cx cells across
   * @param {number} cy cells down (even when rowOffset ≠ 0)
   * @param {number} [jitter] 0 = regular grid, 1 = fully random
   * @param {number} [rowOffset] horizontal shift of odd rows in cells (0.5 = running bond)
   * @param {boolean} [withEdge] also compute the exact border distance
   * @returns {WorleyResult} shared result object (copy what you need)
   */
  worley(u, v, cx, cy, jitter = 1, rowOffset = 0, withEdge = true) {
    const r = this.cell;
    const T = this._cellTable(cx, cy, jitter);
    const JX = T.jx;
    const JY = T.jy;
    const ID = T.id;
    const sx = 1 / cx;
    const sy = 1 / cy;
    const gx = u * cx;
    const gy = v * cy;
    const iy0 = Math.floor(gy);
    // Search window in cells: wide cells need more rows, tall cells more columns.
    const spanX = T.spanX + (rowOffset ? 1 : 0);
    const spanY = T.spanY;
    let f1 = 1e9;
    let f2 = 1e9;
    let bestX = 0;
    let bestY = 0;
    let bestId = 0;
    for (let j = -spanY; j <= spanY; j++) {
      const row = iy0 + j;
      const wr = wrapi(row, cy);
      const off = (wr & 1) * rowOffset;
      const ix0 = Math.floor(gx - off);
      const base = wr * cx;
      const py0 = row * sy;
      for (let i = -spanX; i <= spanX; i++) {
        const col = ix0 + i;
        const k = base + wrapi(col, cx);
        const px = (col + off + JX[k]) * sx;
        const py = py0 + JY[k] * sy;
        const dx = px - u;
        const dy = py - v;
        const d = dx * dx + dy * dy;
        if (d < f2) {
          if (d < f1) {
            f2 = f1;
            f1 = d;
            bestX = px;
            bestY = py;
            bestId = ID[k];
          } else f2 = d;
        }
      }
    }
    r.f1 = Math.sqrt(f1);
    r.f2 = Math.sqrt(f2);
    r.id = bestId;
    r.cx = bestX;
    r.cy = bestY;

    if (withEdge) {
      // Exact border distance (Quilez): distance to the bisector with every
      // neighbour; neighbours farther than 2·(f1 + best edge) cannot matter.
      const mx = bestX - u;
      const my = bestY - v;
      const f1d = r.f1;
      let md = 1e9;
      for (let j = -spanY - 1; j <= spanY + 1; j++) {
        const row = iy0 + j;
        const wr = wrapi(row, cy);
        const off = (wr & 1) * rowOffset;
        const ix0 = Math.floor(gx - off);
        const base = wr * cx;
        const py0 = row * sy;
        for (let i = -spanX - 1; i <= spanX + 1; i++) {
          const col = ix0 + i;
          const k = base + wrapi(col, cx);
          const rx = (col + off + JX[k]) * sx - u;
          const ry = py0 + JY[k] * sy - v;
          const ex = rx - mx;
          const ey = ry - my;
          const el = ex * ex + ey * ey;
          if (el > 1e-12) {
            const len = Math.sqrt(el);
            if (len * 0.5 - f1d > md) continue;
            const d = ((0.5 * (mx + rx)) * ex + (0.5 * (my + ry)) * ey) / len;
            if (d < md) md = d;
          }
        }
      }
      r.edge = md;
    }
    return r;
  }

  /** Cached jittered feature points for a cell grid. */
  _cellTable(cx, cy, jitter) {
    const key = `${cx},${cy},${jitter}`;
    let t = this._tables?.get(key);
    if (t) return t;
    if (!this._tables) this._tables = new Map();
    const n = cx * cy;
    t = { jx: new Float32Array(n), jy: new Float32Array(n), id: new Uint32Array(n), spanX: Math.max(1, Math.ceil(cx / cy)), spanY: Math.max(1, Math.ceil(cy / cx)) };
    for (let wr = 0; wr < cy; wr++) {
      for (let wc = 0; wc < cx; wc++) {
        const h = hash2i(wc, wr, this.seed);
        const k = wr * cx + wc;
        t.jx[k] = ((h & 0xffff) / 65535 - 0.5) * jitter + 0.5;
        t.jy[k] = ((h >>> 16) / 65535 - 0.5) * jitter + 0.5;
        t.id[k] = h;
      }
    }
    this._tables.set(key, t);
    return t;
  }

  // ------------------------------------------------------------- simplex

  /** 4D simplex noise (Gustavson). @returns {number} roughly [-1, 1] */
  simplex4(x, y, z, w) {
    const perm = this.perm;
    const s = (x + y + z + w) * F4;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const l = Math.floor(w + s);
    const t = (i + j + k + l) * G4;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);
    const w0 = w - (l - t);

    let rankx = 0, ranky = 0, rankz = 0, rankw = 0;
    if (x0 > y0) rankx++; else ranky++;
    if (x0 > z0) rankx++; else rankz++;
    if (x0 > w0) rankx++; else rankw++;
    if (y0 > z0) ranky++; else rankz++;
    if (y0 > w0) ranky++; else rankw++;
    if (z0 > w0) rankz++; else rankw++;

    const i1 = rankx >= 3 ? 1 : 0, j1 = ranky >= 3 ? 1 : 0, k1 = rankz >= 3 ? 1 : 0, l1 = rankw >= 3 ? 1 : 0;
    const i2 = rankx >= 2 ? 1 : 0, j2 = ranky >= 2 ? 1 : 0, k2 = rankz >= 2 ? 1 : 0, l2 = rankw >= 2 ? 1 : 0;
    const i3 = rankx >= 1 ? 1 : 0, j3 = ranky >= 1 ? 1 : 0, k3 = rankz >= 1 ? 1 : 0, l3 = rankw >= 1 ? 1 : 0;

    const x1 = x0 - i1 + G4, y1 = y0 - j1 + G4, z1 = z0 - k1 + G4, w1 = w0 - l1 + G4;
    const x2 = x0 - i2 + 2 * G4, y2 = y0 - j2 + 2 * G4, z2 = z0 - k2 + 2 * G4, w2 = w0 - l2 + 2 * G4;
    const x3 = x0 - i3 + 3 * G4, y3 = y0 - j3 + 3 * G4, z3 = z0 - k3 + 3 * G4, w3 = w0 - l3 + 3 * G4;
    const x4 = x0 - 1 + 4 * G4, y4 = y0 - 1 + 4 * G4, z4 = z0 - 1 + 4 * G4, w4 = w0 - 1 + 4 * G4;

    const ii = i & 255, jj = j & 255, kk = k & 255, ll = l & 255;
    const contrib = (tx, ty, tz, tw, gi) => {
      let tt = 0.6 - tx * tx - ty * ty - tz * tz - tw * tw;
      if (tt < 0) return 0;
      tt *= tt;
      const g = (gi % 32) * 4;
      return tt * tt * (GRAD4[g] * tx + GRAD4[g + 1] * ty + GRAD4[g + 2] * tz + GRAD4[g + 3] * tw);
    };
    const n0 = contrib(x0, y0, z0, w0, perm[ii + perm[jj + perm[kk + perm[ll]]]]);
    const n1 = contrib(x1, y1, z1, w1, perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]]);
    const n2 = contrib(x2, y2, z2, w2, perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]]);
    const n3 = contrib(x3, y3, z3, w3, perm[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]]);
    const n4 = contrib(x4, y4, z4, w4, perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]]);
    return 27 * (n0 + n1 + n2 + n3 + n4);
  }

  /**
   * Seamless fBm on a 4D torus: (u, v) map to two circles, so the field
   * wraps in both directions without any lattice periodicity.
   * @param {number} freq approximate features per tile
   * @returns {number} roughly [-1, 1]
   */
  torus(u, v, freq, octaves = 4, gain = 0.5) {
    const a = u * TAU;
    const b = v * TAU;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let r = freq / TAU;
    for (let o = 0; o < octaves; o++) {
      const off = o * 19.1;
      sum += amp * this.simplex4(ca * r + off, sa * r + off, cb * r - off, sb * r + off * 0.5);
      norm += amp;
      amp *= gain;
      r *= 2;
    }
    return sum / norm;
  }
}

// ------------------------------------------------------------------ utilities

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
