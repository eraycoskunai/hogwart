/**
 * @file Ornamental wool carpet: repeating medallion motifs (diamond rings,
 * eight-point stars, corner rosettes) in deep red, navy, gold and cream,
 * velvety pile and worn, flattened traffic paths.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = {
  field: hex('#6a1717'),
  navy: hex('#1b2342'),
  gold: hex('#b78a3b'),
  cream: hex('#d6c7a0'),
  worn: hex('#8a5a4a'),
};
const MOTIFS = 2;

export default {
  id: 'carpet',
  label: 'Halı',
  category: 'Kumaş ve deri',
  normalStrength: 2,
  aoStrength: 1.5,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(91);
    const col = [0, 0, 0];
    ctx.each((i, u, v) => {
      const mx = (u * MOTIFS) % 1 - 0.5;
      const my = (v * MOTIFS) % 1 - 0.5;
      const ax = Math.abs(mx), ay = Math.abs(my);
      const dia = ax + ay; // diamond distance
      const ang = Math.atan2(my, mx);
      const r = Math.sqrt(mx * mx + my * my);
      const star = r * (0.8 + 0.2 * Math.cos(ang * 8));

      let c = C.field;
      if (dia < 0.12) c = C.cream;
      if (star < 0.07) c = C.gold;
      if (dia > 0.2 && dia < 0.23) c = C.gold;
      if (dia > 0.26 && dia < 0.33) c = C.navy;
      if (dia > 0.29 && dia < 0.30) c = C.cream;
      // corner rosettes (where four motifs meet)
      const cr = Math.sqrt((ax - 0.5) ** 2 + (ay - 0.5) ** 2);
      if (cr < 0.1) c = C.navy;
      if (cr < 0.05) c = C.gold;
      mixRGB(c, c, 0, col);

      const pile = d.fbm(u, v, 256, 2);
      const tuft = d.value(u, v, 512);
      const wear = smoothstep(0.5, 0.8, N.fbm01(u, v, 2, 4));
      mixRGB(col, C.worn, wear * 0.35, col);
      const lum = 0.85 + pile * 0.12 + tuft * 0.08;
      col[0] *= lum; col[1] *= lum; col[2] *= lum;
      ctx.setAlbedo(i, col);
      ctx.height[i] = clamp01(0.55 + pile * 0.1 + tuft * 0.08 - wear * 0.15);
      ctx.rough[i] = clamp01(0.95 - wear * 0.1);
    });
  },
};
