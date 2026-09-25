/**
 * @file CastleKit — modular castle geometry: wall blocks, battlements
 * (straight and round), gable / cone / pyramid roofs with slope-aligned
 * UVs, pointed-arch windows (frame + glass), buttresses, corbel rings,
 * arched bridge spans, finials, pennants, plank doors and clock faces.
 * Every function returns geometry in local space (base at y = 0) for the
 * StaticBatcher; roofs and panes carry their own UVs (in texture repeats).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT } from '../../data/castle.js';

const TAU = Math.PI * 2;

/** Box with its base on y = 0. */
export function block(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return g;
}

/** Merge a list of geometries (non-indexed, position/normal/uv). */
export function merge(list) {
  const prepared = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    return n;
  });
  const m = mergeGeometries(prepared, false);
  for (const g of prepared) g.dispose();
  return m;
}

/** Merlons along local X (centred), sitting on y = 0. */
export function battlementsLine(length, thickness) {
  const M = KIT.merlon;
  const pitch = M.width + M.gap;
  const count = Math.max(1, Math.floor((length + M.gap) / pitch));
  const used = count * pitch - M.gap;
  const list = [];
  for (let k = 0; k < count; k++) {
    const g = block(M.width, M.height, Math.min(thickness, M.depth + thickness * 0.3));
    g.translate(-used / 2 + M.width / 2 + k * pitch, 0, 0);
    list.push(g);
  }
  return merge(list);
}

/** Merlons around a circle of radius r. */
export function battlementsRing(r, thickness) {
  const M = KIT.merlon;
  const circ = TAU * r;
  const count = Math.max(6, Math.floor(circ / (M.width + M.gap)));
  const list = [];
  for (let k = 0; k < count; k++) {
    const a = (k / count) * TAU;
    const g = block(M.width, M.height, thickness);
    g.translate(0, 0, r - thickness / 2);
    g.rotateY(a);
    list.push(g);
  }
  return merge(list);
}

/**
 * Gable roof with the ridge along local X.
 * @returns {{roof:THREE.BufferGeometry, gables:THREE.BufferGeometry}}
 */
export function gableRoof(length, width, height) {
  const o = KIT.roofOverhang;
  const L = length + o * 2;
  const hw = width / 2 + o;
  const drop = (o / (width / 2)) * height;
  const slope = Math.hypot(hw, height + drop);
  const t = KIT.roofTile;
  const pos = [];
  const uv = [];
  const quad = (a, b, c, d, ua, ub, uc, ud) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  };
  const y0 = -drop;
  for (const side of [-1, 1]) {
    const e0 = [-L / 2, y0, side * hw];
    const e1 = [L / 2, y0, side * hw];
    const r1 = [L / 2, height, 0];
    const r0 = [-L / 2, height, 0];
    const u0 = [0, 0], u1 = [L / t, 0], u2 = [L / t, slope / t], u3 = [0, slope / t];
    if (side > 0) quad(e0, e1, r1, r0, u0, u1, u2, u3);
    else quad(e1, e0, r0, r1, u1, u0, u3, u2);
    // Underside (a thin slab so eaves read from below).
    const dn = (p) => [p[0], p[1] - 0.25, p[2]];
    if (side > 0) quad(dn(r0), dn(r1), dn(e1), dn(e0), u3, u2, u1, u0);
    else quad(dn(r1), dn(r0), dn(e0), dn(e1), u2, u3, u0, u1);
  }
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roof.computeVertexNormals();
  // Stone gable triangles closing the ends.
  const gp = [];
  for (const sx of [-1, 1]) {
    const x = (sx * length) / 2;
    const a = [x, 0, -width / 2], b = [x, 0, width / 2], c = [x, height, 0];
    if (sx > 0) gp.push(...a, ...c, ...b);
    else gp.push(...a, ...b, ...c);
  }
  const gables = new THREE.BufferGeometry();
  gables.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  gables.computeVertexNormals();
  return { roof, gables };
}

