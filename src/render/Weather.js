/**
 * @file Weather — weather state machine and its visible consequences:
 * blended parameters (cloud cover, rain, snow, fog, storm, wind), seasonal
 * automatic changes, surface wetness (wets fast, dries slowly, faster in
 * sun) and snow accumulation, lightning with delayed thunder events, cloud
 * drift, precipitation particles and the roof occluder.
 *
 * Emits: weather:changed {type}, weather:lightning {intensity},
 *        weather:thunder {intensity, distance} (after the sound delay)
 */
import * as THREE from 'three';
import { WEATHER, WEATHER_TYPES, WEATHER_ODDS, SKY } from '../data/atmosphere.js';
import { PrecipitationOccluder } from './PrecipitationOccluder.js';
import { WeatherParticles } from './WeatherParticles.js';

const PARAMS = ['cloud', 'rain', 'snow', 'fog', 'storm', 'wind'];

export class WeatherSystem {
  /**
   * @param {{bus:import('../core/EventBus.js').EventBus, scene:THREE.Scene, renderer:THREE.WebGLRenderer,
   *          library:import('./MaterialLibrary.js').MaterialLibrary, clock:import('../world/GameClock.js').GameClock,
   *          preset:import('../data/quality.js').QUALITY_PRESETS.medium}} o
   */
  constructor(o) {
    this.bus = o.bus;
    this.scene = o.scene;
    this.library = o.library;
    this.clock = o.clock;
    this.type = 'clear';
    this.current = { ...WEATHER_TYPES.clear };
    this.from = { ...this.current };
    this.to = { ...this.current };
    this.blend = 1;
    this.auto = true;
    this.hoursToChange = this._rollHours();
    this.wetness = 0;
    this.snowCover = 0;
    this.lightning = 0;
    this._lightningTimer = this._rollLightning();
    this.cloudOffset = new THREE.Vector2();
    this.wind = new THREE.Vector2();
    this.time = 0;

    const shared = o.library.shared;
    this.occluder = new PrecipitationOccluder(o.renderer, shared.occ, {
      size: o.preset.occluderSize,
      area: WEATHER.area * 1.4,
      height: WEATHER.height,
      interval: 0.35,
    });
    this.particles = new WeatherParticles(o.scene, shared.occ, {
      rain: o.preset.rainDrops,
      splashes: o.preset.splashes,
      snow: o.preset.snowFlakes,
      area: WEATHER.area,
      height: WEATHER.height,
    }, shared.uTime);
  }

  _rollHours() {
    const [a, b] = WEATHER.changeEveryHours;
    return a + Math.random() * (b - a);
  }

  _rollLightning() {
    const L = WEATHER.lightning;
    return L.minGap + Math.random() * (L.maxGap - L.minGap);
  }

  /**
   * Change weather.
   * @param {string} type key of WEATHER_TYPES
   * @param {boolean} [instant]
   */
  set(type, instant = false) {
    if (!WEATHER_TYPES[type]) return;
    this.type = type;
    this.from = { ...this.current };
    this.to = { ...WEATHER_TYPES[type] };
    this.blend = instant ? 1 : 0;
    if (instant) Object.assign(this.current, this.to);
    this.bus.emit('weather:changed', { type, label: WEATHER_TYPES[type].label });
  }

