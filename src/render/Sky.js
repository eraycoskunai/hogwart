/**
 * @file Sky — sky dome around the camera plus the enchanted-ceiling
 * material (the Great Hall ceiling shows the same sky). Both read the
 * shared uniforms updated from the clock and weather each frame.
 */
import * as THREE from 'three';
import { SKY_GLSL, createSkyUniforms } from './SkyShader.js';

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always on the far plane
}`;

const DOME_FRAG = /* glsl */ `
${SKY_GLSL}
varying vec3 vDir;
void main() {
  gl_FragColor = vec4(skyRadiance(normalize(vDir)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const CEILING_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const CEILING_FRAG = /* glsl */ `
${SKY_GLSL}
uniform vec3 uCeilingCenter;
uniform float uDomeHeight;
uniform float uCeilingBrightness;
varying vec3 vWorld;
void main() {
  // Map the flat ceiling onto a hemisphere: the centre looks at the zenith.
  vec3 d = normalize(vec3(vWorld.x - uCeilingCenter.x, uDomeHeight, vWorld.z - uCeilingCenter.z));
  vec3 c = skyRadiance(d) * uCeilingBrightness;
  // Soft magical haze toward the walls.
  float r = length(vWorld.xz - uCeilingCenter.xz) / (uDomeHeight * 2.5);
  c = mix(c, c * vec3(0.9, 0.85, 1.0), smoothstep(0.4, 1.0, r) * 0.4);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  /** @param {ReturnType<typeof createSkyUniforms>} [uniforms] shared uniforms */
  constructor(uniforms = createSkyUniforms()) {
    this.uniforms = uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'Sky';
    this._ceilings = [];
  }

  /**
   * Material for an enchanted ceiling showing this sky.
   * @param {THREE.Vector3} center ceiling centre (world)
   * @param {number} domeHeight virtual dome height controlling the projection
   */
  createCeilingMaterial(center, domeHeight) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.uniforms,
        uCeilingCenter: { value: center.clone() },
        uDomeHeight: { value: domeHeight },
        uCeilingBrightness: { value: 1.15 },
      },
      vertexShader: CEILING_VERT,
      fragmentShader: CEILING_FRAG,
      side: THREE.DoubleSide,
      fog: false,
    });
    this._ceilings.push(mat);
    return mat;
  }

  /** Keep the dome centred on the camera. @param {THREE.Camera} camera */
  update(camera) {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(camera.far * 0.9);
  }

  /**
   * Push time/weather state into the uniforms.
   * @param {{sun:THREE.Vector3, moon:THREE.Vector3, moonPhase:number, time:number, starRotation:number,
   *          cloudCover:number, cloudOffset:THREE.Vector2, lightning:number, fogColor:THREE.Color, horizonFog:number}} s
   */
  setState(s) {
    const u = this.uniforms;
    u.uSunDir.value.copy(s.sun);
    u.uMoonDir.value.copy(s.moon);
    u.uMoonPhase.value = s.moonPhase;
    u.uTime.value = s.time;
    u.uStarRotation.value = s.starRotation;
    u.uCloudCover.value = s.cloudCover;
    u.uCloudOffset.value.copy(s.cloudOffset);
    u.uLightning.value = s.lightning;
    u.uFogColor.value.copy(s.fogColor);
    u.uHorizonFog.value = s.horizonFog;
  }

  /** @param {THREE.Vector3} dir */
  setSunDirection(dir) {
    this.uniforms.uSunDir.value.copy(dir).normalize();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    for (const m of this._ceilings) m.dispose();
  }
}