/** Cone roof for round towers (UVs follow the slope). */
export function coneRoof(radius, height, segments = KIT.towerSegments) {
  const r = radius + KIT.roofOverhang * 0.6;
  const g = new THREE.ConeGeometry(r, height, segments, 6, true);
  g.translate(0, height / 2, 0);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const slant = Math.hypot(r, height);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(x, z);
    uv.setXY(i, ((a + Math.PI) * r) / KIT.roofTile, ((1 - y / height) * slant) / KIT.roofTile);
  }
  // Eave soffit ring.
  const ring = new THREE.RingGeometry(radius * 0.9, r, segments);
  ring.rotateX(Math.PI / 2);
  const merged = merge([g, ring]);
  return merged;
}

/** Four-sided pyramid roof. */
export function pyramidRoof(size, height) {
  const r = (size / 2 + KIT.roofOverhang) * Math.SQRT2;
  const g = new THREE.ConeGeometry(r, height, 4, 1, true);
  g.rotateY(Math.PI / 4);
  g.translate(0, height / 2, 0);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const slant = Math.hypot(r, height);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getX(i), pos.getZ(i));
    uv.setXY(i, ((a + Math.PI) * r) / KIT.roofTile, ((1 - pos.getY(i) / height) * slant) / KIT.roofTile);
  }
  return g;
}

/** Pointed (equilateral) arch outline, base at y = 0, centred on x = 0. */
export function pointedArch(w, h, shape = new THREE.Shape(), reverse = false) {
  const rise = w * 0.5 * Math.sqrt(3) * KIT.window.archRatio;
  const spring = Math.max(0.01, h - rise);
  const pts = [];
  pts.push(new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, spring));
  const steps = 10;
  // Right arc: centred at (-w/2, spring) … apex at (0, spring + rise).
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const x = w / 2 - (w / 2) * t;
    const y = spring + rise * Math.sin((t * Math.PI) / 2) ** 0.8;
    pts.push(new THREE.Vector2(x, y));
  }
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const x = -(w / 2) * t;
    const y = spring + rise * Math.cos((t * Math.PI) / 2) ** 0.8;
    pts.push(new THREE.Vector2(x, y));
  }
  const ordered = reverse ? pts.reverse() : pts;
  shape.moveTo(ordered[0].x, ordered[0].y);
  for (let k = 1; k < ordered.length; k++) shape.lineTo(ordered[k].x, ordered[k].y);
  shape.closePath();
  return shape;
}

/**
 * Window: stone frame (protruding) + glass pane, facing +Z, base at y = 0.
 * @returns {{frame:THREE.BufferGeometry, pane:THREE.BufferGeometry}}
 */
export function windowUnit(w, h) {
  const W = KIT.window;
  const outer = pointedArch(w + W.frame * 2, h + W.frame);
  outer.holes.push(pointedArch(w, h, new THREE.Path(), true));
  const frame = new THREE.ExtrudeGeometry(outer, { depth: W.depth, bevelEnabled: false, curveSegments: 4 });
  frame.translate(0, -W.frame * 0.5, 0);
  const pane = new THREE.ShapeGeometry(pointedArch(w, h), 4);
  pane.translate(0, 0, 0.03);
  // Pane UVs in metres (lattice texture tiles per metre).
  const p = pane.attributes.position;
  const uv = pane.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + 0.5, p.getY(i));
  // A sill.
  const sill = block(w + W.frame * 3, W.frame, W.depth * 1.6);
  sill.translate(0, -W.frame * 1.4, W.depth * 0.3);
  return { frame: merge([frame, sill]), pane };
}

