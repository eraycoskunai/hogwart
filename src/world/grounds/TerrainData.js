/**
 * @file TerrainData — generates the Hogwarts valley heightfield from the
 * feature list in data/grounds.js (rolling hills, a ring of ridged
 * mountains, the lake basin, the castle's cliff-edged plateau, bumps,
 * flattened fields and graded paths) plus the splat masks the terrain
 * shader, grass and vegetation read: dirt path, forest floor, paving and
 * shore mud, and a grass density map.
 */
import * as THREE from 'three';
import { Noise, smoothstep } from '../../procgen/textures/noise.js';

const _seg = { t: 0, d: 0, x: 0, z: 0 };

/** Closest point on segment AB (2D). */
function segmentDistance(px, pz, ax, az, bx, bz, out) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  out.x = ax + dx * t;
  out.z = az + dz * t;
  out.t = t;
  out.d = Math.hypot(px - out.x, pz - out.z);
  return out;
}

export class TerrainData {
  /**
   * @param {typeof import('../../data/grounds.js').TERRAIN} T
   * @param {{paving?:{center:number[], radii:number[]}[]}} [o]
   */
  constructor(T, o = {}) {
    this.T = T;
    this.n = Math.round(T.size / T.cell) + 1;
    this.x0 = -T.size / 2;
    this.z0 = -T.size / 2;
    this.cell = T.cell;
    this.level = T.lake.level;
    this.paving = o.paving ?? [];
    this.N = new Noise(T.seed);
    this.heights = new Float32Array(this.n * this.n);
    this.splat = new Uint8Array(this.n * this.n * 4);
    this.grass = new Uint8Array(this.n * this.n);
    this._generate();
  }

  // ------------------------------------------------------------ heights

  /** Height from every feature except paths. */
  _natural(x, z) {
    const T = this.T;
    const N = this.N;
    const u = (x - this.x0) / T.size;
    const v = (z - this.z0) / T.size;
    let h = T.baseHeight + N.fbm(u, v, T.hills.freq, T.hills.octaves) * T.hills.amp;
    h += N.fbm(u + 0.31, v + 0.77, T.detail.freq, T.detail.octaves) * T.detail.amp;
    for (const b of T.bumps) {
      const d = Math.hypot(x - b.center[0], z - b.center[1]) / b.radius;
      if (d < 2) h += b.height * Math.exp(-d * d * 1.6);
    }
    // Ring of mountains.
    const r = Math.hypot(x, z);
    const M = T.mountains;
    if (r > M.start) {
      const k = smoothstep(M.start, M.full, r);
      const ridged = N.ridged(u, v, M.freq, M.octaves);
      h += M.height * k * (0.45 + 0.75 * ridged);
    }
    // Lake basin.
    const L = T.lake;
    const wob = 1 + L.wobble * N.fbm(u * 1.3 + 0.5, v * 1.3, 6, 3);
    const q = Math.hypot((x - L.center[0]) / L.radii[0], (z - L.center[1]) / L.radii[1]) * wob;
    const shoreT = 1 - smoothstep(1 - L.shore / L.radii[0], 1 + L.shore / L.radii[0] * 0.4, q);
    if (shoreT > 0) {
      const bed = L.level - L.shelf - L.depth * Math.max(0, 1 - q * q) ** L.bedPower;
      h = THREE.MathUtils.lerp(h, Math.min(h, bed), shoreT);
    }
    // Castle plateau with cliffs.
    const P = T.plateau;
    const pw = 1 + P.wobble * N.fbm(u * 2 + 0.2, v * 2 + 0.9, 8, 3);
    const dp = Math.hypot((x - P.center[0]) / P.radii[0], (z - P.center[1]) / P.radii[1]) * pw;
    const pT = 1 - smoothstep(1, 1 + P.cliff / P.radii[0], dp);
    if (pT > 0) {
      const top = P.height + N.fbm(u, v, 40, 2) * 0.35 * smoothstep(0.85, 1, dp);
      h = THREE.MathUtils.lerp(h, top, pT);
    }
    // Flattened fields.
    for (const f of T.flats) {
      const d = Math.hypot((x - f.center[0]) / f.radii[0], (z - f.center[1]) / f.radii[1]);
      const fb = f.blend / Math.max(f.radii[0], f.radii[1]);
      const k = 1 - smoothstep(1, 1 + fb, d);
      if (k > 0) {
        const target = f.height ?? this._flatHeight(f);
        h = THREE.MathUtils.lerp(h, target, k);
      }
    }
    return h;
  }

