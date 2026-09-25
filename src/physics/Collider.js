/**
 * @file Collider — triangle-based collision shape used by the character
 * controller, camera and raycasts. Static colliders are baked into the
 * spatial hash; kinematic/dynamic ones keep world-space triangles that are
 * refreshed whenever their transform changes.
 */
import * as THREE from 'three';
import { PHYSICS } from '../data/physics.js';

let _nextId = 1;

/** @typedef {'static'|'kinematic'|'dynamic'} ColliderKind */
/** @typedef {'box'|'cylinder'|'sphere'|'mesh'} ColliderShape */

/**
 * @typedef {Object} ColliderOptions
 * @property {ColliderShape} shape
 * @property {ColliderKind} [kind]
 * @property {THREE.Vector3} [size]        box full extents
 * @property {number} [radius]             sphere / cylinder radius
 * @property {number} [height]             cylinder height
 * @property {number} [segments]           cylinder segments
 * @property {Float32Array} [positions]    mesh: local triangle soup (9 floats per triangle)
 * @property {THREE.Matrix4} [matrix]      world transform
 * @property {string} [surface]            footstep / impact surface id
 * @property {string} [name]
 * @property {boolean} [cameraBlocking]    false = camera passes through (thin props)
 * @property {any} [userData]
 */

export class Collider {
  /** @param {ColliderOptions} o */
  constructor(o) {
    this.id = _nextId++;
    this.shape = o.shape;
    this.kind = o.kind ?? 'static';
    this.surface = o.surface ?? 'stone';
    this.name = o.name ?? `${this.shape}#${this.id}`;
    this.cameraBlocking = o.cameraBlocking ?? true;
    this.userData = o.userData ?? {};
    /** Set by the physics world for dynamic colliders (cannon body wrapper). */
    this.body = null;
    this.enabled = true;

    this.size = o.size ? o.size.clone() : new THREE.Vector3(1, 1, 1);
    this.radius = o.radius ?? 0.5;
    this.height = o.height ?? 1;

    this.matrix = new THREE.Matrix4();
    this.prevMatrix = new THREE.Matrix4();
    /** Transform delta of the last kinematic step (current * inverse(previous)). */
    this.deltaMatrix = new THREE.Matrix4();
    this.aabbMin = new THREE.Vector3();
    this.aabbMax = new THREE.Vector3();
    this.center = new THREE.Vector3();

    /** @type {Float32Array|null} */
    this.localTris = null;
    if (this.shape === 'box') this.localTris = boxTriangles(this.size);
    else if (this.shape === 'cylinder') {
      this.localTris = cylinderTriangles(this.radius, this.height, o.segments ?? PHYSICS.cylinderSegments);
    } else if (this.shape === 'mesh') this.localTris = o.positions;

    const triCount = this.localTris ? this.localTris.length / 9 : 0;
    this.worldTris = new Float32Array(triCount * 9);
    this.worldNormals = new Float32Array(triCount * 3);
    this.setMatrix(o.matrix ?? new THREE.Matrix4(), true);
  }

  get triangleCount() {
    return this.worldNormals.length / 3;
  }

  /**
   * Update the world transform and derived data.
   * @param {THREE.Matrix4} m
   * @param {boolean} [resetHistory] also overwrite the previous matrix
   */
  setMatrix(m, resetHistory = false) {
    if (resetHistory) this.prevMatrix.copy(m);
    else this.prevMatrix.copy(this.matrix);
    this.matrix.copy(m);
    _inv.copy(this.prevMatrix).invert();
    this.deltaMatrix.multiplyMatrices(this.matrix, _inv);
    this.center.setFromMatrixPosition(m);

    if (this.shape === 'sphere') {
      const s = _scale.setFromMatrixScale(m);
      const r = this.radius * Math.max(s.x, s.y, s.z);
      this.aabbMin.set(this.center.x - r, this.center.y - r, this.center.z - r);
      this.aabbMax.set(this.center.x + r, this.center.y + r, this.center.z + r);
      this.worldRadius = r;
      return;
    }

    const src = this.localTris;
    const dst = this.worldTris;
    const nrm = this.worldNormals;
    const e = m.elements;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      dst[i] = wx; dst[i + 1] = wy; dst[i + 2] = wz;
      if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
      if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
      if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
    }
    for (let t = 0, j = 0; t < dst.length; t += 9, j += 3) {
      const ux = dst[t + 3] - dst[t], uy = dst[t + 4] - dst[t + 1], uz = dst[t + 5] - dst[t + 2];
      const vx = dst[t + 6] - dst[t], vy = dst[t + 7] - dst[t + 1], vz = dst[t + 8] - dst[t + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nrm[j] = nx / l; nrm[j + 1] = ny / l; nrm[j + 2] = nz / l;
    }
    this.aabbMin.set(minX, minY, minZ);
    this.aabbMax.set(maxX, maxY, maxZ);
  }

  /**
   * @param {THREE.Vector3} min
   * @param {THREE.Vector3} max
   */
  overlapsAABB(min, max) {
    return (
      this.aabbMin.x <= max.x && this.aabbMax.x >= min.x &&
      this.aabbMin.y <= max.y && this.aabbMax.y >= min.y &&
      this.aabbMin.z <= max.z && this.aabbMax.z >= min.z
    );
  }
}

const _inv = new THREE.Matrix4();
const _scale = new THREE.Vector3();

/**
 * Triangle soup for an axis-aligned box centred at the origin.
 * @param {THREE.Vector3} size
 * @returns {Float32Array}
 */
export function boxTriangles(size) {
  const x = size.x / 2, y = size.y / 2, z = size.z / 2;
  const c = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
  ];
  // Outward-facing quads (counter-clockwise seen from outside).
  const quads = [
    [4, 5, 6, 7], // +z
    [1, 0, 3, 2], // -z
    [5, 1, 2, 6], // +x
    [0, 4, 7, 3], // -x
    [7, 6, 2, 3], // +y
    [0, 1, 5, 4], // -y
  ];
  const out = new Float32Array(quads.length * 2 * 9);
  let o = 0;
  for (const [a, b, cc, d] of quads) {
    for (const idx of [a, b, cc, a, cc, d]) {
      out[o++] = c[idx][0];
      out[o++] = c[idx][1];
      out[o++] = c[idx][2];
    }
  }
  return out;
}

/**
 * Triangle soup for a Y-aligned closed cylinder centred at the origin.
 * @returns {Float32Array}
 */
export function cylinderTriangles(radius, height, segments) {
  const h = height / 2;
  const out = new Float32Array(segments * 4 * 9);
  let o = 0;
  const push = (x, y, z) => {
    out[o++] = x; out[o++] = y; out[o++] = z;
  };
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
    // side
    push(x0, -h, z0); push(x0, h, z0); push(x1, h, z1);
    push(x0, -h, z0); push(x1, h, z1); push(x1, -h, z1);
    // caps
    push(0, h, 0); push(x1, h, z1); push(x0, h, z0);
    push(0, -h, 0); push(x0, -h, z0); push(x1, -h, z1);
  }
  return out;
}
