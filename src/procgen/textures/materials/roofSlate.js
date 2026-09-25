/**
 * @file Roof slates: staggered rows of overlapping, slightly irregular
 * slate tiles (blue-grey with per-slate tone), dark shadow lines under
 * each course, chipped corners, lichen and moss creeping from the joints.
 * V runs up the roof slope (courses stack upward).
 */
import { smoothstep, clamp01, hash2i } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = {
  a: hex('#3e434c'),
  b: hex('#4c4f57'),
  c: hex('#343a44'),
  d: hex('#55524f'),
  joint: hex('#15161a'),
  lichen: hex('#9a9460'),
  moss: hex('#4a5a2a'),
};
const TONES = [C.a, C.b, C.c, C.d];
const ROWS = 12;

export default {
  id: 'roofSlate',
  label: 'Arduvaz çatı',
  category: 'Taş',
  normalStrength: 6,
  aoStrength: 3,
  generate(ctx) {
    const { N } = ctx;
    const s = ctx.seed;
    const col = [0, 0, 0];
    // Periodic slate boundaries per row (cumulative widths normalised to 1).
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const count = 7 + (hash2i(r, 3, s) % 3);
      const w = [];
      let sum = 0;
      for (let k = 0; k < count; k++) {
        const x = 0.75 + ((hash2i(r, k, s) >>> 8) & 255) / 255 * 0.5;
        w.push(x);
        sum += x;
      }
      const edges = [0];
      for (const x of w) edges.push(edges[edges.length - 1] + x / sum);
      rows.push({ edges, shift: ((hash2i(r, 7, s) & 1023) / 1023) });
    }
    ctx.each((i, u, v) => {
      const rv = v * ROWS;
      const r = Math.floor(rv);
      const fv = rv - r; // 0 = bottom edge of the course, 1 = top (under the next course)
      const row = rows[r % ROWS];
      let uu = u + row.shift;
      uu -= Math.floor(uu);
      let k = 0;
      while (k < row.edges.length - 2 && uu > row.edges[k + 1]) k++;
      const e0 = row.edges[k];
      const e1 = row.edges[k + 1];
      const fu = (uu - e0) / (e1 - e0);
      const id = hash2i(r, k, s);
      const edgeX = Math.min(fu, 1 - fu) * (e1 - e0) * 7 * 2;
      const side = smoothstep(0.0, 0.05, edgeX);
      // Slates are thick at the bottom edge and slide under the next course.
      const chip = N.fbm01(u * 3, v * 3, 48, 3);
      const bottom = smoothstep(0.0, 0.08 + chip * 0.05, fv);
      const thick = (1 - fv) * 0.7 + 0.3;
      const h = side * bottom * thick + N.fbm(u, v, 96, 2) * 0.03;
      ctx.height[i] = clamp01(h * 0.8 + 0.1);
      const tone = TONES[id & 3];
      mixRGB(tone, TONES[(id >>> 2) & 3], ((id >>> 4) & 255) / 255 * 0.5, col);
      const lum = 0.82 + ((id >>> 12) & 255) / 255 * 0.3 + N.fbm(u, v, 64, 3) * 0.08;
      col[0] *= lum; col[1] *= lum; col[2] *= lum;
      const lichen = smoothstep(0.66, 0.8, N.fbm01(u + 0.4, v, 24, 4)) * 0.7;
      mixRGB(col, C.lichen, lichen * (0.4 + chip * 0.6), col);
      const moss = smoothstep(0.62, 0.8, N.fbm01(u, v + 0.2, 8, 4)) * (1 - side * bottom * 0.7);
      mixRGB(col, C.moss, moss * 0.8, col);
      mixRGB(C.joint, col, side * bottom * 0.92 + 0.08, col);
      ctx.setAlbedo(i, col);
      ctx.rough[i] = clamp01(0.62 + (1 - side * bottom) * 0.3 + lichen * 0.1);
    });
  },
};
