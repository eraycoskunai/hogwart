/**
 * @file ClothGarment — couples a ClothSim particle layout with its render
 * mesh. Positions are simulated in world space and written back into the
 * character root's local space each frame; normals are recomputed. The
 * mesh is a child of the character root, so it moves, hides and disposes
 * with the character.
 */
import * as THREE from 'three';
import { ClothSim } from '../../animation/ClothSim.js';

const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class ClothGarment {
  /**
   * @param {ReturnType<import('./Garments.js').robeLayout>} spec
   * @param {THREE.Skeleton} skeleton
   * @param {THREE.Material} material
   * @param {string} name
   */
  constructor(spec, skeleton, material, name) {
    this.sim = new ClothSim(spec, skeleton);
    const n = this.sim.count;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(spec.uv, 2));
    g.setIndex(spec.index);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = name;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // Bounds follow the character; the root is always nearby.
    this.mesh.frustumCulled = false;
  }

  /**
   * @param {number} dt
   * @param {THREE.Object3D} root character root (mesh parent)
   * @param {{capsules:any[], wind:THREE.Vector3, groundY:number, simulate:boolean, iterations:number}} env
   */
  update(dt, root, env) {
    const sim = this.sim;
    sim.capsules = env.capsules;
    sim.wind.copy(env.wind);
    sim.groundY = env.groundY;
    sim.simulate = env.simulate;
    sim.iterations = env.iterations;
    sim.update(dt, _v.setFromMatrixPosition(root.matrixWorld));
    _inv.copy(root.matrixWorld).invert();
    const out = this.geometry.attributes.position.array;
    const P = sim.pos;
    const e = _inv.elements;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      out[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
      out[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      out[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /** Snap to the skeleton (after teleports / rebuilds). */
  reset() {
    this.sim._initialised = false;
  }

  dispose() {
    this.geometry.dispose();
    this.mesh.removeFromParent();
  }
}
