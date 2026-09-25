/**
 * @file BodyGenerator — the clothed body as swept cross-sections along the
 * bind-pose skeleton: torso, pelvis, legs, arms, shoes, hands, neck,
 * collar, tie, skirt, Quidditch pads. Everything but skin shares one
 * clothing atlas material; neck and bare hands go to the skin mesh.
 *
 * Also exposes the body shape (torso cross-section at any height, limb
 * radii) and the skinning rules, which the robe / scarf / hair generators
 * reuse so garments hug the same silhouette.
 */
import * as THREE from 'three';
import {
  TORSO, LEG, ARM, NECK, HAND, SHOE, SKIRT, COLLAR, TIE, CLOTH_UV, FACE_UV, REF_HEIGHT,
} from '../../data/character.js';
import { MATERIALS } from '../../data/materials.js';
import { BONE_INDEX as B } from './Skeleton.js';
import { MeshBuilder, ramp, ringPoint, sampleTable, tube, orientTriangles, triCount } from './MeshKit.js';

const TAU = Math.PI * 2;
/** Fabric normal map tiling: metres per repeat. */
const FABRIC_TILE = MATERIALS.robeFabric.tile * 0.25;
const SKIN_TILE = MATERIALS.skin.tile;
const RING_SEGMENTS = 32;

/** Map (fu, fv) into an atlas rect. */
export function rectUV(rect, fu, fv) {
  return [rect[0] + (rect[2] - rect[0]) * fu, rect[1] + (rect[3] - rect[1]) * fv];
}

/**
 * Body silhouette + skinning helpers for a resolved appearance.
 * @param {Record<string, THREE.Vector3>} J joints
 * @param {Record<string, number>} v resolved sliders
 */
