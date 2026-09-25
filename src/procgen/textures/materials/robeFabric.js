/**
 * @file Woven cloth. 'black' / 'grey' are school-robe twill (diagonal wale)
 * with fibre fuzz and soft creases; 'burlap' is a coarse plain weave.
 */
import { smoothstep, clamp01, hash2i } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const VARIANTS = {
  black: { threads: 384, twill: true, base: hex('#1c1d23'), hi: hex('#2c2d36'), fuzz: 0.05 },
  grey: { threads: 384, twill: true, base: hex('#4d4d52'), hi: hex('#62626a'), fuzz: 0.05 },
  burlap: { threads: 48, twill: false, base: hex('#9a7f55'), hi: hex('#c2a672'), fuzz: 0.2 },
};

export default {
  id: 'robeFabric',
  label: 'Kumaş / cübbe',
  category: 'Kumaş ve deri',
  variants: ['black', 'grey', 'burlap'],
  normalStrength: 3,
  aoStrength: 2,
  generate(ctx) {
    const V = VARIANTS[ctx.variant] ?? VARIANTS.black;
    const { N } = ctx;
    const d = N.fork(81);
    const col = [0, 0, 0];
    const T = V.threads;
    const s = ctx.seed;
    ctx.each((i, u, v) => {
      const tx = u * T;
      const ty = v * T;
      const ix = Math.floor(tx);
      const iy = Math.floor(ty);
      const fx = tx - ix;
      const fy = ty - iy;
      // Which thread is on top: twill (2/2 diagonal) or plain weave.
      const warpOnTop = V.twill ? ((ix + iy) & 3) < 2 : ((ix + iy) & 1) === 0;
      const across = warpOnTop ? fx : fy;
      const along = warpOnTop ? fy : fx;
      const thread = Math.sin(across * Math.PI); // round thread profile
      const bulge = Math.sin(along * Math.PI) * 0.35 + 0.65;
      const slub = (hash2i(warpOnTop ? ix : iy, warpOnTop ? 1 : 2, s) & 255) / 255; // thread thickness variation
      const fuzz = d.fbm(u, v, 256, 2) * V.fuzz;
      const crease = 1 - smoothstep(0, 0.08, 1 - N.ridged(u, v, 3, 3));
      const fold = N.fbm(u, v, 2, 3);
      ctx.height[i] = clamp01(0.45 + thread * bulge * 0.25 * (0.8 + slub * 0.4) + fold * 0.12 - crease * 0.12 + fuzz);
      mixRGB(V.base, V.hi, clamp01(thread * bulge * 0.45 + slub * 0.25 + fuzz * 2 + fold * 0.15), col);
      const dim = 1 - crease * 0.25;
      col[0] *= dim; col[1] *= dim; col[2] *= dim;
      ctx.setAlbedo(i, col);
      ctx.rough[i] = clamp01(0.86 + fuzz * 0.5 - thread * 0.06);
    });
  },
};
