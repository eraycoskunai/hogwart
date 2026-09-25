/**
 * @file Garments — simulated clothing: the school robe (CPU-skinned upper
 * body, bell sleeves and hood, free-swinging skirt), the Quidditch cape
 * and the scarf (knitted wrap + two hanging tails). Each garment is a
 * particle layout (rest positions, skin weights, pins, links) for
 * ClothSim plus the triangles / UVs of its render mesh.
 */
import * as THREE from 'three';
import { ROBE, CAPE, SCARF, TORSO } from '../../data/character.js';
import { MATERIALS } from '../../data/materials.js';
import { BONE_INDEX as B } from './Skeleton.js';
import { ringPoint, normalizeWeights, ramp } from './MeshKit.js';
import { gridLinks } from '../../animation/ClothSim.js';

const TAU = Math.PI * 2;
const FABRIC_TILE = MATERIALS.robeFabric.tile * 0.25;

/** Accumulates particles, links and triangles for one garment. */
class Layout {
  constructor() {
    this.rest = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.pinned = [];
    this.links = [];
    this.stiffness = [];
    this.index = [];
    this.uv = [];
    this.count = 0;
  }

  /** @param {THREE.Vector3} p @param {[number, number][]} w @param {boolean} pin @param {number[]} uv */
  add(p, w, pin, uv) {
    this.rest.push(p.x, p.y, p.z);
    const ws = normalizeWeights(w);
    for (let k = 0; k < 4; k++) {
      this.skinIndex.push(ws[k] ? ws[k][0] : 0);
      this.skinWeight.push(ws[k] ? ws[k][1] : 0);
    }
    this.pinned.push(pin ? 1 : 0);
    this.uv.push(uv[0], uv[1]);
    return this.count++;
  }

  /**
   * Grid of particles; fn(c, r) → {p, w, pin, uv}. Returns the first index.
   * @param {number} cols
   * @param {number} rows
   * @param {(c:number, r:number) => {p:THREE.Vector3, w:[number, number][], pin:boolean, uv:number[]}} fn
   * @param {{wrap?:boolean, flip?:boolean, bend?:boolean}} [o]
   */
  grid(cols, rows, fn, o = {}) {
    const first = this.count;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = fn(c, r);
        this.add(d.p, d.w, d.pin, d.uv);
      }
    }
    const L = gridLinks(cols, rows, { wrap: o.wrap, offset: first, bend: o.bend });
    this.links.push(...L.links);
    this.stiffness.push(...L.stiffness);
    const id = (c, r) => first + r * cols + (c % cols);
    const cmax = o.wrap ? cols : cols - 1;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cmax; c++) {
        const a = id(c, r), b = id(c + 1, r), cc = id(c + 1, r + 1), d = id(c, r + 1);
        if (o.flip) this.index.push(a, d, b, b, d, cc);
        else this.index.push(a, b, d, b, cc, d);
      }
    }
    return first;
  }

  /** Link two existing particles. */
  link(a, b, k = 1) {
    this.links.push(a, b);
    this.stiffness.push(k);
  }

  spec() {
    return {
      rest: new Float32Array(this.rest),
      skinIndex: new Uint16Array(this.skinIndex),
      skinWeight: new Float32Array(this.skinWeight),
      pinned: new Uint8Array(this.pinned),
      links: new Uint32Array(this.links),
      stiffness: new Float32Array(this.stiffness),
      index: this.index,
      uv: new Float32Array(this.uv),
    };
  }
}

const _v = new THREE.Vector3();

/**
 * School robe.
 * @param {Record<string, THREE.Vector3>} J
 * @param {ReturnType<import('./BodyGenerator.js').bodyShape>} S
 */
