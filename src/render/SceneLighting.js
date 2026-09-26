/**
 * @file SceneLighting — sun / moon directional light with cascaded soft
 * shadow maps (three.js CSM), hemisphere ambient, and time-of-day / weather
 * driven colours. Every lit material in the scene is registered with CSM
 * automatically (CSM needs per-material defines; unregistered materials
 * would otherwise receive every cascade light).
 */
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { LIGHT_KEYS, MOON_LIGHT } from '../data/atmosphere.js';

const SHADOW = Object.freeze({
  bias: -0.0003,
  normalBias: 0.035,
  lightMargin: 60,
  lightFar: 400,
  /** Sun elevations (deg) over which direct light fades in at dawn. */
  sunFade: [-4, 2],
});

/** Pre-parse keyframe colours. */
const KEYS = LIGHT_KEYS.map((k) => ({
  el: k.el,
  sunColor: new THREE.Color(k.sun[0]),
  sun: k.sun[1],
  moon: k.moon,
  hemiSky: new THREE.Color(k.hemiSky),
  hemiGround: new THREE.Color(k.hemiGround),
  hemi: k.hemi,
  fog: new THREE.Color(k.fog),
  exposure: k.exposure,
}));

const _c = new THREE.Color();
const _dir = new THREE.Vector3();

export class SceneLighting {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {import('../data/quality.js').QUALITY_PRESETS.medium} preset
   */
  constructor(scene, camera, bus, preset) {
    this.scene = scene;
    this.camera = camera;
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x5d5044, 0.35);
    scene.add(this.hemi);
    /** @type {Set<THREE.Material>} */
    this.materials = new Set();
    this.csm = null;
    this.sunColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.exposure = 1;
    this.directIntensity = 0;
    this.lightDirection = new THREE.Vector3(0.3, 0.8, 0.2).normalize();
    this._build(preset);
    bus.on('render:quality', ({ preset: p }) => this._build(p));
  }

  _build(preset) {
    if (this.csm) {
      this.csm.remove();
      this.csm.dispose();
    }
    this.csm = new CSM({
      camera: this.camera,
      parent: this.scene,
      cascades: preset.cascades,
      maxFar: preset.shadowFar,
      mode: 'practical',
      shadowMapSize: preset.shadowMapSize,
      shadowBias: SHADOW.bias,
      lightDirection: this.lightDirection.clone().negate(),
      lightIntensity: 1,
      lightMargin: SHADOW.lightMargin,
      lightFar: SHADOW.lightFar,
    });
    this.csm.fade = true;
    for (const l of this.csm.lights) {
      l.castShadow = preset.shadows;
      l.shadow.normalBias = SHADOW.normalBias;
    }
    // Re-register every known material with the new cascade count.
    for (const m of this.materials) this._setup(m, true);
  }

  /** Register all lit materials below `root`. */
  registerObject(root) {
    root.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m && !this.materials.has(m)) this._setup(m, false);
    });
  }

  _setup(m, force) {
    const lit = m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial || m.isMeshToonMaterial;
    if (!lit) return;
    if (!force && this.materials.has(m)) return;
    if (!('_preCsm' in m.userData)) {
      m.userData._preCsm = m.onBeforeCompile;
      // CSM keeps every set-up material in its own map; drop it there too,
      // or disposed region materials (and their textures) stay in memory.
      m.addEventListener('dispose', () => {
        this.materials.delete(m);
        this.csm?.shaders.delete(m);
      });
    }
    const pre = m.userData._preCsm;
    this.csm.setupMaterial(m);
    const csmHook = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      pre.call(m, shader, renderer);
      csmHook.call(m, shader, renderer);
    };
    const prevKey = m.customProgramCacheKey;
    if (!m.userData._csmKeyWrapped) {
      m.customProgramCacheKey = () => `${prevKey.call(m)}|csm`;
      m.userData._csmKeyWrapped = true;
    }
    m.needsUpdate = true;
    this.materials.add(m);
  }

  /** Call when the camera projection changes. */
  updateFrustums() {
    this.csm.updateFrustums();
  }

  /**
   * @param {{sunDir:THREE.Vector3, moonDir:THREE.Vector3, moonPhase:number, cloud:number, fog:number, lightning:number}} s
   */
  update(s) {
    const el = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(s.sunDir.y, -1, 1)));
    // Interpolate keyframes by sun elevation.
    let a = KEYS[0];
    let b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (el >= KEYS[i].el && el <= KEYS[i + 1].el) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    const t = el <= KEYS[0].el ? 0 : el >= KEYS[KEYS.length - 1].el ? 1 : (el - a.el) / (b.el - a.el);
    const lerp = THREE.MathUtils.lerp;

    const sunW = THREE.MathUtils.smoothstep(el, SHADOW.sunFade[0], SHADOW.sunFade[1]);
    const moonUp = THREE.MathUtils.smoothstep(s.moonDir.y, -0.02, 0.1);
    const illum = 0.5 - 0.5 * Math.cos(s.moonPhase * Math.PI * 2);
    const moonW = (1 - sunW) * moonUp * lerp(a.moon, b.moon, t) * (0.25 + 0.75 * illum);
    const overcast = 1 - s.cloud * 0.65;

    this.sunColor.copy(a.sunColor).lerp(b.sunColor, t);
    let intensity;
    if (sunW > 0.001) {
      _dir.copy(s.sunDir);
      intensity = lerp(a.sun, b.sun, t) * sunW;
      _c.copy(this.sunColor);
    } else {
      _dir.copy(s.moonDir);
      intensity = MOON_LIGHT.intensity * moonW;
      _c.set(MOON_LIGHT.color);
    }
    intensity *= overcast;
    // Keep the light from skimming exactly along the ground (shadow acne / stretched shadows).
    if (_dir.y < 0.08) _dir.y = 0.08;
    _dir.normalize();
    this.lightDirection.copy(_dir);
    this.csm.lightDirection.copy(_dir).negate();
    this.directIntensity = intensity;
    for (const l of this.csm.lights) {
      l.color.copy(_c);
      l.intensity = intensity + s.lightning * 3;
    }

    this.hemi.color.copy(a.hemiSky).lerp(b.hemiSky, t);
    this.hemi.groundColor.copy(a.hemiGround).lerp(b.hemiGround, t);
    this.hemi.intensity = lerp(a.hemi, b.hemi, t) * (1 + s.cloud * 0.25) + s.lightning * 2.5;
    if (s.lightning > 0) this.hemi.color.lerp(_c.setRGB(0.8, 0.85, 1), Math.min(1, s.lightning * 2));

    this.fogColor.copy(a.fog).lerp(b.fog, t);
    // Overcast / fog wash toward grey.
    const grey = (this.fogColor.r + this.fogColor.g + this.fogColor.b) / 3;
    this.fogColor.lerp(_c.setRGB(grey, grey, grey * 1.03), Math.min(1, s.cloud * 0.5 + s.fog * 0.3));
    this.exposure = lerp(a.exposure, b.exposure, t);
    this.csm.update();
  }

  /** @returns {THREE.Vector3} direction toward the active light */
  get direction() {
    return this.lightDirection;
  }

  dispose() {
    this.csm.remove();
    this.csm.dispose();
    this.scene.remove(this.hemi);
  }
}
