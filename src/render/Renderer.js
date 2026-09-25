/**
 * @file Renderer — WebGL renderer wrapper handling quality presets,
 * resolution scaling and resize.
 */
import * as THREE from 'three';
import { QUALITY_PRESETS } from '../data/quality.js';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../core/Settings.js').Settings} settings
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(canvas, settings, bus) {
    this.canvas = canvas;
    this.settings = settings;
    this.bus = bus;
    this.quality = settings.get('quality');
    const preset = QUALITY_PRESETS[this.quality];

    // MSAA can only be chosen at context creation; later changes apply after reload.
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: preset.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Counted over the whole frame (scene + post passes); reset in beginFrame().
    this.renderer.info.autoReset = false;

    this.width = 1;
    this.height = 1;
    this.applyQuality(this.quality);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    bus.on('settings:changed', ({ key }) => {
      if (key === 'quality' || key === 'renderScale' || key === '*') this.applyQuality(settings.get('quality'));
    });
  }

  /** @returns {typeof QUALITY_PRESETS.medium} */
  get preset() {
    return QUALITY_PRESETS[this.quality];
  }

  /** @param {string} name */
  applyQuality(name) {
    if (!QUALITY_PRESETS[name]) return;
    this.quality = name;
    const p = QUALITY_PRESETS[name];
    this.renderer.shadowMap.enabled = p.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
    this.bus.emit('render:quality', { name, preset: p });
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, this.preset.pixelRatioMax) * this.settings.get('renderScale');
    this.renderer.setPixelRatio(Math.max(0.25, ratio));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.width = w;
    this.height = h;
    this.bus.emit('render:resize', { width: w, height: h });
  }

  get aspect() {
    return this.width / this.height;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  render(scene, camera) {
    this.renderer.render(scene, camera);
  }

  /** Renderer statistics for the debug panel. */
  /** Start counting draw calls / triangles for a new frame. */
  beginFrame() {
    this.renderer.info.reset();
  }

  get stats() {
    const i = this.renderer.info;
    return {
      calls: i.render.calls,
      triangles: i.render.triangles,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
      programs: i.programs ? i.programs.length : 0,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
