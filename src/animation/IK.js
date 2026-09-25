/**
 * @file IK — world-space solvers that adjust an animated skeleton:
 *   - two-bone chains (legs onto the ground, the wand arm onto an aim point)
 *   - ground alignment of feet
 *   - look-at distributed over chest, neck and head, plus eye gaze
 * Bones must have up-to-date matrixWorld; solvers refresh what they touch.
 */
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _cb = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();

/** Rotate a bone by a world-space rotation (keeps its world position). */
export function rotateBoneWorld(bone, rot) {
  bone.getWorldQuaternion(_qw);
  bone.parent.getWorldQuaternion(_qp);
  _qw.premultiply(rot);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}

/**
 * Analytic two-bone IK (e.g. thigh → shin → foot).
 * @param {THREE.Bone} upper
 * @param {THREE.Bone} lower
 * @param {THREE.Bone} end
 * @param {THREE.Vector3} target world position for `end`
 * @param {THREE.Vector3} fallbackAxis world bend axis when the chain is straight
 */
export function solveTwoBone(upper, lower, end, target, fallbackAxis) {
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const lab = _a.distanceTo(_b);
  const lcb = _b.distanceTo(_c);
  const lat = THREE.MathUtils.clamp(_t.subVectors(target, _a).length(), Math.abs(lab - lcb) + 1e-4, lab + lcb - 1e-4);
  // 1. Knee / elbow angle.
  _ab.subVectors(_a, _b).normalize();
  _cb.subVectors(_c, _b).normalize();
  const cur = Math.acos(THREE.MathUtils.clamp(_ab.dot(_cb), -1, 1));
  const want = Math.acos(THREE.MathUtils.clamp((lab * lab + lcb * lcb - lat * lat) / (2 * lab * lcb), -1, 1));
  _axis.crossVectors(_ab, _cb);
  if (_axis.lengthSq() < 1e-8) _axis.copy(fallbackAxis);
  _axis.normalize();
  rotateBoneWorld(lower, _q.setFromAxisAngle(_axis, want - cur));
  // 2. Swing the chain onto the target.
  end.getWorldPosition(_c);
  _d1.subVectors(_c, _a).normalize();
  _d2.subVectors(target, _a).normalize();
  rotateBoneWorld(upper, _q.setFromUnitVectors(_d1, _d2));
}

/**
 * Tilt a foot so its sole follows the ground normal (limited).
 * @param {THREE.Bone} foot
 * @param {THREE.Vector3} normal world ground normal
 * @param {THREE.Vector3} up world up of the character
 * @param {number} maxTilt radians
 * @param {number} weight 0..1
 */
export function alignFoot(foot, normal, up, maxTilt, weight) {
  if (weight <= 0) return;
  const angle = Math.min(maxTilt, up.angleTo(normal)) * weight;
  if (angle < 1e-4) return;
  _axis.crossVectors(up, normal);
  if (_axis.lengthSq() < 1e-10) return;
  rotateBoneWorld(foot, _q.setFromAxisAngle(_axis.normalize(), angle));
}

/**
 * Yaw / pitch of a world target relative to a frame (0, 0 = straight ahead
 * along -Z of that frame).
 * @param {THREE.Vector3} from
 * @param {THREE.Vector3} target
 * @param {THREE.Quaternion} frame
 * @returns {{yaw:number, pitch:number}}
 */
export function lookAngles(from, target, frame, out = { yaw: 0, pitch: 0 }) {
  _t.subVectors(target, from).applyQuaternion(_q.copy(frame).invert());
  out.yaw = Math.atan2(-_t.x, -_t.z);
  out.pitch = Math.atan2(_t.y, Math.hypot(_t.x, _t.z));
  return out;
}

const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3(1, 0, 0);
const _rq = new THREE.Quaternion();
const _pitchQ = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();

/**
 * Turn a bone by yaw (around the character's up) then pitch (around the
 * character's right), both in the character frame.
 * @param {THREE.Bone} bone
 * @param {THREE.Quaternion} frame character root world rotation
 * @param {number} yaw
 * @param {number} pitch
 */
export function turnBone(bone, frame, yaw, pitch) {
  _d1.copy(_up).applyQuaternion(frame);
  _d2.copy(_right).applyQuaternion(frame);
  _yawQ.setFromAxisAngle(_d1, yaw);
  _d2.applyQuaternion(_yawQ);
  _pitchQ.setFromAxisAngle(_d2, pitch);
  rotateBoneWorld(bone, _rq.multiplyQuaternions(_pitchQ, _yawQ));
}