export function bodyShape(J, v) {
  const s = v.height / REF_HEIGHT;
  const b = v.build;
  const sh = v.shoulders;
  const rings = TORSO.rings.map(([y, rx, rzF, rzB, z]) => {
    const shoulderK = THREE.MathUtils.lerp(1, sh, ramp(TORSO.shoulderFrom, TORSO.shoulderFrom + 0.1, y));
    return [y * s, rx * s * b * shoulderK, rzF * s * b, rzB * s * b, z * s];
  });
  const row = [];
  /** Torso cross-section at bind height y. */
  const torsoAt = (y) => {
    sampleTable(rings, y, row);
    return { rx: row[0], rzF: row[1], rzB: row[2], z: row[3] };
  };
  const legLen = J.thighR.y - J.footR.y;
  const armLen = J.upperArmR.y - J.handR.y;
  const tKnee = (J.thighR.y - J.shinR.y) / legLen;
  const tElbow = (J.upperArmR.y - J.foreArmR.y) / armLen;

  /** Torso skin weights at (x, y). */
  const torsoWeights = (x, y) => {
    const chain = [[B.hips, J.hips.y], [B.spine, J.spine.y], [B.chest, J.chest.y]];
    /** @type {[number, number][]} */
    let w;
    if (y <= chain[0][1]) w = [[B.hips, 1]];
    else if (y <= chain[1][1]) w = [[B.hips, 1 - (y - chain[0][1]) / (chain[1][1] - chain[0][1])], [B.spine, (y - chain[0][1]) / (chain[1][1] - chain[0][1])]];
    else if (y <= chain[2][1]) w = [[B.spine, 1 - (y - chain[1][1]) / (chain[2][1] - chain[1][1])], [B.chest, (y - chain[1][1]) / (chain[2][1] - chain[1][1])]];
    else {
      const tn = ramp(J.neck.y - 0.03 * s, J.neck.y + 0.03 * s, y);
      w = [[B.chest, 1 - tn], [B.neck, tn]];
    }
    // Shoulders follow the clavicles.
    const side = x >= 0 ? 'R' : 'L';
    const clav = J[`clavicle${side}`];
    const wc = ramp(0.45 * Math.abs(J.upperArmR.x), 0.95 * Math.abs(J.upperArmR.x), Math.abs(x)) * ramp(clav.y - 0.12 * s, clav.y - 0.03 * s, y);
    if (wc > 0) {
      w = w.map(([bone, k]) => [bone, k * (1 - wc * 0.85)]);
      w.push([B[`clavicle${side}`], wc * 0.55], [B[`upperArm${side}`], wc * 0.3]);
    }
    // Buttocks / groin follow the thighs a little.
    const wt = ramp(J.hips.y, J.thighR.y - 0.03 * s, y) * 0.55;
    if (wt > 0) {
      w = w.map(([bone, k]) => [bone, k * (1 - wt)]);
      w.push([B[`thigh${side}`], wt]);
    }
    return w;
  };
  /** Leg weights along t (0 hip joint → 1 ankle). */
  const legWeights = (side, t) => {
    const thigh = B[`thigh${side}`];
    const shin = B[`shin${side}`];
    const foot = B[`foot${side}`];
    if (t < 0) return [[B.hips, ramp(0, -0.13, t) * 0.6], [thigh, 1 - ramp(0, -0.13, t) * 0.6]];
    if (t < tKnee - 0.05) return [[thigh, 1]];
    if (t < tKnee + 0.05) {
      const k = ramp(tKnee - 0.05, tKnee + 0.05, t);
      return [[thigh, 1 - k], [shin, k]];
    }
    const kf = ramp(0.95, 1.02, t) * 0.5;
    return [[shin, 1 - kf], [foot, kf]];
  };
  /** Arm weights along t (0 shoulder → 1 wrist). */
  const armWeights = (side, t) => {
    const up = B[`upperArm${side}`];
    const fore = B[`foreArm${side}`];
    const hand = B[`hand${side}`];
    if (t < 0.06) {
      const k = ramp(0.06, -0.09, t) * 0.5;
      return [[B[`clavicle${side}`], k], [up, 1 - k]];
    }
    if (t < tElbow - 0.06) return [[up, 1]];
    if (t < tElbow + 0.06) {
      const k = ramp(tElbow - 0.06, tElbow + 0.06, t);
      return [[up, 1 - k], [fore, k]];
    }
    const kh = ramp(0.96, 1.04, t) * 0.6;
    return [[fore, 1 - kh], [hand, kh]];
  };
  const legRow = [];
  const armRow = [];
  return {
    s, b, sh, rings, torsoAt, torsoWeights, legWeights, armWeights, legLen, armLen, tKnee, tElbow,
    legRadius: (t) => (sampleTable(LEG.rings, t, legRow), [legRow[0] * s * b, legRow[1] * s * b]),
    armRadius: (t) => (sampleTable(ARM.rings, t, armRow), [armRow[0] * s * Math.sqrt(b), armRow[1] * s * Math.sqrt(b)]),
  };
}

const _v = new THREE.Vector3();

/** Ring angle for u (a = 0 at the front, u = 0.5). */
const angleOf = (u) => u * TAU - Math.PI;

/**
 * Build the body meshes.
 * @param {Record<string, THREE.Vector3>} J
 * @param {ReturnType<typeof bodyShape>} S
 * @param {{outfit:string, lower:string}} o
 * @returns {{clothes:THREE.BufferGeometry, skin:THREE.BufferGeometry}}
 */
