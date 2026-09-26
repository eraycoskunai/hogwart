/**
 * @file InteriorKit — procedural geometry for castle interiors: walls with
 * arched doorways and windows, columns, stairs, railings, furniture (tables,
 * benches, desks, chairs, bookshelves, armchairs, crates, chests), suits of
 * armour, chandeliers, lecterns, cauldrons, jar shelves, fireplaces, a
 * hanging dragon skeleton and door leaves. Every function returns geometry
 * in a local frame (documented per function); callers place it with a
 * matrix and batch it per material.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pointedArch } from './CastleKit.js';
import { KIT } from '../../data/castle.js';
import { INTERIOR_KIT as IK } from '../../data/interior.js';

const TAU = Math.PI * 2;

/** Box with its base centred on the origin. */
export function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

/** Cylinder standing on y = 0. */
export function cyl(rt, rb, h, seg = 12, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}

/** Merge geometries after reducing them to position/normal/uv. */
export function merge(list) {
  const clean = list.filter(Boolean).map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  return mergeGeometries(clean, false);
}

/** Height of a pointed arch of width w / height h above x (0 at the centre). */
export function archY(x, w, h) {
  const rise = w * 0.5 * Math.sqrt(3) * KIT.window.archRatio;
  const spring = Math.max(0.01, h - rise);
  const t = THREE.MathUtils.clamp(1 - Math.abs(x) / (w / 2), 0, 1);
  return spring + rise * Math.sin((t * Math.PI) / 2) ** 0.8;
}

// ------------------------------------------------------------------ walls

/**
 * Wall slab with openings. Local frame: u along +X from 0 to `length`,
 * v up +Y from 0 to `height`, thickness from z = 0 to z = `thickness`.
 * @param {number} length
 * @param {number} height
 * @param {number} thickness
 * @param {{u:number, v:number, w:number, h:number, shape?:'arch'|'rect'}[]} holes centre u, sill v
 */
export function wallWithHoles(length, height, thickness, holes) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(length, 0);
  s.lineTo(length, height);
  s.lineTo(0, height);
  s.closePath();
  for (const h of holes) {
    const path = new THREE.Path();
    if (h.shape === 'rect') {
      path.moveTo(h.u - h.w / 2, h.v);
      path.lineTo(h.u - h.w / 2, h.v + h.h);
      path.lineTo(h.u + h.w / 2, h.v + h.h);
      path.lineTo(h.u + h.w / 2, h.v);
      path.closePath();
    } else {
      const arch = pointedArch(h.w, h.h, new THREE.Path(), true);
      const pts = arch.getPoints(4).map((p) => new THREE.Vector2(p.x + h.u, p.y + h.v));
      path.setFromPoints(pts);
    }
    s.holes.push(path);
  }
  return new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 4 });
}

