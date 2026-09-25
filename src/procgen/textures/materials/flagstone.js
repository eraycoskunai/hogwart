/**
 * @file Flagstone floor: large rectangular slabs of varying size laid in
 * courses (some split into irregular pieces), each slightly tilted and
 * toned, speckled stone grain, hairline cracks, sanded grout and worn,
 * foot-polished tops.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';
import { createMasonry, sampleMasonry } from './masonry.js';

const SLABS = ['#8a8680', '#9a9286', '#7d8284', '#a39884', '#8f8a7d'].map(hex);
const C = {
  grout: hex('#6b645a'),
  crack: hex('#4b463e'),
  speckDark: hex('#5a5650'),
  speckLight: hex('#c2bcae'),
};
const LAYOUT = { rows: 4, rowVariance: 0.25, minWidth: 0.2, maxWidth: 0.42, splitChance: 0.1 };
const GROUT = 0.004;

export default {
  id: 'flagstone',
  label: 'Döşeme taşı',
  category: 'Taş',
  normalStrength: 5,
  aoStrength: 2.2,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(8);
    const L = createMasonry(ctx.seed + 5, LAYOUT);
    const m = { edge: 0, id: 0, row: 0, du: 0, dv: 0, w: 0, h: 0 };
    const w = [0, 0];
    const col = [0, 0, 0];
    ctx.each((i, u, v) => {
      N.warp(u, v, 8, 0.003, 3, w);
      sampleMasonry(L, u + w[0], v + w[1], m);
      const id = m.id;
      const r1 = (id & 255) / 255;
      const r2 = ((id >>> 8) & 255) / 255;
      const r3 = ((id >>> 16) & 255) / 255;
      const slab = smoothstep(GROUT, GROUT + 0.006, m.edge);
      const tilt = ((m.du - 0.5) * (r1 - 0.5) + (m.dv - 0.5) * (r2 - 0.5)) * 0.08;
      const grain = d.fbm(u, v, 20, 5);
      const speck = d.value(u, v, 300);
      const crackLine = 1 - smoothstep(0.0, 0.03, 1 - d.ridged(u + r3, v, 5, 3));
      const crack = crackLine * slab * smoothstep(0.55, 0.72, N.fbm01(u + r1, v, 3, 2));

      ctx.height[i] = clamp01(slab * (0.72 + tilt + grain * 0.04 + speck * 0.01) - crack * 0.1 + (1 - slab) * 0.18);

      mixRGB(SLABS[id % SLABS.length], SLABS[(id >>> 4) % SLABS.length], r3 * 0.4, col);
      const lum = 0.9 + grain * 0.14 + (r1 - 0.5) * 0.12;
      col[0] *= lum; col[1] *= lum; col[2] *= lum;
      if (speck > 0.82) mixRGB(col, C.speckLight, (speck - 0.82) * 2.5, col);
      else if (speck < 0.16) mixRGB(col, C.speckDark, (0.16 - speck) * 2.5, col);
      mixRGB(col, C.crack, crack * 0.7, col);
      mixRGB(C.grout, col, slab, col);
      ctx.setAlbedo(i, col);
      const wear = smoothstep(0.2, 0.6, N.fbm01(u, v, 3, 3));
      ctx.rough[i] = clamp01(slab * (0.8 - wear * 0.22 + grain * 0.04) + (1 - slab) * 0.95);
    });
  },
};
