/**
 * @file Parchment: warm vellum with fibres, blotchy ageing, tea-ring stains,
 * faint ruled lines and (variant 'sheet') darkened, ragged edges with alpha.
 * Variant 'tile' is seamless for large surfaces.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = {
  light: hex('#f0e2bf'),
  base: hex('#e0c994'),
  aged: hex('#b8935a'),
  stain: hex('#9a7040'),
  edge: hex('#6b4a28'),
  ink: hex('#6a5a48'),
};

export default {
  id: 'parchment',
  label: 'Parşömen',
  category: 'Kâğıt',
  variants: ['sheet', 'tile'],
  tiling: false,
  normalStrength: 2,
  aoStrength: 1.5,
  generate(ctx) {
    const sheet = ctx.variant !== 'tile';
    const { N } = ctx;
    const d = N.fork(191);
    const col = [0, 0, 0];
    const alpha = sheet ? ctx.useAlpha() : null;
    ctx.each((i, u, v) => {
      const blotch = N.fbm01(u, v, 3, 5);
      const fibre = d.perlin(u * 90, v * 12, 90, 12) * 0.5 + 0.5;
      const fibre2 = d.perlin(u * 14 + 3, v * 110, 14, 110) * 0.5 + 0.5;
      const ring = N.worley(u, v, 3, 3, 1, 0, false);
      const ringR = 0.07 + ((ring.id & 255) / 255) * 0.05;
      const stainRing = (1 - smoothstep(0.0, 0.01, Math.abs(ring.f1 - ringR))) * ((ring.id >>> 8) & 1) * 0.6;
      mixRGB(C.light, C.base, clamp01(blotch * 1.1), col);
      mixRGB(col, C.aged, smoothstep(0.55, 0.85, blotch) * 0.6, col);
      mixRGB(col, C.stain, stainRing, col);
      const f = (fibre - 0.5) * 0.06 + (fibre2 - 0.5) * 0.05;
      col[0] += f; col[1] += f; col[2] += f;
      // Faint ruled lines.
      const ruled = sheet ? (1 - smoothstep(0.0, 0.0015, Math.abs(((v * 24) % 1) - 0.5) / 24)) * smoothstep(0.1, 0.12, u) * smoothstep(0.1, 0.12, 1 - u) * 0.12 : 0;
      mixRGB(col, C.ink, ruled, col);
      let e = 1;
      if (sheet) {
        const rag = N.fbm(u, v, 12, 4) * 0.025;
        const border = Math.min(u, 1 - u, v, 1 - v) + rag;
        e = smoothstep(0.0, 0.08, border);
        mixRGB(C.edge, col, clamp01(0.35 + e * 0.65), col);
        alpha[i] = smoothstep(0.005, 0.012, border);
      }
      ctx.setAlbedo(i, col);
      ctx.height[i] = clamp01(0.5 + (fibre - 0.5) * 0.05 + blotch * 0.08 - (1 - e) * 0.1);
      ctx.rough[i] = clamp01(0.82 + blotch * 0.08);
    });
  },
};