/** Stone arch frame (architrave) around an opening, facing +Z, base centred. */
export function archFrame(w, h, frame, depth) {
  const outer = pointedArch(w + frame * 2, h + frame);
  outer.holes.push(pointedArch(w, h, new THREE.Path(), true));
  const g = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ------------------------------------------------------------ structure

/** Column with a square plinth and capital, standing on y = 0. */
export function column(radius, height) {
  const C = IK.column;
  const base = box(radius * 2.6, C.base, radius * 2.6);
  const torus = new THREE.TorusGeometry(radius * 1.05, radius * 0.18, 8, C.segments);
  torus.rotateX(Math.PI / 2);
  torus.translate(0, C.base + radius * 0.15, 0);
  const shaft = cyl(radius * 0.92, radius, height - C.base - C.capital, C.segments, 0, C.base);
  const cap = cyl(radius * 1.35, radius * 0.95, C.capital * 0.6, C.segments, 0, height - C.capital);
  const abacus = box(radius * 2.8, C.capital * 0.4, radius * 2.8, 0, height - C.capital * 0.4);
  return merge([base, torus, shaft, cap, abacus]);
}

/**
 * Straight flight of steps rising toward -Z, from z = 0 (bottom front) to
 * z = -run; each step is solid down to y = 0. Width along X.
 */
export function stairSteps(width, rise, run, steps) {
  const list = [];
  const r = rise / steps;
  const t = run / steps;
  for (let i = 0; i < steps; i++) {
    const h = r * (i + 1);
    list.push(box(width, h, t, 0, 0, -t * (i + 0.5)));
  }
  return merge(list);
}

/**
 * Moving staircase flight in its body frame: the ramp surface runs from
 * (0, -rise/2, run/2) up to (0, rise/2, -run/2); steps sit on a sloped
 * stringer, with balustrades on both sides.
 * @returns {{stone:THREE.BufferGeometry, wood:THREE.BufferGeometry}}
 */
export function flight(width, rise, run, steps, thickness, rail) {
  const stone = [];
  const wood = [];
  const r = rise / steps;
  const t = run / steps;
  for (let i = 0; i < steps; i++) {
    const g = box(width, r, t + 0.02, 0, -rise / 2 + r * i, run / 2 - t * (i + 0.5));
    stone.push(g);
  }
  const len = Math.hypot(rise, run);
  const pitch = Math.atan2(rise, run);
  const under = new THREE.BoxGeometry(width, thickness, len);
  under.translate(0, -thickness / 2, 0);
  under.rotateX(pitch);
  stone.push(under);
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.06);
    const rail0 = new THREE.BoxGeometry(0.08, 0.08, len);
    rail0.rotateX(pitch);
    rail0.translate(x, rail, 0);
    wood.push(rail0);
    const n = Math.round(len / 0.9);
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      const z = run / 2 - run * f;
      const y = -rise / 2 + rise * f;
      wood.push(cyl(0.025, 0.03, rail, 6, x, y, z));
    }
    const newel = box(0.14, rail + 0.2, 0.14, x, -rise / 2, run / 2 - 0.08);
    const newel2 = box(0.14, rail + 0.2, 0.14, x, rise / 2, -run / 2 + 0.08);
    wood.push(newel, newel2);
  }
  return { stone: merge(stone), wood: merge(wood) };
}

/** Railing along +X from 0 to `length`, standing on y = 0. */
export function railing(length) {
  const R = IK.railing;
  const list = [box(length, R.thickness * 0.8, R.thickness, length / 2, R.height - R.thickness * 0.8)];
  const n = Math.max(1, Math.round(length / R.postSpacing));
  for (let i = 0; i <= n; i++) list.push(box(R.post, R.height, R.post, (i / n) * length));
  for (let i = 0; i < n * 4; i++) list.push(cyl(0.022, 0.028, R.height - 0.1, 6, ((i + 0.5) / (n * 4)) * length));
  return merge(list);
}

// ------------------------------------------------------------ furniture

/** Long table along +X (length) centred at the origin, top at `top`. */
export function longTable(length, width, top) {
  const th = 0.1;
  const list = [box(length, th, width, 0, top - th)];
  for (const lx of [-length / 2 + 0.3, 0, length / 2 - 0.3]) {
    for (const lz of [-width / 2 + 0.15, width / 2 - 0.15]) list.push(box(0.12, top - th, 0.12, lx, 0, lz));
  }
  list.push(box(length - 0.8, 0.08, 0.06, 0, 0.2, 0));
  return merge(list);
}

/** Bench along +X centred at the origin. */
export function bench(length, height = 0.46, width = 0.42) {
  const list = [box(length, 0.08, width, 0, height - 0.08)];
  for (const lx of [-length / 2 + 0.4, length / 2 - 0.4]) list.push(box(0.1, height - 0.08, width - 0.08, lx));
  return merge(list);
}

