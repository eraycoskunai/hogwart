/**
 * @file MeshKit — small geometry toolkit for the character generators:
 * an attribute builder with skin weights, parametric grids / tubes /
 * swept rings, seam-aware normal smoothing and weight helpers.
 */
import * as THREE from 'three';

/** @typedef {[number, number][]} Weights list of [boneIndex, weight] */

const _p = new THREE.Vector3();

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.uv1 = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.index = [];
    /** @type {Record<string, number[]>} extra float attributes (1 component) */
    this.extra = {};
    this.count = 0;
  }

  /**
   * @param {THREE.Vector3|number[]} p
   * @param {number[]} uv
   * @param {number[]} uv1
   * @param {Weights} w
   * @param {Record<string, number>} [extra]
   * @returns {number} vertex index
   */
  vertex(p, uv, uv1, w, extra) {
    if (Array.isArray(p)) this.pos.push(p[0], p[1], p[2]);
    else this.pos.push(p.x, p.y, p.z);
    this.uv.push(uv[0], uv[1]);
    this.uv1.push(uv1[0], uv1[1]);
    const ws = normalizeWeights(w);
    for (let k = 0; k < 4; k++) {
      this.skinIndex.push(ws[k] ? ws[k][0] : 0);
      this.skinWeight.push(ws[k] ? ws[k][1] : 0);
    }
    for (const key of Object.keys(this.extra)) this.extra[key].push(extra?.[key] ?? 0);
    return this.count++;
  }

  /** Declare an extra per-vertex float attribute (fills existing vertices with 0). */
  declare(name) {
    if (!this.extra[name]) this.extra[name] = new Array(this.count).fill(0);
  }

  tri(a, b, c) {
    this.index.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.index.push(a, b, d, b, c, d);
  }

  /**
   * Grid of (cols+1)×(rows+1) vertices. fn(u, v, i, j) returns the vertex
   * data; faces wind counter-clockwise when u runs right and v runs up.
   * @param {number} cols
   * @param {number} rows
   * @param {(u:number, v:number, i:number, j:number) => ({p:THREE.Vector3|number[], uv:number[], uv1:number[], w:Weights, extra?:Record<string, number>}|null)} fn
   * @param {{flip?:boolean, skip?:(i:number, j:number) => boolean}} [o]
   */
  grid(cols, rows, fn, o = {}) {
    const ids = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const d = fn(i / cols, j / rows, i, j);
        ids.push(d ? this.vertex(d.p, d.uv, d.uv1, d.w, d.extra) : -1);
      }
    }
    const at = (i, j) => ids[j * (cols + 1) + i];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (o.skip?.(i, j)) continue;
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i + 1, j + 1);
        const d = at(i, j + 1);
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        if (o.flip) this.quad(a, d, c, b);
        else this.quad(a, b, c, d);
      }
    }
    return { ids, at };
  }

  /** Append another builder (indices offset). */
  append(other) {
    const off = this.count;
    for (const key of Object.keys(other.extra)) this.declare(key);
    this.pos.push(...other.pos);
    this.uv.push(...other.uv);
    this.uv1.push(...other.uv1);
    this.skinIndex.push(...other.skinIndex);
    this.skinWeight.push(...other.skinWeight);
    for (const key of Object.keys(this.extra)) {
      const src = other.extra[key];
      for (let i = 0; i < other.count; i++) this.extra[key].push(src ? src[i] : 0);
    }
    for (const i of other.index) this.index.push(i + off);
    this.count += other.count;
    return off;
  }

  /** Apply a matrix to vertices [from, to). */
  transform(m, from = 0, to = this.count) {
    for (let i = from; i < to; i++) {
      _p.fromArray(this.pos, i * 3).applyMatrix4(m);
      this.pos[i * 3] = _p.x;
      this.pos[i * 3 + 1] = _p.y;
      this.pos[i * 3 + 2] = _p.z;
    }
  }

  /**
   * @param {{normals?:boolean, smoothSeams?:boolean}} [o]
   * @returns {THREE.BufferGeometry}
   */
  build(o = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(this.uv1, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));
    for (const [key, arr] of Object.entries(this.extra)) g.setAttribute(key, new THREE.Float32BufferAttribute(arr, 1));
    g.setIndex(this.index);
    if (o.normals !== false) {
      g.computeVertexNormals();
      if (o.smoothSeams !== false) smoothSeams(g);
    }
    return g;
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Vector3();

