/**
 * @file Candle / torch flame sprite: teardrop shape with a blue base, white
 * hot core, amber body and red fringe; alpha from the shape. Emissive.
 * (The flame shader animates flicker and distortion at runtime.)
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, gradient } from '../pipeline.js';

const STOPS = [
  [0, hex('#fffbe8')],
  [0.35, hex('#ffd873')],
  [0.65, hex('#ff9a2e')],
  [0.88, hex('#d9431a')],
  [1, hex('#6a1a08')],
];
const BLUE = hex('#3a5cff');

export default {
  id: 'candleFlame',
  label: 'Mum alevi',
  category: 'Işık ve büyü',
  tiling: false,
  normalStrength: 0,
  aoStrength: 0,
  generate(ctx) {
    const { N } = ctx;
    const col = [0, 0, 0];
    const alpha = ctx.useAlpha();
    ctx.each((i, u, v) => {
      // Teardrop: wide near the bottom (v≈0.25), pointed tip at v≈0.95.
      const y = (v - 0.1) / 0.85;
      const width = y < 0 ? 0 : Math.pow(Math.sin(Math.min(1, y) * Math.PI * 0.85), 1.4) * (1 - y) * 0.55 + 0.02 * (1 - y);
      const wob = N.fbm(u, v, 4, 3) * 0.03 * y;
      const dx = Math.abs(u - 0.5 + wob);
      const shape = width > 0 ? clamp01(1 - dx / width) : 0;
      const core = smoothstep(0.35, 1, shape) * (1 - smoothstep(0.3, 0.8, y));
      const t = clamp01(1 - shape * 0.9 - core * 0.3 + y * 0.35);
      gradient(STOPS, t, col);
      const blue = smoothstep(0.18, 0.02, y) * smoothstep(0.1, 0.6, shape);
      col[0] += (BLUE[0] - col[0]) * blue * 0.7;
      col[1] += (BLUE[1] - col[1]) * blue * 0.7;
      col[2] += (BLUE[2] - col[2]) * blue * 0.7;
      ctx.setAlbedo(i, col);
      ctx.setEmissive(i, col, 1);
      alpha[i] = clamp01(smoothstep(0, 0.35, shape) * (1 - smoothstep(0.92, 1, y)));
      ctx.height[i] = 0.5;
      ctx.rough[i] = 1;
    });
  },
};
