/**
 * @file Water surface detail: the height field is a sum of periodic
 * directional waves (integer wave vectors → seamless) plus capillary noise;
 * it becomes the normal map that the water shader scrolls in two layers.
 * Albedo stores a cellular foam pattern (white on black) that the shader
 * uses as a foam mask; the base water colour lives in the material.
 */
import { smoothstep, clamp01, hash2i } from '../noise.js';

const WAVES = 14;

export default {
  id: 'water',
  label: 'Su',
  category: 'Doğa',
  normalStrength: 2.2,
  aoStrength: 0,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(171);
    const s = ctx.seed;
    const waves = [];
    for (let k = 0; k < WAVES; k++) {
      const h = hash2i(k, 5, s);
      const kx = ((h & 15) - 7) || 1;
      const ky = (((h >>> 4) & 15) - 7) || 2;
      const amp = 1 / Math.hypot(kx, ky);
      waves.push({ kx, ky, amp, phase: ((h >>> 8) & 1023) / 1023 * Math.PI * 2 });
    }
    const TAU = Math.PI * 2;
    let norm = 0;
    for (const w of waves) norm += w.amp;
    ctx.each((i, u, v) => {
      let h = 0;
      for (const w of waves) {
        // Sharpened sine (trochoid-like crests).
        const x = Math.sin((w.kx * u + w.ky * v) * TAU + w.phase) * 0.5 + 0.5;
        h += w.amp * Math.pow(x, 1.6);
      }
      h = h / norm;
      h += d.fbm(u, v, 32, 3) * 0.06;
      ctx.height[i] = clamp01(h);

      const f = N.worley(u, v, 18, 18, 1, 0, true);
      const foam = (1 - smoothstep(0.0, 0.006, f.edge)) * smoothstep(0.35, 0.65, N.fbm01(u, v, 6, 4));
      const bits = smoothstep(0.7, 0.9, d.value(u, v, 200)) * smoothstep(0.4, 0.7, N.fbm01(u, v, 6, 4));
      const m = clamp01(foam + bits * 0.5);
      ctx.setAlbedo(i, [m, m, m]);
      ctx.rough[i] = 0.04 + m * 0.5;
    });
  },
};