/** Pupil's desk facing -Z (the student sits at +Z). */
export function desk() {
  const D = IK.desk;
  const list = [box(D.width, D.top, D.depth, 0, D.height - D.top)];
  list.push(box(D.width - 0.1, D.height * 0.35, 0.03, 0, D.height * 0.62, -D.depth / 2 + 0.03));
  for (const sx of [-1, 1]) list.push(box(0.05, D.height - D.top, D.depth - 0.04, sx * (D.width / 2 - 0.05)));
  list.push(box(D.width - 0.1, 0.03, D.depth - 0.1, 0, D.height * 0.55));
  return merge(list);
}

/** Chair facing -Z (back at +Z). */
export function chair(highBack = false) {
  const C = IK.chair;
  const s = C.size;
  const list = [box(s, 0.05, s, 0, C.seat - 0.05)];
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) list.push(box(0.045, C.seat - 0.05, 0.045, lx * (s / 2 - 0.03), 0, lz * (s / 2 - 0.03)));
  const back = highBack ? C.back * 1.6 : C.back;
  list.push(box(s, back - C.seat, 0.05, 0, C.seat, s / 2 - 0.025));
  if (highBack) list.push(new THREE.ConeGeometry(0.07, 0.2, 6).translate(0, back + 0.1, s / 2 - 0.025));
  return merge(list);
}

/**
 * Bookshelf along +X from 0 to `length`, back at z = 0, shelves facing +Z
 * (and -Z when double). Returns the frame and the book faces (UVs in metres).
 */
export function bookshelf(length, height, double) {
  const B = IK.bookshelf;
  const depth = double ? B.depth * 2 : B.depth;
  const z0 = double ? -B.depth : 0;
  const frame = [];
  const books = [];
  frame.push(box(B.side, height, depth, B.side / 2, 0, z0 + depth / 2));
  frame.push(box(B.side, height, depth, length - B.side / 2, 0, z0 + depth / 2));
  frame.push(box(length, 0.05, depth + 0.06, length / 2, height - 0.05, z0 + depth / 2));
  frame.push(box(length, 0.12, depth, length / 2, 0, z0 + depth / 2));
  frame.push(box(length, height, 0.03, length / 2, 0, double ? 0 : 0.015));
  const levels = Math.floor((height - 0.2) / B.shelfGap);
  for (let i = 0; i <= levels; i++) {
    const y = 0.12 + i * B.shelfGap;
    frame.push(box(length - B.side * 2, B.board, depth, length / 2, y, z0 + depth / 2));
    if (i === levels) break;
    const bh = B.shelfGap - B.board - 0.03;
    for (const face of double ? [1, -1] : [1]) {
      const p = new THREE.PlaneGeometry(length - B.side * 2, bh);
      const uv = p.attributes.uv;
      // Book texture: one repeat per metre of shelf; rows offset so they differ.
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (length - B.side * 2) + i * 0.37 + (face < 0 ? 0.5 : 0), uv.getY(k) * 0.5 + (i % 2) * 0.5);
      if (face < 0) p.rotateY(Math.PI);
      p.translate(length / 2, y + B.board + bh / 2, face * (B.depth - B.inset));
      books.push(p);
    }
  }
  return { frame: merge(frame), books: merge(books) };
}

/** Armchair facing -Z. @returns {{frame, cushion}} */
export function armchair() {
  const frame = merge([box(0.9, 0.3, 0.85, 0, 0.08), box(0.9, 0.75, 0.2, 0, 0.3, 0.33), box(0.16, 0.36, 0.8, -0.37, 0.3, 0.02), box(0.16, 0.36, 0.8, 0.37, 0.3, 0.02)]);
  frame.translate(0, 0, 0);
  const cushion = merge([box(0.6, 0.14, 0.6, 0, 0.38, -0.05), box(0.6, 0.55, 0.12, 0, 0.5, 0.2)]);
  return { frame, cushion };
}

