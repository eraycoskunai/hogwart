/**
 * @file HeadGenerator — sculpts a head from signed-distance primitives
 * (cranium, face, jaw, chin, cheekbones, brow, nose, lips, eye sockets,
 * neck) and projects a warped latitude/longitude grid onto it by ray
 * marching from the head centre. Adds ears, eyelids with lashes and teeth,
 * and builds the facial blend shapes (jaw open, smile, frown, brows up,
 * pucker, wide, per-eye blink) as deformation fields.
 *
 * Head space: origin at the head centre, +Y up, -Z is the face, +X the
 * character's right. Output is still in head space; the character
 * assembler moves it to the bind pose.
 */
import * as THREE from 'three';
import { HEAD, EYELID, TEETH, MORPHS, FACE_UV } from '../../data/character.js';
import { MATERIALS } from '../../data/materials.js';
import { MeshBuilder, ramp, orientTriangles, triCount, smoothSeams } from './MeshKit.js';

export const HEAD_MORPHS = Object.freeze(['jawOpen', 'smile', 'frown', 'browUp', 'pucker', 'wide', 'blinkL', 'blinkR']);

const TAU = Math.PI * 2;
const SKIN_TILE = MATERIALS.skin.tile;

// ---------------------------------------------------------------- shape

/**
 * Face dimensions in head space for a resolved appearance.
 * @param {Record<string, number>} v resolved sliders (see Appearance.resolveAppearance)
 */
export function faceShape(v) {
  const s = v.headScale;
  const H = HEAD;
  const eyeY = H.eye.y;
  // Lower-face heights stretch about eye level with the face length slider.
  const ly = (y) => (y < eyeY ? eyeY + (y - eyeY) * v.faceLength : y);
  const P = (a) => [a[0] * s, ly(a[1]) * s, a[2] * s];
  const R = (a, kx = 1, ky = 1, kz = 1) => [a[0] * s * kx, a[1] * s * ky, a[2] * s * kz];
  const fw = v.faceWidth;
  const jawK = v.jaw;
  const nl = v.noseLength;
  const nw = v.noseWidth;
  const lip = v.lips;
  const mw = v.mouthWidth;
  const cb = v.cheekbones;

  const noseRoot = P(H.nose.root);
  noseRoot[2] -= v.noseBridge * 0.6 * s;
  const tipBase = H.nose.tip;
  const noseTip = [0, (H.nose.root[1] + (tipBase[1] - H.nose.root[1]) * nl + v.noseTip) * s, (tipBase[2] - v.noseBridge - Math.abs(nl - 1) * 0.006 + v.noseTip * 0.3) * s];
  noseTip[1] = ly(noseTip[1] / s) * s;
  const ala = [H.nose.ala[0] * nw * s, noseTip[1] - (tipBase[1] - H.nose.ala[1]) * s, H.nose.ala[2] * s];

  const lipsY = ly(H.lips.y) * s;
  const chin = P(H.chin.c);
  chin[1] -= v.chin * 0.6 * s;
  chin[2] -= v.chin * s;

  return {
    s,
    cranium: { c: R(H.cranium.c), r: R(H.cranium.r, 0.5 + fw * 0.5) },
    face: { c: P(H.face.c), r: R(H.face.r, fw * (0.5 + jawK * 0.5), v.faceLength), k: H.face.k * s },
    jaw: { c: P(H.jaw.c), half: R(H.jaw.half, fw * jawK, v.faceLength), round: H.jaw.round * s, k: H.jaw.k * s },
    chin: { c: chin, r: R(H.chin.r, 1, 1 + v.chin * 18), k: H.chin.k * s },
    cheek: { c: [H.cheek.c[0] * fw * s, ly(H.cheek.c[1]) * s, (H.cheek.c[2] - (cb - 1) * 0.004) * s], r: R(H.cheek.r, Math.sqrt(cb), Math.sqrt(cb), cb), k: H.cheek.k * s },
    brow: { y: H.brow.y * s, z: H.brow.z * s, x: H.brow.x * fw * s, r: H.brow.r * s, k: H.brow.k * s },
    forehead: { c: R(H.forehead.c), r: R(H.forehead.r, fw), k: H.forehead.k * s },
    neck: { a: R(H.neck.a), b: R(H.neck.b), r: H.neck.r * s, k: H.neck.k * s },
    eye: { x: v.eyeSpacing * s, y: eyeY * s, z: H.eye.z * s, r: H.eye.r * s * v.eyeSize },
    socket: { r: (H.eye.r * v.eyeSize + H.socket.extra) * s, k: H.socket.k * s },
    nose: { root: noseRoot, tip: noseTip, bridgeR: H.nose.bridgeR * s * Math.sqrt(nw), tipR: R(H.nose.tipR, nw), ala, alaR: R(H.nose.alaR, nw), k: H.nose.k * s },
    lips: {
      y: lipsY,
      upper: { c: [0, lipsY + (H.lips.upper.c[1] - H.lips.y) * s * lip, H.lips.upper.c[2] * s], r: R(H.lips.upper.r, mw, lip, lip) },
      lower: { c: [0, lipsY + (H.lips.lower.c[1] - H.lips.y) * s * lip, H.lips.lower.c[2] * s], r: R(H.lips.lower.r, mw, lip, lip) },
      seam: { c: [0, lipsY, H.lips.seam.z * s], r: R(H.lips.seam.r, mw) },
      corner: H.lips.corner * s * mw,
      k: H.lips.k * s,
      fullness: lip,
    },
    ear: { ...H.ear, size: v.earSize, out: v.earOut },
    eyeTilt: v.eyeTilt,
    browHeight: v.browHeight * s,
    browThickness: v.browThickness,
  };
}

