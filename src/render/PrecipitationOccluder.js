/**
 * @file PrecipitationOccluder — top-down orthographic depth map around the
 * camera. Tells rain, snow, splashes and surface wetness where the sky is
 * blocked (roofs, bridges, tunnels), and where the topmost surface is.
 * Shared GLSL helper `occHeight(xz)` / `occSheltered(worldPos)`.
 */
import * as THREE from 'three';

/** Layer used by effects that must not appear in the occluder map. */
export const FX_LAYER = 1;

export const OCCLUDER_GLSL = /* glsl */ `
uniform sampler2D uOccDepth;
uniform vec2 uOccCenter;
uniform float uOccArea;
uniform float uOccTop;
uniform float uOccNear;
uniform float uOccRange;
uniform float uOccEnabled;
float occHeight(vec2 xz) {
  vec2 uv = vec2((xz.x - uOccCenter.x) / uOccArea + 0.5, -(xz.y - uOccCenter.y) / uOccArea + 0.5);
  if (uOccEnabled < 0.5 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return -1e5;
  float d = texture2D(uOccDepth, uv).r;
  return uOccTop - (uOccNear + d * uOccRange);
}
float occSheltered(vec3 wp) {
  return smoothstep(0.15, 0.5, occHeight(wp.xz) - wp.y);
}
`;

/** Uniform set used by OCCLUDER_GLSL (share the same objects everywhere). */
export function createOccluderUniforms() {
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  blank.needsUpdate = true;
  return {
    uOccDepth: { value: blank },
    uOccCenter: { value: new THREE.Vector2() },
    uOccArea: { value: 1 },
    uOccTop: { value: 0 },
    uOccNear: { value: 0.1 },
    uOccRange: { value: 1 },
    uOccEnabled: { value: 0 },
  };
}

export class PrecipitationOccluder {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {ReturnType<typeof createOccluderUniforms>} uniforms
   * @param {{size:number, area:number, height:number, interval:number}} o
   */
  constructor(renderer, uniforms, o) {
    this.renderer = renderer;
    this.u = uniforms;
    this.o = o;
    this.target = new THREE.WebGLRenderTarget(o.size, o.size, {
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(o.size, o.size),
    });
    this.target.depthTexture.type = THREE.UnsignedIntType;
    const h = o.area / 2;
    this.camera = new THREE.OrthographicCamera(-h, h, h, -h, 0.1, o.height * 2);
    this.camera.up.set(0, 0, -1);
    this.camera.layers.set(0);
    this.material = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    this.timer = 0;
    this._last = new THREE.Vector3(1e9, 0, 0);
  }

  /**
   * Re-render when due or when the camera moved far.
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} center
   * @param {number} dt
   */
  update(scene, center, dt) {
    this.timer -= dt;
    const moved = Math.hypot(center.x - this._last.x, center.z - this._last.z) > this.o.area / 8;
    if (this.timer > 0 && !moved) return;
    this.timer = this.o.interval;
    const texel = this.o.area / this.o.size;
    const cx = Math.round(center.x / texel) * texel;
    const cz = Math.round(center.z / texel) * texel;
    const top = center.y + this.o.height;
    this.camera.position.set(cx, top, cz);
    this.camera.lookAt(cx, top - 1, cz);
    this.camera.updateMatrixWorld();

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevFog = scene.fog;
    scene.overrideMaterial = this.material;
    scene.background = null;
    scene.fog = null;
    const prevAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.target);
    r.clear(true, true, false);
    r.render(scene, this.camera);
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = prevAuto;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    scene.fog = prevFog;

    const u = this.u;
    u.uOccDepth.value = this.target.depthTexture;
    u.uOccCenter.value.set(cx, cz);
    u.uOccArea.value = this.o.area;
    u.uOccTop.value = top;
    u.uOccNear.value = this.camera.near;
    u.uOccRange.value = this.camera.far - this.camera.near;
    u.uOccEnabled.value = 1;
    this._last.set(center.x, center.y, center.z);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
