/**
 * @file heraldry.js — simple geometric animal silhouettes (lion, badger,
 * eagle, snake) drawn with Canvas 2D paths. Shared by tapestries, banners
 * and seals. Coordinates: centre (cx, cy), half-size s, canvas y down;
 * figures face left.
 */

/** @typedef {CanvasRenderingContext2D} G */

function limb(g, x0, y0, x1, y1, w) {
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

/** @param {G} g */
export function drawLion(g, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  // body (rearing)
  g.beginPath();
  g.ellipse(0.02, 0.05, 0.32, 0.15, -0.55, 0, Math.PI * 2);
  g.fill();
  // hind legs
  limb(g, 0.14, 0.2, 0.08, 0.5, 0.1);
  limb(g, 0.26, 0.14, 0.34, 0.5, 0.1);
  limb(g, 0.08, 0.5, -0.02, 0.52, 0.07);
  limb(g, 0.34, 0.5, 0.24, 0.53, 0.07);
  // raised fore legs with claws
  limb(g, -0.14, -0.12, -0.42, -0.2, 0.09);
  limb(g, -0.12, -0.04, -0.4, 0.04, 0.09);
  limb(g, -0.42, -0.2, -0.5, -0.3, 0.05);
  limb(g, -0.4, 0.04, -0.52, -0.04, 0.05);
  // mane (star) + head
  g.beginPath();
  const mx = -0.26, my = -0.32;
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = i % 2 ? 0.12 : 0.2;
    const x = mx + Math.cos(a) * r;
    const y = my + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.fill();
  g.beginPath();
  g.ellipse(-0.36, -0.32, 0.1, 0.08, 0.2, 0, Math.PI * 2);
  g.fill();
  // tail with tuft
  g.lineWidth = 0.045;
  g.beginPath();
  g.moveTo(0.3, 0.12);
  g.bezierCurveTo(0.55, 0.05, 0.48, -0.3, 0.38, -0.36);
  g.stroke();
  g.beginPath();
  g.ellipse(0.36, -0.4, 0.06, 0.08, 0.5, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** @param {G} g */
export function drawBadger(g, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.beginPath();
  g.ellipse(0.06, 0.08, 0.38, 0.17, 0, 0, Math.PI * 2);
  g.fill();
  // head wedge
  g.beginPath();
  g.moveTo(-0.22, -0.08);
  g.lineTo(-0.58, 0.1);
  g.lineTo(-0.52, 0.15);
  g.lineTo(-0.22, 0.22);
  g.closePath();
  g.fill();
  // ears
  g.beginPath();
  g.arc(-0.26, -0.08, 0.05, 0, Math.PI * 2);
  g.fill();
  // legs
  for (const x of [-0.2, -0.08, 0.2, 0.32]) limb(g, x, 0.18, x - 0.02, 0.4, 0.085);
  // tail
  g.beginPath();
  g.moveTo(0.42, 0.02);
  g.lineTo(0.56, 0.08);
  g.lineTo(0.43, 0.14);
  g.closePath();
  g.fill();
  g.restore();
}

/** @param {G} g */
export function drawEagle(g, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  // wings (mirrored, stepped feathers)
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(0.05 * side, -0.14);
    g.lineTo(0.3 * side, -0.34);
    g.lineTo(0.58 * side, -0.44);
    const tips = 6;
    for (let k = 0; k <= tips; k++) {
      const t = k / tips;
      const x = (0.58 - t * 0.44) * side;
      const y = -0.44 + t * 0.52;
      g.lineTo(x, y);
      g.lineTo(x - 0.04 * side, y + 0.07);
    }
    g.lineTo(0.08 * side, 0.1);
    g.closePath();
    g.fill();
  }
  // body
  g.beginPath();
  g.ellipse(0, 0.02, 0.11, 0.24, 0, 0, Math.PI * 2);
  g.fill();
  // head + beak (facing left)
  g.beginPath();
  g.arc(-0.01, -0.28, 0.085, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(-0.07, -0.3);
  g.lineTo(-0.2, -0.26);
  g.lineTo(-0.07, -0.22);
  g.closePath();
  g.fill();
  // tail fan
  g.beginPath();
  g.moveTo(-0.08, 0.2);
  g.lineTo(0.08, 0.2);
  g.lineTo(0.18, 0.46);
  g.lineTo(0, 0.4);
  g.lineTo(-0.18, 0.46);
  g.closePath();
  g.fill();
  // talons
  limb(g, -0.05, 0.22, -0.12, 0.34, 0.035);
  limb(g, 0.05, 0.22, 0.12, 0.34, 0.035);
  g.restore();
}

/** @param {G} g */
export function drawSnake(g, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // tapering body drawn as successive strokes
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    pts.push([Math.sin(t * Math.PI * 2.5) * 0.3 * (0.6 + t * 0.4) + 0.05, 0.48 - t * 0.82]);
  }
  for (let i = 1; i < pts.length; i++) {
    g.lineWidth = 0.03 + (i / pts.length) * 0.08;
    g.beginPath();
    g.moveTo(pts[i - 1][0], pts[i - 1][1]);
    g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
  }
  const [hx, hy] = pts[pts.length - 1];
  g.beginPath();
  g.ellipse(hx - 0.06, hy - 0.02, 0.1, 0.065, -0.3, 0, Math.PI * 2);
  g.fill();
  // forked tongue
  g.lineWidth = 0.015;
  g.beginPath();
  g.moveTo(hx - 0.15, hy);
  g.lineTo(hx - 0.25, hy - 0.02);
  g.moveTo(hx - 0.22, hy - 0.01);
  g.lineTo(hx - 0.27, hy - 0.05);
  g.moveTo(hx - 0.22, hy - 0.01);
  g.lineTo(hx - 0.27, hy + 0.03);
  g.stroke();
  g.restore();
}

export const ANIMALS = { lion: drawLion, badger: drawBadger, eagle: drawEagle, snake: drawSnake };
