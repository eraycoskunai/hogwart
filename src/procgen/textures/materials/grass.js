/**
 * @file Lawn seen from above: dense blades in varied greens (oriented per
 * clump), dry yellowed patches, clover and soil showing through.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = {
  deep: hex('#2e4a1c'),
  mid: hex('#4c7028'),
  bright: hex('#7a9a3a'),
  dry: hex('#a39a55'),
  soil: hex('#4a3a26'),
  clover: hex('#3f6a2a'),
};

export default {
  id: 'grass',
  label: 'Çim',
  category: 'Doğa',
  normalStrength: 5,
  aoStrength: 3,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(141);
    const col = [0, 0, 0];
    ctx.each((i, u, v) => {
      // Clumps orient their blades differently.
      const c = N.worley(u, v, 24, 24, 1, 0, false);
      const ang = ((c.id & 255) / 255) * Math.PI;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      // Stripe phase relative to the clump centre keeps the tile seamless.
      const du = u - c.cx;
      const dv = v - c.cy;
      const lu = du * ca - dv * sa;
      const lv = du * sa + dv * ca;
      // Blades: high-frequency stripes along the clump direction, broken by noise.
      const bladeA = Math.abs(Math.sin((lu * 260 + d.perlin(u * 32, v * 32, 32, 32) * 2) * Math.PI));
      const bladeB = Math.abs(Math.sin((lv * 190 + d.perlin(u * 24 + 5, v * 24, 24, 24) * 2) * Math.PI));
      const blades = Math.max(smoothstep(0.7, 1, bladeA), smoothstep(0.75, 1, bladeB) * 0.7) * (0.6 + d.value(u, v, 256) * 0.4);
      const dryMask = smoothstep(0.55, 0.8, N.fbm01(u, v, 3, 4));
      const soilMask = smoothstep(0.72, 0.85, d.fbm01(u + 0.5, v, 5, 4)) * (1 - blades);
      const cloverMask = smoothstep(0.75, 0.82, N.fbm01(u + 0.2, v + 0.7, 12, 2));

      mixRGB(C.deep, C.mid, clamp01(0.3 + blades * 0.7), col);
      mixRGB(col, C.bright, smoothstep(0.7, 1, blades) * 0.6, col);
      mixRGB(col, C.dry, dryMask * (0.4 + blades * 0.4), col);
      mixRGB(col, C.clover, cloverMask * 0.7, col);
      mixRGB(col, C.soil, soilMask * 0.8, col);
      ctx.setAlbedo(i, col);
      ctx.height[i] = clamp01(0.3 + blades * 0.5 - soilMask * 0.2 + cloverMask * 0.1);
      ctx.rough[i] = clamp01(0.82 + dryMask * 0.1 - blades * 0.08);
    });
  },
};
