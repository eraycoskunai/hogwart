/**
 * @file HairGenerator — hair as geometry: a shell over the scalp (offset
 * along the surface normal, thickness varying over the head, noise for
 * messy tufts or curls, an optional fringe over the forehead, a parting
 * groove), a draped curtain for long styles and extras (ponytail, braids,
 * bun). UVs run along the strands so a tileable strand texture and an
 * anisotropic highlight read as hair. Built in head space.
 */
import * as THREE from 'three';
import { HAIR, HAIR_STYLES, HEAD } from '../../data/character.js';
import { Noise } from '../textures/noise.js';
import { MeshBuilder, ramp, polylinePoint, tube, sampleTable } from './MeshKit.js';
import { scalpCoverage, fringeCoverage } from './Hairline.js';
import { gridDir } from './HeadGenerator.js';

const TAU = Math.PI * 2;
/** Strand texture repeat: metres per tile across / along strands. */
const ACROSS = 0.035;
const ALONG = 0.12;

function march(sdf, ox, oy, oz, dx, dy, dz, start, s) {
  let t = start;
  for (let i = 0; i < HEAD.march.steps; i++) {
    const f = sdf(ox + dx * t, oy + dy * t, oz + dz * t);
    if (f < HEAD.march.eps * s) return t;
    t -= f * HEAD.march.relax;
    if (t <= 0) return 0;
  }
  return t;
}

function sdfNormal(sdf, p, out) {
  const e = 0.0008;
  return out.set(
    sdf(p.x + e, p.y, p.z) - sdf(p.x - e, p.y, p.z),
    sdf(p.x, p.y + e, p.z) - sdf(p.x, p.y - e, p.z),
    sdf(p.x, p.y, p.z + e) - sdf(p.x, p.y, p.z - e),
  ).normalize();
}

/**
 * @param {ReturnType<import('./HeadGenerator.js').faceShape>} F
 * @param {(x:number, y:number, z:number) => number} sdf head distance field
 * @param {string} styleKey
 * @param {{headBone:number, neckBone:number, chestBone:number, seed:number, toHead:(p:THREE.Vector3)=>THREE.Vector3}} o
 * @returns {THREE.BufferGeometry}
 */
export function buildHair(F, sdf, styleKey, o) {
  const style = HAIR_STYLES[styleKey] ?? HAIR_STYLES.short;
  const s = F.s;
  const N = new Noise(o.seed);
  const mb = new MeshBuilder();
  const [cols, rows] = HAIR.segments;
  const start = HEAD.march.start * s;
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const T = style.thickness;
  const minT = HAIR.minThickness * s;
  const wHead = [[o.headBone, 1]];

  // ---- Scalp shell.
  const thick = (x, y, z, th) => {
    const back = ramp(1.1, 2.5, Math.abs(th));
    const top = ramp(0.02 * s, 0.08 * s, y);
    let t = THREE.MathUtils.lerp(THREE.MathUtils.lerp(T.side, T.back, back), T.top, top) * s;
    const nz = style.noise;
    const u = (th / TAU + 0.5);
    const v = Math.acos(THREE.MathUtils.clamp(y / (0.1 * s), -1, 1)) / Math.PI;
    let bump = N.fbm(u, v * 0.5, nz.freq, 3);
    if (nz.spiky) bump = Math.pow(1 - Math.abs(bump), 2) * 1.3 - 0.35;
    if (nz.curls) bump = Math.abs(Math.sin(bump * 9)) * 1.2 - 0.3;
    t += bump * nz.amp * s * (0.4 + 0.6 * top);
    if (style.part !== undefined) {
      const px = (style.part - 0.5) * 0.06 * s * (style.part ? 1 : 0);
      t *= 1 - 0.5 * Math.exp(-(((x - px) / (0.0035 * s)) ** 2)) * ramp(0, 0.4, -z / (0.1 * s)) * top;
    }
    return Math.max(t, minT);
  };
  const jagOf = (th) => (style.fringe ? style.fringe.jag * s * (style.fringe.straight ? 0.2 : 1) * N.perlin(th * 8 + 3.3, 1.7, 64, 64) : 0);
  // Where the hair ends on each column (polar angle): rows then run from
  // the crown to exactly the hairline, so the edge is smooth.
  const surf = (th, ph, out) => {
    gridDir(th, Math.max(0.0001, ph), d);
    const r = march(sdf, 0, 0, 0, d.x, d.y, d.z, start, s);
    return out.copy(d).multiplyScalar(r);
  };
  const covered = (th, ph) => {
    surf(th, ph, p);
    return scalpCoverage(style, p.x, p.y, p.z, s) > 0.5 || fringeCoverage(style, p.x, p.y, p.z, s, jagOf(th)) > 0.5;
  };
  const edgePhi = [];
  for (let i = 0; i <= cols; i++) {
    const th = (i / cols * 2 - 1) * Math.PI;
    let lo = 0;
    let hi = Math.PI * 0.95;
    const steps = 40;
    for (let k = 1; k <= steps; k++) {
      const ph = (k / steps) * hi;
      if (!covered(th, ph)) {
        hi = ph;
        lo = ((k - 1) / steps) * Math.PI * 0.95;
        break;
      }
    }
    for (let k = 0; k < 6; k++) {
      const mid = (lo + hi) / 2;
      if (covered(th, mid)) lo = mid;
      else hi = mid;
    }
    edgePhi.push((lo + hi) / 2);
  }
  mb.grid(cols, rows, (u, v, i) => {
    const th = (u * 2 - 1) * Math.PI;
    const ph = edgePhi[i] * Math.pow(v, 0.9);
    surf(th, ph, p);
    sdfNormal(sdf, p, n);
    const hl = scalpCoverage(style, p.x, p.y, p.z, s);
    const taper = THREE.MathUtils.smoothstep(1 - v, 0, 0.18);
    let t;
    if (hl > 0.25) t = minT + (thick(p.x, p.y, p.z, th) - minT) * taper;
    else t = minT * 2.5 + 0.004 * s * taper;
    p.addScaledVector(n, t);
    return { p: p.clone(), uv: [(th * 0.09 * s) / ACROSS, (ph * 0.09 * s) / ALONG], uv1: [u, v], w: wHead };
  });

  // ---- Curtain (long / bob).
  const C = style.curtain;
  if (C) buildCurtain(mb, F, sdf, style, C, o, N);

  // ---- Extras.
  for (const ex of style.extras ?? []) {
    if (ex.type === 'tail' || ex.type === 'braid') {
      const src = ex.mirror ? style.extras.find((e) => e.type === ex.type && !e.mirror) : ex;
      const pts = src.points.map(([x, y, z]) => [(ex.mirror ? -x : x) * s, y * s, z * s]);
      const radii = src.radius.map((r) => r * s);
      const braid = ex.type === 'braid';
      tube(mb, (t, out) => polylinePoint(pts, t, out), (t, a) => {
        const r = sampleTable(radii.map((rv, i) => [i / (radii.length - 1), rv]), t)[0];
        const lumps = braid ? 1 + 0.2 * Math.abs(Math.sin(t * 34 + a * 1 + (Math.floor(t * 34 / Math.PI) % 2) * 1.5)) : 1 + 0.06 * N.perlin(a * 3, t * 10, 64, 64);
        return r * lumps;
      }, {
        rings: HAIR.tube.rings, segments: HAIR.tube.segments, capStart: true, capEnd: true,
        uv: (t, a) => [a * 4, (t * 0.3 * s) / ALONG * 3], uv1: (t, a) => [a, t],
        weights: (t) => {
          const k = ramp(0.25, 0.85, t);
          return [[o.headBone, 1 - k], [o.neckBone, k * 0.5], [o.chestBone, k * 0.5]];
        },
        up: new THREE.Vector3(1, 0, 0),
      });
    } else if (ex.type === 'bun') {
      const c = new THREE.Vector3(...ex.center).multiplyScalar(s);
      const R = ex.radius * s;
      mb.grid(20, 14, (u, v) => {
        const a = u * TAU;
        const b = v * Math.PI;
        const wob = 1 + 0.12 * Math.abs(Math.sin(a * 3 + b * 5)) + 0.05 * N.perlin(u * 8, v * 8, 8, 8);
        d.set(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a));
        return { p: c.clone().addScaledVector(d, R * wob), uv: [(a * R) / ACROSS, (b * R) / ALONG], uv1: [u, v], w: wHead };
      });
    }
  }
  return mb.build();
}

