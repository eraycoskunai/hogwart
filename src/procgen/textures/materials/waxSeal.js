/**
 * @file Sealing wax: an irregular poured blob (alpha) with a raised rim, a
 * pressed stamp (shield with crossed wands and stars) and glossy highlights.
 * Variants: 'red' (default), 'green', 'gold'.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const WAX = {
  red: { base: hex('#8a1414'), light: hex('#c0302a'), dark: hex('#4a0808') },
  green: { base: hex('#1e5a2e'), light: hex('#3a8a4a'), dark: hex('#0c2a14') },
  gold: { base: hex('#a0782a'), light: hex('#d8ad4a'), dark: hex('#5a3e10') },
};

export default {
  id: 'waxSeal',
  label: 'Mühür mumu',
  category: 'Kâğıt',
  variants: ['red', 'green', 'gold'],
  tiling: false,
  normalStrength: 6,
  aoStrength: 2,
  generate(ctx) {
    const W = WAX[ctx.variant] ?? WAX.red;
    const { N } = ctx;
    const stamp = ctx.canvasMask((g, s) => {
      g.fillStyle = '#fff';
      g.strokeStyle = '#fff';
      const cx = s / 2, cy = s / 2;
      // ring
      g.lineWidth = s * 0.025;
      g.beginPath();
      g.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
      g.stroke();
      // shield
      g.beginPath();
      g.moveTo(cx - s * 0.13, cy - s * 0.16);
      g.lineTo(cx + s * 0.13, cy - s * 0.16);
      g.lineTo(cx + s * 0.13, cy + s * 0.02);
      g.quadraticCurveTo(cx + s * 0.12, cy + s * 0.15, cx, cy + s * 0.2);
      g.quadraticCurveTo(cx - s * 0.12, cy + s * 0.15, cx - s * 0.13, cy + s * 0.02);
      g.closePath();
      g.lineWidth = s * 0.018;
      g.stroke();
      // crossed wands
      g.lineCap = 'round';
      g.lineWidth = s * 0.02;
      g.beginPath();
      g.moveTo(cx - s * 0.08, cy + s * 0.1);
      g.lineTo(cx + s * 0.08, cy - s * 0.1);
      g.moveTo(cx + s * 0.08, cy + s * 0.1);
      g.lineTo(cx - s * 0.08, cy - s * 0.1);
      g.stroke();
      // stars around the ring
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.beginPath();
        g.arc(cx + Math.cos(a) * s * 0.24, cy + Math.sin(a) * s * 0.24, s * 0.012, 0, Math.PI * 2);
        g.fill();
      }
    });
    const col = [0, 0, 0];
    const alpha = ctx.useAlpha();
    ctx.each((i, u, v) => {
      const dx = u - 0.5, dy = v - 0.5;
      const ang = Math.atan2(dy, dx);
      const r = Math.sqrt(dx * dx + dy * dy);
      const blobR = 0.4 + N.torus(ang / (Math.PI * 2) + 0.5, 0.5, 6, 3) * 0.05;
      const inside = smoothstep(blobR, blobR - 0.01, r);
      const rim = smoothstep(0.26, 0.33, r) * smoothstep(blobR, blobR - 0.05, r);
      const dome = Math.sqrt(clamp01(1 - (r / blobR) ** 2));
      const st = stamp ? stamp[i] : 0;
      const pressed = r < 0.33 ? 1 : 0;
      const h = inside * (0.3 + dome * 0.25 + rim * 0.25 - pressed * 0.12 + st * 0.08 * pressed);
      ctx.height[i] = clamp01(h);
      mixRGB(W.dark, W.base, clamp01(0.5 + dome * 0.4 + rim * 0.3), col);
      mixRGB(col, W.light, rim * 0.35 + st * 0.2, col);
      ctx.setAlbedo(i, col);
      alpha[i] = inside;
      ctx.rough[i] = clamp01(0.22 + st * 0.15 + (1 - rim) * 0.05);
    });
  },
};
