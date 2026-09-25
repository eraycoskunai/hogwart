/**
 * @file FlameSprites — every candle / torch / brazier flame in one draw
 * call: instanced camera-facing (cylindrical) quads sampling the procedural
 * flame texture, with per-instance flicker, sway and heat distortion.
 * Instances can be linked to LightManager sources so the flame brightness
 * follows the light's flicker.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aOffset;
attribute vec3 aSize; // width, height, brightness
attribute float aSeed;
uniform float uTime;
varying vec2 vUv;
varying float vBright;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vBright = aSize.z;
  vec3 camRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  float stretch = 0.9 + 0.12 * sin(uTime * 13.0 + aSeed) + 0.06 * sin(uTime * 29.0 + aSeed * 2.0);
  float sway = (sin(uTime * 3.1 + aSeed) * 0.5 + sin(uTime * 7.7 + aSeed * 1.3) * 0.3) * 0.08 * position.y;
  vec3 p = aOffset + camRight * ((position.x + sway) * aSize.x) + vec3(0.0, position.y * aSize.y * stretch, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
varying float vBright;
varying float vSeed;
void main() {
  vec2 uv = vUv;
  uv.x += (sin(uv.y * 10.0 - uTime * 8.0 + vSeed) * 0.5 + sin(uv.y * 23.0 - uTime * 15.0 + vSeed * 2.0) * 0.25) * 0.05 * uv.y;
  vec4 t = texture2D(map, uv);
  vec3 col = t.rgb * uIntensity * vBright;
  gl_FragColor = vec4(col * t.a, t.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class FlameSprites {
  /**
   * @param {THREE.Texture} flameTexture albedo of the 'candleFlame' material (with alpha)
   * @param {number} capacity
   * @param {{value:number}} timeUniform shared time
   */
  constructor(flameTexture, capacity, timeUniform) {
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.offsets = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity * 3);
    this.seeds = new Float32Array(capacity);
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(this.offsets, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(this.sizes, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(this.seeds, 1));
    geo.instanceCount = 0;
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: flameTexture }, uTime: timeUniform, uIntensity: { value: 2.2 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'FlameSprites';
    this.capacity = capacity;
    this.count = 0;
    /** @type {(import('./LightManager.js').LightSource|null)[]} */
    this.links = [];
    this._base = [];
  }

  /**
   * @param {THREE.Vector3|number[]} position flame base
   * @param {{width?:number, height?:number, brightness?:number, source?:import('./LightManager.js').LightSource}} [o]
   * @returns {number} instance index
   */
  add(position, o = {}) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    const p = Array.isArray(position) ? position : position.toArray();
    this.offsets.set(p, i * 3);
    this.sizes[i * 3] = o.width ?? 0.08;
    this.sizes[i * 3 + 1] = o.height ?? 0.18;
    this.sizes[i * 3 + 2] = o.brightness ?? 1;
    this._base[i] = o.brightness ?? 1;
    this.seeds[i] = Math.random() * 100;
    this.links[i] = o.source ?? null;
    this.geometry.instanceCount = this.count;
    this.geometry.attributes.aOffset.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aSeed.needsUpdate = true;
    return i;
  }

  /** Remove every flame (region unload). */
  clear() {
    this.count = 0;
    this.links.length = 0;
    this._base.length = 0;
    this.geometry.instanceCount = 0;
  }

  /** Move a flame (floating candles). */
  setPosition(i, x, y, z) {
    this.offsets[i * 3] = x;
    this.offsets[i * 3 + 1] = y;
    this.offsets[i * 3 + 2] = z;
    this.geometry.attributes.aOffset.needsUpdate = true;
  }

  /** Sync brightness with linked light sources. */
  update() {
    let dirty = false;
    for (let i = 0; i < this.count; i++) {
      const s = this.links[i];
      if (!s) continue;
      this.sizes[i * 3 + 2] = this._base[i] * (0.75 + 0.25 * s.level) * (s.enabled ? 1 : 0);
      dirty = true;
    }
    if (dirty) this.geometry.attributes.aSize.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
