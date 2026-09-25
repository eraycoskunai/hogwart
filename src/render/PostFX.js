/**
 * @file PostFX — post-processing chain:
 *   scene (HDR, optional MSAA) → GTAO → depth of field (cinematics only)
 *   → sun shafts (screen-space radial scattering) → bloom
 *   → tone mapping + sRGB (OutputPass) → colour grade + vignette → FXAA
 * Each stage follows the quality preset and the user's toggles. When post
 * processing is disabled the scene renders straight to the screen.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { POSTFX } from '../data/atmosphere.js';

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const GodRaysShader = (samples) => ({
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uIntensity: { value: 0 },
    uDensity: { value: POSTFX.godRays.density },
    uDecay: { value: POSTFX.godRays.decay },
    uWeight: { value: POSTFX.godRays.weight },
    uThreshold: { value: POSTFX.godRays.threshold },
    uColor: { value: new THREE.Color(1, 0.95, 0.85) },
  },
  vertexShader: FULLSCREEN_VERT,
  fragmentShader: /* glsl */ `
    #define SAMPLES ${samples}
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uIntensity, uDensity, uDecay, uWeight, uThreshold;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (uIntensity <= 0.0) { gl_FragColor = vec4(base, 1.0); return; }
      vec2 delta = (vUv - uSun) * uDensity / float(SAMPLES);
      vec2 c = vUv;
      float illum = 1.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < SAMPLES; i++) {
        c -= delta;
        vec3 s = texture2D(tDiffuse, clamp(c, 0.0, 1.0)).rgb;
        float l = max(0.0, dot(s, vec3(0.3, 0.59, 0.11)) - uThreshold);
        acc += min(s, vec3(4.0)) * l * illum * uWeight;
        illum *= uDecay;
      }
      acc /= float(SAMPLES);
      gl_FragColor = vec4(base + acc * uColor * uIntensity, 1.0);
    }`,
});

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uLift: { value: new THREE.Vector3() },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: 0.3 },
    uFade: { value: 0 },
  },
  vertexShader: FULLSCREEN_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast, uSaturation, uVignette, uFade;
    uniform vec3 uLift, uGain;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = c * uGain + uLift * (1.0 - c);
      c = (c - 0.5) * uContrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      vec2 d = vUv - 0.5;
      c *= clamp(1.0 - dot(d, d) * uVignette * 2.4, 0.0, 1.0);
      c = mix(c, vec3(0.0), uFade);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

const _v = new THREE.Vector3();

export class PostFX {
  /**
   * @param {import('./Renderer.js').Renderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../core/Settings.js').Settings} settings
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(renderer, scene, camera, settings, bus) {
    this.r = renderer;
    this.scene = scene;
    this.camera = camera;
    this.settings = settings;
    this.composer = null;
    this.enabled = false;
    this.dofActive = false;
    this.build(renderer.preset);
    bus.on('render:quality', ({ preset }) => this.build(preset));
    bus.on('render:resize', () => this.resize());
    bus.on('settings:changed', ({ key }) => {
      if (key === 'fx' || key === '*') this.build(this.r.preset);
    });
  }

  /** Effective toggle: preset allows it and the user did not switch it off. */
  _on(preset, key) {
    const fx = this.settings.get('fx') ?? {};
    return !!preset[key] && fx[key] !== false;
  }

  /** (Re)create the pass chain for a preset. */
  build(preset) {
    this._dispose();
    this.enabled = !!preset.postFx;
    this.r.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (!this.enabled) return;
    const renderer = this.r.renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: preset.msaaSamples ?? 0,
    });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(1);
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(this.scene, this.camera));

    if (this._on(preset, 'ao')) {
      this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.2, thickness: 1.5, scale: 1 });
      composer.addPass(this.gtao);
    }
    this.bokeh = new BokehPass(this.scene, this.camera, { ...POSTFX.dof });
    this.bokeh.enabled = false;
    composer.addPass(this.bokeh);
    if (this._on(preset, 'godRays')) {
      this.godRays = new ShaderPass(GodRaysShader(preset.godRaySamples ?? 32));
      composer.addPass(this.godRays);
    }
    if (this._on(preset, 'bloom')) {
      const b = POSTFX.bloom;
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), b.strength, b.radius, b.threshold);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    if (preset.fxaa) {
      this.fxaa = new ShaderPass(FXAAShader);
      this.fxaa.material.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
      composer.addPass(this.fxaa);
    }
    this.composer = composer;
  }

  resize() {
    if (!this.composer) return;
    const size = this.r.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
    this.gtao?.setSize(size.x, size.y);
    this.fxaa?.material.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
  }

  /**
   * @param {{contrast:number, saturation:number, lift:number[], gain:number[], vignette:number, exposure:number}} g
   */
  setGrade(g) {
    this.r.renderer.toneMappingExposure = g.exposure;
    if (!this.grade) return;
    const u = this.grade.material.uniforms;
    u.uContrast.value = g.contrast;
    u.uSaturation.value = g.saturation;
    u.uLift.value.fromArray(g.lift);
    u.uGain.value.fromArray(g.gain);
    u.uVignette.value = g.vignette;
  }

  /**
   * Sun shafts: project the sun and fade with visibility.
   * @param {THREE.Vector3} sunDir direction toward the sun
   * @param {number} strength 0..1 (sun height × clear sky)
   * @param {THREE.Color} color
   */
  setSun(sunDir, strength, color) {
    if (!this.godRays) return;
    _v.copy(this.camera.position).addScaledVector(sunDir, 1000).project(this.camera);
    const inFront = _v.z < 1;
    const u = this.godRays.material.uniforms;
    u.uSun.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
    // Fade out as the sun leaves the screen.
    const off = Math.max(0, Math.max(Math.abs(_v.x), Math.abs(_v.y)) - 1);
    const onScreen = inFront ? Math.max(0, 1 - off * 1.5) : 0;
    u.uIntensity.value = strength * onScreen * POSTFX.godRays.exposure * 10;
    u.uColor.value.copy(color);
  }

  /** @param {number} strength */
  setBloom(strength) {
    if (this.bloom) this.bloom.strength = strength;
  }

  /**
   * Depth of field (cinematic shots).
   * @param {boolean} on
   * @param {number} [focus] metres
   */
  setDof(on, focus = POSTFX.dof.focus) {
    if (!this.bokeh) return;
    this.bokeh.enabled = on;
    this.bokeh.uniforms.focus.value = focus;
  }

  render() {
    if (this.composer) this.composer.render();
    else this.r.renderer.render(this.scene, this.camera);
  }

  _dispose() {
    if (!this.composer) return;
    for (const p of this.composer.passes) p.dispose?.();
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.composer = null;
    this.gtao = this.bokeh = this.godRays = this.bloom = this.grade = this.fxaa = null;
  }

  dispose() {
    this._dispose();
  }
}
