/**
 * @file Natural rock: ridged multifractal relief, sedimentary strata,
 * fractures and lichen colonies.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB, gradient } from '../pipeline.js';

const STOPS = [
  [0, hex('#4c4a47')],
  [0.4, hex('#6e6b66')],
  [0.7, hex('#8a857c')],
  [1, hex('#a39d92')],
];
const LICHEN_A = hex('#a58a3e');
const LICHEN_B = hex('#8c9275');
const CRACK = hex('#2c2a28');

export default {
  id: 'rock',
  label: 'Kaya',
  category: 'Taş',
  normalStrength: 9,
  aoStrength: 4,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(21);
    const w = [0, 0];
    const col = [0, 0, 0];
    ctx.each((i, u, v) => {
      N.warp(u, v, 4, 0.05, 4, w);
      const ridge = N.ridged(u + w[0], v + w[1], 4, 6);
      const strata = Math.sin((v + w[1] * 2 + d.fbm(u, v, 3, 3) * 0.1) * Math.PI * 2 * 9) * 0.5 + 0.5;
      const fine = d.fbm(u, v, 64, 3);
      const c = N.worley(u + w[0], v + w[1], 5, 5, 1, 0);
      // Only some cell borders open up into fractures.
      const crack = (1 - smoothstep(0.0, 0.0025, c.edge)) * smoothstep(0.55, 0.7, d.fbm01(u + 0.3, v + 0.6, 4, 3));
      const h = clamp01(ridge * 0.75 + strata * 0.1 + fine * 0.05 - crack * 0.25);
      ctx.height[i] = h;

      gradient(STOPS, clamp01(h * 0.8 + strata * 0.2 + fine * 0.1), col);
      const lichen = smoothstep(0.6, 0.72, d.fbm01(u + 0.2, v, 7, 4)) * smoothstep(0.35, 0.6, h);
      const lic = (c.id & 1) ? LICHEN_A : LICHEN_B;
      mixRGB(col, lic, lichen * (0.6 + fine * 0.4), col);
      mixRGB(col, CRACK, crack * 0.75, col);
      ctx.setAlbedo(i, col);
      ctx.rough[i] = clamp01(0.88 + fine * 0.05 - (1 - h) * 0.05);
    });
  },
};
