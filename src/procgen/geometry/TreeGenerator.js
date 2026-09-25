/**
 * @file TreeGenerator — procedural trees: recursive broadleaf branching
 * (oak), whorled conifers (pine) and twisted dead trees for the Forbidden
 * Forest. Branches are tapered tubes with bark UVs along their length;
 * foliage is clusters of crossed alpha cards whose normals point out of the
 * crown (so the canopy shades like a volume). Plus rocks (noise-displaced
 * icospheres) and a needle-card texture for conifers.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREE_SPECIES, ROCKS } from '../../data/vegetation.js';
import { Noise } from '../textures/noise.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

/** Tapered, gently curved tube from p0 along dir. */
function branchTube(p0, dir, length, r0, r1, segs, rings, bend, rnd, barkTile, pos, nor, uv, idx) {
  const base = pos.length / 3;
  const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.95 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
  const other = new THREE.Vector3().crossVectors(dir, side).normalize();
  const wob = new THREE.Vector3((rnd() - 0.5) * bend, (rnd() - 0.5) * bend + bend * 0.3, (rnd() - 0.5) * bend);
  const pts = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    pts.push(p0.clone().addScaledVector(dir, length * t).addScaledVector(wob, length * t * t));
  }
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = r0 + (r1 - r0) * t;
    const c = pts[j];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const nx = side.x * Math.cos(a) + other.x * Math.sin(a);
      const ny = side.y * Math.cos(a) + other.y * Math.sin(a);
      const nz = side.z * Math.cos(a) + other.z * Math.sin(a);
      pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
      nor.push(nx, ny, nz);
      uv.push((i / segs) * Math.max(1, Math.round((TAU * r0) / barkTile)), (length * t) / barkTile);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = base + j * (segs + 1) + i;
      const b = a + segs + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return pts[rings];
}

/** Crossed foliage cards at a point; normals point away from the crown centre. */
function leafCluster(p, size, crown, rnd, pos, nor, uv, idx) {
  for (let k = 0; k < 3; k++) {
    const base = pos.length / 3;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * TAU, rnd() * Math.PI));
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const s = size * (0.75 + rnd() * 0.5);
    for (const [cx, cy] of corners) {
      const v = new THREE.Vector3(cx * s * 0.5, cy * s * 0.5, 0).applyQuaternion(q).add(p);
      pos.push(v.x, v.y, v.z);
      const n = v.clone().sub(crown).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push((cx + 1) / 2, (cy + 1) / 2);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function toGeometry(pos, nor, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * @param {'oak'|'pine'|'dead'} species
 * @param {number} seed
 * @param {number} barkTile metres per bark texture repeat
 * @returns {{trunk:THREE.BufferGeometry, leaves:THREE.BufferGeometry|null, height:number, trunkRadius:number, species:string}}
 */
export function buildTree(species, seed, barkTile) {
  const S = TREE_SPECIES[species];
  let st = seed >>> 0;
  const rnd = () => {
    st = (st + 0x6d2b79f5) >>> 0;
    let t = st;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const range = ([a, b]) => a + rnd() * (b - a);
  const tp = [], tn = [], tu = [], ti = [];
  const lp = [], ln = [], lu = [], li = [];
  const H = range(S.trunkHeight);
  const R = range(S.trunkRadius);
  const lean = new THREE.Vector3((rnd() - 0.5) * S.lean, 1, (rnd() - 0.5) * S.lean).normalize();
  const origin = new THREE.Vector3(0, -0.3, 0);

  if (species === 'pine') {
    const top = branchTube(origin, lean, H + 0.3, R, R * 0.12, 8, 8, 0.05, rnd, barkTile, tp, tn, tu, ti);
    const crown = origin.clone().addScaledVector(lean, H * 0.6);
    const whorls = Math.round(range(S.whorls));
    for (let w = 0; w < whorls; w++) {
      const t = 0.3 + (w / whorls) * 0.68;
      const y = H * t;
      const len = S.branchLength[0] + (S.branchLength[1] - S.branchLength[0]) * ((w / whorls) ** 0.9);
      const count = 5 + Math.floor(rnd() * 3);
      for (let b = 0; b < count; b++) {
        const a = (b / count) * TAU + rnd() * 0.5 + w;
        const dir = new THREE.Vector3(Math.cos(a), -S.droop * (0.5 + rnd() * 0.5), Math.sin(a)).normalize();
        const p0 = origin.clone().addScaledVector(lean, y);
        const end = branchTube(p0, dir, len, R * 0.22 * (1 - t * 0.6), 0.02, 4, 2, 0.2, rnd, barkTile, tp, tn, tu, ti);
        // Needle cards along the branch.
        const cards = Math.max(1, Math.round(len / 0.9));
        for (let c = 0; c < cards; c++) {
          const f = (c + 0.6) / cards;
          const p = p0.clone().lerp(end, f);
          p.y -= 0.12;
          leafCluster(p, range(S.needleSize) * (1.1 - f * 0.4) * Math.min(1, len / 2.2 + 0.4), crown, rnd, lp, ln, lu, li);
        }
      }
    }
    leafCluster(top.clone().add(new THREE.Vector3(0, -0.4, 0)), range(S.needleSize), crown, rnd, lp, ln, lu, li);
  } else {
    // Recursive broadleaf / dead branching.
    const crown = origin.clone().addScaledVector(lean, H * 1.25);
    const grow = (p0, dir, len, r, level) => {
      const end = branchTube(p0, dir, len, r, r * S.radiusRatio * (level === 0 ? 1.2 : 1), level === 0 ? 10 : level === 1 ? 7 : 5, level === 0 ? 5 : 3, level === 0 ? 0.1 : 0.35 + (S.twist ?? 0), rnd, barkTile, tp, tn, tu, ti);
      if (level >= S.levels) {
        const clusters = S.leafClusters >= 1 ? S.leafClusters : rnd() < S.leafClusters ? 1 : 0;
        for (let k = 0; k < clusters; k++) {
          const off = new THREE.Vector3((rnd() - 0.5), (rnd() - 0.2), (rnd() - 0.5)).multiplyScalar(0.8);
          leafCluster(end.clone().add(off), range(S.leafSize), crown, rnd, lp, ln, lu, li);
        }
        return;
      }
      const n = S.children[level];
      for (let c = 0; c < n; c++) {
        const t = level === 0 ? 0.55 + rnd() * 0.45 : 0.35 + rnd() * 0.65;
        const start = p0.clone().lerp(end, t);
        const a = (c / n) * TAU + rnd() * 1.2;
        const spread = S.spread[level] * (0.7 + rnd() * 0.6);
        const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const nd = dir.clone().multiplyScalar(Math.cos(spread)).addScaledVector(side, Math.sin(spread));
        nd.y += S.bendUp;
        nd.normalize();
        grow(start, nd, len * S.lengthRatio[level] * (0.8 + rnd() * 0.4), r * S.radiusRatio * (0.8 + rnd() * 0.3), level + 1);
      }
    };
    grow(origin, lean, H, R, 0);
    // Root flare.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + rnd();
      branchTube(new THREE.Vector3(0, 0.25, 0), new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a)).normalize(), 1.1, R * 0.55, R * 0.1, 5, 2, 0.1, rnd, barkTile, tp, tn, tu, ti);
    }
  }
  return {
    trunk: toGeometry(tp, tn, tu, ti),
    leaves: lp.length ? toGeometry(lp, ln, lu, li) : null,
    height: H,
    trunkRadius: R,
    species,
  };
}