  _flatHeight(f) {
    if (f._h === undefined) {
      // Natural height at the centre without this flat (this.T is a private copy).
      const flats = this.T.flats;
      this.T.flats = flats.filter((x) => x !== f);
      f._h = this._natural(f.center[0], f.center[1]);
      this.T.flats = flats;
    }
    return f._h;
  }

  _generate() {
    const { n, heights } = this;
    // Flats cache their centre height in a private copy.
    this.T = { ...this.T, flats: this.T.flats.map((f) => ({ ...f })) };
    for (let j = 0; j < n; j++) {
      const z = this.z0 + j * this.cell;
      for (let i = 0; i < n; i++) heights[j * n + i] = this._natural(this.x0 + i * this.cell, z);
    }
    this._applyPaths();
    this._buildMasks();
  }

  /** Grade paths: flat cross-section, controlled heights along their length. */
  _applyPaths() {
    const T = this.T;
    const base = Float32Array.from(this.heights);
    const hBase = (x, z) => this._sample(base, x, z);
    const half = T.path.width / 2;
    const reach = half + T.path.blend;
    this.pathSegments = [];
    for (const path of T.paths) {
      const pts = path.points.map(([x, z, y]) => [x, z, y ?? hBase(x, z)]);
      for (let k = 0; k < pts.length - 1; k++) this.pathSegments.push([pts[k], pts[k + 1]]);
    }
    const n = this.n;
    for (const [a, b] of this.pathSegments) {
      const minX = Math.min(a[0], b[0]) - reach, maxX = Math.max(a[0], b[0]) + reach;
      const minZ = Math.min(a[1], b[1]) - reach, maxZ = Math.max(a[1], b[1]) + reach;
      const i0 = Math.max(0, Math.floor((minX - this.x0) / this.cell));
      const i1 = Math.min(n - 1, Math.ceil((maxX - this.x0) / this.cell));
      const j0 = Math.max(0, Math.floor((minZ - this.z0) / this.cell));
      const j1 = Math.min(n - 1, Math.ceil((maxZ - this.z0) / this.cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + i * this.cell;
          const z = this.z0 + j * this.cell;
          segmentDistance(x, z, a[0], a[1], b[0], b[1], _seg);
          if (_seg.d > reach) continue;
          const target = a[2] + (b[2] - a[2]) * _seg.t;
          const k = 1 - smoothstep(half, reach, _seg.d);
          const idx = j * n + i;
          this.heights[idx] = THREE.MathUtils.lerp(this.heights[idx], target, k);
        }
      }
    }
  }

  /** Distance from (x, z) to the nearest path centreline. */
  pathDistance(x, z) {
    let best = Infinity;
    for (const [a, b] of this.pathSegments) best = Math.min(best, segmentDistance(x, z, a[0], a[1], b[0], b[1], _seg).d);
    return best;
  }

  _buildMasks() {
    const T = this.T;
    const N = this.N;
    const n = this.n;
    const half = T.path.width / 2;
    const F = T.forest;
    const nrm = new THREE.Vector3();
    for (let j = 0; j < n; j++) {
      const z = this.z0 + j * this.cell;
      for (let i = 0; i < n; i++) {
        const x = this.x0 + i * this.cell;
        const idx = j * n + i;
        const h = this.heights[idx];
        const u = i / (n - 1);
        const v = j / (n - 1);
        // Paths (only near segments).
        let path = 0;
        const pd = this._nearPath(x, z, half + 2);
        if (pd < half + 2) path = 1 - smoothstep(half * 0.7, half + 1.2, pd + N.perlin(u * 400, v * 400, 400, 400) * 0.6);
        // Forest floor.
        const fw = 1 + F.wobble * N.fbm(u * 3 + 0.1, v * 3 + 0.4, 10, 3);
        const fq = Math.hypot((x - F.center[0]) / F.radii[0], (z - F.center[1]) / F.radii[1]) * fw;
        const forest = 1 - smoothstep(0.85, 1.02, fq);
        // Paving.
        let pave = 0;
        for (const p of this.paving) {
          const d = Math.hypot((x - p.center[0]) / p.radii[0], (z - p.center[1]) / p.radii[1]);
          pave = Math.max(pave, 1 - smoothstep(0.9, 1, d));
        }
        // Shore mud / sand.
        const rel = h - this.level;
        const shore = rel < T.shore[1] ? 1 - smoothstep(T.shore[0], T.shore[1], rel) : 0;
        const o = idx * 4;
        this.splat[o] = Math.round(path * 255);
        this.splat[o + 1] = Math.round(forest * 255);
        this.splat[o + 2] = Math.round(pave * 255);
        this.splat[o + 3] = Math.round(shore * 255);
        // Grass: not on paths, paving, shore, rock or under water; thinner in the forest.
        this._normalIdx(i, j, nrm);
        const rock = smoothstep(T.rockSlope[1], T.rockSlope[0], nrm.y);
        const patches = 0.65 + 0.35 * N.fbm(u, v, 30, 3);
        let g = (1 - path) * (1 - pave) * (1 - shore) * (1 - rock) * (1 - forest * 0.7) * patches;
        if (rel < 0.3) g = 0;
        this.grass[idx] = Math.round(THREE.MathUtils.clamp(g, 0, 1) * 255);
      }
    }
  }

