/**
 * @file Ghostly mist: seamless wisps from a 4D-torus fBm with a domain warp,
 * pale silver-blue, translucent. The ghost shader adds a Fresnel rim and
 * scrolls the texture.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = { dim: hex('#6f8aa8'), bright: hex('#e8f2ff') };

export default {
  id: 'ghost',
  label: 'Hayalet',
  category: 'Işık ve büyü',
  normalStrength: 0,
  aoStrength: 0,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(231);
    const w = [0, 0];
    const col = [0, 0, 0];
    const alpha = ctx.useAlpha();
    ctx.each((i, u, v) => {
      d.warp(u, v, 3, 0.15, 3, w);
      const n = N.torus(u + w[0], v + w[1], 4, 5) * 0.5 + 0.5;
      const wisps = smoothstep(0.35, 0.85, n);
      mixRGB(C.dim, C.bright, wisps, col);
      ctx.setAlbedo(i, col);
      ctx.setEmissive(i, col, 0.4 + wisps * 0.6);
      alpha[i] = clamp01(0.25 + wisps * 0.75);
      ctx.height[i] = 0.5;
      ctx.rough[i] = 1;
    });
  },
};
