/**
 * @file MaterialLibrary — turns generated map sets into GPU textures and
 * three.js materials according to the catalogue in data/materials.js.
 *
 * - Textures are created once per material key and reference counted.
 * - Materials are shared per (key + overrides) signature.
 * - Owns the shared uniforms: time (effects), wetness (weather) and the
 *   world variation texture used by the surface shader.
 */
import * as THREE from 'three';
import { MATERIALS, VARIATION_TEXTURE_SIZE } from '../data/materials.js';
import { Noise } from '../procgen/textures/noise.js';
import { applySurfaceShader } from './SurfaceShader.js';
import { createWaterMaterial, createGlowMaterial, createGhostMaterial } from './EffectMaterials.js';

const EFFECT_TYPES = new Set(['water', 'flame', 'trail', 'ink', 'ghost']);
const MAX_ANISOTROPY = 8;
/** Resolution of the quick first-pass maps while full-size ones generate. */
const PREVIEW_SIZE = 256;
/** Per-effect texture size caps (small sprites need little resolution). */
const EFFECT_MAX_SIZE = { flame: 256, trail: 512, ink: 1024, ghost: 512, water: 1024 };

/** Build the tileable RGBA world-variation texture. */
function createVariationTexture(size) {
  const N = new Noise(7331);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const i = (y * size + x) * 4;
      data[i] = Math.round(N.fbm01(u, v, 3, 4) * 255);
      data[i + 1] = Math.round(N.fbm01(u + 0.37, v + 0.11, 5, 4) * 255);
      const c = N.worley(u, v, 6, 6, 1, 0, false);
      data[i + 2] = Math.round(Math.min(1, (c.f1 * 6) * 0.6 + N.fbm01(u, v, 8, 3) * 0.4) * 255);
      data[i + 3] = Math.round(N.fbm01(u + 0.71, v + 0.53, 2, 3) * 255);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export class MaterialLibrary {
  /**
   * @param {{bus:import('../core/EventBus.js').EventBus, renderer:THREE.WebGLRenderer,
   *          factory:import('../procgen/textures/TextureFactory.js').TextureFactory, size:number}} o
   */
  constructor(o) {
    this.bus = o.bus;
    this.renderer = o.renderer;
    this.factory = o.factory;
    this.size = o.size;
    this.anisotropy = Math.min(MAX_ANISOTROPY, o.renderer.capabilities.getMaxAnisotropy());
    this.shared = {
      uTime: { value: 0 },
      uWetness: { value: 0 },
      uVarTex: { value: createVariationTexture(VARIATION_TEXTURE_SIZE) },
    };
    /** @type {Map<string, {tex:Record<string, THREE.DataTexture>, refs:number, size:number, set:object}>} */
    this.textures = new Map();
    /** @type {Map<string, {material:THREE.Material, key:string, refs:number}>} */
    this.materials = new Map();
    this.pendingUpgrades = 0;
  }

  /** Keys known to the catalogue. */
  get keys() {
    return Object.keys(MATERIALS);
  }

  /** @param {string} key */
  descriptor(key) {
    const d = MATERIALS[key];
    if (!d) throw new Error(`MaterialLibrary: unknown material "${key}"`);
    return d;
  }

  /** Texture resolution used for a key. */
  sizeFor(key) {
    const d = this.descriptor(key);
    const cap = EFFECT_MAX_SIZE[d.type] ?? Infinity;
    return Math.min(this.size, cap);
  }

  /**
   * Make materials available. Keys whose full-resolution maps are already
   * cached load at full size; the rest load a fast low-resolution preview
   * first and are upgraded in the background (textures swap in place).
   * @param {string[]} keys
   * @param {string} [label] loading label
   */
  async load(keys, label) {
    const todo = keys.filter((k) => !this.textures.has(k));
    let done = 0;
    const total = todo.length;
    if (total) this.bus.emit('textures:progress', { done, total, label });
    await Promise.all(todo.map(async (key) => {
      const full = this.sizeFor(key);
      let set = await this.factory.peek(key, full);
      const preview = !set && full > PREVIEW_SIZE;
      if (!set) set = await this.factory.request(key, preview ? PREVIEW_SIZE : full);
      if (!this.textures.has(key)) this.textures.set(key, { tex: this._makeTextures(set), refs: 0, size: set.size, set });
      if (preview) this._upgrade(key, full);
      done++;
      this.bus.emit('textures:progress', { done, total, label, key });
    }));
  }

  /** Generate full resolution in the background and swap it in. */
  async _upgrade(key, size) {
    this.pendingUpgrades++;
    try {
      const set = await this.factory.request(key, size, true);
      const entry = this.textures.get(key);
      if (!entry) return;
      for (const [name, tex] of Object.entries(entry.tex)) {
        const data = set.maps[name];
        if (!data) continue;
        // Immutable GPU storage: free it, then re-upload at the new size.
        tex.dispose();
        tex.image = { data, width: set.size, height: set.size };
        tex.needsUpdate = true;
      }
      entry.size = set.size;
      entry.set = set;
      this.bus.emit('textures:upgraded', { key, size: set.size });
    } catch (err) {
      console.warn(`[MaterialLibrary] upgrade of ${key} failed`, err);
    } finally {
      this.pendingUpgrades--;
    }
  }

  isLoaded(key) {
    return this.textures.has(key);
  }

  /** Raw map data currently in use (gallery previews). */
  mapData(key) {
    return this.textures.get(key)?.set ?? null;
  }

  _makeTextures(set) {
    const make = (data, srgb) => {
      const t = new THREE.DataTexture(data, set.size, set.size, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = this.anisotropy;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    /** @type {Record<string, THREE.DataTexture>} */
    const tex = {
      albedo: make(set.maps.albedo, true),
      normal: make(set.maps.normal, false),
      orm: make(set.maps.orm, false),
    };
    if (set.maps.emissive) tex.emissive = make(set.maps.emissive, true);
    return tex;
  }

  /**
   * Get a shared material instance.
   * @param {string} key catalogue key
   * @param {{triplanar?:boolean, tile?:number, surface?:object, color?:number}} [overrides]
   * @returns {THREE.Material}
   */
  get(key, overrides = {}) {
    const sig = `${key}|${JSON.stringify(overrides)}`;
    const cached = this.materials.get(sig);
    if (cached) {
      cached.refs++;
      return cached.material;
    }
    const entry = this.textures.get(key);
    if (!entry) throw new Error(`MaterialLibrary: "${key}" not loaded`);
    entry.refs++;
    const material = this._create(key, entry.tex, overrides);
    material.name = key;
    material.userData.libraryKey = key;
    // Owned by the library: generic scene disposal must skip it.
    material.userData.shared = true;
    material.userData.librarySig = sig;
    this.materials.set(sig, { material, key, refs: 1 });
    return material;
  }

  _create(key, tex, ov) {
    const d = this.descriptor(key);
    const tile = ov.tile ?? d.tile ?? 2;
    if (EFFECT_TYPES.has(d.type)) return this._createEffect(d, tex, tile, ov);

    const hasMetal = this._hasMetal(key);
    const params = {
      map: tex.albedo,
      normalMap: tex.normal,
      aoMap: tex.orm,
      roughnessMap: tex.orm,
      metalnessMap: hasMetal ? tex.orm : null,
      roughness: 1,
      metalness: hasMetal ? 1 : 0,
      color: ov.color ?? 0xffffff,
      side: d.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
    };
    if (d.alphaTest) params.alphaTest = d.alphaTest;
    if (d.transparent) {
      params.transparent = true;
      params.depthWrite = false;
    }
    if (tex.emissive) {
      params.emissiveMap = tex.emissive;
      params.emissive = new THREE.Color(0xffffff);
      params.emissiveIntensity = d.emissiveIntensity ?? 1;
    }
    let m;
    if (d.type === 'physical') {
      const phys = { ...(d.physical ?? {}) };
      if (phys.sheenColor != null) phys.sheenColor = new THREE.Color(phys.sheenColor);
      m = new THREE.MeshPhysicalMaterial({ ...params, ...phys });
    } else {
      m = new THREE.MeshStandardMaterial(params);
    }
    if (d.normalScale) m.normalScale.setScalar(d.normalScale);
    const triplanar = ov.triplanar ?? d.triplanar ?? false;
    applySurfaceShader(m, { ...(d.surface ?? {}), ...(ov.surface ?? {}), triplanar, scale: 1 / tile }, this.shared);
    return m;
  }

  _hasMetal(key) {
    const set = this.mapData(key);
    if (!set) return true;
    const orm = set.maps.orm;
    for (let i = 2; i < orm.length; i += 64) if (orm[i] > 8) return true;
    return false;
  }

  _createEffect(d, tex, tile, ov) {
    const color = ov.color ?? d.color;
    switch (d.type) {
      case 'water':
        return createWaterMaterial(tex, this.shared, tile);
      case 'flame':
        return createGlowMaterial(tex.albedo, this.shared, { color: color ?? 0xffffff, intensity: 2.2, pulse: 0.12, distort: 0.06 });
      case 'trail':
        return createGlowMaterial(tex.albedo, this.shared, { color: color ?? 0x8fd4ff, intensity: 2, scroll: [-0.6, 0], pulse: 0.05 });
      case 'ink':
        return createGlowMaterial(tex.albedo, this.shared, { color: color ?? 0xffffff, intensity: 1.6, pulse: 0.15 });
      case 'ghost':
        return createGhostMaterial(tex.albedo, this.shared, { color: color ?? 0xcfe4ff });
      default:
        throw new Error(`Unknown effect type ${d.type}`);
    }
  }

  /** Release a material obtained with get(); disposes when unused. */
  release(material) {
    const sig = material?.userData?.librarySig;
    const entry = sig && this.materials.get(sig);
    if (!entry) return;
    entry.refs--;
    if (entry.refs > 0) return;
    this.materials.delete(sig);
    material.dispose();
    const tex = this.textures.get(entry.key);
    if (tex && --tex.refs <= 0) {
      for (const t of Object.values(tex.tex)) t.dispose();
      this.textures.delete(entry.key);
    }
  }

  /** @param {number} w 0 dry … 1 soaked */
  setWetness(w) {
    this.shared.uWetness.value = THREE.MathUtils.clamp(w, 0, 1);
  }

  /** @param {number} dt */
  update(dt) {
    this.shared.uTime.value += dt;
  }

  get stats() {
    return { textures: this.textures.size, materials: this.materials.size, size: this.size, pending: this.pendingUpgrades };
  }

  dispose() {
    for (const { material } of this.materials.values()) material.dispose();
    for (const { tex } of this.textures.values()) for (const t of Object.values(tex)) t.dispose();
    this.materials.clear();
    this.textures.clear();
    this.shared.uVarTex.value.dispose();
  }
}