export function buildBody(J, S, o) {
  const clothes = new MeshBuilder();
  const skin = new MeshBuilder();
  skin.declare('aMouth');
  const kit = o.outfit === 'quidditch';
  const skirt = !kit && o.lower === 'skirt';
  const s = S.s;

  // --- Torso (waist → neck) and pelvis (crotch → waist).
  const sweep = (y0, y1, rect, rows, extraR = 0) => {
    const first = triCount(clothes);
    clothes.grid(RING_SEGMENTS, rows, (u, fv) => {
      const y = THREE.MathUtils.lerp(y0, y1, fv);
      const T = S.torsoAt(y);
      ringPoint(angleOf(u), T.rx + extraR, T.rzF + extraR, T.rzB + extraR, TORSO.exponent, _v);
      _v.y = y;
      _v.z += T.z;
      return { p: _v.clone(), uv: rectUV(rect, u, fv), uv1: [(u * TAU * T.rx) / FABRIC_TILE, y / FABRIC_TILE], w: S.torsoWeights(_v.x, y) };
    }, { flip: true });
    // Close the bottom (crotch) with a fan when starting at the lowest ring.
    return first;
  };
  const waist = TORSO.waistY * s;
  const bottom = S.rings[0][0];
  const top = S.rings[S.rings.length - 1][0];
  sweep(waist, top, CLOTH_UV.torso, 20);
  sweep(bottom, waist, CLOTH_UV.pelvis, 7);
  // Crotch cap.
  {
    const T = S.torsoAt(bottom);
    const c = clothes.vertex([0, bottom - 0.004 * s, T.z], rectUV(CLOTH_UV.pelvis, 0.5, 0), [0, 0], [[B.hips, 1]]);
    const ring = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const u = i / RING_SEGMENTS;
      ringPoint(angleOf(u), T.rx, T.rzF, T.rzB, TORSO.exponent, _v);
      _v.y = bottom;
      _v.z += T.z;
      ring.push(clothes.vertex(_v.clone(), rectUV(CLOTH_UV.pelvis, u, 0), [0, 0], S.torsoWeights(_v.x, bottom)));
    }
    for (let i = 0; i < RING_SEGMENTS; i++) clothes.tri(c, ring[i], ring[i + 1]);
  }

  // --- Legs.
  for (const side of ['L', 'R']) {
    const hip = J[`thigh${side}`];
    const t0 = LEG.rings[0][0];
    clothes.grid(RING_SEGMENTS, 24, (u, fv) => {
      const t = THREE.MathUtils.lerp(t0, 1, fv);
      const [rx, rz] = S.legRadius(t);
      ringPoint(angleOf(u), rx, rz, rz, 2, _v);
      _v.x += hip.x;
      _v.y = hip.y - t * S.legLen;
      return { p: _v.clone(), uv: rectUV(CLOTH_UV.legs, u, THREE.MathUtils.clamp(1 - t, 0, 1)), uv1: [(u * TAU * rx) / FABRIC_TILE, _v.y / FABRIC_TILE], w: S.legWeights(side, t) };
    }, { flip: true });
  }

  // --- Arms (sleeves) down to the wrist.
  for (const side of ['L', 'R']) {
    const sh = J[`upperArm${side}`];
    const t0 = ARM.rings[0][0];
    const t1 = ARM.rings[ARM.rings.length - 1][0];
    const [r0x, r0z] = S.armRadius(0);
    clothes.grid(RING_SEGMENTS - 8, 22, (u, fv) => {
      const t = THREE.MathUtils.lerp(t0, t1, fv);
      let [rx, rz] = S.armRadius(Math.max(t, 0));
      let y = sh.y - t * S.armLen;
      if (t < 0) {
        // Rounded shoulder cap instead of an open tube end.
        const al = (t / t0) * Math.PI * 0.5;
        rx = r0x * Math.cos(al);
        rz = r0z * Math.cos(al);
        y = sh.y + r0x * Math.sin(al) * 0.5;
      }
      ringPoint(angleOf(u), rx, rz, rz, 2, _v);
      _v.x += sh.x;
      _v.y = y;
      _v.z += sh.z;
      return { p: _v.clone(), uv: rectUV(CLOTH_UV.arms, u, THREE.MathUtils.clamp(1 - t, 0, 1)), uv1: [(u * TAU * rx) / FABRIC_TILE, _v.y / FABRIC_TILE], w: S.armWeights(side, t) };
    }, { flip: true });
  }

  // --- Neck (skin).
  {
    const yb = NECK.bottom * s;
    const yt = NECK.top * s;
    skin.grid(24, 6, (u, fv) => {
      const y = THREE.MathUtils.lerp(yb, yt, fv);
      const r = sampleTable([[0, NECK.r[0]], [0.5, NECK.r[1]], [1, NECK.r[2]]], fv)[0] * s * Math.sqrt(S.b);
      ringPoint(angleOf(u), r, r * 0.95, r, 2, _v);
      _v.y = y;
      _v.z += 0.006 * s;
      const tn = ramp(J.neck.y - 0.02 * s, J.neck.y + 0.02 * s, y);
      const th = ramp(J.head.y - 0.015 * s, J.head.y + 0.02 * s, y);
      return { p: _v.clone(), uv: rectUV(FACE_UV.skin, u, fv), uv1: [(u * TAU * r) / SKIN_TILE, y / SKIN_TILE], w: [[B.chest, 1 - tn], [B.neck, tn * (1 - th)], [B.head, th]] };
    }, { flip: true });
  }

  // --- Collar (shirt or sweater neck).
  {
    const y0 = COLLAR.y * s - COLLAR.height * s * 0.5;
    const r0 = COLLAR.r * s * Math.sqrt(S.b);
    clothes.grid(24, 3, (u, fv) => {
      const y = y0 + fv * COLLAR.height * s * (kit ? 1.2 : 1);
      const flare = kit ? 1 : 1 + (1 - fv) * 0.18;
      // Shirt collar points open at the front.
      const a = angleOf(u);
      const open = kit ? 0 : Math.max(0, Math.cos(a)) ** 6 * 0.004 * s * fv;
      ringPoint(a, r0 * flare, r0 * flare * 0.95 - open, r0 * flare, 2, _v);
      _v.y = y;
      _v.z += 0.006 * s;
      const tn = ramp(J.neck.y - 0.02 * s, J.neck.y + 0.03 * s, y);
      return { p: _v.clone(), uv: rectUV(CLOTH_UV.collar, u, fv), uv1: [u * 2, fv * 0.3], w: [[B.chest, 1 - tn], [B.neck, tn]] };
    }, { flip: true });
  }

  // --- Tie.
  if (!kit) buildTie(clothes, J, S);

  // --- Skirt.
  if (skirt) buildSkirt(clothes, J, S);

  // --- Quidditch pads (knees, forearms).
  if (kit) buildPads(clothes, J, S);

  // --- Shoes.
  for (const side of ['L', 'R']) buildShoe(clothes, J, S, side, kit);

  // --- Hands (gloves with the kit).
  for (const side of ['L', 'R']) {
    const target = kit ? clothes : skin;
    buildHand(target, J, S, side, side === 'R' ? HAND.grip : HAND.curl, kit ? CLOTH_UV.gloves : FACE_UV.skin);
  }

  return { clothes: clothes.build(), skin: skin.build() };
}