// ------------------------------------------------------------------ SDF

function sdEllipsoid(x, y, z, c, r) {
  const px = (x - c[0]) / r[0];
  const py = (y - c[1]) / r[1];
  const pz = (z - c[2]) / r[2];
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / r[0];
  const qy = py / r[1];
  const qz = pz / r[2];
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}

function sdCapsule(x, y, z, a, b, r) {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

function sdRoundBox(x, y, z, c, half, round) {
  const qx = Math.abs(x - c[0]) - half[0] + round;
  const qy = Math.abs(y - c[1]) - half[1] + round;
  const qz = Math.abs(z - c[2]) - half[2] + round;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - round;
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function smax(a, b, k) {
  return -smin(-a, -b, k);
}

/**
 * Signed distance to the head surface.
 * @param {ReturnType<typeof faceShape>} F
 */
export function makeHeadSdf(F) {
  const eyeC = [F.eye.x, F.eye.y, F.eye.z];
  const browA = [0, F.brow.y, F.brow.z];
  const browB = [F.brow.x, F.brow.y, F.brow.z + 0.006 * F.s];
  return (x, y, z) => {
    const ax = Math.abs(x);
    let d = sdEllipsoid(x, y, z, F.cranium.c, F.cranium.r);
    d = smin(d, sdEllipsoid(x, y, z, F.face.c, F.face.r), F.face.k);
    d = smin(d, sdRoundBox(x, y, z, F.jaw.c, F.jaw.half, F.jaw.round), F.jaw.k);
    d = smin(d, sdEllipsoid(x, y, z, F.chin.c, F.chin.r), F.chin.k);
    d = smin(d, sdEllipsoid(ax, y, z, F.cheek.c, F.cheek.r), F.cheek.k);
    d = smin(d, sdCapsule(ax, y, z, browA, browB, F.brow.r), F.brow.k);
    d = smin(d, sdEllipsoid(x, y, z, F.forehead.c, F.forehead.r), F.forehead.k);
    d = smin(d, sdCapsule(x, y, z, F.neck.a, F.neck.b, F.neck.r), F.neck.k);
    // Nose: bridge capsule + tip + nostril wings.
    const N = F.nose;
    let dn = sdCapsule(x, y, z, N.root, N.tip, N.bridgeR);
    dn = smin(dn, sdEllipsoid(x, y, z, N.tip, N.tipR), N.k * 0.5);
    dn = smin(dn, sdEllipsoid(ax, y, z, N.ala, N.alaR), N.k * 0.5);
    d = smin(d, dn, N.k);
    // Lips and the line between them.
    const L = F.lips;
    const dl = smin(sdEllipsoid(x, y, z, L.upper.c, L.upper.r), sdEllipsoid(x, y, z, L.lower.c, L.lower.r), L.k * 0.3);
    d = smin(d, dl, L.k);
    d = smax(d, -sdEllipsoid(x, y, z, L.seam.c, L.seam.r), L.k * 0.25);
    // Eye sockets.
    const ex = ax - eyeC[0], ey = y - eyeC[1], ez = z - eyeC[2];
    d = smax(d, -(Math.sqrt(ex * ex + ey * ey + ez * ez) - F.socket.r), F.socket.k);
    return d;
  };
}

/** March from a point along a direction (inward) onto the outermost surface. */
function marchInward(sdf, ox, oy, oz, dx, dy, dz, start, M) {
  let t = start;
  for (let i = 0; i < M.steps; i++) {
    const f = sdf(ox + dx * t, oy + dy * t, oz + dz * t);
    if (f < M.eps) return t;
    t -= f * M.relax;
    if (t <= 0) return 0;
  }
  return t;
}

// ----------------------------------------------------------- grid warps

/** Longitude for grid u (0..1): -π..π, dense at the face. */
export function gridTheta(u) {
  const a = 1 - HEAD.warpU;
  const s = u * 2 - 1;
  return Math.PI * s * (a + (1 - a) * s * s);
}

/** Polar angle for grid v (0..1): 0..π, dense around the features. */
export function gridPhi(v) {
  const b = HEAD.warpV;
  const c = HEAD.warpVCenter;
  return Math.PI * (v - (b / TAU) * (Math.sin(TAU * (v - c)) + Math.sin(TAU * c)));
}

/** Unit direction for (θ, φ). */
export function gridDir(theta, phi, out) {
  const sp = Math.sin(phi);
  return out.set(sp * Math.sin(theta), Math.cos(phi), -sp * Math.cos(theta));
}

// --------------------------------------------------------------- morphs

const _q = new THREE.Vector3();
const _r = new THREE.Quaternion();
const _axis = new THREE.Vector3(1, 0, 0);

function gauss(dx, dy, dz, sigma) {
  return Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * sigma * sigma));
}

