/**
 * @file Skeleton — builds the 24-bone student rig from body proportions.
 * All bones have identity rest rotations (arms hang, character faces -Z),
 * which keeps keyframe authoring and IK simple. Also exposes bind-space
 * joint positions for the mesh generators and inverse bind matrices.
 */
import * as THREE from 'three';
import { BONES, SKELETON, REF_HEIGHT } from '../../data/character.js';

/** @typedef {{height:number, build:number, shoulders:number, headScale:number}} BodyParams */

/** Name → index lookup for BONES. */
export const BONE_INDEX = Object.freeze(Object.fromEntries(BONES.map(([name], i) => [name, i])));

/** Mirror a bone name (L ↔ R). */
export function mirrorBone(name) {
  if (name.endsWith('L')) return `${name.slice(0, -1)}R`;
  if (name.endsWith('R')) return `${name.slice(0, -1)}L`;
  return name;
}

/**
 * Bind-space joint positions (character root space, feet at y = 0).
 * @param {BodyParams} p
 * @returns {Record<string, THREE.Vector3>}
 */
export function jointPositions(p) {
  const S = SKELETON;
  const s = p.height / REF_HEIGHT;
  const sh = p.shoulders;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const j = {};
  j.root = V(0, 0, 0);
  j.hips = V(0, S.hipsY * s, 0);
  j.spine = V(0, j.hips.y + S.spineUp * s, 0);
  j.chest = V(0, j.spine.y + S.chestUp * s, 0);
  j.neck = V(0, j.chest.y + S.neckUp * s, 0);
  j.head = V(0, j.neck.y + S.headUp * s, 0);
  const hc = S.headCenter;
  j.headCenter = V(hc[0], j.head.y + hc[1] * p.headScale, hc[2] * p.headScale);
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const clav = V(sx * S.clavicle.x * s, j.chest.y + S.clavicle.up * s, S.clavicle.z * s);
    j[`clavicle${side}`] = clav;
    const shoulder = V(sx * S.shoulderX * s * sh, clav.y, clav.z);
    j[`upperArm${side}`] = shoulder;
    j[`foreArm${side}`] = V(shoulder.x, shoulder.y - S.upperArm * s, shoulder.z);
    j[`hand${side}`] = V(shoulder.x, shoulder.y - (S.upperArm + S.foreArm) * s, shoulder.z);
    const hip = V(sx * S.hipJoint.x * s * Math.sqrt(p.build), j.hips.y - S.hipJoint.drop * s, 0);
    j[`thigh${side}`] = hip;
    j[`shin${side}`] = V(hip.x, S.kneeY * s, 0);
    j[`foot${side}`] = V(hip.x, S.ankleY * s, 0);
    j[`toe${side}`] = V(hip.x, (S.ankleY + S.ball.y) * s, S.ball.z * s);
    // Eye pivots start at the head centre; Character moves them onto the sculpted eyes.
    j[`eye${side}`] = j.headCenter.clone();
  }
  return j;
}

/**
 * Create bones and the THREE.Skeleton.
 * @param {Record<string, THREE.Vector3>} joints bind-space joint positions
 * @returns {{bones:THREE.Bone[], skeleton:THREE.Skeleton, byName:Record<string, THREE.Bone>, rest:THREE.Vector3[]}}
 */
export function buildSkeleton(joints) {
  const bones = [];
  const byName = {};
  const rest = [];
  for (const [name, parent] of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    const pos = joints[name];
    if (parent) {
      b.position.copy(pos).sub(joints[parent]);
      byName[parent].add(b);
    } else {
      b.position.copy(pos);
    }
    bones.push(b);
    byName[name] = b;
    rest.push(b.position.clone());
  }
  // Inverse bind matrices in character-root space (rotations are identity).
  const inverses = bones.map((b) => new THREE.Matrix4().makeTranslation(-joints[b.name].x, -joints[b.name].y, -joints[b.name].z));
  const skeleton = new THREE.Skeleton(bones, inverses);
  return { bones, skeleton, byName, rest };
}
