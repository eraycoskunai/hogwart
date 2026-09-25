/**
 * @file PortraitPainter — paints original painted figures for the castle's
 * portraits on a 2D canvas (oil-paint look: glazed background, brush
 * texture, varnish, vignette). A portrait is fully described by a seed;
 * `paintPortrait` takes a pose so the same figure can be animated (head
 * sway, blinking, talking, eyes following the viewer).
 */
import { mulberry } from '../characters/Appearance.js';

const SKINS = ['#f2d2b8', '#e8bf9c', '#d9a57c', '#c48a62', '#9c6644', '#6e4630'];
const HAIRS = ['#1e1612', '#3b2618', '#6a4424', '#a0703c', '#c9a46a', '#8a2e14', '#d8d4cc', '#9a9690'];
const CLOTH = ['#5a1a1e', '#1d3a5c', '#2a4a2c', '#4a2a5a', '#6a4a1a', '#2a2a2e', '#7a6a4a', '#8a3a50', '#3a5a6a'];
const BACKS = ['drape', 'landscape', 'dark', 'window'];
const HATS = ['none', 'none', 'wizard', 'beret', 'veil', 'helmet', 'circlet'];
const COLLARS = ['fur', 'ruff', 'plain', 'armor', 'lace'];
const BEARDS = ['none', 'none', 'short', 'long', 'mustache'];
const PETS = ['none', 'none', 'none', 'owl', 'cat', 'book'];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];

/**
 * Deterministic portrait description.
 * @param {number} seed
 * @param {object} [override] fields to force (e.g. the guardian's pink dress)
 */
export function portraitSpec(seed, override = {}) {
  const rnd = mulberry(seed);
  const female = rnd() < 0.5;
  const old = rnd() < 0.45;
  const spec = {
    seed,
    female,
    old,
    skin: pick(rnd, SKINS),
    hair: old && rnd() < 0.7 ? pick(rnd, HAIRS.slice(6)) : pick(rnd, HAIRS.slice(0, 6)),
    hairStyle: female ? pick(rnd, ['long', 'bun', 'long', 'curls']) : pick(rnd, ['short', 'short', 'bald', 'long']),
    beard: female ? 'none' : pick(rnd, BEARDS),
    hat: pick(rnd, HATS),
    cloth: pick(rnd, CLOTH),
    cloth2: pick(rnd, CLOTH),
    collar: pick(rnd, COLLARS),
    back: pick(rnd, BACKS),
    backColor: pick(rnd, ['#3a1a14', '#14281c', '#1a1e30', '#2a2418', '#301a28']),
    pet: pick(rnd, PETS),
    eye: pick(rnd, ['#3a2a1a', '#2a4a6a', '#3a5a3a', '#5a4a2a', '#222']),
    faceW: 0.8 + rnd() * 0.3,
    faceH: 0.9 + rnd() * 0.25,
    nose: 0.8 + rnd() * 0.5,
    lean: (rnd() - 0.5) * 0.08,
    grain: rnd() * 1000,
    ...override,
  };
  return spec;
}

/** Default (still) pose. */
export const REST_POSE = Object.freeze({ dx: 0, dy: 0, tilt: 0, blink: 0, mouth: 0, lookX: 0, lookY: 0, breathe: 0 });