  _nearPath(x, z, reach) {
    let best = Infinity;
    for (const [a, b] of this.pathSegments) {
      if (x < Math.min(a[0], b[0]) - reach || x > Math.max(a[0], b[0]) + reach) continue;
      if (z < Math.min(a[1], b[1]) - reach || z > Math.max(a[1], b[1]) + reach) continue;
      best = Math.min(best, segmentDistance(x, z, a[0], a[1], b[0], b[1], _seg).d);
    }
    return best;
  }

  // ------------------------------------------------------------ queries

  _sample(arr, x, z) {
    const n = this.n;
    const fx = THREE.MathUtils.clamp((x - this.x0) / this.cell, 0, n - 1.0001);
    const fz = THREE.MathUtils.clamp((z - this.z0) / this.cell, 0, n - 1.0001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = arr[j * n + i], b = arr[j * n + i + 1], c = arr[(j + 1) * n + i], d = arr[(j + 1) * n + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  /** Bilinear terrain height. */
  heightAt(x, z) {
    return this._sample(this.heights, x, z);
  }

  _normalIdx(i, j, out) {
    const n = this.n;
    const H = this.heights;
    const l = H[j * n + Math.max(0, i - 1)], r = H[j * n + Math.min(n - 1, i + 1)];
    const d = H[Math.max(0, j - 1) * n + i], u = H[Math.min(n - 1, j + 1) * n + i];
    return out.set(l - r, 4 * this.cell * 0.5, d - u).normalize();
  }

  /** @param {THREE.Vector3} out */
  normalAt(x, z, out) {
    const e = this.cell;
    return out.set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e)).normalize();
  }

  /** Splat channel (0 path, 1 forest, 2 paving, 3 shore) 0..1. */
  mask(x, z, channel) {
    const n = this.n;
    const i = THREE.MathUtils.clamp(Math.round((x - this.x0) / this.cell), 0, n - 1);
    const j = THREE.MathUtils.clamp(Math.round((z - this.z0) / this.cell), 0, n - 1);
    return this.splat[(j * n + i) * 4 + channel] / 255;
  }

  /** Water depth at (x, z) (0 on land). */
  waterDepth(x, z) {
    return Math.max(0, this.level - this.heightAt(x, z));
  }

  // ---------------------------------------------------------- GPU data

  /** Half-float height texture (linear filtering on every WebGL2 device). */
  heightTexture() {
    const n = this.n;
    const data = new Uint16Array(n * n);
    for (let k = 0; k < data.length; k++) data[k] = THREE.DataUtils.toHalfFloat(this.heights[k]);
    const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }

  splatTexture() {
    const t = new THREE.DataTexture(this.splat, this.n, this.n, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  grassTexture() {
    const t = new THREE.DataTexture(this.grass, this.n, this.n, THREE.RedFormat);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  /**
   * World → texture UV: uv = (xz - (x0, z0)) * z + w (texel centres line
   * up with the height samples).
   */
  get uvTransform() {
    return new THREE.Vector4(this.x0, this.z0, 1 / (this.cell * this.n), 0.5 / this.n);
  }
}
