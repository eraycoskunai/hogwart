/**
 * @file Cobblestone paving: rounded, traffic-polished setts in packed earth
 * with grit, small pebbles and the odd tuft of grass in the gaps.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = {
  stoneA: hex('#7d7870'),
  stoneB: hex('#948a7c'),
  stoneC: hex('#6a6e70'),
  stoneD: hex('#8b7a66'),
  earth: hex('#4a3d2f'),
  grit: hex('#6b5d4a'),
  grass: hex('#4f5e2c'),
};
const STONES = [C.stoneA, C.stoneB, C.stoneC, C.stoneD];

export default {
  id: 'cobblestone',
  label: 'Kaldırım taşı',
  category: 'Taş',
  normalStrength: 7,
  aoStrength: 3.5,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(4);
    const w = [0, 0];
    const col = [0, 0, 0];
    const tmp = [0, 0, 0];
    ctx.each((i, u, v) => {
      N.warp(u, v, 6, 0.006, 3, w);
      const c = N.worley(u + w[0], v + w[1], 8, 8, 0.85, 0.5);
      const id = c.id;
      const r1 = (id & 255) / 255;
      const r2 = ((id >>> 8) & 255) / 255;
      const edge = c.edge; // the shared result object is reused by the pebble query below
      const gap = 0.0025 + r2 * 0.002;
      const inside = smoothstep(gap, gap + 0.018, edge);
      const dome = Math.pow(inside, 0.55);
      const grain = d.fbm(u, v, 48, 3);
      const pebble = N.worley(u * 1, v * 1, 64, 64, 1, 0, false);
      const pebbleH = (1 - smoothstep(0.002, 0.006, pebble.f1)) * (1 - inside);

      ctx.height[i] = clamp01(dome * (0.75 + r1 * 0.15) + grain * 0.04 * inside + pebbleH * 0.2 + (1 - inside) * d.fbm01(u, v, 64, 2) * 0.08);

      const s = STONES[id & 3];
      mixRGB(s, STONES[(id >>> 2) & 3], r2 * 0.4, col);
      const lum = 0.85 + grain * 0.15 + dome * 0.12;
      col[0] *= lum; col[1] *= lum; col[2] *= lum;
      // Earth and grit between the stones, with grass tufts.
      mixRGB(C.earth, C.grit, d.fbm01(u, v, 40, 3) + pebbleH * 0.6, tmp);
      const grassMask = smoothstep(0.62, 0.78, N.fbm01(u + 0.3, v, 6, 4)) * (1 - inside);
      mixRGB(tmp, C.grass, grassMask * (0.6 + d.fbm01(u, v, 128, 1) * 0.4), tmp);
      mixRGB(tmp, col, inside, col);
      // Grime darkens the stone edges.
      mixRGB(col, C.earth, (1 - smoothstep(gap, gap + 0.05, edge)) * inside * 0.35, col);
      ctx.setAlbedo(i, col);

      // Tops are polished by feet, edges and earth stay rough.
      ctx.rough[i] = clamp01(inside * (0.72 - dome * 0.22 + grain * 0.05) + (1 - inside) * 0.96);
    });
  },
};
