/**
 * @file Thatch: bundles of straw laid in overlapping courses, straws
 * running down the slope (V), sun-bleached tops, darker weathered ends and
 * patches of moss.
 */
import { smoothstep, clamp01, hash2i } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = { light: hex('#b39a5e'), mid: hex('#8a7442'), dark: hex('#4e4028'), moss: hex('#5a6a30') };
const COURSES = 6;
const STRAWS = 160;

export default {
  id: 'thatch',
  label: 'Saman çatı',
  category: 'Doğa',
  normalStrength: 5,
  aoStrength: 3,
  generate(ctx) {
    const { N } = ctx;
    const s = ctx.seed;
    const col = [0, 0, 0];
    ctx.each((i, u, v) => {
      const cv = v * COURSES;
      const c = Math.floor(cv);
      const fv = cv - c;
      const x = u * STRAWS + N.perlin(u * 8, v * 4, 8, 4) * 2;
      const k = Math.floor(x);
      const fx = x - k;
      const hs = hash2i(((k % STRAWS) + STRAWS) % STRAWS, c, s);
      const straw = Math.max(0, 1 - Math.abs(fx - 0.5) * 2);
      const end = smoothstep(0, 0.12 + ((hs >>> 8) & 63) / 63 * 0.08, fv);
      ctx.height[i] = clamp01(straw * 0.5 * end + (1 - fv) * 0.4 + N.fbm01(u, v, 32, 3) * 0.1);
      mixRGB(C.mid, C.light, (hs & 255) / 255 * 0.8 + (1 - fv) * 0.3, col);
      mixRGB(col, C.dark, (1 - end) * 0.7 + smoothstep(0.6, 0.85, N.fbm01(u, v, 10, 4)) * 0.4, col);
      mixRGB(col, C.moss, smoothstep(0.7, 0.85, N.fbm01(u + 0.5, v, 6, 4)) * 0.6, col);
      const lum = 0.85 + straw * 0.2;
      col[0] *= lum; col[1] *= lum; col[2] *= lum;
      ctx.setAlbedo(i, col);
      ctx.rough[i] = 0.9;
    });
  },
};