  /** Pick the next weather from the seasonal odds. */
  roll() {
    const odds = WEATHER_ODDS[this.clock.season];
    const total = Object.values(odds).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [k, w] of Object.entries(odds)) {
      r -= w;
      if (r <= 0) return this.set(k);
    }
    return this.set('clear');
  }

  /** Force a lightning strike now (debug). */
  strike(distance = 300 + Math.random() * 2000) {
    const L = WEATHER.lightning;
    this.lightning = 1;
    this.bus.emit('weather:lightning', { intensity: 1, distance });
    const delay = Math.min(distance, L.maxDistance) / L.speedOfSound;
    this._thunder = { t: delay, intensity: 1 - distance / L.maxDistance, distance };
  }

  get label() {
    return WEATHER_TYPES[this.type].label;
  }

  /**
   * @param {number} dt real seconds
   * @param {number} gameHours game hours elapsed this frame
   * @param {THREE.Vector3} camPos
   * @param {{sunElevation:number, light:THREE.Color}} env
   */
  update(dt, gameHours, camPos, env) {
    this.time += dt;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / WEATHER.transitionSeconds);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      for (const p of PARAMS) this.current[p] = THREE.MathUtils.lerp(this.from[p], this.to[p], k);
    }
    if (this.auto) {
      this.hoursToChange -= gameHours;
      if (this.hoursToChange <= 0) {
        this.hoursToChange = this._rollHours();
        this.roll();
      }
    }
    const c = this.current;

    // Wind and cloud drift.
    const [wx, wz] = WEATHER.windDirection;
    this.wind.set(wx, wz).multiplyScalar(c.wind * 3);
    this.cloudOffset.x += (SKY.cloudSpeed * (0.3 + c.wind * 2)) * wx * dt * 60;
    this.cloudOffset.y += (SKY.cloudSpeed * (0.3 + c.wind * 2)) * wz * dt * 60;

    // Surfaces: wet under rain, dry slowly (faster in sunshine); snow builds up and melts.
    const sunny = THREE.MathUtils.clamp(env.sunElevation / 30, 0, 1) * (1 - c.cloud);
    if (c.rain > 0.05) this.wetness = Math.min(1, this.wetness + WEATHER.wetRate * c.rain * dt);
    else this.wetness = Math.max(0, this.wetness - WEATHER.dryRate * (0.4 + sunny * 1.6) * dt);
    if (c.snow > 0.05) this.snowCover = Math.min(1, this.snowCover + WEATHER.snowAccumulateRate * c.snow * dt);
    else this.snowCover = Math.max(0, this.snowCover - WEATHER.snowMeltRate * (0.3 + sunny * 2) * dt);
    this.library.setWetness(this.wetness * (1 - this.snowCover));
    this.library.shared.uSnowCover.value = this.snowCover;

    // Lightning.
    this.lightning = Math.max(0, this.lightning - dt / WEATHER.lightning.flash);
    if (c.storm > 0.5) {
      this._lightningTimer -= dt;
      if (this._lightningTimer <= 0) {
        this._lightningTimer = this._rollLightning();
        this.strike();
      }
    }
    if (this._thunder) {
      this._thunder.t -= dt;
      if (this._thunder.t <= 0) {
        this.bus.emit('weather:thunder', { intensity: this._thunder.intensity, distance: this._thunder.distance });
        this._thunder = null;
      }
    }
    // Flash flicker: a few quick pulses.
    const flash = this.lightning > 0 ? this.lightning * (0.6 + 0.4 * Math.sin(this.time * 60)) : 0;
    this.flash = flash;

    this.occluder.update(this.scene, camPos, dt);
    this.particles.update(camPos, { rain: c.rain, snow: c.snow, wind: this.wind, light: env.light });
  }

  /** Fog density for the scene (exp2), scaled by quality. */
  fogDensity(scale) {
    const [a, b] = WEATHER.fogDensity;
    return THREE.MathUtils.lerp(a, b, this.current.fog) * scale;
  }

  serialize() {
    return { type: this.type, wetness: this.wetness, snowCover: this.snowCover, auto: this.auto };
  }

  deserialize(d) {
    if (!d || !WEATHER_TYPES[d.type]) return;
    this.set(d.type, true);
    this.wetness = Number(d.wetness) || 0;
    this.snowCover = Number(d.snowCover) || 0;
    this.auto = d.auto !== false;
  }

  dispose() {
    this.particles.dispose();
    this.occluder.dispose();
  }
}
