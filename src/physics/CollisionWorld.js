/**
 * @file CollisionWorld — triangle collision database with a 3D spatial hash
 * for static geometry and brute-force (AABB-culled) lists for moving shapes.
 * Serves capsule overlap queries (character controller) and raycasts
 * (camera, AI line of sight, spell aiming). Terrain is a heightfield:
 * its triangles are generated on the fly for the cells a query touches,
 * so kilometre-sized landscapes cost no triangle storage.
 */
import * as THREE from 'three';
import { capsuleTriangle, capsuleSphere, rayTriangle, raySphere, rayAABB } from './Geometry.js';

const CELL_BIAS = 1 << 20;
const CELL_SPAN = 1 << 21;

/**
 * @typedef {Object} Contact
 * @property {THREE.Vector3} normal  push direction for the capsule (unit)
 * @property {THREE.Vector3} faceNormal normal of the touched face (equals `normal` on face contacts)
 * @property {THREE.Vector3} point   closest point on the obstacle
 * @property {number} depth          penetration depth
 * @property {import('./Collider.js').Collider} collider
 */

/**
 * @typedef {Object} RayHit
 * @property {number} distance
 * @property {THREE.Vector3} point
 * @property {THREE.Vector3} normal
 * @property {import('./Collider.js').Collider} collider
 */

/**
 * @typedef {Object} QueryFilter
 * @property {boolean} [static]      include static geometry (default true)
 * @property {boolean} [kinematic]   include kinematic colliders (default true)
 * @property {boolean} [dynamic]     include dynamic bodies (default true)
 * @property {boolean} [cameraOnly]  skip colliders with cameraBlocking=false
 * @property {Set<number>|null} [ignore] collider ids to ignore
 */

export class CollisionWorld {
  /** @param {number} cellSize */
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.invCell = 1 / cellSize;

    // Static triangle storage (grows by doubling).
    this._capacity = 1024;
    this.triCount = 0;
    this.tris = new Float32Array(this._capacity * 9);
    this.normals = new Float32Array(this._capacity * 3);
    /** @type {import('./Collider.js').Collider[]} */
    this.triOwner = [];
    this._stamp = new Uint32Array(this._capacity);
    this._stampId = 1;

    /** @type {Map<number, number[]>} */
    this.grid = new Map();
    /** @type {import('./Collider.js').Collider[]} */
    this.staticColliders = [];
    /** @type {import('./Collider.js').Collider[]} */
    this.moving = [];
    /** @type {Heightfield[]} */
    this.heightfields = [];
    this._dirtyStatic = false;

    // Contact pool
    /** @type {Contact[]} */
    this._pool = [];

