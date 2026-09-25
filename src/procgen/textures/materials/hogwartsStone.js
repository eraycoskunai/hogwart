/**
 * @file Hogwarts castle stone: coursed ashlar with courses of varying height,
 * hand-cut (noise-warped) joints, rubble infill stones split by Voronoi,
 * recessed lime mortar, per-stone tone and hue, worn rounded arrises, chipped
 * faces, pitting, moss in the joints and rain / soot streaks.
 * (Up-facing moss, damp wall bases and wetness are added in world space by
 * the surface shader.)
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';
import { createMasonry, sampleMasonry } from './masonry.js';

const C = {
  light: hex('#bdb3a0'),
  dark: hex('#6f675a'),
  warm: hex('#a8916f'),
  cool: hex('#8b918f'),
  grey: hex('#96928a'),
  mortar: hex('#a49c8a'),
  mortarDark: hex('#7a7264'),
  grime: hex('#4a4338'),
  moss: hex('#5a6636'),
};

const LAYOUT = { rows: 7, rowVariance: 0.3, minWidth: 0.16, maxWidth: 0.34, splitChance: 0.14 };
const MORTAR = 0.0045;
const ARRIS = 0.012;

export default {
  id: 'hogwartsStone',
  label: 'Hogwarts taşı',
  category: 'Taş',
  normalStrength: 6,
  aoStrength: 2.4,
  generate(ctx) {
    const { N } = ctx;
    const detail = N.fork(1);
    const mossN = N.fork(2);
    const L = createMasonry(ctx.seed, LAYOUT);
    const m = { edge: 0, id: 0, row: 0, du: 0, dv: 0, w: 0, h: 0 };
    const w = [0, 0];
    const col = [0, 0, 0];
    const tmp = [0, 0, 0];
    ctx.each((i, u, v) => {
      // Hand-cut joints: warp the lookup a little.
      N.warp(u, v, 12, 0.0035, 3, w);
      sampleMasonry(L, u + w[0], v + w[1], m);
      const id = m.id;
      const r1 = (id & 255) / 255;
      const r2 = ((id >>> 8) & 255) / 255;
      const r3 = ((id >>> 16) & 255) / 255;
      const edge = m.edge;

      const mortarW = MORTAR * (0.8 + r3 * 0.5);
      const stone = smoothstep(mortarW, mortarW + ARRIS * (0.7 + r2 * 0.8), edge);
      const grain = detail.fbm(u, v, 24, 4);
      const fine = detail.fbm(u + 0.37, v + 0.11, 96, 2);
      const pits = smoothstep(0.6, 0.78, detail.fbm01(u + 0.5, v + 0.5, 128, 2)) * 0.5;
      const chips = smoothstep(0.7, 0.9, detail.ridged(u + r1, v, 10, 3)) * stone * smoothstep(0.03, 0.0, edge - mortarW);
      // Each face bulges slightly and is tilted a touch.
      const bulge = Math.sin(clamp01(m.du) * Math.PI) * Math.sin(clamp01(m.dv) * Math.PI) * 0.06;
      const tilt = (m.du - 0.5) * (r1 - 0.5) * 0.05 + (m.dv - 0.5) * (r2 - 0.5) * 0.05;

      ctx.height[i] = clamp01(stone * (0.7 + bulge + tilt + grain * 0.04 + fine * 0.015 - pits * 0.04) - chips * 0.12 + (1 - stone) * (0.12 + fine * 0.03));

      // Stone colour: tone per block, warm/cool/grey hue families, mottling.
      mixRGB(C.dark, C.light, clamp01(0.45 + (r1 - 0.5) * 0.6 + grain * 0.18 + fine * 0.06), col);
      const fam = r2 < 0.33 ? C.warm : r2 < 0.66 ? C.cool : C.grey;
      mixRGB(col, fam, 0.35, col);
      const mottle = N.fbm(u + r3, v, 16, 3);
      col[0] *= 1 + mottle * 0.08; col[1] *= 1 + mottle * 0.08; col[2] *= 1 + mottle * 0.07;
      // Soot / rain streaks running down the wall.
      const streak = smoothstep(0.45, 0.95, N.perlin(u * 18, v * 2, 18, 2) * 0.5 + 0.5 + detail.fbm(u, v, 12, 2) * 0.25);
      mixRGB(col, C.grime, streak * 0.18 + pits * 0.3 + chips * 0.25, col);
      // Lime mortar, dirtier near the stone.
      if (stone < 1) {
        mixRGB(C.mortar, C.mortarDark, clamp01(0.3 + fine * 0.6 + streak * 0.3), tmp);
        mixRGB(tmp, col, stone, col);
      }
      // Moss colonising the joints.
      const mossField = mossN.fbm01(u, v, 5, 4);
      const joint = 1 - smoothstep(0, mortarW + ARRIS * 1.5, edge);
      const mossMask = clamp01(joint * smoothstep(0.55, 0.72, mossField) * (0.7 + fine * 0.6));
      mixRGB(col, C.moss, mossMask * 0.85, col);
      ctx.height[i] += mossMask * 0.04;
      ctx.setAlbedo(i, col);

      ctx.rough[i] = clamp01(0.8 + grain * 0.06 + (1 - stone) * 0.12 + mossMask * 0.06 - streak * 0.05);
    });
  },
};
