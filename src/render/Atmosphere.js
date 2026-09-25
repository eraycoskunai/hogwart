/**
 * @file Atmosphere — orchestrates everything that depends on time of day
 * and weather: sky dome, sun/moon lighting with cascaded shadows, sky-driven
 * environment map, fog, weather, pooled point lights and flames, colour
 * grading zones, dust motes and the post-processing chain.
 *
 * Per frame: clock → weather → lighting → sky → fog → env → lights →
 * grading → post-fx parameters. `render()` draws through the post chain.
 */
import * as THREE from 'three';
import { SKY, POSTFX, INTERIOR_AMBIENT_BLEND } from '../data/atmosphere.js';
import { Sky } from './Sky.js';
import { createSkyUniforms } from './SkyShader.js';
import { SkyEnvironment } from './Environment.js';
import { SceneLighting } from './SceneLighting.js';
import { LightManager } from './LightManager.js';
import { FlameSprites } from './FlameSprites.js';
import { WeatherSystem } from './Weather.js';
import { ColorGrading } from './ColorGrading.js';
import { PostFX } from './PostFX.js';
import { DustMotes } from './DustMotes.js';
import { FX_LAYER } from './PrecipitationOccluder.js';

const MAX_FLAMES = 768;
const REGISTER_INTERVAL = 0.5;
/** Fog multiplier inside indoor grading zones. */
const INDOOR_FOG = 0.25;
const _c = new THREE.Color();

export class Atmosphere {
  /**
   * @param {{renderer:import('./Renderer.js').Renderer, scene:THREE.Scene, camera:THREE.PerspectiveCamera,
   *          bus:import('../core/EventBus.js').EventBus, settings:import('../core/Settings.js').Settings,
   *          library:import('./MaterialLibrary.js').MaterialLibrary, clock:import('../world/GameClock.js').GameClock}} o
   */
  constructor(o) {
    this.o = o;
    const preset = o.renderer.preset;
    const { scene, camera, bus } = o;
    this.scene = scene;
    this.camera = camera;
    this.clock = o.clock;
    /** Outdoor fog multiplier set by the current region (wide valleys see farther). */
    this.fogScale = 1;
    this.preset = preset;
    this.time = 0;

    camera.layers.enable(FX_LAYER);
    this.skyUniforms = createSkyUniforms();
    this.sky = new Sky(this.skyUniforms);
    this.sky.mesh.layers.set(FX_LAYER);
    scene.add(this.sky.mesh);
    scene.fog = new THREE.FogExp2(0xbac6d0, 0.006);

    this.lighting = new SceneLighting(scene, camera, bus, preset);
    this.lights = new LightManager(scene, preset.maxDynamicLights);
    this.flames = null;
    this.weather = new WeatherSystem({ bus, scene, renderer: o.renderer.renderer, library: o.library, clock: o.clock, preset });
    this.grading = new ColorGrading();
    this.postfx = new PostFX(o.renderer, scene, camera, o.settings, bus);
    this.dust = new DustMotes(scene, preset.dust, o.library.shared.uTime);

    // Light and sky state once before the first environment capture.
    this.weather.flash = 0;
    this.lighting.update({ sunDir: o.clock.sunDirection, moonDir: o.clock.moonDirection, moonPhase: o.clock.moonPhase, cloud: this.weather.current.cloud, fog: this.weather.current.fog, lightning: 0 });
    this._pushSky();
    this.env = new SkyEnvironment(o.renderer.renderer, this.skyUniforms, preset.envRefresh ?? SKY.envRefresh);
    scene.environment = this.env.texture;
    this._registerTimer = 0;
    this._interior = 0;
    this._ambient = null;

    bus.on('render:quality', ({ preset: p }) => {
      this.preset = p;
      this.lights.setPoolSize(p.maxDynamicLights);
      this.env.interval = p.envRefresh ?? SKY.envRefresh;
    });
    bus.on('render:resize', () => this.lighting.updateFrustums());
    bus.on('cinematic:start', () => this.postfx.setDof(true));
    bus.on('cinematic:end', () => this.postfx.setDof(false));
    bus.on('weather:changed', () => {
      this.env.timer = Math.min(this.env.timer, 0.5);
    });
  }

  /** Flame sprites need the generated flame texture (call after materials load). */
  initFlames(texture) {
    this.flames = new FlameSprites(texture, MAX_FLAMES, this.o.library.shared.uTime);
    this.flames.mesh.layers.set(FX_LAYER);
    this.scene.add(this.flames.mesh);
  }

  /** Register lit materials with the cascaded shadows right away. */
  registerNow() {
    this.lighting.registerObject(this.scene);
  }

  _pushSky() {
    const c = this.clock;
    const w = this.weather.current;
    this.sky.setState({
      sun: c.sunDirection,
      moon: c.moonDirection,
      moonPhase: c.moonPhase,
      time: this.time,
      starRotation: (c.hour / 24) * Math.PI * 2,
      cloudCover: w.cloud,
      cloudOffset: this.weather.cloudOffset,
      lightning: this.weather.flash ?? 0,
      fogColor: this.lighting.fogColor,
      horizonFog: Math.min(1, 0.3 + w.fog * 0.6 + w.cloud * 0.5),
    });
  }

