/**
 * @file Glowing magical ink: flowing cursive-like strokes (random Bézier
 * scribbles laid out in lines) with a bright core and soft glow halo on a
 * transparent background. Variants: 'gold' (default), 'teal', 'violet'.
 */
import { clamp01, hash2i } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const INKS = {
  gold: { core: hex('#fff2c2'), glow: hex('#e0a83a') },
  teal: { core: hex('#d8fff6'), glow: hex('#2fc4b0') },
  violet: { core: hex('#f3e2ff'), glow: hex('#9a4ae0') },
};
const LINES = 7;

export default {
  id: 'magicInk',
  label: 'Sihirli mürekkep',
  category: 'Işık ve büyü',
  variants: ['gold', 'teal', 'violet'],
  tiling: false,
  normalStrength: 0,
  aoStrength: 0,
  generate(ctx) {
    const P = INKS[ctx.variant] ?? INKS.gold;
    const s = ctx.seed;
    const stroke = (g, size, width, blur) => {
      g.strokeStyle = '#fff';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = width;
      if (blur) {
        g.shadowColor = '#fff';
        g.shadowBlur = blur;
      }
      for (let line = 0; line < LINES; line++) {
        const y = size * (0.14 + line * 0.11);
        let x = size * 0.08;
        let k = 0;
        g.beginPath();
        g.moveTo(x, y);
        while (x < size * 0.9) {
          const h = hash2i(line, k++, s);
          const w = size * (0.015 + ((h & 255) / 255) * 0.03);
          const up = size * (0.015 + (((h >>> 8) & 255) / 255) * 0.035);
          g.bezierCurveTo(x + w * 0.3, y - up, x + w * 0.9, y - up, x + w, y + size * 0.004);
          x += w;
          // word gaps
          if (((h >>> 16) & 7) === 0) {
            x += size * 0.02;
            g.moveTo(x, y);
          }
        }
        g.stroke();
      }
    };
    const core = ctx.canvasMask((g, size) => stroke(g, size, size * 0.004, 0));
    const glow = ctx.canvasMask((g, size) => stroke(g, size, size * 0.01, size * 0.02));
    const col = [0, 0, 0];
    const alpha = ctx.useAlpha();
    ctx.each((i) => {
      const c = core ? core[i] : 0;
      const gl = glow ? glow[i] : 0;
      mixRGB(P.glow, P.core, c, col);
      ctx.setAlbedo(i, col);
      ctx.setEmissive(i, col, clamp01(c + gl * 0.8));
      alpha[i] = clamp01(c + gl * 0.7);
      ctx.height[i] = 0.5;
      ctx.rough[i] = 1;
    });
  },
};
