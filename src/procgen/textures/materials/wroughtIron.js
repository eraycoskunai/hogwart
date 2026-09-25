/**
 * @file Wrought iron: hammer-dimpled dark metal with forge scale, a bluish
 * sheen on raised spots and rust creeping into the hollows.
 */
import { smoothstep, clamp01 } from '../noise.js';
import { hex, mixRGB } from '../pipeline.js';

const C = {
  iron: hex('#2e2f33'),
  sheen: hex('#4a5058'),
  scale: hex('#1a1a1c'),
  rust: hex('#7a3d1c'),
  rustLight: hex('#a3582a'),
};

export default {
  id: 'wroughtIron',
  label: 'Dövme demir',
  category: 'Metal',
  normalStrength: 4,
  aoStrength: 2.5,
  generate(ctx) {
    const { N } = ctx;
    const d = N.fork(111);
    const col = [0, 0, 0];
    const metal = ctx.useMetal();
    ctx.each((i, u, v) => {
      const c = N.worley(u, v, 14, 14, 0.9, 0, false);
      const dimple = smoothstep(0, 0.05, c.f1) * 0.6 + 0.4; // centre of hammer blow = low (shallow)
      const scale = smoothstep(0.55, 0.75, d.fbm01(u, v, 16, 4));
      const h = clamp01(0.45 + dimple * 0.25 + d.fbm(u, v, 32, 3) * 0.05);
      const rust = smoothstep(0.6, 0.8, N.fbm01(u + 0.4, v, 5, 5) + (0.5 - h) * 0.8);
      ctx.height[i] = clamp01(h + rust * 0.05);
      mixRGB(C.iron, C.sheen, clamp01(0.3 + d.fbm(u, v, 6, 3) * 0.6 + (dimple - 0.7) * 0.4), col);
      mixRGB(col, C.scale, scale * 0.6, col);
      mixRGB(col, rust > 0.5 ? C.rustLight : C.rust, rust, col);
      ctx.setAlbedo(i, col);
      metal[i] = clamp01(0.85 - scale * 0.3 - rust);
      ctx.rough[i] = clamp01(0.5 + scale * 0.25 + rust * 0.4 - (dimple - 0.7) * 0.15);
    });
  },
};
