/**
 * @file Brass: brushed metal with directional micro-lines, fine scratches,
 * darker tarnish and green verdigris gathering in low spots.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = {
  bright: hex('#d9b25e'),
  base: hex('#b8903f'),
  tarnish: hex('#6e5426'),
  verdigris: hex('#4f8a72'),
};

export default {
  id: 'brass',
  label: 'Pirinç',
  category: 'Metal',
  normalStrength: 1.2,
  aoStrength: 1.5,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(101);
    const col = [0, 0, 0];
    const metal = ctx.useMetal();
    ctx.each((i, u, v) => {
      const brush = d.perlin(u * 2, v * 400, 2, 400) * 0.5 + 0.5;
      const scratchRaw = 1 - Math.abs(N.perlin(u * 3 + v * 39, v * 3, 3, 3));
      const scratch = smoothstep(0.985, 1, scratchRaw);
      const dents = N.fbm(u, v, 6, 3);
      const tarnish = smoothstep(0.45, 0.8, N.fbm01(u + 0.3, v, 4, 5));
      const verd = smoothstep(0.72, 0.85, d.fbm01(u, v, 6, 4)) * smoothstep(0.3, 0.7, -dents * 0.5 + 0.5);
      ctx.height[i] = clamp01(0.5 + dents * 0.1 + brush * 0.02 - scratch * 0.05 + verd * 0.04);
      mixRGB(C.base, C.bright, brush * 0.5 + scratch * 0.5, col);
      mixRGB(col, C.tarnish, tarnish * 0.55, col);
      mixRGB(col, C.verdigris, verd, col);
      ctx.setAlbedo(i, col);
      metal[i] = 1 - verd * 0.9;
      ctx.rough[i] = clamp01(0.28 + brush * 0.1 + tarnish * 0.2 + verd * 0.5 - scratch * 0.1);
    });
  },
};
