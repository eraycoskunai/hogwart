/**
 * @file Hair strands for hair cards: many thin strands running along V with
 * per-strand colour and thickness, darker roots, lighter sun-bleached tips
 * and alpha that thins out toward the ends. Pair with an anisotropic
 * material. Variants: 'brown' (default), 'black', 'blonde', 'red', 'grey'.
 */
import { smoothstep, clamp01, hash2i } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const COLORS = {
  brown: { root: hex('#2a1a10'), mid: hex('#5a3a22'), tip: hex('#8a6440') },
  black: { root: hex('#0c0a09'), mid: hex('#1d1916'), tip: hex('#3a322b') },
  blonde: { root: hex('#7a5a30'), mid: hex('#c8a064'), tip: hex('#e8cf98') },
  red: { root: hex('#4a1a0c'), mid: hex('#9a3e1a'), tip: hex('#c86a34') },
  grey: { root: hex('#5a5652'), mid: hex('#9a9690'), tip: hex('#d0ccc6') },
};
const STRANDS = 220;

export default {
  id: 'hair',
  label: 'Saç',
  category: 'Karakter',
  variants: ['brown', 'black', 'blonde', 'red', 'grey'],
  tiling: false,
  normalStrength: 3,
  aoStrength: 1.5,
  generate(ctx) {
    const P = COLORS[ctx.variant] ?? COLORS.brown;
    const { N } = ctx;
    const s = ctx.seed;
    const col = [0, 0, 0];
    const alpha = ctx.useAlpha();
    ctx.each((i, u, v) => {
      // Strands sway slightly along their length.
      const x = u * STRANDS + N.perlin(u * 4, v * 3, 4, 3) * 2.5;
      const k = Math.floor(x);
      const fx = x - k;
      const h = hash2i(k, 11, s);
      const thick = 0.35 + ((h & 255) / 255) * 0.5;
      const len = 0.7 + (((h >>> 8) & 255) / 255) * 0.3; // strands end at different lengths
      const profile = Math.max(0, 1 - Math.abs(fx - 0.5) / (thick * 0.5));
      const along = 1 - v; // v = 1 is the root at the top of the card
      const ending = 1 - smoothstep(len - 0.15, len, along);
      const shade = ((h >>> 16) & 255) / 255;
      if (along < 0.5) mixRGB(P.root, P.mid, along * 2, col);
      else mixRGB(P.mid, P.tip, (along - 0.5) * 2, col);
      const lum = 0.75 + shade * 0.35 + profile * 0.15;
      col[0] *= lum; col[1] *= lum; col[2] *= lum;
      ctx.setAlbedo(i, col);
      alpha[i] = clamp01(smoothstep(0.05, 0.4, profile) * ending);
      ctx.height[i] = clamp01(profile * 0.6 + 0.2);
      ctx.rough[i] = clamp01(0.45 + (1 - profile) * 0.2);
    });
  },
};