// ------------------------------------------------------------------ parts

function buildTie(mb, J, S) {
  const s = S.s;
  const top = TIE.top * s;
  const bot = TIE.bottom * s;
  const half = (TIE.width * s) / 2;
  const rows = 12;
  const front = (y) => {
    const T = S.torsoAt(y);
    return T.z - T.rzF - 0.0045 * s;
  };
  mb.grid(2, rows, (u, fv) => {
    const y = THREE.MathUtils.lerp(top, bot, fv);
    const widen = THREE.MathUtils.lerp(0.55, 1, ramp(0, 0.25, fv));
    // Pointed tip.
    const tip = fv > 0.92 ? 1 - (fv - 0.92) / 0.08 : 1;
    const x = (u * 2 - 1) * half * widen * (u === 0.5 ? 1 : tip);
    const yy = u === 0.5 && fv === 1 ? y - TIE.tip * s * 0.3 : y;
    return { p: [x, yy, front(yy) - (1 - Math.abs(u * 2 - 1)) * 0.001 * s], uv: rectUV(CLOTH_UV.tie, u, fv), uv1: [u, fv], w: S.torsoWeights(0, yy) };
  });
  // Knot: a small wedge under the collar.
  const k = TIE.knot * s;
  const kz = front(top) - 0.001 * s;
  const ids = [
    [-k * 0.9, top + k * 0.8], [k * 0.9, top + k * 0.8], [k * 0.55, top - k * 0.6], [-k * 0.55, top - k * 0.6],
  ].map(([x, y]) => mb.vertex([x, y, kz - 0.004 * s], rectUV(CLOTH_UV.tie, 0.5, 0.05), [0, 0], S.torsoWeights(0, y)));
  const back = [
    [-k * 0.9, top + k * 0.8], [k * 0.9, top + k * 0.8], [k * 0.55, top - k * 0.6], [-k * 0.55, top - k * 0.6],
  ].map(([x, y]) => mb.vertex([x, y, kz + 0.004 * s], rectUV(CLOTH_UV.tie, 0.5, 0.05), [0, 0], S.torsoWeights(0, y)));
  const first = triCount(mb);
  mb.quad(ids[0], ids[1], ids[2], ids[3]);
  for (let i = 0; i < 4; i++) mb.quad(ids[i], back[i], back[(i + 1) % 4], ids[(i + 1) % 4]);
  const center = new THREE.Vector3(0, top, kz);
  orientTriangles(mb, first, triCount(mb), (c, out) => out.subVectors(c, center).normalize());
}