/** Iron-bound chest facing -Z. @returns {{wood, iron}} */
export function chest() {
  const [w, h, d] = IK.chest.size;
  const wood = merge([box(w, h * 0.7, d), box(w, h * 0.3, d, 0, h * 0.7)]);
  const iron = [];
  for (const x of [-w * 0.35, w * 0.35]) iron.push(box(0.06, h + 0.01, d + 0.02, x));
  iron.push(box(0.12, 0.14, 0.03, 0, h * 0.55, -d / 2 - 0.01));
  return { wood, iron: merge(iron) };
}

/** Pile of `count` stacked crates (count up to 4) on y = 0. */
export function crateStack(count, seed) {
  const s = IK.crate.size;
  const list = [];
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const k = 0.75 + rnd() * 0.3;
    const g = box(s * k, s * k, s * k);
    g.rotateY((rnd() - 0.5) * 0.5);
    g.translate((rnd() - 0.5) * 0.25, i * s * 0.92, (rnd() - 0.5) * 0.25);
    list.push(g);
  }
  return merge(list);
}

/** Suit of armour facing -Z (with its halberd unless `weapon` is false). @returns geometry (metal) */
export function armor(weapon = true) {
  const H = IK.armor.height;
  const list = [];
  list.push(box(0.55, 0.12, 0.4)); // plinth
  for (const sx of [-1, 1]) {
    list.push(cyl(0.07, 0.08, 0.5, 8, sx * 0.1, 0.12)); // greaves
    list.push(cyl(0.08, 0.07, 0.42, 8, sx * 0.1, 0.62)); // cuisses
    list.push(box(0.12, 0.06, 0.2, sx * 0.1, 0.12, -0.04)); // sabatons
    list.push(new THREE.SphereGeometry(0.075, 8, 6).translate(sx * 0.1, 0.62, -0.02)); // knees
    list.push(cyl(0.055, 0.06, 0.36, 8, sx * 0.25, 1.1).rotateZ(sx * 0.12)); // arms
    list.push(new THREE.SphereGeometry(0.1, 10, 8).translate(sx * 0.22, 1.46, 0)); // pauldrons
    list.push(box(0.09, 0.12, 0.08, sx * 0.3, 0.98, -0.02)); // gauntlets
  }
  list.push(cyl(0.2, 0.17, 0.2, 12, 0, 1.0)); // faulds
  const torso = new THREE.SphereGeometry(0.22, 14, 10, 0, TAU, 0, Math.PI * 0.62);
  torso.scale(1, 1.3, 0.8);
  torso.rotateX(Math.PI);
  torso.translate(0, 1.5, 0);
  list.push(torso, cyl(0.19, 0.2, 0.3, 12, 0, 1.2));
  list.push(cyl(0.12, 0.14, 0.26, 12, 0, 1.62)); // helm
  list.push(new THREE.SphereGeometry(0.12, 12, 8, 0, TAU, 0, Math.PI / 2).translate(0, 1.88, 0));
  list.push(box(0.2, 0.02, 0.04, 0, 1.76, -0.13)); // visor slit bar
  list.push(new THREE.ConeGeometry(0.03, 0.18, 6).translate(0, H - 0.03, 0)); // crest spike
  // Halberd in the right hand.
  if (weapon) {
    list.push(cyl(0.018, 0.018, 2.1, 6, 0.32, 0.12));
    list.push(box(0.03, 0.26, 0.2, 0.32, 1.95, -0.08));
  }
  return merge(list);
}

/** Iron chandelier ring hanging from a chain; candles returned as positions. */
export function chandelier(radius, candles) {
  const ring = new THREE.TorusGeometry(radius, 0.05, 6, 32);
  ring.rotateX(Math.PI / 2);
  const inner = new THREE.TorusGeometry(radius * 0.55, 0.035, 6, 24);
  inner.rotateX(Math.PI / 2);
  inner.translate(0, 0.25, 0);
  const list = [ring, inner, cyl(0.03, 0.03, 3, 6, 0, 0.25)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const spoke = new THREE.CylinderGeometry(0.02, 0.02, radius, 5);
    spoke.rotateZ(Math.PI / 2);
    spoke.rotateY(-a);
    spoke.translate(Math.cos(a) * radius * 0.5, 0.02, Math.sin(a) * radius * 0.5);
    list.push(spoke);
  }
  const points = [];
  for (let i = 0; i < candles; i++) {
    const a = (i / candles) * TAU;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    list.push(cyl(0.045, 0.035, 0.05, 8, x, 0.02, z));
    points.push(new THREE.Vector3(x, 0.07, z));
  }
  return { iron: merge(list), candles: points };
}