/**
 * Re-wind triangles [firstTri, lastTri) so their normals agree with a
 * desired outward direction.
 * @param {MeshBuilder} mb
 * @param {number} firstTri
 * @param {number} lastTri
 * @param {(centroid:THREE.Vector3, out:THREE.Vector3) => THREE.Vector3} outward
 */
export function orientTriangles(mb, firstTri, lastTri, outward) {
  const P = mb.pos;
  const I = mb.index;
  const dir = new THREE.Vector3();
  for (let t = firstTri; t < lastTri; t++) {
    const k = t * 3;
    _a.fromArray(P, I[k] * 3);
    _b.fromArray(P, I[k + 1] * 3);
    _c.fromArray(P, I[k + 2] * 3);
    _n.subVectors(_b, _a).cross(_m.subVectors(_c, _a));
    _m.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3);
    outward(_m, dir);
    if (_n.dot(dir) < 0) {
      const tmp = I[k + 1];
      I[k + 1] = I[k + 2];
      I[k + 2] = tmp;
    }
  }
}

/** Current triangle count of a builder. @param {MeshBuilder} mb */
export function triCount(mb) {
  return mb.index.length / 3;
}

/** Keep the 4 largest weights, normalised. @param {Weights} w */
export function normalizeWeights(w) {
  const merged = new Map();
  for (const [b, v] of w) if (v > 1e-4) merged.set(b, (merged.get(b) ?? 0) + v);
  const list = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = list.reduce((s, x) => s + x[1], 0) || 1;
  return list.map(([b, v]) => [b, v / sum]);
}

/** Blend two bones by t (0 → a, 1 → b). @returns {Weights} */
export function blend2(a, b, t) {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return [[a, 1 - k], [b, k]];
}

/** Smooth step helper returning 0..1 between e0 and e1 (either order). */
export function ramp(e0, e1, x) {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Groups of vertices sharing a position (UV seams, grid wrap-arounds).
 * @param {THREE.BufferGeometry} g
 * @param {number} [precision] metres
 * @returns {number[][]}
 */
export function seamGroups(g, precision = 1e-5) {
  const pos = g.attributes.position;
  const inv = 1 / precision;
  /** @type {Map<string, number[]>} */
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * inv)},${Math.round(pos.getY(i) * inv)},${Math.round(pos.getZ(i) * inv)}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(i);
  }
  return [...groups.values()].filter((l) => l.length > 1);
}

/**
 * Average normals within seam groups so seams do not show as creases.
 * @param {THREE.BufferGeometry} g
 * @param {number[][]} [groups] precomputed seamGroups(g)
 * @returns {number[][]} the groups used
 */
export function smoothSeams(g, groups = seamGroups(g)) {
  const nor = g.attributes.normal;
  const n = new THREE.Vector3();
  for (const list of groups) {
    n.set(0, 0, 0);
    for (const i of list) n.x += nor.getX(i), n.y += nor.getY(i), n.z += nor.getZ(i);
    n.normalize();
    for (const i of list) nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
  return groups;
}

/**
 * Superellipse ring point. Angle a = 0 faces front (-Z), increases toward +X.
 * @param {number} a
 * @param {number} rx
 * @param {number} rzF front depth
 * @param {number} rzB back depth
 * @param {number} n exponent (2 = ellipse)
 * @param {THREE.Vector3} out
 */
export function ringPoint(a, rx, rzF, rzB, n, out) {
  const s = Math.sin(a);
  const c = Math.cos(a);
  const e = 2 / n;
  const x = Math.sign(s) * Math.pow(Math.abs(s), e) * rx;
  const zc = Math.sign(c) * Math.pow(Math.abs(c), e);
  const z = -zc * (zc > 0 ? rzF : rzB);
  return out.set(x, 0, z);
}

/** Catmull-Rom point on a polyline of [x, y, z] (t in 0..1). */
export function polylinePoint(points, t, out) {
  const n = points.length - 1;
  const f = THREE.MathUtils.clamp(t, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const u = f - i;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n, i + 2)];
  const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return out.set(cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2]));
}