function buildSkirt(mb, J, S) {
  const s = S.s;
  const y0 = SKIRT.top * s;
  const y1 = SKIRT.hem * s;
  const rows = 8;
  mb.grid(56, rows, (u, fv) => {
    const y = THREE.MathUtils.lerp(y0, y1, fv);
    const hipsT = S.torsoAt(Math.max(y, S.rings[2][0]));
    const flare = SKIRT.flare * s * fv * fv;
    const a = angleOf(u);
    const saw = ((u * SKIRT.pleats) % 1) * 2 - 1;
    const pleat = SKIRT.pleatDepth * s * fv * Math.abs(saw);
    const ex = 0.006 * s + flare + pleat;
    ringPoint(a, hipsT.rx + ex, hipsT.rzF + ex, hipsT.rzB + ex, 2.2, _v);
    _v.y = y;
    _v.z += hipsT.z;
    const side = _v.x >= 0 ? 'R' : 'L';
    const wt = ramp(0, 1, fv) * 0.45;
    const w = [[B.hips, 1 - wt], [B[`thigh${side}`], wt * (0.5 + 0.5 * Math.min(1, Math.abs(_v.x) / (hipsT.rx * 0.6)))]];
    return { p: _v.clone(), uv: rectUV(CLOTH_UV.skirt, u, fv), uv1: [(u * TAU * hipsT.rx) / FABRIC_TILE, y / FABRIC_TILE], w };
  }, { flip: true });
}

function buildPads(mb, J, S) {
  const s = S.s;
  for (const side of ['L', 'R']) {
    // Knee pad: front half-shell around the knee.
    const hip = J[`thigh${side}`];
    const tk = S.tKnee;
    mb.grid(12, 5, (u, fv) => {
      const t = THREE.MathUtils.lerp(tk - 0.07, tk + 0.07, fv);
      const [rx, rz] = S.legRadius(t);
      const a = (u - 0.5) * Math.PI * 1.1;
      const bulge = 0.009 * s * Math.sin(fv * Math.PI);
      ringPoint(a, rx + 0.006 * s + bulge, rz + 0.007 * s + bulge, rz, 2, _v);
      _v.x += hip.x;
      _v.y = hip.y - t * S.legLen;
      return { p: _v.clone(), uv: rectUV(CLOTH_UV.pads, u, fv), uv1: [u, fv], w: S.legWeights(side, t) };
    }, { flip: true });
    // Arm guard around the forearm.
    const sh = J[`upperArm${side}`];
    mb.grid(18, 5, (u, fv) => {
      const t = THREE.MathUtils.lerp(S.tElbow + 0.12, 0.96, fv);
      const [rx, rz] = S.armRadius(t);
      ringPoint(angleOf(u), rx + 0.005 * s, rz + 0.005 * s, rz + 0.005 * s, 2, _v);
      _v.x += sh.x;
      _v.y = sh.y - t * S.armLen;
      _v.z += sh.z;
      return { p: _v.clone(), uv: rectUV(CLOTH_UV.pads, u, fv), uv1: [u, fv], w: S.armWeights(side, t) };
    }, { flip: true });
  }
}

