/**
 * @file House tapestries / banners: woven field in house colours, patterned
 * border, embroidered metallic-thread animal silhouette, fringe at the
 * bottom (alpha). Variants: 'lion', 'badger', 'eagle', 'snake'.
 * Not tiling: map once onto a hanging quad.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';
import { ANIMALS } from './heraldry.js';

const HOUSES = {
  lion: { field: hex('#7c1219'), accent: hex('#d8ad3f'), metal: 0.75 },
  badger: { field: hex('#d9ae2e'), accent: hex('#1b1814'), metal: 0 },
  eagle: { field: hex('#1d2f6a'), accent: hex('#b77d3e'), metal: 0.75 },
  snake: { field: hex('#1c4a2c'), accent: hex('#c3c7cc'), metal: 0.8 },
};
const FRINGE = 0.06;
const FRINGE_STRANDS = 60;

export default {
  id: 'tapestry',
  label: 'Goblen / sancak',
  category: 'Kumaş ve deri',
  variants: ['lion', 'badger', 'eagle', 'snake'],
  tiling: false,
  normalStrength: 3,
  aoStrength: 2,
  generate(ctx) {
    const kind = HOUSES[ctx.variant] ? ctx.variant : 'lion';
    const H = HOUSES[kind];
    const { N } = ctx;
    const draw = ANIMALS[kind];
    const figure = ctx.canvasMask((g, size) => {
      g.fillStyle = '#fff';
      g.strokeStyle = '#fff';
      draw(g, size * 0.5, size * 0.47, size * 0.36);
    });
    const outline = ctx.canvasMask((g, size) => {
      g.fillStyle = '#fff';
      g.strokeStyle = '#fff';
      g.shadowColor = '#fff';
      g.shadowBlur = size * 0.012;
      g.lineWidth = size * 0.01;
      for (let k = 0; k < 3; k++) draw(g, size * 0.5, size * 0.47, size * 0.36);
    });
    const col = [0, 0, 0];
    const dark = [H.field[0] * 0.45, H.field[1] * 0.45, H.field[2] * 0.45];
    const alpha = ctx.useAlpha();
    const metal = ctx.useMetal();
    ctx.each((i, u, v, x, y) => {
      const T = 160;
      const tx = u * T, ty = v * T;
      const fx = tx - Math.floor(tx), fy = ty - Math.floor(ty);
      const weave = ((Math.floor(tx) + Math.floor(ty)) & 1) ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI);
      const fold = N.fbm(u, v, 3, 3);

      // Fringe: bottom strip (v small) becomes separate threads.
      const fringeZone = v < FRINGE;
      if (fringeZone) {
        const strand = Math.sin(u * Math.PI * 2 * FRINGE_STRANDS) * 0.5 + 0.5;
        alpha[i] = smoothstep(0.35, 0.6, strand) * smoothstep(0, 0.02, v - (N.value(u, 0.5, 64) * 0.03));
        mixRGB(H.accent, H.accent, 0, col);
        ctx.setAlbedo(i, col);
        ctx.height[i] = 0.5 + strand * 0.2;
        ctx.rough[i] = 0.8;
        metal[i] = H.metal * 0.6;
        return;
      }

      // Border: outer band with diamond pattern.
      const bu = Math.min(u, 1 - u);
      const bv = Math.min(v - FRINGE, 1 - v);
      const bd = Math.min(bu, bv);
      const inBorder = bd < 0.075;
      const diamond = Math.abs(((u + v) * 24) % 1 - 0.5) + Math.abs(((u - v) * 24 + 10) % 1 - 0.5) < 0.35;
      const innerLine = Math.abs(bd - 0.09) < 0.006;

      const fig = figure ? figure[i] : 0;
      const out = outline ? clamp01(outline[i] - fig) : 0;
      let accent = 0;
      if (inBorder) accent = diamond ? 1 : 0.15;
      if (innerLine) accent = 1;
      accent = Math.max(accent, fig);

      mixRGB(H.field, H.accent, accent, col);
      mixRGB(col, dark, out * 0.9, col);
      const shade = 0.82 + weave * 0.18 + fold * 0.1;
      col[0] *= shade; col[1] *= shade; col[2] *= shade;
      ctx.setAlbedo(i, col);
      ctx.height[i] = clamp01(0.45 + weave * 0.12 + fold * 0.15 + fig * 0.08);
      metal[i] = accent * H.metal;
      ctx.rough[i] = clamp01(0.88 - accent * H.metal * 0.45 + (1 - weave) * 0.05);
      alpha[i] = 1;
    });
  },
};
