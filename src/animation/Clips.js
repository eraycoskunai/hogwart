/**
 * @file Clips — compiles the keyframe data in data/animations.js into
 * samplers (mirrored halves generated, per-bone Catmull-Rom splines over
 * Euler angles) and provides the Pose container with blend helpers.
 */
import * as THREE from 'three';
import { CLIPS } from '../data/animations.js';
import { BONES } from '../data/character.js';
import { BONE_INDEX, mirrorBone } from '../procgen/characters/Skeleton.js';

export const BONE_COUNT = BONES.length;
const DEG = Math.PI / 180;
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/** Local bone rotations + hips offset. */
export class Pose {
  constructor() {
    this.q = new Float32Array(BONE_COUNT * 4);
    this.hips = new THREE.Vector3();
    this.identity();
  }

  identity() {
    for (let i = 0; i < BONE_COUNT; i++) {
      this.q[i * 4] = 0;
      this.q[i * 4 + 1] = 0;
      this.q[i * 4 + 2] = 0;
      this.q[i * 4 + 3] = 1;
    }
    this.hips.set(0, 0, 0);
    return this;
  }

  copy(p) {
    this.q.set(p.q);
    this.hips.copy(p.hips);
    return this;
  }

  getQ(i, out) {
    return out.set(this.q[i * 4], this.q[i * 4 + 1], this.q[i * 4 + 2], this.q[i * 4 + 3]);
  }

  setQ(i, q) {
    this.q[i * 4] = q.x;
    this.q[i * 4 + 1] = q.y;
    this.q[i * 4 + 2] = q.z;
    this.q[i * 4 + 3] = q.w;
  }

  /**
   * this = mix(this, other, w) per bone (w may be a per-bone mask).
   * @param {Pose} other
   * @param {number} w
   * @param {Float32Array} [mask] per-bone weights (multiplied with w)
   * @param {number} [hipsW] weight for the hips offset (defaults to w)
   */
  blend(other, w, mask, hipsW = w) {
    if (w <= 0) return this;
    const A = this.q;
    const Bq = other.q;
    for (let i = 0; i < BONE_COUNT; i++) {
      const t = mask ? w * mask[i] : w;
      if (t <= 0) continue;
      const k = i * 4;
      // nlerp with hemisphere fix.
      const dot = A[k] * Bq[k] + A[k + 1] * Bq[k + 1] + A[k + 2] * Bq[k + 2] + A[k + 3] * Bq[k + 3];
      const sgn = dot < 0 ? -1 : 1;
      let x = A[k] + (Bq[k] * sgn - A[k]) * t;
      let y = A[k + 1] + (Bq[k + 1] * sgn - A[k + 1]) * t;
      let z = A[k + 2] + (Bq[k + 2] * sgn - A[k + 2]) * t;
      let ww = A[k + 3] + (Bq[k + 3] * sgn - A[k + 3]) * t;
      const l = 1 / Math.hypot(x, y, z, ww);
      A[k] = x * l;
      A[k + 1] = y * l;
      A[k + 2] = z * l;
      A[k + 3] = ww * l;
    }
    if (hipsW > 0) this.hips.lerp(other.hips, Math.min(1, hipsW));
    return this;
  }

  /**
   * this = this ∘ other·w (additive on top, relative to rest).
   * @param {Pose} other
   * @param {number} w
   */
  add(other, w) {
    if (w <= 0) return this;
    for (let i = 0; i < BONE_COUNT; i++) {
      other.getQ(i, _q2);
      if (_q2.w > 0.99999) continue;
      _q2.slerp(_q.identity(), 1 - w);
      this.getQ(i, _q).multiply(_q2);
      this.setQ(i, _q);
    }
    this.hips.addScaledVector(other.hips, w);
    return this;
  }
}

