/**
 * @file Sky — gradient sky dome with a soft sun disc. Phase 3 replaces the
 * shader with a full atmospheric model; the interface (setSunDirection,
 * update) stays the same.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, uBottom, smoothstep(0.0, -0.25, h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.25);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  /**
   * @param {{top:number, horizon:number, bottom:number, sunColor:number}} colors
   */
  constructor(colors) {
    this.uniforms = {
      uTop: { value: new THREE.Color(colors.top) },
      uHorizon: { value: new THREE.Color(colors.horizon) },
      uBottom: { value: new THREE.Color(colors.bottom) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
      uSunColor: { value: new THREE.Color(colors.sunColor) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'Sky';
  }

  /** @param {THREE.Vector3} dir direction toward the sun */
  setSunDirection(dir) {
    this.uniforms.uSunDir.value.copy(dir).normalize();
  }

  /** Keep the dome centred on the camera. @param {THREE.Camera} camera */
  update(camera) {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(camera.far * 0.9);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