/**
 * Deformation fields for the face shapes (grid vertices only).
 * @returns {(name:string, p:THREE.Vector3, out:THREE.Vector3) => THREE.Vector3} delta
 */
function faceFields(F) {
  const s = F.s;
  const mouthY = F.lips.y;
  const cx = F.lips.corner;
  const cz = F.lips.upper.c[2] + 0.012 * s;
  const eyeX = F.eye.x;
  const browY = F.eye.y + 0.017 * s + F.browHeight;
  const hinge = new THREE.Vector3().fromArray(MORPHS.jawOpen.hinge).multiplyScalar(s);
  const front = (z) => ramp(-0.035 * s, -0.07 * s, z);
  return (name, p, out) => {
    out.set(0, 0, 0);
    const f = front(p.z);
    switch (name) {
      case 'jawOpen': {
        const below = ramp(mouthY + 0.0025 * s, mouthY - 0.0025 * s, p.y);
        const neckFade = ramp(-0.135 * s, -0.1 * s, p.y);
        const w = below * neckFade * ramp(0.04 * s, 0.01 * s, p.z);
        _q.copy(p).sub(hinge).applyQuaternion(_r.setFromAxisAngle(_axis, MORPHS.jawOpen.angle * w)).add(hinge);
        out.subVectors(_q, p);
        // Pull the lip line inward to form the mouth cavity.
        const band = Math.exp(-(((p.y - mouthY) / (0.0024 * s)) ** 2)) * Math.max(0, 1 - (p.x / (cx * 1.02)) ** 2) * ramp(-0.07 * s, -0.082 * s, p.z);
        out.z += MORPHS.jawOpen.pocket * s * band;
        return out;
      }
      case 'smile': {
        const M = MORPHS.smile;
        const sg = M.sigma * s;
        for (const sx of [-1, 1]) {
          const g = gauss(p.x - sx * cx, p.y - mouthY, p.z - cz, sg) * f;
          out.x += sx * M.corner[0] * s * g;
          out.y += M.corner[1] * s * g;
          out.z += M.corner[2] * s * g;
          const c = gauss(p.x - sx * 0.036 * s, p.y + 0.018 * s, p.z + 0.07 * s, sg * 1.5) * f;
          out.y += M.cheek[1] * s * c;
          out.z += M.cheek[2] * s * c;
          // Lower lids squint a little.
          const l = gauss(p.x - sx * eyeX, p.y - (F.eye.y - 0.013 * s), p.z + 0.075 * s, sg * 0.6) * f;
          out.y += 0.0014 * s * l;
        }
        return out;
      }
      case 'frown': {
        const M = MORPHS.frown;
        const sg = M.sigma * s;
        for (const sx of [-1, 1]) {
          const g = gauss(p.x - sx * 0.014 * s, p.y - browY, p.z + 0.08 * s, sg) * f;
          out.x -= sx * M.brow[0] * s * g;
          out.y += M.brow[1] * s * g;
          out.z += M.brow[2] * s * g;
          const c = gauss(p.x - sx * cx, p.y - mouthY, p.z - cz, sg) * f;
          out.y += M.corner[1] * s * c;
        }
        return out;
      }
      case 'browUp': {
        const M = MORPHS.browUp;
        for (const sx of [-1, 1]) {
          const g = gauss(p.x - sx * eyeX, p.y - browY, p.z + 0.075 * s, M.sigma * s) * f;
          out.y += M.lift * s * g;
        }
        return out;
      }
      case 'pucker': {
        const M = MORPHS.pucker;
        const g = gauss(p.x * 0.7, p.y - mouthY, p.z - cz + 0.004 * s, M.sigma * s) * f;
        out.x -= p.x * M.squeeze * g;
        out.z -= M.forward * s * g;
        return out;
      }
      case 'wide': {
        const M = MORPHS.wide;
        for (const sx of [-1, 1]) {
          const g = gauss(p.x - sx * cx, p.y - mouthY, p.z - cz, M.sigma * s) * f;
          out.x += sx * M.corner[0] * s * g;
          out.y += M.corner[1] * s * g;
          out.z += M.corner[2] * s * g;
        }
        return out;
      }
      default:
        return out;
    }
  };
}

