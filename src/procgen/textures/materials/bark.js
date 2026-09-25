/**
 * @file Tree bark: deep vertical furrows (ridged, stretched along V),
 * plated ridges, fine fibres, moss in the furrows and grey-green lichen.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = {
  ridge: hex('#6e5e4c'),
  ridgeLight: hex('#8d7d68'),
  furrow: hex('#2b221a'),
  moss: hex('#4e5c2a'),
  lichen: hex('#9aa38a'),
};

export default {
  id: 'bark',
  label: 'Ağaç kabuğu',
  category: 'Doğa',
  normalStrength: 10,
  aoStrength: 4,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(51);
    const col = [0, 0, 0];
    ctx.each((i, u, v) => {
      // Stretched (anisotropic) lattice: 10 columns across, 3 rows down.
      const wx = d.perlin(u * 4, v * 4, 4, 4) * 0.06;
      let r = 0;
      let amp = 0.6;
      let fx = 10;
      let fy = 2;
      for (let o = 0; o < 4; o++) {
        const n = 1 - Math.abs(N.perlin((u + wx) * fx + o * 3.1, v * fy + o * 7.7, fx, fy));
        r += n * n * amp;
        amp *= 0.5;
        fx *= 2;
        fy *= 2;
      }
      const ridge = clamp01(r);
      // Horizontal plate breaks.
      const plates = smoothstep(0.45, 0.55, d.perlin(u * 6, v * 12, 6, 12) * 0.5 + 0.5) * 0.15;
      const fibres = d.perlin(u * 80, v * 8, 80, 8) * 0.5 + 0.5;
      const h = clamp01(ridge - plates + fibres * 0.05);
      ctx.height[i] = h;

      mixRGB(C.furrow, C.ridge, smoothstep(0.2, 0.65, h), col);
      mixRGB(col, C.ridgeLight, smoothstep(0.65, 0.95, h) * (0.5 + fibres * 0.5), col);
      const moss = smoothstep(0.55, 0.75, d.fbm01(u, v, 5, 3)) * (1 - smoothstep(0.2, 0.5, h));
      mixRGB(col, C.moss, moss * 0.85, col);
      const lichen = smoothstep(0.68, 0.78, N.fbm01(u + 0.4, v, 9, 3)) * smoothstep(0.5, 0.7, h);
      mixRGB(col, C.lichen, lichen * 0.7, col);
      ctx.setAlbedo(i, col);
      ctx.rough[i] = clamp01(0.9 + (1 - h) * 0.08);
    });
  },
};