/**
 * @typedef {Object} CompiledClip
 * @property {string} name
 * @property {number} duration
 * @property {boolean} loop
 * @property {boolean} hold
 * @property {string} mask
 * @property {number} stride
 * @property {Record<string, number>} events
 * @property {{bone:number, times:number[], values:number[][]}[]} tracks
 * @property {{times:number[], values:number[][]}|null} hips
 */

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** @returns {CompiledClip} */
function compile(name, src) {
  let keys = src.keys.map((k) => ({ t: k.t, bones: { ...k.bones }, hips: k.hips ?? null }));
  if (src.mirror) {
    const second = keys.map((k) => {
      const bones = {};
      for (const [b, v] of Object.entries(k.bones)) bones[mirrorBone(b)] = [v[0], -v[1], -v[2]];
      return { t: k.t + 0.5, bones, hips: k.hips ? [-k.hips[0], k.hips[1], k.hips[2]] : null };
    });
    keys = keys.concat(second);
  }
  keys.sort((a, b) => a.t - b.t);
  const names = new Set();
  for (const k of keys) for (const b of Object.keys(k.bones)) names.add(b);
  const tracks = [];
  for (const b of names) {
    if (!(b in BONE_INDEX)) throw new Error(`Clip ${name}: unknown bone ${b}`);
    tracks.push({ bone: BONE_INDEX[b], times: keys.map((k) => k.t), values: keys.map((k) => k.bones[b] ?? [0, 0, 0]) });
  }
  const hasHips = keys.some((k) => k.hips);
  return {
    name,
    duration: src.duration,
    loop: !!src.loop,
    hold: !!src.hold,
    mask: src.mask ?? 'full',
    stride: src.stride ?? 0,
    events: src.events ?? {},
    tracks,
    hips: hasHips ? { times: keys.map((k) => k.t), values: keys.map((k) => k.hips ?? [0, 0, 0]) } : null,
  };
}

/** Spline-sample a keyed track at normalised time t into out[3]. */
function sampleTrack(times, values, t, loop, out) {
  const n = times.length;
  if (n === 1) {
    out[0] = values[0][0];
    out[1] = values[0][1];
    out[2] = values[0][2];
    return out;
  }
  let i = n - 1;
  for (let k = 0; k < n - 1; k++) {
    if (t < times[k + 1]) {
      i = k;
      break;
    }
  }
  let t0 = times[i];
  let t1;
  let i1;
  if (i === n - 1) {
    if (!loop) {
      out[0] = values[i][0];
      out[1] = values[i][1];
      out[2] = values[i][2];
      return out;
    }
    t1 = times[0] + 1;
    i1 = 0;
  } else {
    t1 = times[i + 1];
    i1 = i + 1;
  }
  if (t < t0 && loop) t0 -= 1;
  const u = THREE.MathUtils.clamp((t - t0) / (t1 - t0 || 1), 0, 1);
  const im = loop ? (i - 1 + n) % n : Math.max(0, i - 1);
  const ip = loop ? (i1 + 1) % n : Math.min(n - 1, i1 + 1);
  for (let c = 0; c < 3; c++) out[c] = catmull(values[im][c], values[i][c], values[i1][c], values[ip][c], u);
  return out;
}

const _tmp = [0, 0, 0];

/**
 * Sample a clip into a pose (bones not in the clip are left at rest).
 * @param {CompiledClip} clip
 * @param {number} t normalised time 0..1
 * @param {Pose} out
 */
export function sampleClip(clip, t, out) {
  out.identity();
  const tt = clip.loop ? t - Math.floor(t) : THREE.MathUtils.clamp(t, 0, 1);
  for (const tr of clip.tracks) {
    sampleTrack(tr.times, tr.values, tt, clip.loop, _tmp);
    _e.set(_tmp[0] * DEG, _tmp[1] * DEG, _tmp[2] * DEG, 'YXZ');
    _q.setFromEuler(_e);
    out.setQ(tr.bone, _q);
  }
  if (clip.hips) {
    sampleTrack(clip.hips.times, clip.hips.values, tt, clip.loop, _tmp);
    out.hips.set(_tmp[0], _tmp[1], _tmp[2]);
  }
  return out;
}

/** All compiled clips by name. */
export const CLIP_LIBRARY = Object.freeze(Object.fromEntries(Object.entries(CLIPS).map(([k, v]) => [k, compile(k, v)])));
