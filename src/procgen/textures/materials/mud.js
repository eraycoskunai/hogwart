/**
 * @file Wet mud: churned ruts, glossy standing puddles in the low areas,
 * darker saturated soil around them and drying crust on the crests.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = {
  wet: hex('#3a2b1d'),
  mid: hex('#51402c'),
  crust: hex('#6e5a42'),
  water: hex('#2a241c'),
};
const WATER_LEVEL = 0.38;

export default {
  id: 'mud',
  label: 'Çamur',
  category: 'Doğa',
  normalStrength: 5,
  aoStrength: 2.5,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(161);
    const w = [0, 0];
    const col = [0, 0, 0];
    ctx.each((i, u, v) => {
      N.warp(u, v, 3, 0.08, 3, w);
      const ruts = (Math.sin((v + w[1] * 3) * Math.PI * 2 * 2) * 0.5 + 0.5) * N.fbm01(u, v + 0.4, 2, 2);
      const churn = N.fbm01(u + w[0], v, 8, 5);
      let h = clamp01(churn * 0.8 + ruts * 0.15 + d.fbm(u, v, 64, 2) * 0.04);
      const puddle = smoothstep(WATER_LEVEL + 0.02, WATER_LEVEL - 0.02, h);
      h = Math.max(h, WATER_LEVEL); // standing water is flat
      ctx.height[i] = h;
      mixRGB(C.wet, C.mid, smoothstep(0.35, 0.6, h), col);
      mixRGB(col, C.crust, smoothstep(0.62, 0.8, h), col);
      mixRGB(col, C.water, puddle * 0.8, col);
      ctx.setAlbedo(i, col);
      ctx.rough[i] = clamp01(0.55 + smoothstep(0.55, 0.8, h) * 0.4 - puddle * 0.5);
    });
  },
};