export function robeLayout(J, S) {
  const s = S.s;
  const L = new Layout();
  const off = ROBE.offset * s;
  const cols = ROBE.columns;
  const upper = ROBE.upperRows;
  const skirt = ROBE.skirtRows;
  const rows = upper + skirt;
  const yTop = (TORSO.rings[TORSO.rings.length - 2][0] - 0.004) * s;
  const yWaist = (TORSO.waistY + 0.03) * s;
  const yHem = ROBE.hemY * s;
  const hipsY = TORSO.rings[3][0] * s;
  const heights = [];
  for (let r = 0; r < rows; r++) {
    heights.push(r < upper ? THREE.MathUtils.lerp(yTop, yWaist, r / (upper - 1)) : THREE.MathUtils.lerp(yWaist, yHem, (r - upper + 1) / skirt));
  }
  // Physical v coordinate (arc length down the robe) for the fabric UVs.
  const vDist = heights.map((y) => (yTop - y) / FABRIC_TILE);
  L.grid(cols, rows, (c, r) => {
    const y = heights[r];
    const f = r < upper ? r / (upper - 1) : 1 + (r - upper + 1) / skirt;
    const open = f <= 1 ? THREE.MathUtils.lerp(ROBE.open.top, ROBE.open.waist, Math.sqrt(f)) : THREE.MathUtils.lerp(ROBE.open.waist, ROBE.open.hem, f - 1);
    const a = open + (c / (cols - 1)) * (TAU - 2 * open);
    const skirtT = Math.max(0, f - 1);
    const T = S.torsoAt(Math.max(y, hipsY));
    const flare = ROBE.flare * s * Math.pow(skirtT, 1.3);
    ringPoint(a, T.rx + off + flare, T.rzF + off + flare * 0.8, T.rzB + off + flare, TORSO.exponent, _v);
    _v.y = y;
    _v.z += T.z;
    let w = S.torsoWeights(_v.x, Math.max(y, hipsY));
    if (skirtT > 0) {
      const side = _v.x >= 0 ? 'R' : 'L';
      const wt = 0.35 * skirtT * Math.min(1, Math.abs(_v.x) / (T.rx * 0.5)) * (Math.cos(a) > -0.3 ? 1 : 0.4);
      w = [[B.hips, 1 - wt], [B[`thigh${side}`], wt]];
    }
    return { p: _v.clone(), w, pin: r < upper, uv: [(a * (T.rx + off)) / FABRIC_TILE, vDist[r]] };
  });

  // Bell sleeves: pinned to the arm, the last rows swing freely.
  const sl = ROBE.sleeve;
  const dome = sl.domeRows;
  const total = sl.rows + dome;
  for (const side of ['L', 'R']) {
    const sh = J[`upperArm${side}`];
    const tEnd = 1 + sl.extend * s / S.armLen;
    const [r0x, r0z] = S.armRadius(0);
    L.grid(sl.segments, total, (c, r) => {
      const a = (c / sl.segments) * TAU - Math.PI;
      if (r < dome) {
        // Rounded cap over the shoulder.
        const al = (1 - r / dome) * Math.PI * 0.47;
        ringPoint(a, (r0x + off) * Math.cos(al), (r0z + off) * Math.cos(al), (r0z + off) * Math.cos(al), 2, _v);
        _v.x += sh.x;
        _v.y = sh.y + (r0x + off) * Math.sin(al) * 0.42;
        _v.z += sh.z;
        return { p: _v.clone(), w: S.armWeights(side, 0), pin: true, uv: [(a * r0x) / FABRIC_TILE, -al * r0x / FABRIC_TILE] };
      }
      const f = (r - dome) / (sl.rows - 1);
      const t = THREE.MathUtils.lerp(0, tEnd, f);
      const [rx, rz] = S.armRadius(Math.min(t, 1));
      const bell = THREE.MathUtils.lerp(0, sl.wristRadius * s - rx, Math.pow(f, 2.2));
      ringPoint(a, rx + off + bell, rz + off + bell, rz + off + bell * 1.15, 2, _v);
      _v.x += sh.x;
      _v.y = sh.y - t * S.armLen - Math.max(0, Math.cos(a + Math.PI)) * bell * 0.4;
      _v.z += sh.z + bell * 0.25;
      return { p: _v.clone(), w: S.armWeights(side, Math.min(t, 1)), pin: r < total - 2, uv: [(a * rx) / FABRIC_TILE, (t * S.armLen) / FABRIC_TILE] };
    }, { wrap: true });
  }

  // Hood lying on the upper back.
  const H = ROBE.hood;
  L.grid(9, 5, (c, r) => {
    const fx = c / 8 - 0.5;
    const fy = r / 4;
    const y = H.y * s + (1 - fy) * H.height * s * 0.4 - fy * H.height * s * 0.6;
    const T = S.torsoAt(y);
    const x = fx * H.width * s * (1 - 0.55 * Math.pow(fy, 1.3));
    const bulge = Math.sin(fy * Math.PI) * (1 - (fx * 2) ** 2) * H.depth * s;
    const zb = T.z + T.rzB * Math.sqrt(Math.max(0, 1 - (x / (T.rx + off)) ** 2)) + off * 1.3 + bulge;
    return { p: new THREE.Vector3(x, y, zb), w: S.torsoWeights(x, y), pin: true, uv: [(x + 0.2) / FABRIC_TILE, fy * 0.1 / FABRIC_TILE] };
  }, { flip: true, bend: false });

  return L.spec();
}