/** Linear interpolation in a table of [t, ...values] rows. */
export function sampleTable(rows, t, out = []) {
  if (t <= rows[0][0]) return rows[0].slice(1).map((v, k) => (out[k] = v)) && out;
  for (let i = 1; i < rows.length; i++) {
    if (t <= rows[i][0]) {
      const a = rows[i - 1];
      const b = rows[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      for (let c = 1; c < a.length; c++) out[c - 1] = a[c] + (b[c] - a[c]) * k;
      return out;
    }
  }
  const last = rows[rows.length - 1];
  for (let c = 1; c < last.length; c++) out[c - 1] = last[c];
  return out;
}

/**
 * Build a tube along a curve with a radius profile (hair tails, braids,
 * fingers). Frames are parallel-transported.
 * @param {MeshBuilder} mb
 * @param {(t:number, out:THREE.Vector3) => THREE.Vector3} curve
 * @param {(t:number, a:number) => number} radius
 * @param {{rings:number, segments:number, uv:(t:number, a:number)=>number[], uv1:(t:number, a:number)=>number[],
 *          weights:(t:number, p:THREE.Vector3)=>Weights, capStart?:boolean, capEnd?:boolean, up?:THREE.Vector3}} o
 */
export function tube(mb, curve, radius, o) {
  const pts = [];
  for (let i = 0; i <= o.rings; i++) pts.push(curve(i / o.rings, new THREE.Vector3()));
  const tangents = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    return new THREE.Vector3().subVectors(b, a).normalize();
  });
  let normal = new THREE.Vector3().crossVectors(tangents[0], o.up ?? new THREE.Vector3(1, 0, 0));
  if (normal.lengthSq() < 1e-6) normal.crossVectors(tangents[0], new THREE.Vector3(0, 0, 1));
  normal.normalize();
  const frames = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const q = new THREE.Quaternion().setFromUnitVectors(tangents[i - 1], tangents[i]);
      normal = normal.clone().applyQuaternion(q);
    }
    const bin = new THREE.Vector3().crossVectors(tangents[i], normal).normalize();
    frames.push({ n: normal.clone(), b: bin });
  }
  const p = new THREE.Vector3();
  const res = mb.grid(o.segments, o.rings, (u, v, i, j) => {
    const a = u * Math.PI * 2;
    const r = radius(v, a);
    const f = frames[j];
    p.copy(pts[j]).addScaledVector(f.n, Math.cos(a) * r).addScaledVector(f.b, Math.sin(a) * r);
    return { p: p.clone(), uv: o.uv(v, u), uv1: o.uv1(v, u), w: o.weights(v, pts[j]) };
  });
  const cap = (j, flip) => {
    const c = mb.vertex(pts[j], o.uv(j / o.rings, 0.5), o.uv1(j / o.rings, 0.5), o.weights(j / o.rings, pts[j]));
    for (let i = 0; i < o.segments; i++) {
      const a = res.at(i, j);
      const b = res.at(i + 1, j);
      if (flip) mb.tri(c, a, b);
      else mb.tri(c, b, a);
    }
  };
  if (o.capStart) cap(0, false);
  if (o.capEnd) cap(o.rings, true);
  return res;
}