    // Scratch
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._min = new THREE.Vector3();
    this._max = new THREE.Vector3();
    this._tmpContact = { normal: new THREE.Vector3(), point: new THREE.Vector3(), depth: 0 };
    this._e1 = new THREE.Vector3();
    this._e2 = new THREE.Vector3();
  }

  // ------------------------------------------------------------ heightfields

  /**
   * Register terrain heights.
   * @param {{x0:number, z0:number, cell:number, nx:number, nz:number, heights:Float32Array,
   *          name?:string, surface?:string}} o samples laid out row by row (z), nx per row
   * @returns {Heightfield}
   */
  addHeightfield(o) {
    const hf = new Heightfield(o);
    this.heightfields.push(hf);
    return hf;
  }

  /** @param {Heightfield} hf */
  removeHeightfield(hf) {
    const i = this.heightfields.indexOf(hf);
    if (i >= 0) this.heightfields.splice(i, 1);
  }

  /** Load cell triangle k (0/1) of heightfield cell (i, j) into _v0.._v2 / _n. */
  _loadHfTri(hf, i, j, k) {
    const c = hf.cell;
    const x = hf.x0 + i * c;
    const z = hf.z0 + j * c;
    const H = hf.heights;
    const w = hf.nx;
    const h00 = H[j * w + i];
    const h10 = H[j * w + i + 1];
    const h01 = H[(j + 1) * w + i];
    const h11 = H[(j + 1) * w + i + 1];
    if (k === 0) {
      this._v0.set(x, h00, z);
      this._v1.set(x, h01, z + c);
      this._v2.set(x + c, h10, z);
    } else {
      this._v0.set(x + c, h10, z);
      this._v1.set(x, h01, z + c);
      this._v2.set(x + c, h11, z + c);
    }
    this._e1.subVectors(this._v1, this._v0);
    this._e2.subVectors(this._v2, this._v0);
    this._n.crossVectors(this._e1, this._e2).normalize();
  }

  _hfContacts(a, b, r, min, max, filter, out, tmp) {
    for (const hf of this.heightfields) {
      if (!this._passes(hf, filter)) continue;
      const [i0, i1, j0, j1] = hf.cellRange(min.x, min.z, max.x, max.z);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          if (hf.cellMaxHeight(i, j) < min.y) continue;
          for (let k = 0; k < 2; k++) {
            this._loadHfTri(hf, i, j, k);
            if (capsuleTriangle(a, b, r, this._v0, this._v1, this._v2, this._n, tmp)) this._pushContact(out, tmp, hf);
          }
        }
      }
    }
  }

  /** 2D DDA across heightfield cells; returns the nearest hit distance. */
  _hfRaycast(hf, origin, dir, maxDist) {
    const c = hf.cell;
    // Clip the ray to the heightfield rectangle.
    let t0 = 0;
    let t1 = maxDist;
    const bx0 = hf.x0, bx1 = hf.x0 + (hf.nx - 1) * c;
    const bz0 = hf.z0, bz1 = hf.z0 + (hf.nz - 1) * c;
    for (const [o, d, lo, hi] of [[origin.x, dir.x, bx0, bx1], [origin.z, dir.z, bz0, bz1]]) {
      if (Math.abs(d) < 1e-12) {
        if (o < lo || o > hi) return -1;
        continue;
      }
      let ta = (lo - o) / d;
      let tb = (hi - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
    }
    if (t0 > t1) return -1;
    const px = origin.x + dir.x * t0;
    const pz = origin.z + dir.z * t0;
    let i = Math.min(hf.nx - 2, Math.max(0, Math.floor((px - hf.x0) / c)));
    let j = Math.min(hf.nz - 2, Math.max(0, Math.floor((pz - hf.z0) / c)));
    const si = dir.x > 0 ? 1 : -1;
    const sj = dir.z > 0 ? 1 : -1;
    const big = 1e30;
    const tdi = Math.abs(dir.x) > 1e-12 ? c / Math.abs(dir.x) : big;
    const tdj = Math.abs(dir.z) > 1e-12 ? c / Math.abs(dir.z) : big;
    let tmi = Math.abs(dir.x) > 1e-12 ? (hf.x0 + (i + (si > 0 ? 1 : 0)) * c - origin.x) / dir.x : big;
    let tmj = Math.abs(dir.z) > 1e-12 ? (hf.z0 + (j + (sj > 0 ? 1 : 0)) * c - origin.z) / dir.z : big;
    const maxSteps = hf.nx + hf.nz;
    for (let n = 0; n < maxSteps; n++) {
      let best = -1;
      for (let k = 0; k < 2; k++) {
        this._loadHfTri(hf, i, j, k);
        const t = rayTriangle(origin, dir, this._v0, this._v1, this._v2);
        if (t >= 0 && t <= maxDist && (best < 0 || t < best)) best = t;
      }
      if (best >= 0) return best;
      const tNext = Math.min(tmi, tmj);
      if (tNext > t1) break;
      if (tmi <= tmj) {
        i += si;
        tmi += tdi;
      } else {
        j += sj;
        tmj += tdj;
      }
      if (i < 0 || j < 0 || i > hf.nx - 2 || j > hf.nz - 2) break;
    }
    return -1;
  }

  /**
   * Terrain height at (x, z) or -Infinity outside every heightfield.
   * @param {number} x
   * @param {number} z
   */
  terrainHeight(x, z) {
    let best = -Infinity;
    for (const hf of this.heightfields) best = Math.max(best, hf.heightAt(x, z));
    return best;
  }

  // ------------------------------------------------------------ registration

  /** @param {import('./Collider.js').Collider} c */
  add(c) {
    if (c.kind === 'static') {
      this.staticColliders.push(c);
      this._insertStatic(c);
    } else {
      this.moving.push(c);
    }
    return c;
  }

  /** @param {import('./Collider.js').Collider} c */
  remove(c) {
    if (c.kind === 'static') {
      const i = this.staticColliders.indexOf(c);
      if (i >= 0) {
        this.staticColliders.splice(i, 1);
        this._dirtyStatic = true;
      }
    } else {
      const i = this.moving.indexOf(c);
      if (i >= 0) this.moving.splice(i, 1);
    }
  }

  /** Rebuild the static hash after removals (region streaming). */
  rebuildStatic() {
    this.triCount = 0;
    this.triOwner.length = 0;
    this.grid.clear();
    for (const c of this.staticColliders) this._insertStatic(c);
    this._dirtyStatic = false;
  }

  _ensureCapacity(n) {
    if (n <= this._capacity) return;
    let cap = this._capacity;
    while (cap < n) cap *= 2;
    const t = new Float32Array(cap * 9);
    t.set(this.tris);
    const nr = new Float32Array(cap * 3);
    nr.set(this.normals);
    this.tris = t;
    this.normals = nr;
    this._stamp = new Uint32Array(cap);
    this._capacity = cap;
  }

  _cellKey(ix, iy, iz) {
    return ((ix + CELL_BIAS) * CELL_SPAN + (iy + CELL_BIAS)) * CELL_SPAN + (iz + CELL_BIAS);
  }

  /** @param {import('./Collider.js').Collider} c */
  _insertStatic(c) {
    const count = c.triangleCount;
    this._ensureCapacity(this.triCount + count);
    const inv = this.invCell;
    for (let t = 0; t < count; t++) {
      const idx = this.triCount++;
      const src = t * 9;
      const dst = idx * 9;
      for (let k = 0; k < 9; k++) this.tris[dst + k] = c.worldTris[src + k];
      this.normals[idx * 3] = c.worldNormals[t * 3];
      this.normals[idx * 3 + 1] = c.worldNormals[t * 3 + 1];
      this.normals[idx * 3 + 2] = c.worldNormals[t * 3 + 2];
      this.triOwner[idx] = c;

      const T = this.tris;
      const minX = Math.min(T[dst], T[dst + 3], T[dst + 6]);
      const minY = Math.min(T[dst + 1], T[dst + 4], T[dst + 7]);
      const minZ = Math.min(T[dst + 2], T[dst + 5], T[dst + 8]);
      const maxX = Math.max(T[dst], T[dst + 3], T[dst + 6]);
      const maxY = Math.max(T[dst + 1], T[dst + 4], T[dst + 7]);
      const maxZ = Math.max(T[dst + 2], T[dst + 5], T[dst + 8]);
      const x0 = Math.floor(minX * inv), x1 = Math.floor(maxX * inv);
      const y0 = Math.floor(minY * inv), y1 = Math.floor(maxY * inv);
      const z0 = Math.floor(minZ * inv), z1 = Math.floor(maxZ * inv);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          for (let z = z0; z <= z1; z++) {
            const key = this._cellKey(x, y, z);
            let list = this.grid.get(key);
            if (!list) {
              list = [];
              this.grid.set(key, list);
            }
            list.push(idx);
          }
        }
      }
    }
  }

  _loadStaticTri(i) {
    const T = this.tris;
    const o = i * 9;
    this._v0.set(T[o], T[o + 1], T[o + 2]);
    this._v1.set(T[o + 3], T[o + 4], T[o + 5]);
    this._v2.set(T[o + 6], T[o + 7], T[o + 8]);
    const N = this.normals;
    this._n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
  }

  _loadMovingTri(c, t) {
    const T = c.worldTris;
    const o = t * 9;
    this._v0.set(T[o], T[o + 1], T[o + 2]);
    this._v1.set(T[o + 3], T[o + 4], T[o + 5]);
    this._v2.set(T[o + 6], T[o + 7], T[o + 8]);
    const N = c.worldNormals;
    this._n.set(N[t * 3], N[t * 3 + 1], N[t * 3 + 2]);
  }

  /**
   * Visit static triangle indices overlapping an AABB (each at most once).
   * @param {THREE.Vector3} min
   * @param {THREE.Vector3} max
   * @param {(tri:number) => void} visit
   */
  forEachStaticInAABB(min, max, visit) {
    if (this._dirtyStatic) this.rebuildStatic();
    const inv = this.invCell;
    const stamp = ++this._stampId;
    if (stamp === 0xffffffff) {
      this._stamp.fill(0);
      this._stampId = 1;
    }
    const x0 = Math.floor(min.x * inv), x1 = Math.floor(max.x * inv);
    const y0 = Math.floor(min.y * inv), y1 = Math.floor(max.y * inv);
    const z0 = Math.floor(min.z * inv), z1 = Math.floor(max.z * inv);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const list = this.grid.get(this._cellKey(x, y, z));
          if (!list) continue;
          for (let k = 0; k < list.length; k++) {
            const i = list[k];
            if (this._stamp[i] === this._stampId) continue;
            this._stamp[i] = this._stampId;
            visit(i);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------- overlaps

  _contact(i) {
    let c = this._pool[i];
    if (!c) {
      c = {
        normal: new THREE.Vector3(),
        faceNormal: new THREE.Vector3(),
        point: new THREE.Vector3(),
        depth: 0,
        collider: null,
        // Scratch flags filled in by consumers (character controller).
        onEdge: false,
        ground: false,
      };
      this._pool[i] = c;
    }
    return c;
  }

  /** Store a contact; `this._n` holds the touched face normal. */
  _pushContact(out, tmp, collider) {
    const c = this._contact(out.length);
    c.normal.copy(tmp.normal);
    c.faceNormal.copy(this._n);
    if (c.faceNormal.dot(c.normal) < 0) c.faceNormal.negate();
    c.point.copy(tmp.point);
    c.depth = tmp.depth;
    c.collider = collider;
    out.push(c);
  }

  /**
   * @param {import('./Collider.js').Collider} c
   * @param {QueryFilter} f
   */
  _passes(c, f) {
    if (!c.enabled) return false;
    if (f.ignore && f.ignore.has(c.id)) return false;
    if (f.cameraOnly && !c.cameraBlocking) return false;
    if (c.kind === 'static') return f.static !== false;
    if (c.kind === 'kinematic') return f.kinematic !== false;
    return f.dynamic !== false;
  }

  /**
   * Find all penetrations between a capsule and the world.
   * Returned contact objects are pooled: copy what you need before the next query.
   * @param {THREE.Vector3} a bottom sphere centre
   * @param {THREE.Vector3} b top sphere centre
   * @param {number} r radius
   * @param {QueryFilter} [filter]
   * @returns {Contact[]} (shared array, valid until next call)
   */
  capsuleContacts(a, b, r, filter = {}) {
    const out = this._results || (this._results = []);
    out.length = 0;
    const min = this._min.set(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.min(a.z, b.z) - r);
    const max = this._max.set(Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, Math.max(a.z, b.z) + r);
    const tmp = this._tmpContact;

    if (filter.static !== false) {
      this.forEachStaticInAABB(min, max, (i) => {
        const owner = this.triOwner[i];
        if (!this._passes(owner, filter)) return;
        this._loadStaticTri(i);
        if (capsuleTriangle(a, b, r, this._v0, this._v1, this._v2, this._n, tmp)) {
          this._pushContact(out, tmp, owner);
        }
      });
    }

    if (filter.static !== false && this.heightfields.length) this._hfContacts(a, b, r, min, max, filter, out, tmp);

    for (const col of this.moving) {
      if (!this._passes(col, filter) || !col.overlapsAABB(min, max)) continue;
      if (col.shape === 'sphere') {
        if (capsuleSphere(a, b, r, col.center, col.worldRadius, tmp)) {
          this._n.copy(tmp.normal);
          this._pushContact(out, tmp, col);
        }
        continue;
      }
      const n = col.triangleCount;
      for (let t = 0; t < n; t++) {
        this._loadMovingTri(col, t);
        if (capsuleTriangle(a, b, r, this._v0, this._v1, this._v2, this._n, tmp)) {
          this._pushContact(out, tmp, col);
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- raycast

  /**
   * Closest ray hit.
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} dir normalised direction
   * @param {number} maxDist
   * @param {QueryFilter} [filter]
   * @param {RayHit} [out]
   * @returns {RayHit|null}
   */
  raycast(origin, dir, maxDist, filter = {}, out) {
    let best = maxDist;
    let bestCollider = null;
    let bestTri = -1;
    let bestMoving = null;
    let bestMovingTri = -1;

    if (filter.static !== false && this.triCount > 0) {
      if (this._dirtyStatic) this.rebuildStatic();
      const r = this._raycastStatic(origin, dir, maxDist, filter);
      if (r.tri >= 0 && r.t < best) {
        best = r.t;
        bestTri = r.tri;
        bestCollider = this.triOwner[r.tri];
      }
    }

    let bestHf = null;
    if (filter.static !== false) {
      for (const hf of this.heightfields) {
        if (!this._passes(hf, filter)) continue;
        const t = this._hfRaycast(hf, origin, dir, best);
        if (t >= 0 && t < best) {
          best = t;
          bestHf = hf;
          bestCollider = hf;
          bestTri = -1;
        }
      }
    }

    for (const col of this.moving) {
      if (!this._passes(col, filter)) continue;
      const entry = rayAABB(origin, dir, col.aabbMin, col.aabbMax, best);
      if (entry < 0) continue;
      if (col.shape === 'sphere') {
        const t = raySphere(origin, dir, col.center, col.worldRadius);
        if (t >= 0 && t < best) {
          best = t;
          bestCollider = col;
          bestMoving = col;
          bestMovingTri = -1;
          bestTri = -1;
          bestHf = null;
        }
        continue;
      }
      const n = col.triangleCount;
      for (let t = 0; t < n; t++) {
        this._loadMovingTri(col, t);
        const d = rayTriangle(origin, dir, this._v0, this._v1, this._v2);
        if (d >= 0 && d < best) {
          best = d;
          bestCollider = col;
          bestMoving = col;
          bestMovingTri = t;
          bestTri = -1;
          bestHf = null;
        }
      }
    }

    if (!bestCollider) return null;
    const hit = out ?? { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };
    hit.distance = best;
    hit.point.copy(origin).addScaledVector(dir, best);
    hit.collider = bestCollider;
    if (bestHf) {
      bestHf.normalAt(hit.point.x, hit.point.z, hit.normal);
    } else if (bestMoving) {
      if (bestMovingTri >= 0) {
        this._loadMovingTri(bestMoving, bestMovingTri);
        hit.normal.copy(this._n);
      } else {
        hit.normal.subVectors(hit.point, bestMoving.center).normalize();
      }
    } else {
      this._loadStaticTri(bestTri);
      hit.normal.copy(this._n);
    }
    if (hit.normal.dot(dir) > 0) hit.normal.negate();
    return hit;
  }

  /** 3D DDA through the spatial hash. */
  _raycastStatic(origin, dir, maxDist, filter) {
    const cs = this.cellSize;
    const inv = this.invCell;
    let ix = Math.floor(origin.x * inv);
    let iy = Math.floor(origin.y * inv);
    let iz = Math.floor(origin.z * inv);
    const sx = dir.x > 0 ? 1 : -1, sy = dir.y > 0 ? 1 : -1, sz = dir.z > 0 ? 1 : -1;
    const big = 1e30;
    const tdx = dir.x !== 0 ? Math.abs(cs / dir.x) : big;
    const tdy = dir.y !== 0 ? Math.abs(cs / dir.y) : big;
    const tdz = dir.z !== 0 ? Math.abs(cs / dir.z) : big;
    let tmx = dir.x !== 0 ? ((ix + (sx > 0 ? 1 : 0)) * cs - origin.x) / dir.x : big;
    let tmy = dir.y !== 0 ? ((iy + (sy > 0 ? 1 : 0)) * cs - origin.y) / dir.y : big;
    let tmz = dir.z !== 0 ? ((iz + (sz > 0 ? 1 : 0)) * cs - origin.z) / dir.z : big;

    const stamp = ++this._stampId;
    let best = maxDist;
    let bestTri = -1;
    const maxCells = Math.ceil(maxDist * inv) * 3 + 3;

    for (let n = 0; n < maxCells; n++) {
      const list = this.grid.get(this._cellKey(ix, iy, iz));
      if (list) {
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          if (this._stamp[i] === stamp) continue;
          this._stamp[i] = stamp;
          if (!this._passes(this.triOwner[i], filter)) continue;
          this._loadStaticTri(i);
          const t = rayTriangle(origin, dir, this._v0, this._v1, this._v2);
          if (t >= 0 && t < best) {
            best = t;
            bestTri = i;
          }
        }
      }
      const tNext = Math.min(tmx, tmy, tmz);
      if (bestTri >= 0 && best <= tNext) break;
      if (tNext > maxDist) break;
      if (tmx === tNext) {
        ix += sx;
        tmx += tdx;
      } else if (tmy === tNext) {
        iy += sy;
        tmy += tdy;
      } else {
        iz += sz;
        tmz += tdz;
      }
    }
    return { t: best, tri: bestTri };
  }

  /** Statistics for the debug panel. */
  get stats() {
    return {
      staticColliders: this.staticColliders.length,
      staticTriangles: this.triCount,
      cells: this.grid.size,
      moving: this.moving.length,
      heightfields: this.heightfields.length,
    };
  }
}

let _hfId = 1 << 24;

/** Regular grid of terrain heights acting as a static collider. */
export class Heightfield {
  constructor(o) {
    this.id = _hfId++;
    this.kind = 'static';
    this.shape = 'heightfield';
    this.enabled = true;
    this.cameraBlocking = true;
    this.name = o.name ?? 'Arazi';
    this.surface = o.surface ?? 'grass';
    this.userData = {};
    this.x0 = o.x0;
    this.z0 = o.z0;
    this.cell = o.cell;
    this.nx = o.nx;
    this.nz = o.nz;
    this.heights = o.heights;
    // Per-cell max height (fast rejection).
    const cx = o.nx - 1;
    const cz = o.nz - 1;
    this.cellMax = new Float32Array(cx * cz);
    const H = o.heights;
    for (let j = 0; j < cz; j++) {
      for (let i = 0; i < cx; i++) {
        this.cellMax[j * cx + i] = Math.max(H[j * o.nx + i], H[j * o.nx + i + 1], H[(j + 1) * o.nx + i], H[(j + 1) * o.nx + i + 1]);
      }
    }
  }

  cellMaxHeight(i, j) {
    return this.cellMax[j * (this.nx - 1) + i];
  }

  /** Clamped cell index range overlapping a rectangle. */
  cellRange(minX, minZ, maxX, maxZ) {
    const c = this.cell;
    const i0 = Math.max(0, Math.floor((minX - this.x0) / c));
    const i1 = Math.min(this.nx - 2, Math.floor((maxX - this.x0) / c));
    const j0 = Math.max(0, Math.floor((minZ - this.z0) / c));
    const j1 = Math.min(this.nz - 2, Math.floor((maxZ - this.z0) / c));
    return [i0, i1, j0, j1];
  }

  /** Height on the triangulated surface (-Infinity outside). */
  heightAt(x, z) {
    const fx = (x - this.x0) / this.cell;
    const fz = (z - this.z0) / this.cell;
    if (fx < 0 || fz < 0 || fx > this.nx - 1 || fz > this.nz - 1) return -Infinity;
    const i = Math.min(this.nx - 2, Math.floor(fx));
    const j = Math.min(this.nz - 2, Math.floor(fz));
    const u = fx - i;
    const v = fz - j;
    const H = this.heights;
    const w = this.nx;
    const h00 = H[j * w + i], h10 = H[j * w + i + 1], h01 = H[(j + 1) * w + i], h11 = H[(j + 1) * w + i + 1];
    // Same diagonal as the collision triangles (h10 – h01).
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  /** Surface normal at (x, z). @param {THREE.Vector3} out */
  normalAt(x, z, out) {
    const e = this.cell;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    if (!Number.isFinite(hl + hr + hd + hu)) return out.set(0, 1, 0);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }
}