/**
 * Quidditch cape hanging from the shoulders.
 */
export function capeLayout(J, S) {
  const s = S.s;
  const L = new Layout();
  const { columns: cols, rows } = CAPE;
  L.grid(cols, rows, (c, r) => {
    const fx = c / (cols - 1) - 0.5;
    const fy = r / (rows - 1);
    const y = CAPE.y * s - fy * CAPE.length * s;
    const T = S.torsoAt(Math.max(y, CAPE.y * s - 0.2 * s));
    const w = CAPE.width * s * (0.8 + 0.4 * fy);
    const x = fx * w;
    const arc = Math.sqrt(Math.max(0, 1 - (x / (T.rx + 0.03 * s)) ** 2));
    const z = T.z + T.rzB * arc + CAPE.z * s * (0.3 + fy * 0.7);
    const p = new THREE.Vector3(x, y, z);
    return { p, w: r === 0 ? S.torsoWeights(x, CAPE.y * s) : [[B.chest, 1 - fy], [B.hips, fy]], pin: r === 0, uv: [fx + 0.5, fy] };
  }, { flip: true });
  return L.spec();
}

/**
 * Scarf: pinned knitted wrap + two free tails.
 */
export function scarfLayout(J, S) {
  const s = S.s;
  const L = new Layout();
  const W = SCARF.wrap;
  const rows = 3;
  L.grid(W.segments, rows, (c, r) => {
    const a = (c / W.segments) * TAU - Math.PI;
    const y = W.y * s + (0.5 - r / (rows - 1)) * W.height * s;
    const bulge = 1 + 0.12 * Math.sin((r / (rows - 1)) * Math.PI) + 0.06 * Math.sin(a * 3 + r * 2);
    ringPoint(a, W.r[0] * s * bulge * Math.sqrt(S.b), W.r[1] * s * bulge * Math.sqrt(S.b), W.r[1] * s * bulge, 2, _v);
    _v.y = y;
    _v.z += 0.008 * s;
    const tn = ramp(J.neck.y - 0.02 * s, J.neck.y + 0.03 * s, y);
    return { p: _v.clone(), w: [[B.chest, 1 - tn * 0.6], [B.neck, tn * 0.6]], pin: true, uv: [c / W.segments, r / (rows - 1) * 0.1] };
  }, { wrap: true });
  const T = SCARF.tail;
  const [ax, ay, az] = T.anchor;
  for (const [dx, lenK, dz] of [[0, 1, 0], [0.022, 0.82, 0.006]]) {
    const cols = 3;
    L.grid(cols, T.rows, (c, r) => {
      const fx = c / (cols - 1) - 0.5;
      const fy = r / (T.rows - 1);
      const x = (ax + dx) * s + fx * T.width * s;
      const y = ay * s - fy * T.length * s * lenK;
      const Tor = S.torsoAt(Math.max(y, S.rings[3][0]));
      const z = Math.min(Tor.z - Tor.rzF - 0.014 * s - dz * s, az * s);
      const p = new THREE.Vector3(x, y, z);
      return { p, w: r === 0 ? [[B.chest, 0.6], [B.neck, 0.4]] : [[B.chest, 1 - fy * 0.5], [B.spine, fy * 0.5]], pin: r === 0, uv: [fx + 0.5, fy * lenK] };
    });
  }
  return L.spec();
}