// ---------------------------------------------------------------- build

/** UV centre of a patch rect. */
function patchUV(rect, fu = 0.5, fv = 0.5) {
  return [rect[0] + (rect[2] - rect[0]) * fu, rect[1] + (rect[3] - rect[1]) * fv];
}

/**
 * Build the head.
 * @param {ReturnType<typeof faceShape>} F
 * @param {{headBone:number, neckBone:number, detail?:number}} o
 */
export function buildHead(F, o) {
  const sdf = makeHeadSdf(F);
  const M = { steps: HEAD.march.steps, eps: HEAD.march.eps * F.s, relax: HEAD.march.relax };
  const detail = o.detail ?? 1;
  const cols = Math.round(HEAD.segments[0] * detail);
  const rows = Math.round(HEAD.segments[1] * detail);
  const start = HEAD.march.start * F.s;
  const radius = new Float32Array((cols + 1) * (rows + 1));
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();

  const mb = new MeshBuilder();
  mb.declare('aMouth');
  const headW = (y) => {
    const t = ramp(HEAD.neckBlend[0] * F.s, HEAD.neckBlend[1] * F.s, y);
    return [[o.headBone, 1 - t], [o.neckBone, t]];
  };
  const vMax = HEAD.vMax;
  const mouthY = F.lips.y;
  const cx = F.lips.corner;

  // --- Skull / face grid. Rays start just outside the previous row's hit
  // (the surface is continuous); a start inside the surface falls back.
  const margin = 0.02 * F.s;
  const grid = mb.grid(cols, rows, (u, v, i, j) => {
    const th = gridTheta(u);
    const ph = gridPhi(v);
    gridDir(th, ph, d);
    let r0 = start;
    if (j > 0) {
      const prev = radius[(j - 1) * (cols + 1) + i];
      const guess = prev + margin;
      if (guess < start && sdf(d.x * guess, d.y * guess, d.z * guess) > 0) r0 = guess;
    }
    const r = marchInward(sdf, 0, 0, 0, d.x, d.y, d.z, r0, M);
    radius[j * (cols + 1) + i] = r;
    p.copy(d).multiplyScalar(r);
    const band = Math.exp(-(((p.y - mouthY) / (0.0022 * F.s)) ** 2)) * Math.max(0, 1 - (p.x / cx) ** 2) * ramp(-0.07 * F.s, -0.082 * F.s, p.z);
    return {
      p: p.clone(),
      uv: [u, v * vMax],
      uv1: [(u * TAU * 0.08 * F.s) / SKIN_TILE, (ph * 0.09 * F.s) / SKIN_TILE],
      w: headW(p.y),
      extra: { aMouth: band },
    };
  });
  const gridCount = mb.count;
  const gridTris = triCount(mb);

  // --- Ears.
  const earFirstTri = triCount(mb);
  const earVerts = [];
  for (const sx of [-1, 1]) earVerts.push(buildEar(mb, F, sdf, sx, M, headW));
  const earLastTri = triCount(mb);

  // --- Eyelids (+ lashes) with blink targets.
  /** @type {Map<number, THREE.Vector3>} vertex → blink position (per side) */
  const blink = { L: new Map(), R: new Map() };
  const lidFirstTri = triCount(mb);
  for (const [side, sx] of [['L', -1], ['R', 1]]) buildLids(mb, F, sx, o.headBone, blink[side]);
  const lidLastTri = triCount(mb);

  // --- Teeth.
  const teethFirst = mb.count;
  const teethFirstTri = triCount(mb);
  const lowerTeeth = [];
  for (const upper of [true, false]) {
    const first = mb.count;
    buildTeeth(mb, F, upper, o.headBone);
    if (!upper) for (let i = first; i < mb.count; i++) lowerTeeth.push(i);
  }
  const teethLastTri = triCount(mb);
  orientTriangles(mb, teethFirstTri, teethLastTri, (c, out) => out.set(c.x, 0, c.z - (TEETH.z + TEETH.radius) * F.s).normalize());

  const geometry = mb.build({ normals: false });
  const count = mb.count;

  // Normals for the grid part come from the mesh; seams get averaged.
  geometry.computeVertexNormals();
  const seams = smoothSeams(geometry);

  // --- Morph targets.
  const fields = faceFields(F);
  const basePos = geometry.attributes.position.array;
  const baseNor = geometry.attributes.normal.array;
  const morphPos = [];
  const morphNor = [];
  const tmp = new THREE.BufferGeometry();
  tmp.setIndex(geometry.index);
  const hinge = new THREE.Vector3().fromArray(MORPHS.jawOpen.hinge).multiplyScalar(F.s);
  const jawQ = new THREE.Quaternion().setFromAxisAngle(_axis, MORPHS.jawOpen.angle);
  const delta = new THREE.Vector3();
  for (const name of HEAD_MORPHS) {
    const dp = new Float32Array(count * 3);
    if (name === 'blinkL' || name === 'blinkR') {
      for (const [vi, target] of blink[name === 'blinkL' ? 'L' : 'R']) {
        dp[vi * 3] = target.x - basePos[vi * 3];
        dp[vi * 3 + 1] = target.y - basePos[vi * 3 + 1];
        dp[vi * 3 + 2] = target.z - basePos[vi * 3 + 2];
      }
    } else {
      for (let vi = 0; vi < gridCount; vi++) {
        p.fromArray(basePos, vi * 3);
        fields(name, p, delta);
        dp[vi * 3] = delta.x;
        dp[vi * 3 + 1] = delta.y;
        dp[vi * 3 + 2] = delta.z;
      }
      if (name === 'jawOpen') {
        for (const vi of lowerTeeth) {
          p.fromArray(basePos, vi * 3);
          delta.copy(p).sub(hinge).applyQuaternion(jawQ).add(hinge).sub(p);
          dp[vi * 3] = delta.x;
          dp[vi * 3 + 1] = delta.y;
          dp[vi * 3 + 2] = delta.z;
        }
      }
    }
    const morphed = new Float32Array(count * 3);
    for (let k = 0; k < morphed.length; k++) morphed[k] = basePos[k] + dp[k];
    tmp.setAttribute('position', new THREE.BufferAttribute(morphed, 3));
    tmp.computeVertexNormals();
    smoothSeams(tmp, seams);
    const mn = tmp.attributes.normal.array;
    const dn = new Float32Array(count * 3);
    for (let k = 0; k < dn.length; k++) dn[k] = mn[k] - baseNor[k];
    const pa = new THREE.Float32BufferAttribute(dp, 3);
    pa.name = name;
    morphPos.push(pa);
    const na = new THREE.Float32BufferAttribute(dn, 3);
    na.name = name;
    morphNor.push(na);
  }
  tmp.dispose();
  geometry.morphAttributes.position = morphPos;
  geometry.morphAttributes.normal = morphNor;
  geometry.morphTargetsRelative = true;

  return {
    geometry,
    grid: { cols, rows, radius },
    ranges: { grid: [0, gridTris], ears: [earFirstTri, earLastTri], lids: [lidFirstTri, lidLastTri], teeth: [teethFirstTri, teethLastTri], teethFirst },
    earVerts,
    sdf,
  };
}

