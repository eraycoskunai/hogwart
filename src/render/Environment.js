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
  groundColor: 0x3d3730,
});

/**
 * Environment from the sky gradient plus a dark ground hemisphere.
 * @param {THREE.WebGLRenderer} renderer
 * @param {{top:number, horizon:number, bottom:number, sunColor:number}} skyColors
 * @param {THREE.Vector3} sunDir
 * @returns {THREE.Texture}
 */
export function createSkyEnvironment(renderer, skyColors, sunDir) {
  const scene = new THREE.Scene();
  const sky = new Sky({ ...skyColors, bottom: ENV.groundColor });
  sky.setSunDirection(sunDir);
  sky.mesh.scale.setScalar(ENV.skyRadius);
  scene.add(sky.mesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, ENV.sigma, 0.1, ENV.skyRadius * 2);
  pmrem.dispose();
  sky.dispose();
  return target.texture;
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