function buildShoe(mb, J, S, side, boot) {
  const s = S.s;
  const ankle = J[`foot${side}`];
  const ballZ = J[`toe${side}`].z;
  const L0 = SHOE.heel * s;
  const L1 = SHOE.toe * s;
  const W = SHOE.width * s * Math.sqrt(S.b);
  const Hh = SHOE.height * s * (boot ? 1.35 : 1);
  const first = triCount(mb);
  const rows = SHOE.segments;
  const seg = 16;
  const foot = B[`foot${side}`];
  const toe = B[`toe${side}`];
  const res = mb.grid(seg, rows, (u, fv) => {
    const z = ankle.z + L0 - fv * (L0 + L1);
    // Width: narrow heel, wide ball, rounded toe.
    const round = Math.sqrt(Math.max(0, 1 - ((fv - 0.62) / 0.4) ** 2 * (fv > 0.62 ? 1 : 0)));
    const w = W * (0.74 + 0.26 * Math.sin(Math.PI * Math.min(1, fv * 1.2))) * 0.5 * (fv > 0.62 ? round : 1) * (fv < 0.03 ? 0.86 : 1);
    const h = Hh * (1 - 0.58 * ramp(0.38, 1, fv)) * (fv > 0.95 ? 0.6 + 0.4 * (1 - (fv - 0.95) / 0.05) : 1);
    const a = u * TAU;
    // Cross-section: flat sole, rounded upper.
    const cx = Math.cos(a);
    const sy = Math.sin(a);
    const x = Math.sign(cx) * Math.pow(Math.abs(cx), 0.7) * w;
    const y = sy > 0 ? Math.pow(sy, 0.8) * h : sy * SHOE.sole * s * 0.2;
    const inward = side === 'L' ? 1 : -1;
    const px = ankle.x + x + inward * 0.004 * s * fv;
    const kt = ramp(ballZ + 0.02 * s, ballZ - 0.02 * s, z);
    return { p: [px, Math.max(0, y) + 0.001, z], uv: rectUV(CLOTH_UV.shoes, u, THREE.MathUtils.clamp(y / (Hh * 1.05) + 0.14, 0, 1)), uv1: [u * 2, fv * 2], w: [[foot, 1 - kt], [toe, kt]] };
  });
  // Caps at heel and toe.
  for (const [j, fv] of [[0, 0], [rows, 1]]) {
    const z = ankle.z + L0 - fv * (L0 + L1);
    const c = mb.vertex([ankle.x, Hh * 0.4 * (fv ? 0.4 : 1), z], rectUV(CLOTH_UV.shoes, 0.5, 0.5), [0, 0], fv ? [[toe, 1]] : [[foot, 1]]);
    for (let i = 0; i < seg; i++) mb.tri(c, res.at(i, j), res.at(i + 1, j));
  }
  const center = new THREE.Vector3(ankle.x, Hh * 0.35, ankle.z - (L1 - L0) * 0.5);
  orientTriangles(mb, first, triCount(mb), (c, out) => {
    out.subVectors(c, center);
    out.z *= 0.35;
    return out.normalize();
  });
}

/**
 * Hand with palm, four fingers and a thumb (static curl).
 * @param {MeshBuilder} mb
 */
