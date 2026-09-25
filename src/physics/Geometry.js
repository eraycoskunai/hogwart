/**
 * @file Low-level geometric queries used by the collision system.
 * All functions write into caller-provided vectors to avoid allocations.
 */
import * as THREE from 'three';

const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _ap = new THREE.Vector3();
const _bp = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/**
 * Closest point on triangle abc to point p (Ericson, Real-Time Collision Detection 5.1.5).
 * @param {THREE.Vector3} p
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {THREE.Vector3} c
 * @param {THREE.Vector3} out
 * @returns {THREE.Vector3}
 */
export function closestPointOnTriangle(p, a, b, c, out) {
  _ab.subVectors(b, a);
  _ac.subVectors(c, a);
  _ap.subVectors(p, a);
  const d1 = _ab.dot(_ap);
  const d2 = _ac.dot(_ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);

  _bp.subVectors(p, b);
  const d3 = _ab.dot(_bp);
  const d4 = _ac.dot(_bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return out.copy(a).addScaledVector(_ab, v);
  }

  _cp.subVectors(p, c);
  const d5 = _ab.dot(_cp);
  const d6 = _ac.dot(_cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return out.copy(a).addScaledVector(_ac, w);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    _tmp.subVectors(c, b);
    return out.copy(b).addScaledVector(_tmp, w);
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return out.copy(a).addScaledVector(_ab, v).addScaledVector(_ac, w);
}

/**
 * Closest point on segment ab to p.
 * @param {THREE.Vector3} p
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {THREE.Vector3} out
 * @returns {number} parameter t in [0,1]
 */
export function closestPointOnSegment(p, a, b, out) {
  _ab.subVectors(b, a);
  const len2 = _ab.lengthSq();
  let t = len2 > 1e-12 ? _ap.subVectors(p, a).dot(_ab) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.copy(a).addScaledVector(_ab, t);
  return t;
}

const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _pv = new THREE.Vector3();
const _tv = new THREE.Vector3();
const _qv = new THREE.Vector3();

/**
 * Double-sided Möller–Trumbore ray/triangle intersection.
 * @returns {number} distance along the (normalised) ray or -1
 */
export function rayTriangle(ro, rd, a, b, c) {
  _e1.subVectors(b, a);
  _e2.subVectors(c, a);
  _pv.crossVectors(rd, _e2);
  const det = _e1.dot(_pv);
  if (Math.abs(det) < 1e-10) return -1;
  const inv = 1 / det;
  _tv.subVectors(ro, a);
  const u = _tv.dot(_pv) * inv;
  if (u < 0 || u > 1) return -1;
  _qv.crossVectors(_tv, _e1);
  const v = rd.dot(_qv) * inv;
  if (v < 0 || u + v > 1) return -1;
  const t = _e2.dot(_qv) * inv;
  return t >= 0 ? t : -1;
}

/**
 * Ray/sphere intersection (ray starting inside returns 0).
 * @returns {number} distance or -1
 */
export function raySphere(ro, rd, center, radius) {
  _tv.subVectors(ro, center);
  const b = _tv.dot(rd);
  const c = _tv.lengthSq() - radius * radius;
  if (c <= 0) return 0;
  if (b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  return -b - Math.sqrt(disc);
}

/**
 * Slab test of a ray against an AABB.
 * @returns {number} entry distance or -1
 */
export function rayAABB(ro, rd, min, max, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? ro.x : i === 1 ? ro.y : ro.z;
    const d = i === 0 ? rd.x : i === 1 ? rd.y : rd.z;
    const lo = i === 0 ? min.x : i === 1 ? min.y : min.z;
    const hi = i === 0 ? max.x : i === 1 ? max.y : max.z;
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return -1;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

const _dir = new THREE.Vector3();
const _linePt = new THREE.Vector3();
const _ref = new THREE.Vector3();
const _segPt = new THREE.Vector3();
const _triPt = new THREE.Vector3();

/**
 * Capsule (segment a→b, radius r) vs triangle. Uses the reference-point
 * method: intersect the capsule axis with the triangle plane, clamp to the
 * triangle, find the closest axis point, then the closest triangle point.
 *
 * @param {THREE.Vector3} a segment start (bottom sphere centre)
 * @param {THREE.Vector3} b segment end (top sphere centre)
 * @param {number} r radius
 * @param {THREE.Vector3} v0
 * @param {THREE.Vector3} v1
 * @param {THREE.Vector3} v2
 * @param {THREE.Vector3} n triangle unit normal
 * @param {{normal:THREE.Vector3, point:THREE.Vector3, depth:number}} out
 * @returns {boolean} true when penetrating
 */
export function capsuleTriangle(a, b, r, v0, v1, v2, n, out) {
  _dir.subVectors(b, a);
  const nd = n.dot(_dir);
  if (Math.abs(nd) > 1e-6) {
    const t = _ref.subVectors(v0, a).dot(n) / nd;
    _linePt.copy(a).addScaledVector(_dir, t);
    closestPointOnTriangle(_linePt, v0, v1, v2, _ref);
  } else {
    closestPointOnTriangle(a, v0, v1, v2, _ref);
  }
  closestPointOnSegment(_ref, a, b, _segPt);
  closestPointOnTriangle(_segPt, v0, v1, v2, _triPt);

  const dx = _segPt.x - _triPt.x;
  const dy = _segPt.y - _triPt.y;
  const dz = _segPt.z - _triPt.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= r * r) return false;
  const d = Math.sqrt(d2);
  if (d > 1e-6) {
    out.normal.set(dx / d, dy / d, dz / d);
  } else {
    // Axis lies on the triangle: push along the face normal toward the capsule centre.
    out.normal.copy(n);
    _tmp.addVectors(a, b).multiplyScalar(0.5).sub(v0);
    if (_tmp.dot(n) < 0) out.normal.negate();
  }
  out.point.copy(_triPt);
  out.depth = r - d;
  return true;
}

/**
 * Capsule vs sphere.
 * @returns {boolean}
 */
export function capsuleSphere(a, b, r, center, radius, out) {
  closestPointOnSegment(center, a, b, _segPt);
  _tmp.subVectors(_segPt, center);
  const rr = r + radius;
  const d2 = _tmp.lengthSq();
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2);
  if (d > 1e-6) out.normal.copy(_tmp).divideScalar(d);
  else out.normal.set(0, 1, 0);
  out.point.copy(center).addScaledVector(out.normal, radius);
  out.depth = rr - d;
  return true;
}