/** Conifer needle card texture (alpha), generated once. */
export function needleTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const N = new Noise(77);
  // A central twig with dense needles fanning out.
  for (let k = 0; k < 520; k++) {
    const t = Math.random();
    const x0 = size * (0.12 + t * 0.76);
    const y0 = size * 0.5 + N.perlin(t * 4, 1, 64, 64) * size * 0.04;
    const side = Math.random() < 0.5 ? -1 : 1;
    const len = size * (0.12 + Math.random() * 0.22) * (1 - Math.abs(t - 0.5) * 0.9);
    const a = side * (0.5 + Math.random() * 0.9);
    const shade = 30 + Math.floor(Math.random() * 50);
    g.strokeStyle = `rgb(${shade * 0.7}, ${shade + 40}, ${shade * 0.6})`;
    g.lineWidth = Math.max(1, size / 180);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + Math.cos(a) * len * 0.35, y0 + Math.sin(a) * len);
    g.stroke();
  }
  g.strokeStyle = '#3a2a1a';
  g.lineWidth = size / 90;
  g.beginPath();
  g.moveTo(size * 0.08, size * 0.5);
  g.lineTo(size * 0.92, size * 0.5);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Boulder: displaced icosphere with a flattened base.
 * @param {number} seed
 */
export function buildRock(seed) {
  const g = new THREE.IcosahedronGeometry(1, ROCKS.detail);
  const N = new Noise(seed);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const stretch = new THREE.Vector3(1 + (N.perlin(1.3, 2.1, 64, 64)) * 0.4, 0.7 + N.perlin(4.2, 0.3, 64, 64) * 0.2, 1 + N.perlin(7.7, 3.3, 64, 64) * 0.4);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const u = Math.atan2(v.x, v.z) / TAU + 0.5;
    const w = Math.acos(v.y) / Math.PI;
    const n = N.fbm(u, w, Math.round(ROCKS.noise.freq * 4), 4) * ROCKS.noise.amp;
    const r = N.ridged(u, w, 6, 3) * ROCKS.noise.ridged;
    v.multiplyScalar(1 + n + r * 0.4).multiply(stretch);
    if (v.y < -ROCKS.flatten) v.y = -ROCKS.flatten + (v.y + ROCKS.flatten) * 0.15;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.translate(0, ROCKS.flatten * 0.8, 0);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const merged = mergeVertices(g);
  g.dispose();
  merged.computeVertexNormals();
  // Rocks are shaded tri-planar; a UV set only keeps shader inputs defined.
  merged.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(merged.attributes.position.count * 2), 2));
  merged.computeBoundingSphere();
  return merged;
}
