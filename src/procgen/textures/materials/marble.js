/**
 * @file Marble: domain-warped veins (primary grey veins, fine secondary
 * veins, faint gold threads) in a cream base with cloudy depth; polished.
 * Variants: 'white' (default), 'black', 'green'.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const PALETTES = {
  white: { base: hex('#ece6da'), cloud: hex('#d6cfc2'), vein: hex('#6f6a66'), fine: hex('#9b958d'), gold: hex('#b89455') },
  black: { base: hex('#1d1c1f'), cloud: hex('#2c2a2e'), vein: hex('#d9d4cb'), fine: hex('#8c8680'), gold: hex('#b38a4a') },
  green: { base: hex('#2f4a3d'), cloud: hex('#3c5a4a'), vein: hex('#d8dccd'), fine: hex('#1a2b22'), gold: hex('#a88f58') },
};

export default {
  id: 'marble',
  label: 'Mermer',
  category: 'Taş',
  variants: ['white', 'black', 'green'],
  normalStrength: 1.2,
  aoStrength: 1,
  generate(ctx) {
    const P = PALETTES[ctx.variant] ?? PALETTES.white;
    const { N } = ctx;
    const n2 = N.fork(11);
    const w = [0, 0];
    const col = [0, 0, 0];
    const TAU = Math.PI * 2;
    ctx.each((i, u, v) => {
      N.warp(u, v, 3, 0.25, 5, w);
      const t = (u + v * 2) + w[0] * 2.2 + w[1];
      const veinRaw = Math.abs(Math.sin(t * TAU * 2));
      const vein = 1 - smoothstep(0.0, 0.06 + n2.fbm01(u, v, 4, 2) * 0.08, veinRaw);
      const fineT = (u * 3 - v) + n2.fbm(u, v, 6, 5) * 0.8;
      const fine = 1 - smoothstep(0.0, 0.03, Math.abs(Math.sin(fineT * TAU * 3)));
      const goldT = (u - v * 3) + n2.fbm(u + 0.5, v, 4, 4) * 0.6;
      const gold = (1 - smoothstep(0, 0.012, Math.abs(Math.sin(goldT * TAU)))) * smoothstep(0.55, 0.75, N.fbm01(u, v, 3, 2));
      const cloud = N.torus(u, v, 5, 4) * 0.5 + 0.5;

      mixRGB(P.base, P.cloud, clamp01(cloud * 0.9), col);
      mixRGB(col, P.fine, fine * 0.45, col);
      mixRGB(col, P.vein, vein * 0.85, col);
      mixRGB(col, P.gold, gold * 0.7, col);
      ctx.setAlbedo(i, col);
      ctx.height[i] = 0.5 - vein * 0.03 - fine * 0.01;
      ctx.rough[i] = clamp01(0.12 + vein * 0.08 + cloud * 0.04);
      if (gold > 0.05) ctx.useMetal()[i] = gold * 0.8;
    });
  },
};
