/**
 * @file ClothSim — position-based Verlet cloth for robes, capes and scarf
 * tails. Every particle has a skinned "target" (its place on the rest
 * garment carried by the skeleton); pinned particles snap to it, free ones
 * fall, swing and collide with the body's capsules, with a weak pull
 * toward the target that keeps garments tidy. The simulation runs in world
 * space at a fixed step; the owning mesh reads positions back.
 */
import * as THREE from 'three';
import { CLOTH } from '../data/character.js';

/**
 * @typedef {Object} ClothSpec
 * @property {Float32Array} rest        bind-space positions (3 per particle)
 * @property {Uint16Array} skinIndex    4 bones per particle
 * @property {Float32Array} skinWeight  4 weights per particle
 * @property {Uint8Array} pinned        1 = follows the skeleton exactly
 * @property {Uint32Array} links        particle pairs (2 per constraint)
 * @property {Float32Array} [stiffness] per-link stiffness (0..1)
 */

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _ab = new THREE.Vector3();

export class ClothSim {
  /**
   * @param {ClothSpec} spec
   * @param {THREE.Skeleton} skeleton
   */
  constructor(spec, skeleton) {
    this.spec = spec;
    this.skeleton = skeleton;
    const n = spec.rest.length / 3;
    this.count = n;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.target = new Float32Array(n * 3);
    this.prevTarget = new Float32Array(n * 3);
    const L = spec.links;
    this.restLen = new Float32Array(L.length / 2);
    for (let i = 0; i < this.restLen.length; i++) {
      _a.fromArray(spec.rest, L[i * 2] * 3);
      _b.fromArray(spec.rest, L[i * 2 + 1] * 3);
      this.restLen[i] = _a.distanceTo(_b);
    }
    /** Collision capsules in world space: {a, b, r}. */
    this.capsules = [];
    this.wind = new THREE.Vector3();
    this.groundY = -Infinity;
    this.simulate = true;
    this.iterations = 4;
    this._acc = 0;
    this._time = 0;
    this._initialised = false;
    this._boneMats = skeleton.bones.map(() => new THREE.Matrix4());
    this.lastRoot = new THREE.Vector3();
  }

