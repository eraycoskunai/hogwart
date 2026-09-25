/**
 * @file Stained glass: irregular panes separated by lead came (Voronoi
 * borders), jewel colours with thickness variation, seeds (bubbles) and
 * streaks. Alpha = translucency; emissive = backlit glow colour.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const GLASS = ['#9b1b22', '#1d3e8c', '#1f6b3a', '#c98a1c', '#5b2a7a', '#d9c98f', '#b0421c', '#2c7c8a'].map(hex);
const LEAD = hex('#2a2b2d');

export default {
  id: 'stainedGlass',
  label: 'Vitray',
  category: 'Cam',
  normalStrength: 4,
  aoStrength: 1.5,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(131);
    const col = [0, 0, 0];
    const metal = ctx.useMetal();
    const alpha = ctx.useAlpha();
    const w = [0, 0];
    ctx.each((i, u, v) => {
      N.warp(u, v, 4, 0.01, 2, w);
      const c = N.worley(u + w[0], v + w[1], 5, 5, 0.75, 0.5, true);
      const id = c.id;
      const edge = c.edge; // copy before the bubble query reuses the result object
      const leadW = 0.009;
      const glass = smoothstep(leadW, leadW + 0.004, edge);
      const thick = d.fbm(u, v, 12, 4);
      const bubble = N.worley(u, v, 90, 90, 1, 0, false).f1;
      const seed = (1 - smoothstep(0.0008, 0.0022, bubble)) * glass * smoothstep(0.6, 0.8, d.value(u, v, 30));
      const streak = d.perlin(u * 40, v * 4, 40, 4) * 0.5 + 0.5;
      const g = GLASS[id % GLASS.length];
      const lum = 0.75 + thick * 0.25 + streak * 0.12;
      col[0] = g[0] * lum; col[1] = g[1] * lum; col[2] = g[2] * lum;
      mixRGB(col, [1, 1, 1], seed * 0.5, col);
      // Emissive: the glow of backlit glass (lead stays dark).
      ctx.setEmissive(i, col, glass);
      mixRGB(LEAD, col, glass, col);
      ctx.setAlbedo(i, col);
      // Came is a rounded raised channel.
      const came = 1 - glass;
      ctx.height[i] = clamp01(0.4 + came * 0.35 * Math.sin(clamp01(edge / leadW) * Math.PI * 0.5 + Math.PI * 0.5) + thick * 0.05 - seed * 0.05);
      metal[i] = came * 0.6;
      ctx.rough[i] = clamp01(glass * (0.08 + streak * 0.06) + came * 0.55);
      alpha[i] = came > 0.5 ? 1 : 0.55 + thick * 0.15;
    });
  },
};
