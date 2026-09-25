/**
 * @file Worn leather: pebbled cellular grain, creases, lighter scuffs and
 * a slightly waxed sheen. Variants: 'brown' (default), 'black', 'red'.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const PALETTES = {
  brown: { base: hex('#6b4128'), dark: hex('#3e2414'), scuff: hex('#a07350') },
  black: { base: hex('#26211f'), dark: hex('#110e0d'), scuff: hex('#5a524c') },
  red: { base: hex('#6e1f1a'), dark: hex('#3b0f0c'), scuff: hex('#a4564a') },
};

export default {
  id: 'leather',
  label: 'Deri',
  category: 'Kumaş ve deri',
  variants: ['brown', 'black', 'red'],
  normalStrength: 3,
  aoStrength: 2.5,
  generate(ctx) {
    const P = PALETTES[ctx.variant] ?? PALETTES.brown;
    const { N } = ctx;
    const d = N.fork(71);
    const col = [0, 0, 0];
    ctx.each((i, u, v) => {
      const c = N.worley(u, v, 48, 48, 0.9, 0, true);
      const pebble = smoothstep(0, 0.006, c.edge);
      const crease = 1 - smoothstep(0, 0.05, 1 - d.ridged(u, v, 5, 3));
      const tone = d.fbm01(u, v, 4, 4);
      const scuff = smoothstep(0.62, 0.85, N.fbm01(u + 0.21, v, 7, 4));
      ctx.height[i] = clamp01(0.5 + pebble * 0.2 - crease * 0.25 + tone * 0.05);
      mixRGB(P.dark, P.base, clamp01(0.35 + tone * 0.6 + pebble * 0.1), col);
      mixRGB(col, P.dark, crease * 0.6, col);
      mixRGB(col, P.scuff, scuff * 0.45, col);
      ctx.setAlbedo(i, col);
      ctx.rough[i] = clamp01(0.55 + (1 - pebble) * 0.15 + scuff * 0.2 - tone * 0.1);
    });
  },
};
