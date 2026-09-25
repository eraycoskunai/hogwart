/**
 * @file Shelf of old leather-bound books seen spine-on: varied widths and
 * heights, coloured leather with grain and scuffs, raised bands, gilt
 * tooling and title labels, dark shelf back above the books.
 * One tile = one shelf row; tiles horizontally.
 */
import { smoothstep, clamp01, hash2i } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const LEATHER = ['#6e1d1a', '#1f3b2a', '#1d2a4a', '#5a3a22', '#2a2320', '#4a1f35', '#7a5a2a', '#3a4a4f'].map(hex);
const GILT = hex('#c9a24a');
const LABEL = hex('#d8c9a3');
const SHELF_BACK = hex('#1a120c');

/** Precompute book boundaries across the tile. */
function layout(seed) {
  const books = [];
  let x = 0;
  let k = 0;
  while (x < 1) {
    const h = hash2i(k, 3, seed);
    const w = 0.022 + ((h & 255) / 255) * 0.045;
    books.push({ x0: x, x1: Math.min(1, x + w), h, top: 0.62 + (((h >>> 8) & 255) / 255) * 0.3 });
    x += w;
    k++;
  }
  // Stretch the last book so the row closes exactly at u = 1 (seamless).
  books[books.length - 1].x1 = 1;
  return books;
}

export default {
  id: 'books',
  label: 'Deri ciltli kitaplar',
  category: 'Kumaş ve deri',
  /** Tiles horizontally only (one shelf row). */
  tiling: 'u',
  normalStrength: 5,
  aoStrength: 3,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(61);
    const books = layout(ctx.seed);
    const col = [0, 0, 0];
    const metal = ctx.useMetal();
    let bi = 0;
    ctx.each((i, u, v, x) => {
      if (x === 0) bi = 0;
      while (bi < books.length - 1 && u >= books[bi].x1) bi++;
      const b = books[bi];
      const h = b.h;
      const lx = (u - b.x0) / (b.x1 - b.x0); // 0..1 across the spine
      const top = b.top;
      if (v > top) {
        // Shelf back / gap above the books.
        mixRGB(SHELF_BACK, SHELF_BACK, 0, col);
        const shade = 0.7 + d.fbm(u, v, 16, 2) * 0.2;
        col[0] *= shade; col[1] *= shade; col[2] *= shade;
        ctx.setAlbedo(i, col);
        ctx.height[i] = 0.05;
        ctx.rough[i] = 0.9;
        return;
      }
      const lv = v / top; // 0 bottom .. 1 top of the book
      const round = Math.sin(lx * Math.PI); // spine curvature
      const leather = LEATHER[h % LEATHER.length];
      const grain = d.fbm(u, v, 128, 2);
      const scuff = smoothstep(0.6, 0.85, N.fbm01(u + (h & 7), v, 12, 3));
      mixRGB(leather, leather, 0, col);
      const lum = 0.75 + round * 0.3 + grain * 0.08 + scuff * 0.2;
      col[0] *= lum; col[1] *= lum; col[2] *= lum;

      // Raised bands (hubs) across the spine.
      const bandCount = 3 + (h >>> 20) % 3;
      let band = 0;
      for (let k = 1; k <= bandCount; k++) {
        const bp = 0.12 + (k / (bandCount + 1)) * 0.76;
        band = Math.max(band, 1 - smoothstep(0.004, 0.012, Math.abs(lv - bp)));
      }
      // Gilt lines beside the bands and a title label.
      const giltLine = (1 - smoothstep(0.002, 0.005, Math.abs(Math.abs(lv - 0.5) - 0.28))) * ((h >>> 12) & 1);
      const labelOn = ((h >>> 13) & 3) !== 0;
      const inLabel = labelOn && Math.abs(lv - 0.7) < 0.06 && lx > 0.18 && lx < 0.82;
      const letters = inLabel ? smoothstep(0.55, 0.7, d.perlin(u * 220, v * 60, 220, 60) * 0.5 + 0.5) * (Math.abs(lv - 0.7) < 0.025 ? 1 : 0) : 0;
      if (inLabel) {
        const labelCol = ((h >>> 15) & 1) ? LABEL : GILT;
        mixRGB(col, labelCol, 0.9, col);
        mixRGB(col, leather, letters * 0.8, col);
      }
      const gilt = clamp01(giltLine + band * 0.35 * ((h >>> 16) & 1));
      mixRGB(col, GILT, gilt, col);
      // Book edges darken.
      const edge = smoothstep(0, 0.08, lx) * smoothstep(0, 0.08, 1 - lx);
      col[0] *= 0.55 + edge * 0.45; col[1] *= 0.55 + edge * 0.45; col[2] *= 0.55 + edge * 0.45;
      ctx.setAlbedo(i, col);

      ctx.height[i] = clamp01(0.45 + round * 0.3 + band * 0.12 + grain * 0.02 - letters * 0.03);
      metal[i] = inLabel && !((h >>> 15) & 1) ? 0.9 : gilt * 0.9;
      ctx.rough[i] = clamp01(0.62 - scuff * 0.15 + grain * 0.05 - (inLabel ? 0.2 : 0) - gilt * 0.3);
    });
  },
};