  /** Recompute skinned targets from the current bone matrices. */
  _skinTargets() {
    const S = this.spec;
    const bones = this.skeleton.bones;
    const inv = this.skeleton.boneInverses;
    for (let i = 0; i < bones.length; i++) this._boneMats[i].multiplyMatrices(bones[i].matrixWorld, inv[i]);
    this.prevTarget.set(this.target);
    const T = this.target;
    for (let p = 0; p < this.count; p++) {
      _v.fromArray(S.rest, p * 3);
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 4; k++) {
        const w = S.skinWeight[p * 4 + k];
        if (w <= 0) continue;
        _a.copy(_v).applyMatrix4(this._boneMats[S.skinIndex[p * 4 + k]]);
        x += _a.x * w;
        y += _a.y * w;
        z += _a.z * w;
      }
      T[p * 3] = x;
      T[p * 3 + 1] = y;
      T[p * 3 + 2] = z;
    }
  }

  /** Snap every particle to its target (spawn, teleport). */
  reset() {
    this._skinTargets();
    this.prevTarget.set(this.target);
    this.pos.set(this.target);
    this.prev.set(this.target);
    this._initialised = true;
  }

  /**
   * Advance the cloth. Bones must be up to date (matrixWorld).
   * @param {number} dt
   * @param {THREE.Vector3} root character root (teleport detection)
   */
  update(dt, root) {
    if (!this._initialised || root.distanceTo(this.lastRoot) > CLOTH.teleportDistance) {
      this.lastRoot.copy(root);
      this.reset();
      return;
    }
    this.lastRoot.copy(root);
    this._skinTargets();
    if (!this.simulate) {
      this.pos.set(this.target);
      this.prev.set(this.target);
      return;
    }
    this._acc = Math.min(this._acc + dt, CLOTH.step * CLOTH.maxSubsteps);
    const steps = Math.floor(this._acc / CLOTH.step);
    this._acc -= steps * CLOTH.step;
    for (let k = 0; k < steps; k++) this._step(CLOTH.step, (k + 1) / steps);
    if (steps === 0) {
      // Keep pins glued even when no step ran this frame.
      const P = this.spec.pinned;
      for (let p = 0; p < this.count; p++) if (P[p]) for (let c = 0; c < 3; c++) this.pos[p * 3 + c] = this.target[p * 3 + c];
    }
  }

  _step(h, alpha) {
    const S = this.spec;
    const P = this.pos;
    const Q = this.prev;
    const T = this.target;
    const PT = this.prevTarget;
    const damp = 1 - CLOTH.damping;
    const g = CLOTH.gravity * h * h;
    this._time += h;
    const gust = 0.75 + 0.25 * Math.sin(this._time * 1.7) * Math.sin(this._time * 0.63 + 1.3);
    const wx = this.wind.x * CLOTH.windScale * gust * h * h;
    const wz = this.wind.z * CLOTH.windScale * gust * h * h;
    const shape = CLOTH.shapeStiffness;
    for (let p = 0; p < this.count; p++) {
      const i = p * 3;
      if (S.pinned[p]) {
        for (let c = 0; c < 3; c++) {
          const t = PT[i + c] + (T[i + c] - PT[i + c]) * alpha;
          Q[i + c] = P[i + c];
          P[i + c] = t;
        }
        continue;
      }
      const x = P[i], y = P[i + 1], z = P[i + 2];
      P[i] += (x - Q[i]) * damp + wx;
      P[i + 1] += (y - Q[i + 1]) * damp + g;
      P[i + 2] += (z - Q[i + 2]) * damp + wz;
      Q[i] = x;
      Q[i + 1] = y;
      Q[i + 2] = z;
      // Weak pull toward the skinned shape.
      for (let c = 0; c < 3; c++) P[i + c] += (T[i + c] - P[i + c]) * shape;
    }
    const L = S.links;
    const K = S.stiffness;
    for (let it = 0; it < this.iterations; it++) {
      for (let l = 0; l < this.restLen.length; l++) {
        const ia = L[l * 2] * 3;
        const ib = L[l * 2 + 1] * 3;
        const pa = S.pinned[L[l * 2]];
        const pb = S.pinned[L[l * 2 + 1]];
        if (pa && pb) continue;
        const dx = P[ib] - P[ia];
        const dy = P[ib + 1] - P[ia + 1];
        const dz = P[ib + 2] - P[ia + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const k = ((d - this.restLen[l]) / d) * (K ? K[l] : 1);
        const wa = pa ? 0 : pb ? 1 : 0.5;
        const wb = pb ? 0 : pa ? 1 : 0.5;
        P[ia] += dx * k * wa;
        P[ia + 1] += dy * k * wa;
        P[ia + 2] += dz * k * wa;
        P[ib] -= dx * k * wb;
        P[ib + 1] -= dy * k * wb;
        P[ib + 2] -= dz * k * wb;
      }
      this._collide();
    }
  }

  _collide() {
    const P = this.pos;
    const pinned = this.spec.pinned;
    const margin = CLOTH.collisionMargin;
    for (const cap of this.capsules) {
      _ab.subVectors(cap.b, cap.a);
      const len2 = _ab.lengthSq() || 1e-6;
      const r = cap.r + margin;
      for (let p = 0; p < this.count; p++) {
        if (pinned[p]) continue;
        const i = p * 3;
        _v.set(P[i] - cap.a.x, P[i + 1] - cap.a.y, P[i + 2] - cap.a.z);
        const t = Math.max(0, Math.min(1, _v.dot(_ab) / len2));
        const cx = cap.a.x + _ab.x * t;
        const cy = cap.a.y + _ab.y * t;
        const cz = cap.a.z + _ab.z * t;
        const dx = P[i] - cx;
        const dy = P[i + 1] - cy;
        const dz = P[i + 2] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const push = (r - d) / d;
        P[i] += dx * push;
        P[i + 1] += dy * push;
        P[i + 2] += dz * push;
      }
    }
    if (this.groundY > -Infinity) {
      const gy = this.groundY + margin;
      for (let p = 0; p < this.count; p++) if (!pinned[p] && P[p * 3 + 1] < gy) P[p * 3 + 1] = gy;
    }
  }
}

/**
 * Build links for a grid of particles (index = row * cols + col).
 * Structural, shear and bend constraints; optional wrap-around in columns.
 * @param {number} cols
 * @param {number} rows
 * @param {{wrap?:boolean, offset?:number, bend?:boolean, shear?:boolean}} [o]
 * @returns {{links:number[], stiffness:number[]}}
 */
export function gridLinks(cols, rows, o = {}) {
  const links = [];
  const stiff = [];
  const off = o.offset ?? 0;
  const id = (c, r) => off + r * cols + (o.wrap ? ((c % cols) + cols) % cols : c);
  const add = (a, b, k) => {
    links.push(a, b);
    stiff.push(k);
  };
  const cmax = o.wrap ? cols : cols - 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < cmax) add(id(c, r), id(c + 1, r), 1);
      if (r < rows - 1) add(id(c, r), id(c, r + 1), 1);
      if (o.shear !== false && r < rows - 1 && c < cmax) {
        add(id(c, r), id(c + 1, r + 1), 0.5);
        add(id(c + 1, r), id(c, r + 1), 0.5);
      }
      if (o.bend !== false) {
        if (r < rows - 2) add(id(c, r), id(c, r + 2), 0.35);
        if (c < cmax - 1 || (o.wrap && cols > 3)) add(id(c, r), id(c + 2, r), 0.25);
      }
    }
  }
  return { links, stiffness: stiff };
}
