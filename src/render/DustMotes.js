/**
 * @file DustMotes — slowly drifting specks of dust around the camera.
 * GPU animated (no CPU per particle); they catch light and become more
 * visible indoors and in sunlit, calm air.
 */
import * as THREE from 'three';
import { FX_LAYER } from './PrecipitationOccluder.js';

const AREA = 14;

const VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCam;
uniform float uArea;
uniform float uScale;
attribute vec4 aRand;
varying float vAlpha;
void main() {
  vec3 seed = aRand.xyz;
  vec3 p = uCam + (fract(seed - uCam / uArea + vec3(sin(uTime * 0.05 + aRand.w * 6.0) * 0.02, uTime * 0.004 * (aRand.w - 0.3), cos(uTime * 0.04 + aRand.w * 4.0) * 0.02)) - 0.5) * uArea;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = length(mv.xyz);
  vAlpha = smoothstep(uArea * 0.5, uArea * 0.2, d) * smoothstep(0.3, 1.5, d) * (0.5 + 0.5 * sin(uTime * (0.5 + aRand.w) + aRand.w * 20.0));
  // Specks of 2–5 mm projected to pixels.
  gl_PointSize = max(1.0, (0.002 + aRand.w * 0.003) * uScale / max(d, 0.1));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c)) * vAlpha * uStrength;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}`;

export class DustMotes {
  /**
   * @param {THREE.Scene} scene
   * @param {number} count
   * @param {{value:number}} timeUniform
   */
  constructor(scene, count, timeUniform) {
    const g = new THREE.BufferGeometry();
    const n = Math.max(1, count);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const r = new Float32Array(n * 4);
    for (let i = 0; i < r.length; i++) r[i] = Math.random();
    g.setAttribute('aRand', new THREE.BufferAttribute(r, 4));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: timeUniform,
        uCam: { value: new THREE.Vector3() },
        uArea: { value: AREA },
        uScale: { value: 800 },
        uColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uStrength: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.layers.set(FX_LAYER);
    this.points.visible = count > 0;
    scene.add(this.points);
  }

  /**
   * @param {THREE.Vector3} cam
   * @param {number} strength 0..1
   * @param {THREE.Color} light
   * @param {number} pixelScale viewport height / (2·tan(fov/2))
   */
  update(cam, strength, light, pixelScale) {
    this.material.uniforms.uScale.value = pixelScale;
    this.material.uniforms.uCam.value.copy(cam);
    this.material.uniforms.uStrength.value = strength;
    this.material.uniforms.uColor.value.copy(light);
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
