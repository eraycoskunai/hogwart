/**
 * @file GroundProbe — adapts the physics raycast into the ground query the
 * Animator's foot IK uses: (x, yStart, z, length, out) → hit?.
 */
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physics
 * @returns {(x:number, y:number, z:number, len:number, out:{y:number, normal:THREE.Vector3}) => boolean}
 */
export function makeGroundProbe(physics) {
  const origin = new THREE.Vector3();
  const hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };
  return (x, y, z, len, out) => {
    origin.set(x, y, z);
    if (!physics.raycast(origin, DOWN, len, {}, hit)) return false;
    out.y = hit.point.y;
    out.normal.copy(hit.normal);
    return true;
  };
}

/**
 * Flat ground at a fixed height (character creator stage).
 * @param {number} [height]
 */
export function flatGround(height = 0) {
  return (x, y, z, len, out) => {
    if (y - len > height) return false;
    out.y = height;
    out.normal.set(0, 1, 0);
    return true;
  };
}
