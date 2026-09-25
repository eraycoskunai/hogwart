/**
 * @file LightManager — many registered light sources (torches, candles,
 * lamps), few real lights. Each frame the N most relevant sources (by
 * distance-weighted intensity to the camera) get one of the pooled
 * PointLights; the rest are represented only by their emissive flames and
 * bloom. Assignments fade in/out to avoid popping; every source flickers
 * with its own profile.
 */
import * as THREE from 'three';
import { FLICKER, LIGHT_POOL_FADE } from '../data/atmosphere.js';

/**
 * @typedef {Object} LightSource
 * @property {THREE.Vector3} position
 * @property {THREE.Color} color
 * @property {number} intensity
 * @property {number} distance
 * @property {string} flicker   key of FLICKER
 * @property {number} seed
 * @property {boolean} enabled
 * @property {number} level     current flicker multiplier (read by flame sprites)
 */

const FADE_RATE = LIGHT_POOL_FADE;

export class LightManager {
  /**
   * @param {THREE.Scene} scene
   * @param {number} poolSize
   */
  constructor(scene, poolSize) {
    this.scene = scene;
    /** @type {LightSource[]} */
    this.sources = [];
    this.pool = [];
    this.time = 0;
    this.setPoolSize(poolSize);
  }

  /** @param {number} n */
  setPoolSize(n) {
    for (const p of this.pool) this.scene.remove(p.light);
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      this.scene.add(light);
      this.pool.push({ light, source: null, fade: 0 });
    }
  }

  /**
   * @param {{position:THREE.Vector3|number[], color:number, intensity:number, distance:number, flicker?:string}} o
   * @returns {LightSource}
   */
  add(o) {
    const src = {
      position: Array.isArray(o.position) ? new THREE.Vector3().fromArray(o.position) : o.position.clone(),
      color: new THREE.Color(o.color),
      intensity: o.intensity,
      distance: o.distance,
      flicker: o.flicker ?? 'steady',
      /** Ranking multiplier (spell lights, Lumos). */
      priority: o.priority ?? 1,
      seed: Math.random() * 1000,
      enabled: true,
      level: 1,
    };
    this.sources.push(src);
    return src;
  }

  /** @param {LightSource} src */
  remove(src) {
    const i = this.sources.indexOf(src);
    if (i >= 0) this.sources.splice(i, 1);
    for (const p of this.pool) if (p.source === src) p.source = null;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} viewer camera / player position
   */
  update(dt, viewer) {
    this.time += dt;
    const t = this.time;
    for (const s of this.sources) {
      const f = FLICKER[s.flicker] ?? FLICKER.steady;
      s.level = f.amount
        ? 1 - f.amount * 0.5 + f.amount * 0.5 * (Math.sin(t * f.speed + s.seed) * 0.5 + Math.sin(t * f.speed * 2.3 + s.seed * 1.7) * 0.3 + Math.sin(t * f.speed * 5.1 + s.seed * 3.1) * 0.2)
        : 1;
    }

    // Rank sources by how much they could light the viewer's surroundings.
    const ranked = this.sources
      .filter((s) => s.enabled)
      .map((s) => ({ s, score: (s.priority ?? 1) * s.intensity / (1 + s.position.distanceToSquared(viewer) / (s.distance * s.distance)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.pool.length)
      .map((r) => r.s);
    const rankedSet = new Set(ranked);
    const assigned = new Set();
    for (const p of this.pool) if (p.source) assigned.add(p.source);
    const queue = ranked.filter((s) => !assigned.has(s));
    const k = 1 - Math.exp(-FADE_RATE * dt);

    for (const p of this.pool) {
      // A slot whose source dropped out fades before it is reused.
      if (p.source && !rankedSet.has(p.source)) {
        p.fade += (0 - p.fade) * k;
        if (p.fade < 0.02) p.source = null;
      } else if (p.source) {
        p.fade += (1 - p.fade) * k;
      }
      if (!p.source && queue.length) {
        p.source = queue.shift();
        p.fade = 0;
      }
      const s = p.source;
      // Lights stay "visible" (intensity 0 when idle): changing the light
      // count would force every material to recompile.
      if (!s) {
        p.light.intensity = 0;
        continue;
      }
      p.light.position.copy(s.position);
      p.light.color.copy(s.color);
      p.light.distance = s.distance;
      p.light.intensity = s.intensity * s.level * p.fade;
    }
  }

  get stats() {
    return { sources: this.sources.length, active: this.pool.filter((p) => p.light.intensity > 0).length, pool: this.pool.length };
  }

  dispose() {
    for (const p of this.pool) this.scene.remove(p.light);
    this.pool = [];
    this.sources = [];
  }
}
