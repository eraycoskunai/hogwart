/**
 * @file Skin: warm base tone with blotchy redness and subtle blue/olive
 * shifts, pores (tiny cellular dips), fine micro-lines and optional
 * freckles. Variants: 'fair', 'medium' (default), 'olive', 'deep',
 * 'freckled'. Neutral enough that the character creator can tint it.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const TONES = {
  fair: { base: hex('#eac4ab'), red: hex('#d99a8a'), shadow: hex('#c9a08c') },
  medium: { base: hex('#d7a784'), red: hex('#c98470'), shadow: hex('#b58a6c') },
  olive: { base: hex('#b98d68'), red: hex('#a86e56'), shadow: hex('#957055') },
  deep: { base: hex('#7a5038'), red: hex('#6e4030'), shadow: hex('#5e3e2c') },
  freckled: { base: hex('#ecc6ad'), red: hex('#d99a8a'), shadow: hex('#c9a08c') },
};
const FRECKLE = hex('#b0714a');

export default {
  id: 'skin',
  label: 'Cilt',
  category: 'Karakter',
  variants: ['medium', 'fair', 'olive', 'deep', 'freckled'],
  normalStrength: 1.4,
  aoStrength: 1.2,
  generate(ctx) {
    const T = TONES[ctx.variant] ?? TONES.medium;
    const freckles = ctx.variant === 'freckled';
    const { N } = ctx;
    const d = N.fork(181);
    const col = [0, 0, 0];
    ctx.each((i, u, v) => {
      const blotch = N.fbm01(u, v, 4, 4);
      const redness = smoothstep(0.55, 0.8, d.fbm01(u, v, 6, 3));
      const p = N.worley(u, v, 110, 110, 1, 0, false);
      const pore = 1 - smoothstep(0.0006, 0.0018, p.f1);
      const lines = 1 - smoothstep(0, 0.03, Math.abs(d.perlin(u * 30, v * 80, 30, 80)));
      mixRGB(T.base, T.shadow, (blotch - 0.5) * 0.6 + 0.2, col);
      mixRGB(col, T.red, redness * 0.35, col);
      if (freckles) {
        const f = d.worley(u, v, 40, 40, 1, 0, false);
        const fr = (1 - smoothstep(0.002, 0.004, f.f1)) * ((f.id & 3) === 0 ? 1 : 0) * smoothstep(0.4, 0.6, blotch);
        mixRGB(col, FRECKLE, fr * 0.6, col);
      }
      mixRGB(col, T.shadow, pore * 0.2, col);
      ctx.setAlbedo(i, col);
      ctx.height[i] = clamp01(0.5 - pore * 0.12 - lines * 0.03 + blotch * 0.02);
      ctx.rough[i] = clamp01(0.5 + pore * 0.15 + blotch * 0.08 - redness * 0.05);
    });
  },
};
