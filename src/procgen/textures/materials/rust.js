/**
 * @file Heavy rust: layered oxide colours, flaking plates with lifted edges,
 * pitting, and islands of bare grey steel.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, gradient, mixRGB } from '../pipeline.js';

const STOPS = [
  [0, hex('#2b1409')],
  [0.35, hex('#5e2a10')],
  [0.6, hex('#8e4418')],
  [0.85, hex('#b8672a')],
  [1, hex('#c9884a')],
];
const STEEL = hex('#6d6c6a');

export default {
  id: 'rust',
  label: 'Pas',
  category: 'Metal',
  normalStrength: 6,
  aoStrength: 3,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(121);
    const col = [0, 0, 0];
    const metal = ctx.useMetal();
    ctx.each((i, u, v) => {
      const layer = N.fbm01(u, v, 6, 6);
      const c = N.worley(u, v, 10, 10, 1, 0, true);
      const flakeEdge = 1 - smoothstep(0, 0.01, c.edge);
      const flakeLift = ((c.id & 255) / 255) * smoothstep(0.5, 0.7, layer);
      const pits = smoothstep(0.75, 0.9, d.value(u, v, 128)) * 0.5;
      const steel = smoothstep(0.62, 0.7, d.fbm01(u + 0.6, v, 4, 4)) * (1 - flakeLift);
      ctx.height[i] = clamp01(0.4 + layer * 0.3 + flakeLift * 0.15 - flakeEdge * 0.1 - pits * 0.2 - steel * 0.2);
      gradient(STOPS, clamp01(layer + (d.fbm(u, v, 48, 2)) * 0.2), col);
      mixRGB(col, STOPS[0][1], flakeEdge * 0.6 + pits * 0.5, col);
      mixRGB(col, STEEL, steel, col);
      ctx.setAlbedo(i, col);
      metal[i] = steel * 0.9;
      ctx.rough[i] = clamp01(0.9 - steel * 0.45);
    });
  },
};
