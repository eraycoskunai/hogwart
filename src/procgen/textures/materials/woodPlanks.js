/**
 * @file Wooden planks: growth rings seen on flat-sawn boards, long grain
 * streaks, knots that bend the rings, end joints, grooves between boards
 * and a worn varnish (roughness). Boards run along U.
 * Variants: 'oak' (default), 'walnut', 'weathered'.
 */
import { smoothstep, clamp01, hash2i } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const PALETTES = {
  oak: { light: hex('#c29160'), dark: hex('#8a5a31'), ring: hex('#6e4424'), gap: hex('#2a1a0e'), knot: hex('#4a2c16'), rough: 0.42 },
  walnut: { light: hex('#7b5236'), dark: hex('#4d2f1c'), ring: hex('#33200f'), gap: hex('#140b05'), knot: hex('#26150a'), rough: 0.35 },
  weathered: { light: hex('#9d9486'), dark: hex('#6e665b'), ring: hex('#57504a'), gap: hex('#2a2622'), knot: hex('#3e3730'), rough: 0.85 },
};

const BOARDS = 5;
const JOINTS = 2;

export default {
  id: 'woodPlanks',
  label: 'Ahşap tahta',
  category: 'Ahşap',
  variants: ['oak', 'walnut', 'weathered'],
  normalStrength: 3.5,
  aoStrength: 2.5,
  generate(ctx) {
    const P = PALETTES[ctx.variant] ?? PALETTES.oak;
    const { N } = ctx;
    const g = N.fork(31);
    const col = [0, 0, 0];
    const s = ctx.seed;
    ctx.each((i, u, v) => {
      const bf = v * BOARDS;
      const board = Math.floor(bf);
      const across = bf - board; // 0..1 across the board
      // End joints at a random offset per board.
      const jOff = (hash2i(board, 7, s) % 1000) / 1000;
      const seg = Math.floor(((u + jOff) % 1) * JOINTS);
      const piece = hash2i(board, seg, s);
      const along = (((u + jOff) % 1) * JOINTS) % 1;
      const r1 = (piece & 255) / 255;
      const r2 = ((piece >>> 8) & 255) / 255;
      const r3 = ((piece >>> 16) & 255) / 255;

      // Growth rings: distance from an off-board pith, perturbed by long grain noise.
      const pith = -0.6 - r1 * 1.5;
      const grainWarp = g.perlin(u * 6 + r2 * 3, v * 60, 6, 60) * 0.08 + g.perlin(u * 2, v * 20, 2, 20) * 0.15;
      let rings = Math.abs(across - 0.5 + (r3 - 0.5) * 0.6 - pith) * (5 + r2 * 4) + grainWarp;

      // Knots: bend rings around one possible knot per piece.
      const hasKnot = r3 > 0.55;
      let knotCore = 0;
      if (hasKnot) {
        const kx = (r1 * 0.7 + 0.15);
        const ky = (r2 * 0.6 + 0.2);
        const dx = (along - kx) * (1 / JOINTS) * 4;
        const dy = (across - ky) * (1 / BOARDS) * 4;
        const kd = Math.sqrt(dx * dx * 0.35 + dy * dy);
        rings += 0.06 / (kd + 0.02);
        knotCore = 1 - smoothstep(0.02, 0.05, kd);
      }
      const ringT = rings - Math.floor(rings);
      const ringLine = smoothstep(0.75, 1, ringT) * (0.6 + r2 * 0.4);
      const streak = g.perlin(u * 3, v * 140, 3, 140) * 0.5 + 0.5;

      // Grooves between boards and at joints.
      const groove = Math.min(smoothstep(0, 0.035, across), smoothstep(0, 0.035, 1 - across),
        smoothstep(0, 0.006, along), smoothstep(0, 0.006, 1 - along));

      mixRGB(P.light, P.dark, clamp01(0.3 + (r1 - 0.5) * 0.5 + streak * 0.35), col);
      mixRGB(col, P.ring, ringLine * 0.55, col);
      mixRGB(col, P.knot, knotCore, col);
      mixRGB(P.gap, col, groove, col);
      ctx.setAlbedo(i, col);

      ctx.height[i] = clamp01(groove * (0.7 - ringLine * 0.04 + streak * 0.03) - knotCore * 0.05);
      const wear = smoothstep(0.4, 0.8, N.fbm01(u, v, 4, 3));
      ctx.rough[i] = clamp01(P.rough + wear * 0.25 + ringLine * 0.08 + (1 - groove) * 0.4);
    });
  },
};
