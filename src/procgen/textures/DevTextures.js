/**
 * @file DevTextures — procedural "prototype" textures for the engine test
 * room: measured grid surfaces, wooden crates, striped balls, text labels.
 * (Phase 2 introduces the full physically based material generators.)
 */
import * as THREE from 'three';

/** Small deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amount, 0, 1));
  return `#${c.getHexString()}`;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {boolean} [srgb]
 */
function toTexture(canvas, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Measured prototype grid: 2×2 m tile, 2 m checker, 1 m major and
 * 0.25 m minor lines, subtle speckle so surfaces never look flat.
 * @param {{base:string, size?:number, seed?:number}} o
 * @returns {THREE.CanvasTexture}
 */
export function gridTexture(o) {
  const size = o.size ?? 512;
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const half = size / 2;
  g.fillStyle = o.base;
  g.fillRect(0, 0, size, size);
  g.fillStyle = shade(o.base, -0.035);
  g.fillRect(0, 0, half, half);
  g.fillRect(half, half, half, half);

  // speckle
  const r = rng(o.seed ?? 7);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  const line = (pos, width, color) => {
    g.fillStyle = color;
    g.fillRect(pos - width / 2, 0, width, size);
    g.fillRect(0, pos - width / 2, size, width);
  };
  const minor = shade(o.base, -0.08);
  const major = shade(o.base, -0.16);
  for (let i = 1; i < 8; i++) if (i % 4 !== 0) line((i * size) / 8, Math.max(1, size / 512), minor);
  line(half, Math.max(2, size / 200), major);
  // edges drawn half on each side so tiling produces full-width lines
  g.fillStyle = major;
  const ew = Math.max(1, size / 400);
  g.fillRect(0, 0, size, ew);
  g.fillRect(0, size - ew, size, ew);
  g.fillRect(0, 0, ew, size);
  g.fillRect(size - ew, 0, ew, size);
  return toTexture(c);
}

/**
 * Wooden crate face: frame, planks with grain, diagonal brace, nails.
 * @param {{size?:number, seed?:number, tint?:string}} [o]
 */
export function crateTexture(o = {}) {
  const size = o.size ?? 256;
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const r = rng(o.seed ?? 11);
  const base = o.tint ?? '#9c6b3c';
  const planks = 5;
  for (let i = 0; i < planks; i++) {
    const y = (i * size) / planks;
    g.fillStyle = shade(base, (r() - 0.5) * 0.08);
    g.fillRect(0, y, size, size / planks);
    // grain
    g.strokeStyle = shade(base, -0.12);
    g.globalAlpha = 0.35;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      const gy = y + r() * (size / planks);
      g.moveTo(0, gy);
      for (let x = 0; x <= size; x += size / 16) g.lineTo(x, gy + Math.sin(x * 0.05 + k) * 1.5);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = shade(base, -0.25);
    g.fillRect(0, y, size, Math.max(1, size / 128));
  }
  const fw = size * 0.12;
  g.fillStyle = shade(base, -0.1);
  g.fillRect(0, 0, size, fw);
  g.fillRect(0, size - fw, size, fw);
  g.fillRect(0, 0, fw, size);
  g.fillRect(size - fw, 0, fw, size);
  // diagonal brace
  g.save();
  g.translate(size / 2, size / 2);
  g.rotate(Math.PI / 4);
  g.fillRect(-size * 0.7, -fw / 2, size * 1.4, fw);
  g.restore();
  g.strokeStyle = shade(base, -0.3);
  g.lineWidth = Math.max(1, size / 128);
  g.strokeRect(fw, fw, size - 2 * fw, size - 2 * fw);
  g.strokeRect(1, 1, size - 2, size - 2);
  // nails
  g.fillStyle = '#3a3633';
  for (const [x, y] of [[0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94], [0.5, 0.06], [0.5, 0.94]]) {
    g.beginPath();
    g.arc(x * size, y * size, size / 80, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c);
}

/**
 * Two-tone striped texture (balls, hazard strips).
 * @param {string} a
 * @param {string} b
 * @param {number} [stripes]
 */
export function stripeTexture(a, b, stripes = 6) {
  const size = 256;
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect((i * size) / stripes, 0, size / stripes + 1, size);
  }
  return toTexture(c);
}

/**
 * Text label texture on a transparent background.
 * @param {string} text
 * @param {{color?:string, bg?:string, font?:string, width?:number, height?:number}} [o]
 */
export function labelTexture(text, o = {}) {
  const w = o.width ?? 512;
  const h = o.height ?? 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (o.bg) {
    g.fillStyle = o.bg;
    const r = h * 0.2;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, r);
    g.fill();
  }
  g.fillStyle = o.color ?? '#f4ecd8';
  g.font = o.font ?? `600 ${Math.floor(h * 0.52)}px Georgia, "Times New Roman", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = h * 0.06;
  g.fillText(text, w / 2, h / 2 + h * 0.03, w - 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Glowing rune circle (cinematic pad / interaction markers).
 * @param {string} color
 */
export function runeCircleTexture(color) {
  const size = 256;
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const cx = size / 2;
  g.strokeStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 12;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cx, size * 0.44, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cx, size * 0.36, 0, Math.PI * 2);
  g.stroke();
  // star polygon
  g.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = (i * 3 * Math.PI * 2) / 7 - Math.PI / 2;
    const x = cx + Math.cos(a) * size * 0.34;
    const y = cx + Math.sin(a) * size * 0.34;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  // tick marks
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * size * 0.4, cx + Math.sin(a) * size * 0.4);
    g.lineTo(cx + Math.cos(a) * size * 0.44, cx + Math.sin(a) * size * 0.44);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