function buildHand(mb, J, S, side, curl, rect) {
  const s = S.s * 0.97;
  const sx = side === 'R' ? 1 : -1;
  const wrist = J[`hand${side}`];
  const hand = B[`hand${side}`];
  const fore = B[`foreArm${side}`];
  const P = HAND.palm;
  const pw = P.w * s;
  const pl = P.l * s;
  const pt = P.t * s;
  const uvC = rectUV(rect, 0.5, 0.5);
  const uv1 = (a, b) => [a / SKIN_TILE, b / SKIN_TILE];
  const wrW = (y) => {
    const k = ramp(0.012 * s, -0.012 * s, y);
    return [[fore, 1 - k], [hand, k]];
  };
  // Palm: superellipsoid centred below the wrist; x = thickness (palm faces -sx).
  const first = triCount(mb);
  const pc = new THREE.Vector3(wrist.x - sx * 0.002 * s, wrist.y - pl * 0.5, wrist.z);
  mb.grid(16, 10, (u, fv) => {
    const a = u * TAU;
    const b = (fv - 0.5) * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const e = (x) => Math.sign(x) * Math.pow(Math.abs(x), 0.55);
    const x = pc.x + e(cb) * e(ca) * pt * 0.5;
    const z = pc.z + e(cb) * e(sa) * pw * 0.5;
    const y = pc.y + e(sb) * pl * 0.5;
    return { p: [x, y, z], uv: uvC, uv1: uv1(z, y), w: wrW(y - wrist.y) };
  });
  orientTriangles(mb, first, triCount(mb), (c, out) => out.subVectors(c, pc).normalize());

  // Fingers: index at the front (-Z) to pinky at the back.
  const F = HAND.finger;
  const knuckleY = wrist.y - pl * 0.92;
  const seg = [0.45, 0.3, 0.25];
  for (let f = 0; f < 4; f++) {
    const z0 = wrist.z + (-1.5 + f) * F.spread * s;
    const len = F.lengths[f] * s;
    const pts = [[wrist.x - sx * 0.001 * s, knuckleY + 0.008 * s, z0]];
    let ang = 0;
    let p = new THREE.Vector3(...pts[0]);
    for (let k = 0; k < 3; k++) {
      ang += curl[k];
      // Curl toward the palm side (-sx in x).
      const dir = new THREE.Vector3(-sx * Math.sin(ang), -Math.cos(ang), 0);
      p = p.clone().addScaledVector(dir, len * seg[k]);
      pts.push([p.x, p.y, p.z]);
    }
    const r = F.r * s * (f === 3 ? 0.85 : 1);
    const curve = (t, out) => {
      const x = t * 3;
      const i = Math.min(2, Math.floor(x));
      const k = x - i;
      return out.fromArray(pts[i]).lerp(new THREE.Vector3().fromArray(pts[i + 1]), k);
    };
    tube(mb, curve, (t) => r * (1 - 0.25 * t) * (t > 0.92 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.92) / 0.08) ** 2)) : 1), {
      rings: 9, segments: 8, capStart: false, capEnd: true,
      uv: () => uvC, uv1: (t, a) => uv1(a * 0.05, t * 0.05), weights: () => [[hand, 1]], up: new THREE.Vector3(0, 0, 1),
    });
  }
  // Thumb: from the palm's front edge, pointing down / forward / across.
  const T = HAND.thumb;
  const base = new THREE.Vector3(wrist.x + sx * T.base[0] * s * -0.5, wrist.y + T.base[1] * s, wrist.z + T.base[2] * s);
  const tpts = [base.clone()];
  let tp = base.clone();
  const tdirs = [new THREE.Vector3(-sx * 0.35, -0.8, -0.5), new THREE.Vector3(-sx * 0.55 - sx * curl[0] * 0.3, -0.75, -0.25)];
  for (let k = 0; k < 2; k++) {
    tp = tp.clone().addScaledVector(tdirs[k].normalize(), T.length * s * 0.5);
    tpts.push(tp.clone());
  }
  tube(mb, (t, out) => {
    const x = t * 2;
    const i = Math.min(1, Math.floor(x));
    return out.copy(tpts[i]).lerp(tpts[i + 1], x - i);
  }, (t) => T.r * s * (1 - 0.2 * t) * (t > 0.9 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.9) / 0.1) ** 2)) : 1), {
    rings: 8, segments: 8, capStart: true, capEnd: true,
    uv: () => uvC, uv1: (t, a) => uv1(a * 0.05, t * 0.05), weights: () => [[hand, 1]], up: new THREE.Vector3(1, 0, 0),
  });
}

/** Wrist-to-palm offset used to seat the wand in the right hand. */
export function palmCenter(J, S, side) {
  const w = J[`hand${side}`];
  return new THREE.Vector3(w.x, w.y - HAND.palm.l * S.s * 0.75, w.z);
}

