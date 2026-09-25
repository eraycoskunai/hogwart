/**
 * @file AssetCache — reference-counted cache for GPU resources
 * (geometries, materials, textures) plus disposal helpers.
 *
 * Regions acquire what they need and release it when unloaded; resources
 * whose count reaches zero are disposed so region changes do not leak.
 */

export class AssetCache {
  constructor() {
    /** @type {Map<string, {value:any, refs:number}>} */
    this._entries = new Map();
  }

  /**
   * Get (or lazily create) a cached resource and add a reference.
   * @template T
   * @param {string} key
   * @param {() => T} factory
   * @returns {T}
   */
  acquire(key, factory) {
    let e = this._entries.get(key);
    if (!e) {
      e = { value: factory(), refs: 0 };
      this._entries.set(key, e);
    }
    e.refs++;
    return e.value;
  }

  /** @param {string} key */
  has(key) {
    return this._entries.has(key);
  }

  /**
   * Drop a reference; dispose when nobody uses it any more.
   * @param {string} key
   */
  release(key) {
    const e = this._entries.get(key);
    if (!e) return;
    e.refs--;
    if (e.refs <= 0) {
      disposeResource(e.value);
      this._entries.delete(key);
    }
  }

  /** Dispose everything regardless of reference counts. */
  disposeAll() {
    for (const e of this._entries.values()) disposeResource(e.value);
    this._entries.clear();
  }

  get size() {
    return this._entries.size;
  }
}

/**
 * Dispose a single three.js resource (geometry, material, texture) or array of them.
 * @param {any} res
 */
export function disposeResource(res) {
  if (!res) return;
  if (Array.isArray(res)) {
    res.forEach(disposeResource);
    return;
  }
  if (res.isMaterial) {
    for (const v of Object.values(res)) if (v && v.isTexture) v.dispose();
    res.dispose();
    return;
  }
  if (typeof res.dispose === 'function') res.dispose();
}

/**
 * Recursively dispose an object tree's geometries and materials and detach it.
 * Resources flagged with `userData.shared = true` are skipped (owned by a cache).
 * @param {import('three').Object3D} root
 */
export function disposeObject3D(root) {
  root.traverse((obj) => {
    if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
    const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    for (const m of mats) if (!m.userData?.shared) disposeResource(m);
  });
  root.removeFromParent();
}