/** Candle stick (wax) on y = 0. */
export function candle(h = 0.24, r = 0.03) {
  return cyl(r * 0.9, r, h, 8);
}

/** Lectern facing -Z; with an eagle/owl figure when `owl`. @returns {{wood, gold}} */
export function lectern(owl) {
  const wood = [cyl(0.2, 0.28, 0.08, 12), cyl(0.06, 0.08, 1.0, 10, 0, 0.08)];
  const desk = box(0.6, 0.05, 0.45, 0, 0, 0);
  desk.rotateX(0.35);
  desk.translate(0, 1.1, 0);
  wood.push(desk);
  const gold = [];
  if (owl) {
    const body = new THREE.SphereGeometry(0.2, 12, 10);
    body.scale(1, 1.25, 0.9);
    body.translate(0, 1.18, 0.05);
    const head = new THREE.SphereGeometry(0.13, 12, 10).translate(0, 1.5, 0);
    for (const sx of [-1, 1]) {
      const wing = new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI);
      wing.scale(0.35, 1.6, 1.4);
      wing.rotateY(sx * Math.PI / 2);
      wing.translate(sx * 0.22, 1.25, 0.1);
      gold.push(wing);
      gold.push(new THREE.ConeGeometry(0.04, 0.1, 6).translate(sx * 0.08, 1.64, 0));
    }
    gold.push(body, head, new THREE.ConeGeometry(0.03, 0.06, 5).rotateX(-Math.PI / 2).translate(0, 1.48, -0.13));
    wood.length = 0;
    wood.push(cyl(0.22, 0.3, 0.1, 12), cyl(0.07, 0.09, 0.92, 10, 0, 0.1));
  }
  return { wood: merge(wood), gold: gold.length ? merge(gold) : null };
}

/** Cauldron (open bowl) with three legs, liquid disc returned separately. */
export function cauldron() {
  const C = IK.cauldron;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const a = t * Math.PI * 0.62;
    pts.push(new THREE.Vector2(Math.sin(a) * C.radius, C.stand + C.height * 0.5 - Math.cos(a) * C.height * 0.5));
  }
  pts.push(new THREE.Vector2(C.radius * 0.92, C.stand + C.height * 0.8));
  pts.push(new THREE.Vector2(C.radius * 0.98, C.stand + C.height * 0.84));
  const bowl = new THREE.LatheGeometry(pts, 20);
  const list = [bowl];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    list.push(cyl(0.025, 0.03, C.stand + 0.08, 6, Math.cos(a) * C.radius * 0.6, 0, Math.sin(a) * C.radius * 0.6));
  }
  const liquid = new THREE.CircleGeometry(C.radius * 0.86, 20);
  liquid.rotateX(-Math.PI / 2);
  liquid.translate(0, C.stand + C.height * 0.66, 0);
  return { iron: merge(list), liquid };
}

/** Fireplace built against a wall (back at z = 0, opening toward +Z). */
export function fireplace() {
  const list = [];
  list.push(box(2.8, 0.3, 1.0, 0, 0, 0.5)); // hearth
  list.push(box(0.45, 1.6, 0.8, -1.1, 0.3, 0.4));
  list.push(box(0.45, 1.6, 0.8, 1.1, 0.3, 0.4));
  list.push(box(2.9, 0.35, 0.95, 0, 1.9, 0.45)); // mantel
  list.push(box(2.3, 2.6, 0.55, 0, 2.25, 0.28)); // chimney breast
  list.push(box(1.75, 1.6, 0.1, 0, 0.3, 0.05)); // back
  return merge(list);
}

