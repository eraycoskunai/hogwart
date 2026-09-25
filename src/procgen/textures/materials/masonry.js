/**
 * @file masonry.js — tileable coursed-masonry layout shared by stone walls
 * and flagstone floors: courses (rows) of varying height, each split into
 * blocks of varying width with a random horizontal shift so joints never
 * line up. Selected blocks are subdivided with a small Voronoi into
 * irregular infill stones. Everything is normalised to the unit tile, so
 * the pattern repeats seamlessly.
 */
import { hash2i } from '../noise.js';

/**
 * @typedef {Object} MasonryLayout
 * @property {Float32Array} rowEdges  rows+1 ascending edges in [0,1]
 * @property {Float32Array[]} blockEdges per row: ascending edges in [0,1]
 * @property {Float32Array} rowShift per row horizontal shift
 * @property {number} seed
 * @property {number} splitChance
 */

/**
 * @param {number} seed
 * @param {{rows:number, rowVariance:number, minWidth:number, maxWidth:number, splitChance?:number}} o
 * @returns {MasonryLayout}
 */
export function createMasonry(seed, o) {
  const rnd = (a, b) => hash2i(a, b, seed) / 4294967296;
  const heights = [];
  for (let r = 0; r < o.rows; r++) heights.push(1 + (rnd(r, 1) - 0.5) * 2 * o.rowVariance);
  const total = heights.reduce((a, b) => a + b, 0);
  const rowEdges = new Float32Array(o.rows + 1);
  for (let r = 0, acc = 0; r < o.rows; r++) {
    rowEdges[r] = acc / total;
    acc += heights[r];
  }
  rowEdges[o.rows] = 1;
  const blockEdges = [];
  const rowShift = new Float32Array(o.rows);
  for (let r = 0; r < o.rows; r++) {
    const widths = [];
    let sum = 0;
    let k = 0;
    while (sum < 1 - o.minWidth * 0.5) {
      const w = o.minWidth + rnd(r * 97 + k, 7) * (o.maxWidth - o.minWidth);
      widths.push(w);
      sum += w;
      k++;
    }
    const edges = new Float32Array(widths.length + 1);
    for (let i = 0, acc = 0; i < widths.length; i++) {
      edges[i] = acc / sum;
      acc += widths[i];
    }
    edges[widths.length] = 1;
    blockEdges.push(edges);
    rowShift[r] = rnd(r, 13);
  }
  return { rowEdges, blockEdges, rowShift, seed, splitChance: o.splitChance ?? 0 };
}

/**
 * @typedef {Object} MasonrySample
 * @property {number} edge  distance to the nearest joint (uv units)
 * @property {number} id    stable hash of the stone
 * @property {number} row
 * @property {number} du    position inside the stone, 0..1 across
 * @property {number} dv    position inside the stone, 0..1 up
 * @property {number} w     stone width (uv)
 * @property {number} h     stone height (uv)
 */

/**
 * @param {MasonryLayout} L
 * @param {number} u 0..1 (may be slightly outside; wrapped)
 * @param {number} v 0..1
 * @param {MasonrySample} out
 * @returns {MasonrySample}
 */
export function sampleMasonry(L, u, v, out) {
  v -= Math.floor(v);
  const R = L.rowEdges;
  let r = 0;
  while (r < R.length - 2 && v >= R[r + 1]) r++;
  const v0 = R[r];
  const v1 = R[r + 1];
  let lu = u + L.rowShift[r];
  lu -= Math.floor(lu);
  const E = L.blockEdges[r];
  let b = 0;
  while (b < E.length - 2 && lu >= E[b + 1]) b++;
  const u0 = E[b];
  const u1 = E[b + 1];
  let edge = Math.min(lu - u0, u1 - lu, v - v0, v1 - v);
  let id = hash2i(r * 131 + b, 17, L.seed);

  // Some blocks are rubble infill: split them into irregular Voronoi stones.
  if ((id & 1023) / 1023 < L.splitChance) {
    const w = u1 - u0;
    const h = v1 - v0;
    let f1 = 1e9;
    let f2 = 1e9;
    let best = 0;
    let bx = 0;
    let by = 0;
    const count = 3 + (id >>> 10) % 2;
    for (let k = 0; k < count; k++) {
      const hk = hash2i(id, k, L.seed);
      const px = u0 + (0.15 + ((hk & 1023) / 1023) * 0.7) * w;
      const py = v0 + (0.15 + (((hk >>> 10) & 1023) / 1023) * 0.7) * h;
      const d = Math.hypot(lu - px, v - py);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        best = k;
        bx = px;
        by = py;
      } else if (d < f2) f2 = d;
    }
    edge = Math.min(edge, (f2 - f1) * 0.5);
    id = hash2i(id, best + 1, L.seed);
    out.du = (lu - bx) / w + 0.5;
    out.dv = (v - by) / h + 0.5;
  } else {
    out.du = (lu - u0) / (u1 - u0);
    out.dv = (v - v0) / (v1 - v0);
  }
  out.edge = edge;
  out.id = id >>> 0;
  out.row = r;
  out.w = u1 - u0;
  out.h = v1 - v0;
  return out;
}
