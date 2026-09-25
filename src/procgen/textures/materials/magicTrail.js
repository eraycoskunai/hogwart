/**
 * @file Spell trail ribbon: white-hot core along U with soft falloff across
 * V, filaments and sparkles. Neutral white so each spell tints it through
 * the material colour. Tiles along U for scrolling ribbons.
 */
import { smoothstep, clamp01 } from '../noise.js';

export default {
  id: 'magicTrail',
  label: 'Büyü izi',
  category: 'Işık ve büyü',
  tiling: true,
  normalStrength: 0,
  aoStrength: 0,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(211);
    const alpha = ctx.useAlpha();
    ctx.each((i, u, v) => {
      const across = Math.abs(v - 0.5) * 2; // 0 centre .. 1 edge
      const wav = N.perlin(u * 6, v * 2, 6, 2) * 0.15;
      const core = Math.exp(-((across + wav) ** 2) * 18);
      const filaments = smoothstep(0.55, 0.95, 1 - Math.abs(d.perlin(u * 16, v * 8, 16, 8))) * Math.exp(-across * across * 4);
      const sparkle = smoothstep(0.93, 0.99, d.value(u, v, 160)) * Math.exp(-across * across * 3);
      const k = clamp01(core + filaments * 0.5 + sparkle);
      ctx.setAlbedo(i, [k, k, k]);
      ctx.setEmissive(i, [k, k, k], 1);
      alpha[i] = clamp01(k * 1.2);
      ctx.height[i] = 0.5;
      ctx.rough[i] = 1;
    });
  },
};
