/**
 * @file Foliage card: a cluster of lobed leaves at varied angles and shades
 * with midrib and side veins, on a transparent background (alpha-tested).
 * Use on crossed quads for tree canopies and bushes.
 */
import { clamp01, hash2i } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const GREENS = ['#2f5a1f', '#3f6e25', '#4f7f2c', '#5f8a33', '#6d7f2a', '#3a4f1d'].map(hex);
const LEAF_COUNT = 34;

export default {
  id: 'leaves',
  label: 'Yaprak',
  category: 'Doğa',
  tiling: false,
  normalStrength: 4,
  aoStrength: 2,
  generate(ctx) {
    const s = ctx.seed;
    const size = ctx.size;
    const leaves = [];
    for (let k = 0; k < LEAF_COUNT; k++) {
      const h = hash2i(k, 17, s);
      const h2 = hash2i(k, 29, s);
      const r = Math.sqrt((h & 1023) / 1023) * 0.36;
      const a = ((h >>> 10) & 1023) / 1023 * Math.PI * 2;
      leaves.push({
        x: 0.5 + Math.cos(a) * r,
        y: 0.5 + Math.sin(a) * r,
        rot: ((h2 & 1023) / 1023) * Math.PI * 2,
        len: 0.09 + ((h2 >>> 10) & 255) / 255 * 0.05,
        col: GREENS[(h2 >>> 18) % GREENS.length],
        shade: 0.8 + ((h >>> 20) & 255) / 255 * 0.35,
      });
    }
    // Paint leaves back to front into an id buffer using an analytic lobed shape.
    const idBuf = new Int16Array(ctx.n).fill(-1);
    const localX = new Float32Array(ctx.n);
    const localY = new Float32Array(ctx.n);
    for (let k = 0; k < leaves.length; k++) {
      const L = leaves[k];
      const ext = L.len * 1.1;
      const x0 = Math.max(0, Math.floor((L.x - ext) * size));
      const x1 = Math.min(size - 1, Math.ceil((L.x + ext) * size));
      const y0 = Math.max(0, Math.floor((L.y - ext) * size));
      const y1 = Math.min(size - 1, Math.ceil((L.y + ext) * size));
      const c = Math.cos(L.rot), sn = Math.sin(L.rot);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = (x + 0.5) / size - L.x;
          const dy = (y + 0.5) / size - L.y;
          const ax = (dx * c + dy * sn) / L.len; // along the leaf, -1 .. 1
          const ay = (-dx * sn + dy * c) / L.len;
          if (ax < -1 || ax > 1) continue;
          const t = (ax + 1) * 0.5;
          // Width profile: ovate with gentle lobes.
          const width = Math.sin(t * Math.PI) ** 0.8 * 0.42 * (1 + 0.12 * Math.sin(t * Math.PI * 7));
          if (Math.abs(ay) <= width) {
            const i = y * size + x;
            idBuf[i] = k;
            localX[i] = t;
            localY[i] = width > 0 ? ay / width : 0;
          }
        }
      }
    }
    const alpha = ctx.useAlpha();
    const col = [0, 0, 0];
    ctx.each((i) => {
      const k = idBuf[i];
      if (k < 0) {
        alpha[i] = 0;
        ctx.setAlbedo(i, GREENS[0]);
        ctx.height[i] = 0;
        ctx.rough[i] = 1;
        return;
      }
      const L = leaves[k];
      const t = localX[i];
      const w = localY[i];
      const midrib = 1 - clamp01(Math.abs(w) * 12);
      const veinPhase = (t * 7 - Math.abs(w) * 1.6) % 1;
      const vein = clamp01(1 - Math.abs(veinPhase - 0.5) * 16) * (1 - Math.abs(w)) * 0.8;
      const cup = 1 - w * w; // leaf surface curvature
      mixRGB(L.col, [L.col[0] * 1.35, L.col[1] * 1.3, L.col[2] * 1.1], midrib * 0.6 + vein * 0.35, col);
      const lum = L.shade * (0.8 + cup * 0.25);
      col[0] *= lum; col[1] *= lum; col[2] *= lum;
      ctx.setAlbedo(i, col);
      alpha[i] = 1;
      ctx.height[i] = clamp01(0.4 + cup * 0.3 + (k / LEAF_COUNT) * 0.2 - vein * 0.05 - midrib * 0.05);
      ctx.rough[i] = clamp01(0.55 + (1 - cup) * 0.2);
    });
  },
};
