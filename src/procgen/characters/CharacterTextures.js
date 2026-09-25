/**
 * @file CharacterTextures — per-character canvas textures: the painted
 * face (skin tone, redness, lips, brows, eyelid crease, freckles, nostrils,
 * hair-coloured scalp) plus flat skin patches, irises, a tileable hair
 * strand set, the clothing atlas (shirt, vest / sweater, trousers, skirt,
 * shoes, tie, gloves, pads) with its roughness map, knitted scarf stripes
 * and wand wood grain.
 */
import * as THREE from 'three';
import { Noise, hash2i, clamp01, smoothstep } from '../textures/noise.js';
import { hex, mixRGB, createCanvas, normalFromHeight } from '../textures/pipeline.js';
import { HEAD, HAIR, FACE_UV, CLOTH_UV, CHARACTER_TEXTURES, HOUSES, CLOTH_COLORS, SCARF } from '../../data/character.js';
import { gridTheta, gridPhi, sampleGridRadius } from './HeadGenerator.js';
import { hairlineY } from './Hairline.js';

const C = CHARACTER_TEXTURES;

/** Wrap a canvas as a texture. */
function canvasTexture(canvas, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const gauss2 = (dx, dy, s) => Math.exp(-(dx * dx + dy * dy) / (2 * s * s));

// ------------------------------------------------------------------ face

/**
 * Paint the face / scalp texture.
 * @param {{size:number, F:any, grid:any, style:any, tone:{base:string, red:string}, hair:string,
 *          freckles:number, seed:number}} o
 * @returns {THREE.CanvasTexture}
 */
export function paintFace(o) {
  const size = o.size;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const D = img.data;
  const N = new Noise(o.seed);
  const F = o.F;
  const s = F.s;
  const base = hex(o.tone.base);
  const red = hex(o.tone.red);
  const hair = hex(o.hair);
  const lum = 0.3 * base[0] + 0.59 * base[1] + 0.11 * base[2];
  // Lips: rosier on light skin, deeper on dark skin.
  const lip = mixRGB(red, [base[0] * 0.62, base[1] * 0.42, base[2] * 0.42], 0.35 + (1 - lum) * 0.3);
  const brow = mixRGB([hair[0] * 0.72, hair[1] * 0.7, hair[2] * 0.68], hex('#4a3322'), hair[0] > 0.6 ? 0.35 : 0.08);
  const freckle = mixRGB(base, hex('#8a4a26'), 0.55);
  const blush = mixRGB(base, red, 0.6).map((c) => Math.min(1, c * 1.04));
  const col = [0, 0, 0];

  const vMax = HEAD.vMax;
  const eyeX = F.eye.x;
  const eyeY = F.eye.y;
  const mouthY = F.lips.y;
  const cw = F.lips.corner;
  const lf = F.lips.fullness;
  const tip = F.nose.tip;
  const browBase = eyeY + F.browHeight;
  const browTh = F.browThickness;
  const style = o.style;
  const buzz = style.thickness.top < 0.004;
  const scalpAmount = buzz ? 0.62 : 1;
  const freckleCell = 0.0026 * s;

  const rowsHead = Math.floor(size * vMax);
  // Pre-sampled noise tables (per-texel fBm would dominate the paint time).
  const MN = 256;
  const mottle = new Float32Array(MN * MN);
  for (let y = 0; y < MN; y++) for (let x = 0; x < MN; x++) mottle[y * MN + x] = N.fbm(x / MN, y / MN, 24, 4) * 0.5;
  const SU = 512;
  const SV = 48;
  const strands = new Float32Array(SU * SV);
  for (let y = 0; y < SV; y++) for (let x = 0; x < SU; x++) strands[y * SU + x] = 0.8 + 0.3 * Math.abs(N.perlin((x / SU) * 180, (y / SV) * 12, 180, 12));
  const thetas = new Float32Array(size);
  const sinT = new Float32Array(size);
  const cosT = new Float32Array(size);
  const hairY = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    thetas[x] = gridTheta((x + 0.5) / size);
    sinT[x] = Math.sin(thetas[x]);
    cosT[x] = Math.cos(thetas[x]);
    hairY[x] = hairlineY(style, thetas[x], s);
  }
  const hairSoft = HAIR.edgeSoftness * s;

  for (let y = 0; y < rowsHead; y++) {
    const vt = (y + 0.5) / size;
    const vg = vt / vMax;
    const ph = gridPhi(vg);
    const sp = Math.sin(ph);
    const cp = Math.cos(ph);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const r = sampleGridRadius(o.grid, u, vg);
      const px = sp * sinT[x] * r;
      const py = cp * r;
      const pz = -sp * cosT[x] * r;
      const ax = Math.abs(px);
      const frontal = pz < -0.03 * s;

      // Skin base with blotchy variation.
      const m = mottle[((vt * MN) | 0) * MN + ((u * MN) | 0)];
      col[0] = base[0] * (1 + m * 0.07);
      col[1] = base[1] * (1 + m * 0.06);
      col[2] = base[2] * (1 + m * 0.05);

      if (frontal) {
        // Warm areas: cheeks, nose tip, chin, ears of the forehead.
        let rr = 0.2 * gauss2(ax - 0.036 * s, py + 0.014 * s, 0.015 * s);
        rr += 0.22 * gauss2(px, py - tip[1], 0.009 * s);
        rr += 0.1 * gauss2(px, py - (F.chin.c[1] + 0.004 * s), 0.012 * s);
        rr += 0.06 * gauss2(px, py - 0.05 * s, 0.03 * s);
        mixRGB(col, blush, Math.min(0.45, rr), col);

        // Upper eyelid crease / socket shading.
        const ex = ax - eyeX;
        const ey = py - eyeY;
        const rd = Math.sqrt(ex * ex + ey * ey);
        const nearEye = pz < F.eye.z - 0.004 * s ? 1 : 0;
        const crease = Math.exp(-(((rd - 0.0158 * s) / (0.0028 * s)) ** 2)) * (ey > -0.002 * s ? 1 : 0.2) * nearEye;
        col[0] *= 1 - crease * 0.12;
        col[1] *= 1 - crease * 0.16;
        col[2] *= 1 - crease * 0.1;

        // Lips.
        const xn = px / cw;
        if (Math.abs(xn) < 1.15 && pz < -0.07 * s) {
          const k = Math.max(0, 1 - xn * xn);
          const bow = 0.0012 * s * Math.exp(-(((Math.abs(px) - 0.0045 * s) / (0.003 * s)) ** 2)) - 0.0007 * s * Math.exp(-((px / (0.0025 * s)) ** 2));
          const upH = (0.0052 * s * lf + bow) * Math.pow(k, 0.55);
          const loH = 0.0066 * s * lf * Math.pow(k, 0.7);
          const dy = py - mouthY;
          const soft = 0.0009 * s;
          const inUp = dy >= 0 ? 1 - smoothstep(upH - soft, upH + soft, dy) : 0;
          const inLo = dy < 0 ? 1 - smoothstep(loH - soft, loH + soft, -dy) : 0;
          const lm = Math.max(inUp, inLo) * smoothstep(1.12, 0.9, Math.abs(xn));
          const shade = 1 - 0.18 * Math.exp(-((dy / (0.0012 * s)) ** 2));
          mixRGB(col, [lip[0] * shade, lip[1] * shade, lip[2] * shade], lm * 0.85, col);
        }

        // Brows: tapered arches with a hair-stroke texture.
        const bi = eyeX - 0.017 * s;
        const bo = eyeX + 0.022 * s;
        const t = (ax - bi) / (bo - bi);
        if (t > -0.12 && t < 1.12) {
          const tc = clamp01(t);
          const yb = browBase + (0.0168 + 0.0036 * Math.sin(Math.PI * Math.min(1, tc * 1.1))) * s - tc * tc * 0.004 * s;
          const th = (0.0049 - 0.0023 * tc) * s * browTh;
          const dy = Math.abs(py - yb);
          const ends = smoothstep(-0.1, 0.1, t) * (1 - smoothstep(0.9, 1.1, t));
          let bm = (1 - smoothstep(th * 0.3, th * 0.55, dy)) * ends;
          if (bm > 0) {
            const stroke = 0.55 + 0.45 * Math.abs(Math.sin((ax * 0.9 + (py - yb) * 1.6) / (0.00055 * s) + N.perlin(u * 64, vt * 64, 64, 64) * 2));
            bm *= stroke;
            mixRGB(col, brow, Math.min(1, bm * 0.95), col);
          }
        }

        // Freckles over the nose bridge and cheeks.
        if (o.freckles > 0.01 && pz < -0.06 * s) {
          const band = gauss2(ax * 0.55, py - (eyeY - 0.026 * s), 0.018 * s);
          if (band > 0.05) {
            const cx = Math.floor(px / freckleCell);
            const cy = Math.floor(py / freckleCell);
            let f = 0;
            for (let oy = -1; oy <= 1; oy++) {
              for (let ox = -1; ox <= 1; ox++) {
                const h = hash2i(cx + ox, cy + oy, o.seed);
                if ((h & 1023) / 1023 > o.freckles * band * 1.4) continue;
                const fx = (cx + ox + ((h >>> 10) & 255) / 255) * freckleCell;
                const fy = (cy + oy + ((h >>> 18) & 255) / 255) * freckleCell;
                const rad = (0.00045 + ((h >>> 26) & 63) / 63 * 0.0005) * s;
                const dd = Math.hypot(px - fx, py - fy);
                f = Math.max(f, 1 - smoothstep(rad * 0.6, rad, dd));
              }
            }
            mixRGB(col, freckle, f * 0.6, col);
          }
        }

        // Nostrils (on the underside of the nose).
        if (py < tip[1] - 0.003 * s && pz < tip[2] + 0.02 * s) {
          const nd = gauss2((ax - 0.0052 * s * F.nose.tipR[0] / (0.0102 * s)) / 1.3, py - (tip[1] - 0.0082 * s), 0.0015 * s);
          col[0] *= 1 - nd * 0.32;
          col[1] *= 1 - nd * 0.36;
          col[2] *= 1 - nd * 0.32;
        }
      }

      // Scalp takes the hair colour under the hairline.
      const cov = smoothstep(hairY[x] - hairSoft, hairY[x] + hairSoft, py) * scalpAmount;
      if (cov > 0) {
        const strand = strands[((vt * SV) | 0) * SU + ((u * SU) | 0)];
        mixRGB(col, [hair[0] * strand, hair[1] * strand, hair[2] * strand], cov, col);
      }

      const i = (y * size + x) * 4;
      D[i] = Math.min(255, col[0] * 255);
      D[i + 1] = Math.min(255, col[1] * 255);
      D[i + 2] = Math.min(255, col[2] * 255);
      D[i + 3] = 255;
    }
  }

  // Flat patches.
  const fill = (rect, fn) => {
    const x0 = Math.floor(rect[0] * size);
    const x1 = Math.ceil(rect[2] * size);
    const y0 = Math.floor(rect[1] * size);
    const y1 = Math.ceil(rect[3] * size);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        fn((x - x0) / Math.max(1, x1 - x0 - 1), (y - y0) / Math.max(1, y1 - y0 - 1), col);
        const i = (y * size + x) * 4;
        D[i] = col[0] * 255;
        D[i + 1] = col[1] * 255;
        D[i + 2] = col[2] * 255;
        D[i + 3] = 255;
      }
    }
  };
  // Background of the strip: plain skin (safety margin for filtering).
  fill([0, vMax, 1, 1], (fu, fv, c) => mixRGB(base, base, 0, c));
  fill(FACE_UV.skin, (fu, fv, c) => mixRGB(base, red, 0.08, c));
  fill(FACE_UV.ear, (fu, fv, c) => mixRGB(base, red, 0.3, c));
  fill(FACE_UV.lash, (fu, fv, c) => mixRGB([hair[0] * 0.3, hair[1] * 0.28, hair[2] * 0.26], [0.05, 0.04, 0.035], 0.6, c));
  fill(FACE_UV.teeth, (fu, fv, c) => mixRGB(hex('#efe8d6'), hex('#c9b99a'), fv * 0.35, c));
  fill(FACE_UV.mouth, (fu, fv, c) => mixRGB(hex('#4a1a18'), hex('#200a0a'), fv, c));
  fill(FACE_UV.lid, (fu, fv, c) => {
    mixRGB(base, red, 0.14, c);
    const line = smoothstep(0.7, 1, fv);
    return mixRGB(c, [hair[0] * 0.35 + 0.04, hair[1] * 0.3 + 0.03, hair[2] * 0.3 + 0.03], line * 0.85, c);
  });

  ctx.putImageData(img, 0, 0);
  return canvasTexture(canvas);
}

