/**
 * @file WeatherParticles — GPU-driven precipitation around the camera.
 * All motion happens in vertex shaders from per-instance random seeds and
 * time, wrapped in a box that follows the camera, so the CPU cost is zero.
 *   - rain: velocity-aligned streaks, slanted by wind
 *   - splashes: expanding rings on the topmost surface (occluder height)
 *   - snow: soft swaying flakes
 * Drops below a roof (occluder) are culled, so interiors stay dry.
 */
import * as THREE from 'three';
import { OCCLUDER_GLSL, FX_LAYER } from './PrecipitationOccluder.js';

const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uCam;
uniform float uArea;
uniform float uHeight;
uniform vec2 uWind;
uniform float uAmount;
attribute vec4 aRand;
${OCCLUDER_GLSL}
vec3 wrapAround(vec2 seedXZ) {
  vec2 xz = uCam.xz + (fract(seedXZ - uCam.xz / uArea) - 0.5) * uArea;
  return vec3(xz.x, 0.0, xz.y);
}
`;

const RAIN_VERT = /* glsl */ `
${COMMON}
uniform float uSpeed;
varying vec2 vUv;
varying float vFade;
void main() {
  vUv = uv;
  float speed = uSpeed * (0.85 + 0.3 * aRand.w);
  vec3 p = wrapAround(aRand.xz);
  float y = fract(aRand.y - uTime * speed / uHeight);
  p.y = uCam.y - uHeight * 0.3 + y * uHeight;
  vec3 dir = normalize(vec3(uWind.x, -speed, uWind.y));
  vec3 view = normalize(p - cameraPosition);
  vec3 side = normalize(cross(dir, view));
  float len = 0.55 + aRand.w * 0.3;
  vec3 wp = p + side * position.x * 0.018 + dir * position.y * len;
  float hidden = step(aRand.w, 1.0 - uAmount) + step(wp.y, occHeight(wp.xz));
  vFade = (1.0 - smoothstep(uArea * 0.35, uArea * 0.5, length(p.xz - uCam.xz)));
  gl_Position = hidden > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vFade;
void main() {
  float a = (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  gl_FragColor = vec4(uColor, a * 0.55 * vFade);
  #include <colorspace_fragment>
}`;

const SPLASH_VERT = /* glsl */ `
${COMMON}
varying vec2 vUv;
varying float vLife;
void main() {
  vUv = uv - 0.5;
  float rate = 2.2 + aRand.w * 1.5;
  float cyc = uTime * rate + aRand.w * 17.0;
  float n = floor(cyc);
  vLife = fract(cyc);
  vec2 seed = fract(aRand.xz + vec2(n * 0.618034, n * 0.414214));
  vec3 p = wrapAround(seed);
  float gh = occHeight(p.xz);
  float size = 0.06 + vLife * 0.16;
  vec3 wp = vec3(p.x + position.x * size, gh + 0.015, p.z - position.y * size);
  float hidden = step(aRand.y, 1.0 - uAmount) + step(gh, -1e4) + step(uArea * 0.22, length(p.xz - uCam.xz));
  gl_Position = hidden > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const SPLASH_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vLife;
void main() {
  float r = length(vUv) * 2.0;
  float ring = smoothstep(0.65, 0.85, r) * smoothstep(1.0, 0.88, r);
  float a = ring * (1.0 - vLife) * 0.45;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

const SNOW_VERT = /* glsl */ `
${COMMON}
uniform float uSpeed;
varying vec2 vUv;
varying float vFade;
void main() {
  vUv = uv - 0.5;
  float speed = uSpeed * (0.6 + 0.8 * aRand.w);
  vec3 p = wrapAround(aRand.xz);
  float y = fract(aRand.y - uTime * speed / uHeight);
  p.y = uCam.y - uHeight * 0.3 + y * uHeight;
  float t = uTime * (0.6 + aRand.w) + aRand.x * 30.0;
  p.x += sin(t) * 0.35 + uWind.x * y * 2.0;
  p.z += cos(t * 0.8) * 0.35 + uWind.y * y * 2.0;
  float size = 0.025 + aRand.w * 0.03;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = p + (right * position.x + up * position.y) * size;
  float hidden = step(aRand.w, 1.0 - uAmount) + step(wp.y, occHeight(wp.xz));
  vFade = 1.0 - smoothstep(uArea * 0.3, uArea * 0.5, length(p.xz - uCam.xz));
  gl_Position = hidden > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const SNOW_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vFade;
void main() {
  float a = smoothstep(0.5, 0.1, length(vUv)) * 0.85 * vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

function instanced(count, width, height) {
  const base = new THREE.PlaneGeometry(width, height);
  base.translate(0, height / 2 - (width === height ? height / 2 : 0), 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  const r = new Float32Array(count * 4);
  for (let i = 0; i < r.length; i++) r[i] = Math.random();
  g.setAttribute('aRand', new THREE.InstancedBufferAttribute(r, 4));
  g.instanceCount = count;
  return g;
}

export class WeatherParticles {
  /**
   * @param {THREE.Scene} scene
   * @param {ReturnType<import('./PrecipitationOccluder.js').createOccluderUniforms>} occ
   * @param {{rain:number, splashes:number, snow:number, area:number, height:number}} o
   * @param {{value:number}} timeUniform
   */
  constructor(scene, occ, o, timeUniform) {
    this.shared = {
      ...occ,
      uTime: timeUniform,
      uCam: { value: new THREE.Vector3() },
      uArea: { value: o.area },
      uHeight: { value: o.height },
      uWind: { value: new THREE.Vector2() },
    };
    const make = (vert, frag, count, w, h, extra, blending = THREE.NormalBlending) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...this.shared, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0xaab4c0) }, ...extra },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending,
      });
      const mesh = new THREE.Mesh(instanced(count, w, h), mat);
      mesh.frustumCulled = false;
      mesh.layers.set(FX_LAYER);
      mesh.renderOrder = 6;
      scene.add(mesh);
      return mesh;
    };
    this.rain = make(RAIN_VERT, RAIN_FRAG, Math.max(1, o.rain), 1, 1, { uSpeed: { value: 11 } });
    this.splash = make(SPLASH_VERT, SPLASH_FRAG, Math.max(1, o.splashes), 1, 1, {});
    this.snow = make(SNOW_VERT, SNOW_FRAG, Math.max(1, o.snow), 1, 1, { uSpeed: { value: 1.1 } });
    this.snow.material.uniforms.uColor.value.set(0xf2f6ff);
  }

  /**
   * @param {THREE.Vector3} cam
   * @param {{rain:number, snow:number, wind:THREE.Vector2, light:THREE.Color}} s
   */
  update(cam, s) {
    this.shared.uCam.value.copy(cam);
    this.shared.uWind.value.copy(s.wind);
    this.rain.material.uniforms.uAmount.value = s.rain;
    this.splash.material.uniforms.uAmount.value = s.rain;
    this.snow.material.uniforms.uAmount.value = s.snow;
    this.rain.visible = this.splash.visible = s.rain > 0.01;
    this.snow.visible = s.snow > 0.01;
    // Precipitation takes the ambient light colour (dark at night).
    this.rain.material.uniforms.uColor.value.copy(s.light).multiplyScalar(0.9);
    this.splash.material.uniforms.uColor.value.copy(s.light);
    this.snow.material.uniforms.uColor.value.copy(s.light).lerp(new THREE.Color(1, 1, 1), 0.2);
  }

  dispose() {
    for (const m of [this.rain, this.splash, this.snow]) {
      m.geometry.dispose();
      m.material.dispose();
      m.removeFromParent();
    }
  }
}