/** Hanging dragon skeleton (bone material), head toward -Z, hung from y = 0 downward. */
export function dragonSkeleton() {
  const list = [];
  const spineN = 22;
  const pts = [];
  for (let i = 0; i < spineN; i++) {
    const t = i / (spineN - 1);
    const z = -3.2 + t * 7.2;
    const y = -1.4 - Math.sin(t * Math.PI) * 0.35 + (t > 0.7 ? (t - 0.7) * 1.2 : 0);
    const x = Math.sin(t * 5) * 0.15;
    pts.push(new THREE.Vector3(x, y, z));
    const r = 0.1 * (1 - t * 0.75);
    list.push(new THREE.SphereGeometry(r, 7, 5).translate(x, y, z));
    // Ribs on the chest section.
    if (t > 0.12 && t < 0.45) {
      for (const sx of [-1, 1]) {
        const rib = new THREE.TorusGeometry(0.45 - Math.abs(t - 0.28) * 1.2, 0.02, 4, 10, Math.PI * 0.8);
        rib.rotateY(Math.PI / 2);
        rib.rotateZ(sx > 0 ? 0 : Math.PI);
        rib.translate(x, y - 0.05, z);
        list.push(rib);
      }
    }
  }
  // Skull + jaw + horns.
  const skull = new THREE.ConeGeometry(0.22, 0.8, 8);
  skull.rotateX(-Math.PI / 2);
  skull.translate(0, -1.3, -3.7);
  const jaw = new THREE.ConeGeometry(0.12, 0.7, 6);
  jaw.rotateX(-Math.PI / 2 - 0.25);
  jaw.translate(0, -1.5, -3.6);
  list.push(skull, jaw);
  for (const sx of [-1, 1]) {
    list.push(new THREE.ConeGeometry(0.04, 0.45, 5).rotateX(0.9).rotateZ(sx * 0.4).translate(sx * 0.14, -1.05, -3.35));
    // Wing: arm bone + three finger bones.
    const shoulder = new THREE.Vector3(sx * 0.15, -1.35, -1.8);
    const elbow = new THREE.Vector3(sx * 1.6, -0.9, -1.2);
    const wrist = new THREE.Vector3(sx * 2.8, -0.7, -1.9);
    list.push(boneBetween(shoulder, elbow, 0.05), boneBetween(elbow, wrist, 0.04));
    for (const f of [[3.6, -1.1, -0.2], [3.3, -1.3, 0.8], [2.4, -1.4, 1.4]]) list.push(boneBetween(wrist, new THREE.Vector3(sx * f[0], f[1], f[2]), 0.025));
    // Legs.
    for (const lz of [-1.6, 1.3]) {
      const hip = new THREE.Vector3(sx * 0.15, -1.55, lz);
      const knee = new THREE.Vector3(sx * 0.45, -2.1, lz - 0.2);
      const foot = new THREE.Vector3(sx * 0.5, -2.5, lz + 0.2);
      list.push(boneBetween(hip, knee, 0.045), boneBetween(knee, foot, 0.035));
    }
  }
  // Suspension wires.
  for (const z of [-2.5, 0.2, 2.8]) list.push(cyl(0.006, 0.006, 1.4, 4, 0, -1.4, z));
  return merge(list);
}

