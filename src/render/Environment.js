/**
 * @file Environment — prefiltered (PMREM) environment maps so PBR materials
 * get image-based reflections: one from the gradient sky (outdoor scenes),
 * one procedural studio room (material gallery). No external images.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from './Sky.js';

export const ENV = Object.freeze({
  sigma: 0.04,
  skyRadius: 100,
});

/**
 * Image-based lighting that follows the live sky: a private dome sharing the
 * sky uniforms is re-captured into a PMREM map every few seconds (or when
 * forced after big changes such as weather transitions or time skips).
 */
export class SkyEnvironment {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {ReturnType<import('./SkyShader.js').createSkyUniforms>} skyUniforms
   * @param {number} interval real seconds between captures
   */
  constructor(renderer, skyUniforms, interval) {
    this.renderer = renderer;
    this.interval = interval;
    this.scene = new THREE.Scene();
    this.sky = new Sky(skyUniforms);
    this.sky.mesh.scale.setScalar(ENV.skyRadius);
    this.scene.add(this.sky.mesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.target = null;
    this.timer = 0;
    this.capture();
  }

  /** @returns {THREE.Texture} */
  get texture() {
    return this.target.texture;
  }

  capture() {
    const old = this.target;
    this.target = this.pmrem.fromScene(this.scene, ENV.sigma, 0.1, ENV.skyRadius * 2);
    old?.dispose();
    this.timer = this.interval;
    return this.target.texture;
  }

  /**
   * @param {number} dt real seconds
   * @returns {boolean} true when a new texture was produced
   */
  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return false;
    this.capture();
    return true;
  }

  dispose() {
    this.target?.dispose();
    this.pmrem.dispose();
    this.sky.mesh.geometry.dispose();
    this.sky.mesh.material.dispose();
  }
}

/**
 * Neutral studio lighting (the three.js procedural RoomEnvironment).
 * @param {THREE.WebGLRenderer} renderer
 */
export function createStudioEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment(renderer);
  const target = pmrem.fromScene(room, ENV.sigma);
  room.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose?.();
  });
  pmrem.dispose();
  return target.texture;
}