function buildCurtain(mb, F, sdf, style, C, o, N) {
  const s = F.s;
  const { columns, rows } = HAIR.curtain;
  const yTop = 0.03 * s;
  const len = C.length * s;
  const sh = HAIR.shoulders;
  const p = new THREE.Vector3();
  const T = style.thickness;
  const topRadius = [];
  for (let i = 0; i <= columns; i++) {
    const psi = C.front + (i / columns) * (TAU - 2 * C.front);
    const dx = Math.sin(psi);
    const dz = -Math.cos(psi);
    // Widest head extent across a few heights (hair falls from there).
    let r = 0;
    for (const y of [-0.02, 0, 0.02, 0.04]) r = Math.max(r, march(sdf, 0, y * s, 0, dx, 0, dz, HEAD.march.start * s, s));
    // Drape over the ears.
    const ear = Math.exp(-(((Math.abs(Math.atan2(dx, dz)) - Math.PI / 2) / 0.45) ** 2));
    topRadius.push(r + (T.side + 0.003) * s + ear * 0.016 * s);
  }
  mb.grid(columns, rows, (u, v, i) => {
    const psi = C.front + u * (TAU - 2 * C.front);
    const dx = Math.sin(psi);
    const dz = -Math.cos(psi);
    // Ragged ends.
    const jag = 1 + 0.08 * N.perlin(u * 40, 2.2, 64, 64);
    const y = yTop - v * len * jag;
    let r = topRadius[i];
    // Over the shoulders and upper back.
    const k = ramp(sh.y0 * s, sh.y1 * s, y);
    if (k > 0) {
      const ex = sh.rx * s;
      const ez = sh.rz * s;
      const re = 1 / Math.sqrt((dx / ex) ** 2 + (dz / ez) ** 2) + 0.012 * s;
      r = THREE.MathUtils.lerp(r, Math.max(r, re), k);
    }
    r += C.flare * s * v * v;
    r -= C.curl * s * ramp(0.65, 1, v) ** 2;
    p.set(dx * r, y, dz * r + (k > 0 ? sh.z * s * k : 0));
    const kb = ramp(-0.06 * s, -0.2 * s, y);
    const w = [[o.headBone, 1 - kb], [o.neckBone, kb * 0.4], [o.chestBone, kb * 0.6]];
    return { p: p.clone(), uv: [(u * (TAU - 2 * C.front) * 0.09 * s) / ACROSS, (v * len) / ALONG], uv1: [u, v], w };
  });
}
