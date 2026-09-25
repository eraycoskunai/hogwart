/**
 * @file Wooden parquet floor in a basket-weave pattern: squares of four
 * strips whose direction alternates, each strip with its own tone and grain,
 * fine seams and a polished but scuffed finish.
 */
import { smoothstep, clamp01, hash2i } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const SQUARES = 4;
const STRIPS = 4;
const C = {
  light: hex('#b88453'),
  mid: hex('#95643a'),
  dark: hex('#6b4323'),
  seam: hex('#2b1b0f'),
};

export default {
  id: 'woodParquet',
  label: 'Ahşap parke',
  category: 'Ahşap',
  normalStrength: 2.5,
  aoStrength: 2,
  generate(ctx) {
    const { N } = ctx;
    const g = N.fork(41);
    const col = [0, 0, 0];
    const s = ctx.seed;
    ctx.each((i, u, v) => {
      const sx = u * SQUARES;
      const sy = v * SQUARES;
      const qi = Math.floor(sx);
      const qj = Math.floor(sy);
      const lx = sx - qi;
      const ly = sy - qj;
      const horizontal = ((qi + qj) & 1) === 0;
      const stripF = (horizontal ? ly : lx) * STRIPS;
      const strip = Math.floor(stripF);
      const across = stripF - strip;
      const along = horizontal ? lx : ly;
      const h = hash2i(qi * 8 + strip, qj, s);
      const r1 = (h & 255) / 255;
      const r2 = ((h >>> 8) & 255) / 255;

      // Grain runs along the strip: evaluate anisotropic noise in strip space.
      const gu = horizontal ? u : v;
      const gv = horizontal ? v : u;
      const grain = g.perlin(gu * 8 + r1 * 5, gv * 160, 8, 160) * 0.5 + 0.5;
      const rings = Math.sin((across * 3 + g.perlin(gu * 4, gv * 40, 4, 40) * 0.6 + r2 * 10) * Math.PI * 2) * 0.5 + 0.5;

      const seam = Math.min(
        smoothstep(0, 0.04, across), smoothstep(0, 0.04, 1 - across),
        smoothstep(0, 0.012, along), smoothstep(0, 0.012, 1 - along),
      );
      const tone = clamp01(0.25 + r1 * 0.55 + (grain - 0.5) * 0.4);
      if (tone < 0.5) mixRGB(C.dark, C.mid, tone * 2, col);
      else mixRGB(C.mid, C.light, (tone - 0.5) * 2, col);
      const ring = smoothstep(0.8, 1, rings);
      mixRGB(col, C.dark, ring * 0.3, col);
      mixRGB(C.seam, col, seam, col);
      ctx.setAlbedo(i, col);

      ctx.height[i] = clamp01(seam * (0.7 + grain * 0.03 - ring * 0.02));
      const scuff = smoothstep(0.55, 0.85, N.fbm01(u, v, 8, 4));
      ctx.rough[i] = clamp01(0.3 + scuff * 0.3 + ring * 0.05 + (1 - seam) * 0.5);
    });
  },
};