// ----------------------------------------------------------------- iris

/**
 * Eyeball texture (planar projection of the front hemisphere).
 * @param {string} color iris colour
 * @param {number} seed
 */
export function paintIris(color, seed) {
  const size = C.iris;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const D = img.data;
  const N = new Noise(seed);
  const iris = hex(color);
  const dark = [iris[0] * 0.35, iris[1] * 0.35, iris[2] * 0.38];
  const light = mixRGB(iris, [1, 0.92, 0.7], 0.35);
  const sclera = hex('#efe9e2');
  const vein = hex('#c9776c');
  const col = [0, 0, 0];
  const IR = 0.2375;
  const PR = IR * 0.38;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;
      const r = Math.hypot(u, v);
      const a = Math.atan2(v, u);
      if (r > IR) {
        mixRGB(sclera, [0.86, 0.8, 0.78], smoothstep(IR, 0.5, r), col);
        const veins = Math.pow(Math.abs(N.perlin((a / (Math.PI * 2) + 0.5) * 32, r * 10, 32, 10)), 6) * smoothstep(0.3, 0.48, r);
        mixRGB(col, vein, Math.min(0.6, veins * 5), col);
        // Limbal ring.
        mixRGB(col, dark, (1 - smoothstep(IR, IR + 0.02, r)) * 0.8, col);
      } else if (r > PR) {
        const t = (r - PR) / (IR - PR);
        const fib = 0.75 + 0.35 * N.perlin((a / (Math.PI * 2) + 0.5) * 64, t * 3, 64, 3);
        mixRGB(light, iris, smoothstep(0, 0.45, t), col);
        mixRGB(col, dark, smoothstep(0.7, 1, t) * 0.75, col);
        col[0] *= fib;
        col[1] *= fib;
        col[2] *= fib;
      } else {
        col[0] = col[1] = col[2] = 0.02;
      }
      const i = (y * size + x) * 4;
      D[i] = Math.min(255, col[0] * 255);
      D[i + 1] = Math.min(255, col[1] * 255);
      D[i + 2] = Math.min(255, col[2] * 255);
      D[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(canvas);
}

// ------------------------------------------------------------------ hair

let _hairSet = null;
let _hairUsers = 0;

/**
 * Shared tileable hair strand maps (grey albedo tinted by material colour
 * + normal). Reference counted.
 * @returns {{map:THREE.Texture, normal:THREE.DataTexture}}
 */
export function acquireHairTextures() {
  _hairUsers++;
  if (_hairSet) return _hairSet;
  const size = C.hair;
  const strands = 72;
  const h = new Float32Array(size * size);
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const D = img.data;
  const N = new Noise(911);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const sx = u * strands + N.perlin(u * 4, v * 2, 4, 2) * 1.2;
      const k = Math.floor(sx);
      const f = sx - k;
      const hs = hash2i(((k % strands) + strands) % strands, 7, 3);
      const prof = Math.max(0, 1 - Math.abs(f - 0.5) * 2);
      const shade = 0.72 + ((hs & 255) / 255) * 0.36 + prof * 0.12;
      h[y * size + x] = prof * 0.8 + ((hs >>> 8) & 255) / 255 * 0.2;
      const i = (y * size + x) * 4;
      const g = Math.min(255, shade * 200);
      D[i] = g;
      D[i + 1] = g;
      D[i + 2] = g;
      D[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = canvasTexture(canvas, true, true);
  const nd = normalFromHeight(h, size, 2.2);
  const normal = new THREE.DataTexture(nd, size, size, THREE.RGBAFormat);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.magFilter = THREE.LinearFilter;
  normal.minFilter = THREE.LinearMipmapLinearFilter;
  normal.generateMipmaps = true;
  normal.needsUpdate = true;
  _hairSet = { map, normal };
  return _hairSet;
}

export function releaseHairTextures() {
  if (--_hairUsers > 0 || !_hairSet) return;
  _hairSet.map.dispose();
  _hairSet.normal.dispose();
  _hairSet = null;
  _hairUsers = 0;
}

// --------------------------------------------------------------- clothes

/**
 * Clothing atlas: colour + roughness canvases.
 * @param {{size:number, outfit:string, house:string, lower:string, number:number, seed:number}} o
 * @returns {{map:THREE.CanvasTexture, rough:THREE.CanvasTexture}}
 */
export function paintClothing(o) {
  const size = o.size;
  const cc = createCanvas(size, size);
  const rc = createCanvas(size, size);
  const c = cc.getContext('2d');
  const r = rc.getContext('2d');
  const H = HOUSES[o.house] ?? HOUSES.none;
  const kit = o.outfit === 'quidditch';
  const px = (rect) => [rect[0] * size, rect[1] * size, (rect[2] - rect[0]) * size, (rect[3] - rect[1]) * size];
  const rough = (rect, value) => {
    const g = Math.round(value * 255);
    r.fillStyle = `rgb(0,${g},0)`;
    r.fillRect(...px(rect));
  };
  const box = (rect, color) => {
    c.fillStyle = color;
    c.fillRect(...px(rect));
  };
  const knit = Math.max(3, Math.round((C.knit * size) / 1024));
  const ribs = (rect, color, alpha = 0.12) => {
    const [x, y, w, h] = px(rect);
    c.fillStyle = color;
    c.globalAlpha = alpha;
    for (let i = 0; i < w; i += knit) c.fillRect(x + i, y, Math.max(1, knit * 0.35), h);
    c.globalAlpha = 1;
  };
  r.fillStyle = 'rgb(0,230,0)';
  r.fillRect(0, 0, size, size);
  c.fillStyle = CLOTH_COLORS.trousers;
  c.fillRect(0, 0, size, size);

  // ---- torso (u: 0.5 = front centre; v: 0 = waist, 1 = neck)
  const [tx, ty, tw, th] = px(CLOTH_UV.torso);
  if (!kit) {
    box(CLOTH_UV.torso, CLOTH_COLORS.shirt);
    // Sweater vest with a V-neck and house trim.
    c.save();
    c.beginPath();
    c.rect(tx, ty, tw, th);
    c.clip();
    c.fillStyle = CLOTH_COLORS.sweater;
    c.beginPath();
    c.moveTo(tx, ty);
    c.lineTo(tx + tw, ty);
    c.lineTo(tx + tw, ty + th);
    c.lineTo(tx + tw * 0.58, ty + th);
    c.lineTo(tx + tw * 0.5, ty + th * 0.52);
    c.lineTo(tx + tw * 0.42, ty + th);
    c.lineTo(tx, ty + th);
    c.closePath();
    c.fill();
    ribs(CLOTH_UV.torso, '#000000', 0.18);
    // V-neck trim
    c.strokeStyle = H.primary;
    c.lineWidth = th * 0.022;
    c.beginPath();
    c.moveTo(tx + tw * 0.585, ty + th);
    c.lineTo(tx + tw * 0.5, ty + th * 0.505);
    c.lineTo(tx + tw * 0.415, ty + th);
    c.stroke();
    c.strokeStyle = H.secondary;
    c.lineWidth = th * 0.009;
    c.beginPath();
    c.moveTo(tx + tw * 0.605, ty + th);
    c.lineTo(tx + tw * 0.5, ty + th * 0.47);
    c.lineTo(tx + tw * 0.395, ty + th);
    c.stroke();
    // Waistband stripes
    c.fillStyle = H.primary;
    c.fillRect(tx, ty + th * 0.02, tw, th * 0.025);
    c.fillStyle = H.secondary;
    c.fillRect(tx, ty + th * 0.055, tw, th * 0.01);
    c.restore();
    rough(CLOTH_UV.torso, 0.9);
    // Shirt sleeves.
    box(CLOTH_UV.arms, CLOTH_COLORS.shirt);
    ribs(CLOTH_UV.arms, '#b8b6ae', 0.25);
    rough(CLOTH_UV.arms, 0.82);
  } else {
    box(CLOTH_UV.torso, H.primary);
    ribs(CLOTH_UV.torso, '#000000', 0.16);
    // Chest band and shoulder stripes.
    c.fillStyle = H.secondary;
    c.fillRect(tx, ty + th * 0.62, tw, th * 0.07);
    c.fillStyle = H.primary;
    c.fillRect(tx, ty + th * 0.64, tw, th * 0.03);
    // Number on the back, centred on the back seam (u = 0 ≡ 1). The atlas
    // runs upside down and mirrored there, so the glyphs are flipped.
    c.save();
    c.beginPath();
    c.rect(tx, ty, tw, th);
    c.clip();
    c.fillStyle = H.secondary;
    c.font = C.kitNumberFont.replace('120px', `${Math.round(th * 0.3)}px`);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const cx of [tx, tx + tw]) {
      c.save();
      c.translate(cx, ty + th * 0.42);
      c.scale(-1, -1);
      c.fillText(String(o.number), 0, 0);
      c.restore();
    }
    c.restore();
    rough(CLOTH_UV.torso, 0.92);
    box(CLOTH_UV.arms, H.primary);
    ribs(CLOTH_UV.arms, '#000000', 0.16);
    const [ax, ay, aw, ah] = px(CLOTH_UV.arms);
    c.fillStyle = H.secondary;
    c.fillRect(ax, ay + ah * 0.04, aw, ah * 0.05);
    rough(CLOTH_UV.arms, 0.92);
  }

  // ---- lower body
  const skirt = !kit && o.lower === 'skirt';
  const legColor = kit ? CLOTH_COLORS.kitTrousers : skirt ? CLOTH_COLORS.tights : CLOTH_COLORS.trousers;
  box(CLOTH_UV.pelvis, kit ? CLOTH_COLORS.kitTrousers : skirt ? CLOTH_COLORS.skirt : CLOTH_COLORS.trousers);
  rough(CLOTH_UV.pelvis, 0.86);
  box(CLOTH_UV.legs, legColor);
  rough(CLOTH_UV.legs, skirt ? 0.55 : 0.86);
  if (!kit && !skirt) {
    // Trouser crease down the front (u = 0.5).
    const [lx, ly, lw, lh] = px(CLOTH_UV.legs);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(lx + lw * 0.495, ly, Math.max(1, lw * 0.01), lh);
  }
  if (kit) {
    // Riding boots cover the lower legs.
    const [lx, ly, lw, lh] = px(CLOTH_UV.legs);
    c.fillStyle = CLOTH_COLORS.boots;
    c.fillRect(lx, ly, lw, lh * 0.42);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(lx, ly + lh * 0.4, lw, lh * 0.02);
    r.fillStyle = 'rgb(0,120,0)';
    r.fillRect(lx, ly, lw, lh * 0.42);
  }
  // Pleated skirt.
  box(CLOTH_UV.skirt, CLOTH_COLORS.skirt);
  {
    const [sx, sy, sw, sh] = px(CLOTH_UV.skirt);
    const pleats = 14;
    for (let i = 0; i < pleats; i++) {
      const g = c.createLinearGradient(sx + (i * sw) / pleats, 0, sx + ((i + 1) * sw) / pleats, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      c.fillStyle = g;
      c.fillRect(sx + (i * sw) / pleats, sy, sw / pleats, sh);
    }
    c.fillStyle = H.primary;
    c.fillRect(sx, sy, sw, sh * 0.05);
    rough(CLOTH_UV.skirt, 0.88);
  }

  // ---- shoes / boots
  box(CLOTH_UV.shoes, kit ? CLOTH_COLORS.boots : CLOTH_COLORS.shoes);
  {
    const [sx, sy, sw, sh] = px(CLOTH_UV.shoes);
    c.fillStyle = '#0c0907';
    c.fillRect(sx, sy, sw, sh * 0.14);
    const g = c.createLinearGradient(0, sy, 0, sy + sh);
    g.addColorStop(0.2, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(sx, sy + sh * 0.14, sw, sh * 0.86);
    rough(CLOTH_UV.shoes, kit ? 0.5 : 0.32);
  }

  // ---- collar, tie, gloves, pads
  box(CLOTH_UV.collar, kit ? H.primary : CLOTH_COLORS.shirt);
  rough(CLOTH_UV.collar, 0.8);
  {
    const [x, y, w, h] = px(CLOTH_UV.tie);
    c.fillStyle = H.primary;
    c.fillRect(x, y, w, h);
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.strokeStyle = H.secondary;
    c.lineWidth = w * 0.22;
    for (let i = -4; i < 14; i++) {
      c.beginPath();
      c.moveTo(x - w, y + (i * h) / 8);
      c.lineTo(x + w * 2, y + (i * h) / 8 + w * 1.4);
      c.stroke();
    }
    c.restore();
    rough(CLOTH_UV.tie, 0.55);
  }
  box(CLOTH_UV.gloves, CLOTH_COLORS.gloves);
  rough(CLOTH_UV.gloves, 0.55);
  box(CLOTH_UV.pads, CLOTH_COLORS.pads);
  {
    const [x, y, w, h] = px(CLOTH_UV.pads);
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = Math.max(1, w * 0.02);
    for (let i = 1; i < 5; i++) {
      c.beginPath();
      c.moveTo(x, y + (i * h) / 5);
      c.lineTo(x + w, y + (i * h) / 5);
      c.stroke();
    }
    rough(CLOTH_UV.pads, 0.5);
  }

  const map = canvasTexture(cc);
  const roughTex = canvasTexture(rc, false);
  return { map, rough: roughTex };
}

// ----------------------------------------------------------------- scarf

/**
 * Knitted scarf stripes (tileable along the length).
 * @param {string} house
 */
export function paintStripes(house) {
  const size = C.stripes;
  const H = HOUSES[house] ?? HOUSES.none;
  const canvas = createCanvas(size, size);
  const c = canvas.getContext('2d');
  const band = size / (SCARF.stripes * 2);
  for (let i = 0; i < SCARF.stripes * 2; i++) {
    c.fillStyle = i % 2 ? H.secondary : H.primary;
    c.fillRect(0, i * band, size, band);
  }
  c.fillStyle = 'rgba(0,0,0,0.16)';
  const rib = Math.max(2, size / 48);
  for (let x = 0; x < size; x += rib) c.fillRect(x, 0, rib * 0.4, size);
  return canvasTexture(canvas, true, true);
}

// ------------------------------------------------------------------ wand

/**
 * Wood grain running along the wand (v = length).
 * @param {{color:string, grain:string}} wood
 * @param {number} seed
 */
export function paintWandGrain(wood, seed) {
  const [w, h] = C.wand;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const D = img.data;
  const N = new Noise(seed);
  const a = hex(wood.color);
  const b = hex(wood.grain);
  const col = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const warp = N.perlin(u * 4, v * 8, 4, 8) * 0.4;
      const ring = Math.abs(Math.sin((u * 6 + warp) * Math.PI * 2 + N.perlin(u * 2, v * 3, 2, 3) * 3));
      const g = smoothstep(0.75, 1, ring) * 0.7 + N.fbm01(u, v, 8, 3) * 0.2;
      mixRGB(a, b, g, col);
      const i = (y * w + x) * 4;
      D[i] = col[0] * 255;
      D[i + 1] = col[1] * 255;
      D[i + 2] = col[2] * 255;
      D[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(canvas, true, true);
}