/** Radius of the head grid at fractional grid coordinates (bilinear). */
export function sampleGridRadius(grid, u, v) {
  const x = THREE.MathUtils.clamp(u, 0, 1) * grid.cols;
  const y = THREE.MathUtils.clamp(v, 0, 1) * grid.rows;
  const i = Math.min(grid.cols - 1, Math.floor(x));
  const j = Math.min(grid.rows - 1, Math.floor(y));
  const fx = x - i;
  const fy = y - j;
  const R = grid.radius;
  const w = grid.cols + 1;
  const a = R[j * w + i];
  const b = R[j * w + i + 1];
  const c = R[(j + 1) * w + i];
  const e = R[(j + 1) * w + i + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
}

// ----------------------------------------------------------------- ears

function buildEar(mb, F, sdf, sx, M, headW) {
  const E = F.ear;
  const s = F.s * E.size;
  const rx = E.rx * s;
  const ry = E.ry * s;
  const depth = E.depth * s;
  const [segs, rings] = E.segments;
  // Attachment point on the side of the head.
  const oy = E.y * F.s;
  const oz = E.z * F.s;
  const tSurf = marchInward(sdf, 0, oy, oz, sx, 0, 0, HEAD.march.start * F.s, M);
  const base = new THREE.Vector3(sx * (tSurf - 0.0025 * F.s), oy, oz);
  // Ear frame: x_e runs backward, y_e up, z_e outward.
  const m = new THREE.Matrix4();
  const hinge = new THREE.Vector3(0, 0, -rx);
  const rot = new THREE.Matrix4().makeRotationY(sx * E.out);
  const tilt = new THREE.Matrix4().makeRotationZ(E.tilt);
  const axes = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(sx, 0, 0));
  // local → (tilt) → frame → hinge swing → head position
  m.copy(new THREE.Matrix4().makeTranslation(base.x, base.y, base.z))
    .multiply(new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z))
    .multiply(rot)
    .multiply(new THREE.Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z))
    .multiply(axes)
    .multiply(tilt);
  const uv = patchUV(FACE_UV.ear);
  const first = mb.count;
  const firstTri = triCount(mb);
  const pt = new THREE.Vector3();
  const shape = (t, a) => {
    const sa = Math.sin(a);
    const w = 1 + 0.16 * sa;
    const x = Math.cos(a) * rx * w * t;
    const y = sa * ry * (1 + 0.04 * sa) * t;
    return [x, y];
  };
  const frontH = (t, a) => {
    const helix = 0.95 * Math.exp(-(((t - 0.87) / 0.075) ** 2));
    const anti = 0.4 * Math.exp(-(((t - 0.6) / 0.1) ** 2)) * (Math.sin(a) > -0.4 ? 1 : 0.4);
    const concha = 0.75 * (1 - t) * (1 - t) * (0.6 + 0.4 * Math.max(0, -Math.cos(a)));
    return depth * (helix + anti - concha + 0.35 * (1 - t * t));
  };
  // Front (outward) surface, then the back dome.
  for (const front of [true, false]) {
    mb.grid(segs, rings, (u, v) => {
      const a = u * TAU;
      const t = front ? v : 1 - v;
      const [x, y] = shape(Math.max(t, 0.02), a);
      const z = front ? frontH(t, a) : -depth * 0.9 * (1 - t * t);
      pt.set(x, y, z).applyMatrix4(m);
      return { p: pt.clone(), uv, uv1: [(x / SKIN_TILE) * 3, (y / SKIN_TILE) * 3], w: headW(pt.y) };
    });
  }
  const lastTri = triCount(mb);
  // Wind by the side of the ear each triangle belongs to.
  const out = new THREE.Vector3(sx, 0, 0).applyMatrix4(rot);
  const half = firstTri + (lastTri - firstTri) / 2;
  orientTriangles(mb, firstTri, half, (c, o) => o.copy(out));
  orientTriangles(mb, half, lastTri, (c, o) => o.copy(out).negate());
  return [first, mb.count];
}