/** Cylinder bone between two points. */
export function boneBetween(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r * 0.8, r, d.length(), 6);
  g.translate(0, d.length() / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/**
 * Door leaf covering x ∈ [x0, x1] of an arched opening (w × h centred on x = 0),
 * hinge at the origin: returns geometry relative to the hinge (leaf along +X or -X).
 * Thickness centred on z = 0.
 * @returns {{planks:THREE.BufferGeometry, iron:THREE.BufferGeometry}}
 */
export function doorLeaf(w, h, x0, x1, hingeX, arched = true) {
  const D = IK.door;
  const s = new THREE.Shape();
  const N = 10;
  s.moveTo(x0, 0);
  s.lineTo(x1, 0);
  for (let i = 0; i <= N; i++) {
    const x = x1 + ((x0 - x1) * i) / N;
    s.lineTo(x, arched ? archY(x, w, h) - 0.02 : h);
  }
  s.closePath();
  const planks = new THREE.ExtrudeGeometry(s, { depth: D.thickness, bevelEnabled: false, curveSegments: 1 });
  planks.translate(-hingeX, 0, -D.thickness / 2);
  // UVs in metres (planks run vertically).
  const p = planks.attributes.position;
  const uv = planks.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + hingeX, p.getY(i));
  const iron = [];
  const lw = Math.abs(x1 - x0);
  const cx = (x0 + x1) / 2 - hingeX;
  for (const y of [h * 0.14, h * 0.5]) {
    for (const side of [-1, 1]) iron.push(box(lw * 0.92, D.strap, 0.02, cx, y, side * (D.thickness / 2 + 0.01)));
  }
  // Ring handle near the free edge.
  const free = (Math.abs(x0 - hingeX) > Math.abs(x1 - hingeX) ? x0 : x1) - hingeX;
  const ringX = free - Math.sign(free) * 0.22;
  for (const side of [-1, 1]) {
    const ring = new THREE.TorusGeometry(D.handleRadius, 0.012, 6, 14);
    ring.translate(ringX, h * 0.42, side * (D.thickness / 2 + 0.03));
    iron.push(ring, box(0.05, 0.05, 0.03, ringX, h * 0.42 + D.handleRadius, side * (D.thickness / 2 + 0.015)));
  }
  return { planks, iron: merge(iron) };
}

/** Iron grille panel along +X (length) standing on y = 0. */
export function grille(length, height, bar = 0.028, spacing = 0.16) {
  const list = [box(length, 0.06, 0.06, length / 2, height - 0.06), box(length, 0.06, 0.06, length / 2, 0), box(length, 0.04, 0.04, length / 2, height * 0.55)];
  const n = Math.max(1, Math.round(length / spacing));
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * length;
    list.push(cyl(bar, bar, height, 6, x));
    list.push(new THREE.ConeGeometry(bar * 2, 0.12, 6).translate(x, height + 0.06, 0));
  }
  return merge(list);
}

/** Wall torch bracket facing +Z (the torch leans out), base on the wall at z = 0. */
export function torchBracket() {
  const iron = [box(0.08, 0.3, 0.04, 0, -0.35, 0.02), box(0.05, 0.05, 0.32, 0, -0.28, 0.16)];
  const cup = new THREE.CylinderGeometry(0.075, 0.045, 0.13, 10, 1, true);
  cup.translate(0, 0.1, 0.32);
  iron.push(cup);
  const handle = new THREE.CylinderGeometry(0.035, 0.025, 0.5, 8);
  handle.rotateX(0.35);
  handle.translate(0, -0.1, 0.28);
  return { iron: merge(iron), wood: handle };
}

/** Shelf with jars along +X, back at z = 0; jar positions returned (local). */
export function jarShelf(length, rows, seed) {
  const J = IK.jar;
  const wood = [];
  const jars = [];
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < rows; k++) {
    const y = k * 0.45;
    wood.push(box(length, 0.04, 0.32, length / 2, y, 0.16));
    for (let x = J.spacing; x < length - J.spacing * 0.5; x += J.spacing * (0.8 + rnd() * 0.6)) {
      if (rnd() < 0.18) continue;
      const s = 0.7 + rnd() * 0.7;
      jars.push({ x, y: y + 0.04, z: 0.16 + (rnd() - 0.5) * 0.08, s, hue: rnd() });
    }
  }
  for (const x of [0.02, length - 0.02]) wood.push(box(0.04, rows * 0.45, 0.32, x, -0.02, 0.16));
  return { wood: merge(wood), jars };
}