let _grain = null;
/** Shared brush-texture tile (canvas strokes). */
function grainTile() {
  if (_grain) return _grain;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rnd = mulberry(4242);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 128;
    const y = rnd() * 128;
    const a = rnd() * Math.PI;
    const l = 3 + rnd() * 9;
    g.strokeStyle = rnd() < 0.5 ? `rgba(255,240,210,${0.05 + rnd() * 0.08})` : `rgba(20,10,0,${0.05 + rnd() * 0.1})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  _grain = c;
  return c;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function ellipse(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

/**
 * Paint the background (cached separately by animated portraits).
 * @param {CanvasRenderingContext2D} g
 */
export function paintBackground(g, x, y, w, h, s) {
  g.save();
  g.translate(x, y);
  const rnd = mulberry(s.seed ^ 0x5bd1);
  if (s.back === 'landscape') {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0, '#4a5a70');
    sky.addColorStop(1, '#c9a878');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a4a34';
    g.beginPath();
    g.moveTo(0, h * 0.62);
    for (let i = 0; i <= 8; i++) g.lineTo((i / 8) * w, h * (0.55 + rnd() * 0.1));
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.fill();
    g.fillStyle = '#2a3428';
    g.fillRect(w * 0.08, h * 0.5, w * 0.05, h * 0.1);
    g.beginPath();
    g.moveTo(w * 0.06, h * 0.5);
    g.lineTo(w * 0.105, h * 0.44);
    g.lineTo(w * 0.15, h * 0.5);
    g.fill();
  } else if (s.back === 'window') {
    g.fillStyle = shade(s.backColor, 1);
    g.fillRect(0, 0, w, h);
    const lg = g.createLinearGradient(w * 0.6, 0, w, h * 0.6);
    lg.addColorStop(0, 'rgba(255,230,170,0.55)');
    lg.addColorStop(1, 'rgba(255,230,170,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(w * 0.66, h * 0.08);
    g.lineTo(w * 0.94, h * 0.08);
    g.lineTo(w * 0.94, h * 0.5);
    g.lineTo(w * 0.66, h * 0.5);
    g.fill();
    g.strokeStyle = 'rgba(40,30,20,0.6)';
    g.lineWidth = w * 0.015;
    g.strokeRect(w * 0.66, h * 0.08, w * 0.28, h * 0.42);
  } else {
    const rg = g.createRadialGradient(w * 0.45, h * 0.35, w * 0.05, w * 0.5, h * 0.5, w * 0.9);
    rg.addColorStop(0, shade(s.backColor, s.back === 'dark' ? 1.6 : 2.2));
    rg.addColorStop(1, shade(s.backColor, 0.5));
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
    if (s.back === 'drape') {
      for (let i = 0; i < 7; i++) {
        const fx = rnd() * w;
        const fg = g.createLinearGradient(fx - w * 0.05, 0, fx + w * 0.05, 0);
        fg.addColorStop(0, 'rgba(0,0,0,0)');
        fg.addColorStop(0.5, `rgba(0,0,0,${0.18 + rnd() * 0.15})`);
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = fg;
        g.fillRect(fx - w * 0.05, 0, w * 0.1, h);
      }
    }
  }
  g.restore();
}

/**
 * Paint the whole portrait into (x, y, w, h).
 * @param {CanvasRenderingContext2D} g
 * @param {ReturnType<typeof portraitSpec>} s
 * @param {typeof REST_POSE} [pose]
 * @param {HTMLCanvasElement|null} [bgCache] pre-painted background of the same size
 */
export function paintPortrait(g, x, y, w, h, s, pose = REST_POSE, bgCache = null) {
  if (bgCache) g.drawImage(bgCache, x, y, w, h);
  else paintBackground(g, x, y, w, h, s);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.translate(x, y);
  paintFigure(g, w, h, s, pose);
  // Oil paint: brush grain, warm varnish, vignette.
  g.globalAlpha = 0.55;
  g.fillStyle = g.createPattern(grainTile(), 'repeat');
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(120,80,20,0.12)';
  g.fillRect(0, 0, w, h);
  const vg = g.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,5,0,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  g.restore();
}

function paintFigure(g, w, h, s, p) {
  const cx = w * (0.5 + s.lean) + p.dx * w;
  const headY = h * 0.38 + p.dy * h - p.breathe * h * 0.004;
  const fw = w * 0.17 * s.faceW;
  const fh = h * 0.16 * s.faceH;

  // --- body / shoulders
  const bodyTop = headY + fh * 0.95;
  const sh = w * 0.42;
  g.fillStyle = s.cloth;
  g.beginPath();
  g.moveTo(cx - sh, h * 1.02);
  g.bezierCurveTo(cx - sh, bodyTop + h * 0.08, cx - w * 0.2, bodyTop, cx, bodyTop - h * 0.01);
  g.bezierCurveTo(cx + w * 0.2, bodyTop, cx + sh, bodyTop + h * 0.08, cx + sh, h * 1.02);
  g.fill();
  // folds / light
  const lg = g.createLinearGradient(cx - sh, 0, cx + sh, 0);
  lg.addColorStop(0, 'rgba(0,0,0,0.35)');
  lg.addColorStop(0.45, 'rgba(255,240,220,0.08)');
  lg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = lg;
  g.fill();
  // Robe opening / second colour.
  g.fillStyle = s.cloth2;
  g.beginPath();
  g.moveTo(cx - w * 0.08, bodyTop + h * 0.03);
  g.lineTo(cx + w * 0.08, bodyTop + h * 0.03);
  g.lineTo(cx + w * 0.05, h);
  g.lineTo(cx - w * 0.05, h);
  g.fill();

  // --- collar
  if (s.collar === 'ruff') {
    g.fillStyle = '#ece6d6';
    for (let i = 0; i < 12; i++) {
      const a = Math.PI + (i / 11) * Math.PI;
      ellipse(g, cx + Math.cos(a) * fw * 1.25, bodyTop + h * 0.015 - Math.sin(a) * h * 0.02, fw * 0.28, h * 0.03);
      g.fill();
    }
  } else if (s.collar === 'fur') {
    g.fillStyle = '#8a6a4a';
    ellipse(g, cx, bodyTop + h * 0.035, sh * 0.72, h * 0.05);
    g.fill();
    g.fillStyle = 'rgba(255,240,210,0.18)';
    for (let i = 0; i < 20; i++) {
      ellipse(g, cx - sh * 0.6 + (i / 19) * sh * 1.2, bodyTop + h * 0.03, 2, 5, 0.3);
      g.fill();
    }
  } else if (s.collar === 'armor') {
    g.fillStyle = '#8a8e96';
    ellipse(g, cx - sh * 0.62, bodyTop + h * 0.08, sh * 0.34, h * 0.07, -0.3);
    g.fill();
    ellipse(g, cx + sh * 0.62, bodyTop + h * 0.08, sh * 0.34, h * 0.07, 0.3);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    ellipse(g, cx - sh * 0.66, bodyTop + h * 0.06, sh * 0.16, h * 0.02, -0.3);
    g.fill();
  } else if (s.collar === 'lace') {
    g.fillStyle = '#f0e8da';
    g.beginPath();
    g.moveTo(cx - fw * 1.1, bodyTop);
    g.lineTo(cx, bodyTop + h * 0.09);
    g.lineTo(cx + fw * 1.1, bodyTop);
    g.fill();
  }

  // --- neck
  g.fillStyle = shade(s.skin, 0.85);
  g.fillRect(cx - fw * 0.38, headY + fh * 0.5, fw * 0.76, fh * 0.6);

  // --- pet / prop (below the head, in front of the body)
  paintProp(g, w, h, s, cx, bodyTop, p);

  // --- head (tilt around the chin)
  g.save();
  g.translate(cx, headY + fh);
  g.rotate(p.tilt);
  g.translate(-cx, -(headY + fh));

  // Hair behind the head.
  if (s.hairStyle === 'long' || s.hairStyle === 'curls') {
    g.fillStyle = s.hair;
    g.beginPath();
    g.moveTo(cx - fw * 1.15, headY - fh * 0.2);
    g.quadraticCurveTo(cx - fw * 1.5, headY + fh * 1.6, cx - fw * 0.6, headY + fh * 1.9);
    g.lineTo(cx + fw * 0.6, headY + fh * 1.9);
    g.quadraticCurveTo(cx + fw * 1.5, headY + fh * 1.6, cx + fw * 1.15, headY - fh * 0.2);
    g.fill();
  }
  // Face.
  const fg = g.createRadialGradient(cx - fw * 0.3, headY - fh * 0.2, fw * 0.1, cx, headY, fw * 1.3);
  fg.addColorStop(0, shade(s.skin, 1.08));
  fg.addColorStop(1, shade(s.skin, 0.72));
  g.fillStyle = fg;
  ellipse(g, cx, headY, fw, fh);
  g.fill();
  // Ears.
  g.fillStyle = shade(s.skin, 0.85);
  ellipse(g, cx - fw * 0.98, headY + fh * 0.05, fw * 0.14, fh * 0.2);
  g.fill();
  ellipse(g, cx + fw * 0.98, headY + fh * 0.05, fw * 0.14, fh * 0.2);
  g.fill();
  // Cheeks.
  g.fillStyle = 'rgba(200,80,70,0.16)';
  ellipse(g, cx - fw * 0.5, headY + fh * 0.3, fw * 0.25, fh * 0.14);
  g.fill();
  ellipse(g, cx + fw * 0.5, headY + fh * 0.3, fw * 0.25, fh * 0.14);
  g.fill();
  if (s.old) {
    g.strokeStyle = 'rgba(80,40,20,0.35)';
    g.lineWidth = 1;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + sx * fw * 0.3, headY + fh * 0.3);
      g.quadraticCurveTo(cx + sx * fw * 0.45, headY + fh * 0.55, cx + sx * fw * 0.3, headY + fh * 0.7);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cx - fw * 0.35, headY - fh * 0.62);
    g.lineTo(cx + fw * 0.35, headY - fh * 0.62);
    g.stroke();
  }

  // Eyes.
  const ey = headY - fh * 0.08;
  const ex = fw * 0.42;
  const er = fw * 0.2;
  for (const sx of [-1, 1]) {
    const x = cx + sx * ex;
    g.fillStyle = '#f2ece2';
    ellipse(g, x, ey, er, er * 0.55);
    g.fill();
    g.fillStyle = s.eye;
    ellipse(g, x + p.lookX * er * 0.45, ey + p.lookY * er * 0.2, er * 0.45, er * 0.45);
    g.fill();
    g.fillStyle = '#0a0806';
    ellipse(g, x + p.lookX * er * 0.45, ey + p.lookY * er * 0.2, er * 0.2, er * 0.2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    ellipse(g, x + p.lookX * er * 0.45 - er * 0.12, ey - er * 0.12, er * 0.08, er * 0.08);
    g.fill();
    // Lids: the upper lid always covers a little, all of the eye when blinking.
    g.save();
    ellipse(g, x, ey, er, er * 0.55);
    g.clip();
    g.fillStyle = shade(s.skin, 0.8);
    g.fillRect(x - er, ey - er * 0.55, er * 2, er * 1.1 * (0.2 + p.blink * 0.8));
    g.restore();
    // Brow.
    g.strokeStyle = shade(s.hair, 0.8);
    g.lineWidth = Math.max(1.5, fw * 0.08);
    g.beginPath();
    g.moveTo(x - er, ey - er * 1.1);
    g.quadraticCurveTo(x, ey - er * 1.6 - p.mouth * er * 0.3, x + er, ey - er * 1.05);
    g.stroke();
  }
  // Nose.
  g.strokeStyle = shade(s.skin, 0.6);
  g.lineWidth = Math.max(1, fw * 0.05);
  g.beginPath();
  g.moveTo(cx - fw * 0.05, ey + fh * 0.05);
  g.quadraticCurveTo(cx - fw * 0.18 * s.nose, ey + fh * 0.38 * s.nose, cx - fw * 0.02, ey + fh * 0.42 * s.nose);
  g.quadraticCurveTo(cx + fw * 0.08, ey + fh * 0.45 * s.nose, cx + fw * 0.14, ey + fh * 0.4 * s.nose);
  g.stroke();
  // Mouth.
  const my = headY + fh * 0.55;
  if (p.mouth > 0.05) {
    g.fillStyle = '#4a1814';
    ellipse(g, cx, my + fh * 0.02, fw * 0.24, fh * 0.03 + p.mouth * fh * 0.13);
    g.fill();
    g.fillStyle = 'rgba(240,230,220,0.8)';
    g.fillRect(cx - fw * 0.15, my - fh * 0.01, fw * 0.3, fh * 0.03);
  }
  g.strokeStyle = s.female ? '#9a3a3a' : shade(s.skin, 0.55);
  g.lineWidth = Math.max(1.2, fw * 0.06);
  g.beginPath();
  g.moveTo(cx - fw * 0.28, my);
  g.quadraticCurveTo(cx, my + fh * 0.06 + p.mouth * fh * 0.05, cx + fw * 0.28, my);
  g.stroke();

  // Beard / moustache.
  if (s.beard !== 'none') {
    g.fillStyle = shade(s.hair, 0.95);
    if (s.beard === 'mustache') {
      ellipse(g, cx - fw * 0.2, my - fh * 0.06, fw * 0.24, fh * 0.06, 0.25);
      g.fill();
      ellipse(g, cx + fw * 0.2, my - fh * 0.06, fw * 0.24, fh * 0.06, -0.25);
      g.fill();
    } else {
      const len = s.beard === 'long' ? 1.3 : 0.55;
      g.beginPath();
      g.moveTo(cx - fw * 0.85, headY + fh * 0.2);
      g.quadraticCurveTo(cx - fw * 0.8, headY + fh * (0.9 + len), cx, headY + fh * (1 + len));
      g.quadraticCurveTo(cx + fw * 0.8, headY + fh * (0.9 + len), cx + fw * 0.85, headY + fh * 0.2);
      g.quadraticCurveTo(cx, headY + fh * (0.62 + p.mouth * 0.1), cx - fw * 0.85, headY + fh * 0.2);
      g.fill();
    }
  }

  // Hair on top.
  g.fillStyle = s.hair;
  if (s.hairStyle !== 'bald') {
    g.beginPath();
    g.ellipse(cx, headY - fh * 0.35, fw * 1.06, fh * 0.72, 0, Math.PI, Math.PI * 2);
    g.quadraticCurveTo(cx + fw * 0.4, headY - fh * 0.55, cx, headY - fh * 0.6);
    g.quadraticCurveTo(cx - fw * 0.5, headY - fh * 0.5, cx - fw * 1.06, headY - fh * 0.35);
    g.fill();
    if (s.hairStyle === 'bun') {
      ellipse(g, cx, headY - fh * 1.1, fw * 0.45, fh * 0.32);
      g.fill();
    }
    if (s.hairStyle === 'curls') {
      for (let i = 0; i < 9; i++) {
        ellipse(g, cx - fw * 1.1 + (i % 2) * fw * 2.2, headY + fh * (0.1 + i * 0.12), fw * 0.22, fh * 0.14);
        g.fill();
      }
    }
  } else {
    g.beginPath();
    g.ellipse(cx - fw * 0.9, headY - fh * 0.1, fw * 0.2, fh * 0.35, 0.2, 0, Math.PI * 2);
    g.ellipse(cx + fw * 0.9, headY - fh * 0.1, fw * 0.2, fh * 0.35, -0.2, 0, Math.PI * 2);
    g.fill();
  }

  paintHat(g, s, cx, headY, fw, fh);
  g.restore();
}

function paintHat(g, s, cx, headY, fw, fh) {
  if (s.hat === 'wizard') {
    g.fillStyle = shade(s.cloth2, 0.9);
    g.beginPath();
    g.moveTo(cx - fw * 1.5, headY - fh * 0.6);
    g.quadraticCurveTo(cx, headY - fh * 0.9, cx + fw * 1.5, headY - fh * 0.6);
    g.lineTo(cx + fw * 0.7, headY - fh * 0.8);
    g.quadraticCurveTo(cx + fw * 0.5, headY - fh * 2.2, cx + fw * 1.2, headY - fh * 2.9);
    g.quadraticCurveTo(cx - fw * 0.2, headY - fh * 2.2, cx - fw * 0.7, headY - fh * 0.8);
    g.fill();
    g.fillStyle = '#d8b84a';
    for (let i = 0; i < 4; i++) {
      ellipse(g, cx - fw * 0.3 + i * fw * 0.25, headY - fh * (1.2 + i * 0.3), 1.5, 1.5);
      g.fill();
    }
  } else if (s.hat === 'beret') {
    g.fillStyle = shade(s.cloth2, 0.8);
    ellipse(g, cx - fw * 0.2, headY - fh * 0.78, fw * 1.25, fh * 0.35, -0.15);
    g.fill();
    g.strokeStyle = '#e8e0d0';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx + fw * 0.6, headY - fh * 0.9);
    g.quadraticCurveTo(cx + fw * 1.6, headY - fh * 1.8, cx + fw * 1.2, headY - fh * 2.2);
    g.stroke();
  } else if (s.hat === 'veil') {
    g.fillStyle = 'rgba(236,230,218,0.95)';
    g.beginPath();
    g.moveTo(cx - fw * 1.25, headY + fh * 1.3);
    g.quadraticCurveTo(cx - fw * 1.3, headY - fh * 1.1, cx, headY - fh * 1.15);
    g.quadraticCurveTo(cx + fw * 1.3, headY - fh * 1.1, cx + fw * 1.25, headY + fh * 1.3);
    g.lineTo(cx + fw * 0.95, headY + fh * 1.3);
    g.quadraticCurveTo(cx + fw * 1.0, headY - fh * 0.7, cx, headY - fh * 0.78);
    g.quadraticCurveTo(cx - fw * 1.0, headY - fh * 0.7, cx - fw * 0.95, headY + fh * 1.3);
    g.fill();
  } else if (s.hat === 'helmet') {
    g.fillStyle = '#8a8e96';
    g.beginPath();
    g.ellipse(cx, headY - fh * 0.3, fw * 1.12, fh * 0.9, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    ellipse(g, cx - fw * 0.4, headY - fh * 0.85, fw * 0.3, fh * 0.12, -0.3);
    g.fill();
    g.fillStyle = '#9a2a2a';
    g.beginPath();
    g.moveTo(cx - fw * 0.1, headY - fh * 1.15);
    g.quadraticCurveTo(cx + fw * 0.9, headY - fh * 1.9, cx + fw * 1.4, headY - fh * 1.2);
    g.quadraticCurveTo(cx + fw * 0.5, headY - fh * 1.4, cx + fw * 0.1, headY - fh * 1.15);
    g.fill();
  } else if (s.hat === 'circlet') {
    g.strokeStyle = '#d8b84a';
    g.lineWidth = Math.max(2, fw * 0.1);
    g.beginPath();
    g.ellipse(cx, headY - fh * 0.62, fw * 0.95, fh * 0.12, 0, 0, Math.PI);
    g.stroke();
    g.fillStyle = '#4a8ad8';
    ellipse(g, cx, headY - fh * 0.52, fw * 0.1, fw * 0.1);
    g.fill();
  }
}

function paintProp(g, w, h, s, cx, bodyTop, p) {
  if (s.pet === 'owl') {
    const ox = cx + w * 0.27;
    const oy = bodyTop + h * 0.02;
    g.fillStyle = '#7a6040';
    ellipse(g, ox, oy, w * 0.07, h * 0.08);
    g.fill();
    ellipse(g, ox, oy - h * 0.08, w * 0.06, h * 0.05);
    g.fill();
    g.fillStyle = '#e8c860';
    for (const sx of [-1, 1]) {
      ellipse(g, ox + sx * w * 0.025, oy - h * 0.085, w * 0.018, w * 0.018 * (1 - p.blink));
      g.fill();
    }
  } else if (s.pet === 'cat') {
    const ox = cx - w * 0.25;
    const oy = h * 0.9;
    g.fillStyle = '#2a2420';
    ellipse(g, ox, oy, w * 0.1, h * 0.06);
    g.fill();
    ellipse(g, ox + w * 0.06, oy - h * 0.06, w * 0.05, h * 0.045);
    g.fill();
    g.beginPath();
    g.moveTo(ox + w * 0.03, oy - h * 0.09);
    g.lineTo(ox + w * 0.04, oy - h * 0.13);
    g.lineTo(ox + w * 0.06, oy - h * 0.1);
    g.moveTo(ox + w * 0.07, oy - h * 0.1);
    g.lineTo(ox + w * 0.09, oy - h * 0.13);
    g.lineTo(ox + w * 0.1, oy - h * 0.085);
    g.fill();
    g.fillStyle = '#c8d860';
    ellipse(g, ox + w * 0.05, oy - h * 0.065, 1.5, 1.5 * (1 - p.blink));
    g.fill();
    ellipse(g, ox + w * 0.075, oy - h * 0.065, 1.5, 1.5 * (1 - p.blink));
    g.fill();
  } else if (s.pet === 'book') {
    g.fillStyle = '#5a2a1a';
    g.save();
    g.translate(cx + w * 0.18, h * 0.88);
    g.rotate(-0.25);
    g.fillRect(-w * 0.1, -h * 0.05, w * 0.2, h * 0.1);
    g.fillStyle = '#e8dcc0';
    g.fillRect(-w * 0.09, -h * 0.04, w * 0.18, h * 0.02);
    g.restore();
  }
}