  /** Night factor 0 (day) … 1 (night). */
  get night() {
    return 1 - THREE.MathUtils.smoothstep(this.clock.sunElevation, -8, 4);
  }

  /**
   * @param {number} dt real seconds (unscaled)
   * @param {number} gameHours game hours advanced this frame
   * @param {THREE.Vector3} [focus] player's head: interiors are judged from here, not the camera
   */
  update(dt, gameHours, focus = this.camera.position) {
    this.time += dt;
    const cam = this.camera;
    const c = this.clock;
    const w = this.weather;

    const ambient = _c.copy(this.lighting.hemi.color).multiplyScalar(Math.min(1, this.lighting.hemi.intensity * 2.4));
    w.update(dt, gameHours, cam.position, { sunElevation: c.sunElevation, light: ambient });
    this.lighting.update({
      sunDir: c.sunDirection,
      moonDir: c.moonDirection,
      moonPhase: c.moonPhase,
      cloud: w.current.cloud,
      fog: w.current.fog,
      lightning: w.flash,
    });
    this._pushSky();
    this.sky.update(cam);

    const zone = this.grading.zoneAt(focus);
    const indoor = zone?.indoor ?? false;
    // Interior fill light (stands in for bounced light from flames).
    const k = 1 - Math.exp(-INTERIOR_AMBIENT_BLEND * dt);
    this._interior += ((zone?.ambient ? 1 : 0) - this._interior) * k;
    if (zone?.ambient) this._ambient = zone.ambient;
    if (this._interior > 0.001 && this._ambient) {
      const hemi = this.lighting.hemi;
      hemi.color.lerp(this._ambient.sky, this._interior);
      hemi.groundColor.lerp(this._ambient.ground, this._interior);
      hemi.intensity = THREE.MathUtils.lerp(hemi.intensity, this._ambient.intensity, this._interior);
    }
    this.scene.fog.color.copy(this.lighting.fogColor);
    this.scene.fog.density = w.fogDensity(this.preset.fogDensityScale) * (indoor ? INDOOR_FOG : this.fogScale);

    if (this.env.update(dt)) this.scene.environment = this.env.texture;
    this.lights.update(dt, cam.position);
    this.flames?.update();

    const grade = this.grading.update(dt, focus, {
      night: this.night,
      overcast: w.current.cloud,
      extraExposure: this.lighting.exposure,
    });
    this.postfx.setGrade(grade);
    const sunStrength = THREE.MathUtils.smoothstep(c.sunElevation, -1, 8) * (1 - w.current.cloud * 0.9) * (1 - w.current.fog * 0.7) * (indoor ? 0 : 1);
    this.postfx.setSun(c.sunDirection, sunStrength, this.lighting.sunColor);
    this.postfx.setBloom(POSTFX.bloom.strength * (1 + this.night * 0.5 + (indoor ? 0.3 : 0)));

    const fovScale = this.o.renderer.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const dustOn = (this.o.settings.get('fx')?.dust ?? true) ? 1 : 0;
    const dustStrength = dustOn * (indoor ? 0.9 : 0.25 * sunStrength) * (1 - w.current.rain);
    this.dust.update(cam.position, dustStrength, indoor ? _c.setRGB(1, 0.85, 0.6) : this.lighting.sunColor, fovScale);

    this._registerTimer -= dt;
    if (this._registerTimer <= 0) {
      this._registerTimer = REGISTER_INTERVAL;
      this.lighting.registerObject(this.scene);
    }
  }

  render() {
    this.postfx.render();
  }

  /** Status for the debug panel. */
  get stats() {
    const w = this.weather;
    return {
      Saat: `${this.clock.format()} (x${this.clock.speed})`,
      Mevsim: this.clock.season,
      'Güneş yüksekliği': `${this.clock.sunElevation.toFixed(1)}°`,
      'Ay evresi': this.clock.moonPhase.toFixed(2),
      'Hava': `${w.label}${w.blend < 1 ? ` (geçiş %${Math.round(w.blend * 100)})` : ''}`,
      'Bulut / yağmur / kar / sis': `${w.current.cloud.toFixed(2)} / ${w.current.rain.toFixed(2)} / ${w.current.snow.toFixed(2)} / ${w.current.fog.toFixed(2)}`,
      'Islaklık / kar örtüsü': `${w.wetness.toFixed(2)} / ${w.snowCover.toFixed(2)}`,
      'Işık havuzu': `${this.lights.stats.active} / ${this.lights.stats.pool} (${this.lights.stats.sources} kaynak)`,
      'Renk bölgesi': this.grading.zone?.name ?? 'dış mekân',
      'Post-fx': this.postfx.enabled ? 'açık' : 'kapalı',
    };
  }

  dispose() {
    this.weather.dispose();
    this.postfx.dispose();
    this.env.dispose();
    this.lighting.dispose();
    this.lights.dispose();
    this.flames?.dispose();
    this.dust.dispose();
    this.sky.dispose();
  }
}