// ---------------------------------------------------------------- eyelids

function buildLids(mb, F, sx, headBone, blinkMap) {
  const L = EYELID;
  const E = new THREE.Vector3(sx * F.eye.x, F.eye.y, F.eye.z);
  const rl = F.eye.r + L.gap * F.s;
  const hw = L.halfWidth;
  const [cols, rows] = L.segments;
  const tilt = F.eyeTilt;
  const W = [[headBone, 1]];
  const edge = (h, open) => open * Math.pow(Math.max(0, 1 - (h / hw) ** 2), 0.7) + tilt * (h / hw) * 0.5;
  const lower = (h) => L.lowerOpen * Math.pow(Math.max(0, 1 - (h / hw) ** 2), 0.6) + tilt * (h / hw) * 0.5;
  const top = 1.25;
  const bottom = -1.2;
  const point = (h, pitch, r, out) => out.set(E.x + sx * r * Math.sin(h) * Math.cos(pitch), E.y + r * Math.sin(pitch), E.z - r * Math.cos(h) * Math.cos(pitch));
  const lidUV = FACE_UV.lid;
  const q = new THREE.Vector3();
  const firstTri = triCount(mb);

  // Upper lid: row 0 is the margin.
  const upper = mb.grid(cols, rows, (u, v) => {
    const h = (u * 2 - 1) * hw;
    const e = edge(h, L.upperOpen);
    const pitch = e + (top - e) * v;
    const r = rl + (v === 0 ? 0.0008 * F.s : 0);
    point(h, pitch, r, q);
    return { p: q.clone(), uv: patchUV(lidUV, u, 1 - v), uv1: [u * 0.2, v * 0.2], w: W };
  });
  // Blink targets for the upper lid.
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const h = (i / cols * 2 - 1) * hw;
      const e = edge(h, L.closed);
      const pitch = e + (top - e) * (j / rows);
      const r = rl + (j === 0 ? 0.0008 * F.s : 0);
      blinkMap.set(upper.at(i, j), point(h, pitch, r, new THREE.Vector3()));
    }
  }
  // Lower lid.
  mb.grid(cols, rows, (u, v) => {
    const h = (u * 2 - 1) * hw;
    const e = lower(h);
    const pitch = e + (bottom - e) * v;
    const r = rl + (v === 0 ? 0.0006 * F.s : 0);
    point(h, pitch, r, q);
    return { p: q.clone(), uv: patchUV(lidUV, u, 1 - v * 0.6), uv1: [u * 0.2, v * 0.2], w: W };
  });
  orientTriangles(mb, firstTri, triCount(mb), (c, out) => out.subVectors(c, E).normalize());

  // Upper lashes: a double-sided strip on the lid margin.
  const lashUV = patchUV(FACE_UV.lash);
  const lashCols = cols;
  const len = L.lash.length * F.s;
  const lashPoint = (h, open, tip, out) => {
    const e = edge(h, open);
    point(h, e, rl + 0.0008 * F.s, out);
    if (!tip) return out;
    const taper = Math.sqrt(Math.max(0, 1 - (h / hw) ** 2));
    const radial = new THREE.Vector3().subVectors(out, E).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    return out.addScaledVector(radial, Math.cos(L.lash.angle) * len * taper).addScaledVector(up, Math.sin(L.lash.angle) * len * taper);
  };
  const ids = [];
  for (let i = 0; i <= lashCols; i++) {
    const h = (i / lashCols * 2 - 1) * hw * 0.96;
    const a = mb.vertex(lashPoint(h, L.upperOpen, false, new THREE.Vector3()), lashUV, [0, 0], W);
    const b = mb.vertex(lashPoint(h, L.upperOpen, true, new THREE.Vector3()), lashUV, [0, 0], W);
    blinkMap.set(a, lashPoint(h, L.closed, false, new THREE.Vector3()));
    blinkMap.set(b, lashPoint(h, L.closed, true, new THREE.Vector3()));
    ids.push([a, b]);
  }
  for (let i = 0; i < lashCols; i++) {
    const [a, b] = ids[i];
    const [c, d] = ids[i + 1];
    mb.quad(a, c, d, b);
    mb.quad(a, b, d, c);
  }
}

// ----------------------------------------------------------------- teeth

function buildTeeth(mb, F, upper, headBone) {
  const T = TEETH;
  const R = T.radius * F.s;
  const z0 = T.z * F.s;
  const y0 = (upper ? T.upperY : T.lowerY) * F.s + (F.lips.y - HEAD.lips.y * F.s);
  const h = T.height * F.s * (upper ? -1 : 1);
  const uvRect = FACE_UV.teeth;
  const p = new THREE.Vector3();
  mb.grid(T.segments, 1, (u, v) => {
    const a = (u - 0.5) * T.arc;
    // Gentle scallops between teeth.
    const bite = v === 1 ? 1 - 0.18 * Math.abs(Math.sin(u * T.segments * Math.PI * 0.5)) : 1;
    p.set(Math.sin(a) * R, y0 + h * v * bite, z0 + R * (1 - Math.cos(a)));
    return { p: p.clone(), uv: patchUV(uvRect, u, v), uv1: [u, v], w: [[headBone, 1]] };
  });
}
