/**
 * @file StaticBatcher — bakes static geometry into world space, generates
 * world-aligned box-projected UVs (so textures keep a constant metric scale
 * and line up across neighbouring pieces), and merges everything that shares
 * a material into one draw call.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _n = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Rewrite UVs from world position using the dominant normal axis.
 * @param {THREE.BufferGeometry} geo geometry already in world space
 * @param {number} metersPerTile how many metres one texture repeat covers
 */
export function applyWorldUVs(geo, metersPerTile) {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  const s = 1 / metersPerTile;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    _n.fromBufferAttribute(nrm, i);
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    let u, v;
    if (ay >= ax && ay >= az) {
      u = _p.x;
      v = _n.y > 0 ? -_p.z : _p.z;
    } else if (ax >= az) {
      u = _n.x > 0 ? -_p.z : _p.z;
      v = _p.y;
    } else {
      u = _n.z > 0 ? _p.x : -_p.x;
      v = _p.y;
    }
    uv[i * 2] = u * s;
    uv[i * 2 + 1] = v * s;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class StaticBatcher {
  constructor() {
    /** @type {Map<THREE.Material, THREE.BufferGeometry[]>} */
    this._groups = new Map();
    this._tileSize = new Map();
  }

  /**
   * Queue a geometry with a world matrix.
   * @param {THREE.BufferGeometry} geometry (not modified)
   * @param {THREE.Matrix4} matrix
   * @param {THREE.Material} material
   * @param {number} [metersPerTile] world UV scale; 0 keeps original UVs
   */
  add(geometry, matrix, material, metersPerTile = 2) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    if (metersPerTile > 0) applyWorldUVs(g, metersPerTile);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    let list = this._groups.get(material);
    if (!list) {
      list = [];
      this._groups.set(material, list);
    }
    list.push(g);
  }

  /**
   * Merge everything into meshes.
   * @param {{castShadow?:boolean, receiveShadow?:boolean}} [o]
   * @returns {THREE.Mesh[]}
   */
  build(o = {}) {
    const meshes = [];
    for (const [material, list] of this._groups) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = o.castShadow ?? true;
      mesh.receiveShadow = o.receiveShadow ?? true;
      mesh.matrixAutoUpdate = false;
      mesh.name = `static:${material.name || material.uuid.slice(0, 6)}`;
      meshes.push(mesh);
    }
    this._groups.clear();
    return meshes;
  }
}