/** Stepped buttress against a wall (grows toward +Z). */
export function buttress(height, width = KIT.buttress.width, depth = KIT.buttress.depth) {
  const steps = KIT.buttress.steps;
  const list = [];
  for (let k = 0; k < steps; k++) {
    const h = height * (1 - k / steps) * 0.95;
    const d = depth * (1 - k / (steps + 0.5));
    const g = block(width, h, d);
    g.translate(0, 0, d / 2);
    list.push(g);
  }
  return merge(list);
}

/** Ring band around a cylinder (corbels / cornice). */
export function band(radius, height, out) {
  const g = new THREE.CylinderGeometry(radius + out, radius, height, KIT.towerSegments, 1, false);
  g.translate(0, height / 2, 0);
  return g;
}

/** Tower shaft with a slight batter at the base. */
export function towerShaft(radius, height) {
  const g = new THREE.CylinderGeometry(radius, radius * 1.05, height, KIT.towerSegments, 4, true);
  g.translate(0, height / 2, 0);
  return g;
}

/**
 * Bridge span: a block with a pointed arch cut through it, spanning local
 * X (length) and extruded along Z (width).
 */
export function archSpan(length, height, width, archWidth, archHeight) {
  const s = new THREE.Shape();
  s.moveTo(-length / 2, 0);
  s.lineTo(length / 2, 0);
  s.lineTo(length / 2, height);
  s.lineTo(-length / 2, height);
  s.closePath();
  if (archWidth > 0.5 && archHeight > 1) s.holes.push(pointedArch(archWidth, archHeight, new THREE.Path(), true));
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -width / 2);
  return g;
}

/** Finial spike with a ball. */
export function finial() {
  const F = KIT.finial;
  const spike = new THREE.ConeGeometry(F.radius, F.height, 8);
  spike.translate(0, F.height / 2, 0);
  const ball = new THREE.SphereGeometry(F.radius * 1.8, 10, 8);
  ball.translate(0, F.height * 0.35, 0);
  return merge([spike, ball]);
}

/** Swallow-tailed pennant along +X from the pole at x = 0. */
export function pennant() {
  const F = KIT.flag;
  const L = F.length;
  const H = F.height;
  const pos = [0, 0, 0, L, -H * 0.25, 0, L * 0.72, -H * 0.5, 0, 0, 0, 0, L * 0.72, -H * 0.5, 0, L, -H * 0.75, 0, 0, 0, 0, L, -H * 0.75, 0, 0, -H, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Plank door (with iron straps returned separately), facing +Z. */
export function door(w, h) {
  const D = KIT.door;
  const planks = new THREE.ShapeGeometry(pointedArch(w, h), 6);
  const p = planks.attributes.position;
  const uv = planks.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2.5, p.getY(i) / 2.5);
  const straps = [];
  for (const y of [h * 0.18, h * 0.5]) {
    const g = block(w * 0.96, D.strap * 1.5, D.strap);
    g.translate(0, y, D.strap / 2 + 0.02);
    straps.push(g);
  }
  return { planks, straps: merge(straps) };
}

/** Clock dial texture (Roman numerals, gilded ring). */
export function clockTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  g.fillStyle = '#e8dcc0';
  g.beginPath();
  g.arc(r, r, r * 0.98, 0, TAU);
  g.fill();
  g.lineWidth = size * 0.04;
  g.strokeStyle = '#b08a3a';
  g.stroke();
  g.fillStyle = '#2a2018';
  g.font = `bold ${Math.round(size * 0.1)}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  roman.forEach((t, k) => {
    const a = (k / 12) * TAU;
    g.fillText(t, r + Math.sin(a) * r * 0.74, r - Math.cos(a) * r * 0.74);
  });
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * TAU;
    const inner = k % 5 ? 0.9 : 0.86;
    g.lineWidth = k % 5 ? 1 : 3;
    g.beginPath();
    g.moveTo(r + Math.sin(a) * r * inner, r - Math.cos(a) * r * inner);
    g.lineTo(r + Math.sin(a) * r * 0.94, r - Math.cos(a) * r * 0.94);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
