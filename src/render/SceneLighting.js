/**
 * @file SceneLighting — hemisphere fill + shadow-casting sun whose shadow
 * frustum follows the focus point (the player). Respects quality presets.
 */
import * as THREE from 'three';

export class SceneLighting {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {{sky:number, ground:number, hemiIntensity:number, sunColor:number, sunIntensity:number,
   *          sunDirection:number[], shadowExtent:number, shadowDistance:number, shadowBias:number,
   *          shadowNormalBias:number}} cfg
   * @param {import('../data/quality.js').QUALITY_PRESETS.medium} preset
   */
  constructor(scene, bus, cfg, preset) {
    this.cfg = cfg;
    this.hemi = new THREE.HemisphereLight(cfg.sky, cfg.ground, cfg.hemiIntensity);
    scene.add(this.hemi);

    this.sunDir = new THREE.Vector3().fromArray(cfg.sunDirection).normalize();
    this.sun = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity);
    this.sun.castShadow = preset.shadows;
    const cam = this.sun.shadow.camera;
    cam.left = -cfg.shadowExtent;
    cam.right = cfg.shadowExtent;
    cam.top = cfg.shadowExtent;
    cam.bottom = -cfg.shadowExtent;
    cam.near = 0.5;
    cam.far = cfg.shadowDistance * 2;
    this.sun.shadow.bias = cfg.shadowBias;
    this.sun.shadow.normalBias = cfg.shadowNormalBias;
    this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this._texel = (cfg.shadowExtent * 2) / preset.shadowMapSize;
    bus.on('render:quality', ({ preset: p }) => this.applyQuality(p));
  }

  /** @param {import('../data/quality.js').QUALITY_PRESETS.medium} p */
  applyQuality(p) {
    this.sun.castShadow = p.shadows;
    if (this.sun.shadow.mapSize.x !== p.shadowMapSize) {
      this.sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this._texel = (this.cfg.shadowExtent * 2) / p.shadowMapSize;
  }

  /**
   * Centre the shadow frustum on the focus point, snapped to shadow texels
   * to avoid shimmering while moving.
   * @param {THREE.Vector3} focus
   */
  update(focus) {
    const t = this._texel;
    const fx = Math.round(focus.x / t) * t;
    const fz = Math.round(focus.z / t) * t;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(this.sunDir, this.cfg.shadowDistance);
    this.sun.target.updateMatrixWorld();
  }
}
