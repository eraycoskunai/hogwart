/**
 * @file Dry soil: clods, scattered pebbles, twigs and organic bits,
 * shrinkage cracks.
 */
import { smoothstep, clamp01, hash2i } from '../noise.js';
import { hex, mixRGB, gradient } from '../pipeline.js';

const STOPS = [
  [0, hex('#3a2c1e')],
  [0.5, hex('#5c4631')],
  [1, hex('#7a6246')],
];
const PEBBLES = ['#8a8378', '#6f6a62', '#9c8c74', '#5d5850'].map(hex);
const TWIG = hex('#2a1e14');

export default {
  id: 'dirt',
  label: 'Toprak',
  category: 'Doğa',
  normalStrength: 6,
  aoStrength: 3.5,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(151);
    const col = [0, 0, 0];
    ctx.each((i, u, v) => {
      const clod = N.fbm01(u, v, 16, 5);
      const cr = N.worley(u, v, 6, 6, 1, 0, true);
      const crack = (1 - smoothstep(0, 0.004, cr.edge)) * smoothstep(0.5, 0.65, d.fbm01(u, v, 3, 2));
      const p = d.worley(u, v, 40, 40, 1, 0, false);
      const pr = 0.004 + ((p.id & 255) / 255) * 0.006;
      const isPebble = ((p.id >>> 8) & 3) === 0;
      const pebble = isPebble ? Math.sqrt(Math.max(0, 1 - (p.f1 / pr) ** 2)) : 0;
      const twig = (1 - smoothstep(0, 0.03, Math.abs(N.perlin(u * 20, v * 20, 20, 20)))) * smoothstep(0.8, 0.9, d.value(u, v, 16));

      gradient(STOPS, clamp01(clod * 0.9 + d.fbm(u, v, 96, 2) * 0.1), col);
      if (pebble > 0) mixRGB(col, PEBBLES[hash2i(p.id, 1, 3) & 3], smoothstep(0, 0.2, pebble), col);
      mixRGB(col, TWIG, twig * 0.7, col);
      mixRGB(col, STOPS[0][1], crack * 0.8, col);
      ctx.setAlbedo(i, col);
      ctx.height[i] = clamp01(0.35 + clod * 0.3 + pebble * 0.3 - crack * 0.25 + twig * 0.05);
      ctx.rough[i] = clamp01(0.94 - pebble * 0.25);
    });
  },
};
