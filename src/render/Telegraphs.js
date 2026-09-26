/**
 * @file Telegraphs — ground warnings for enemy attacks: circles (slams,
 * venom rain), cones (bites, sweeps) and lanes (charges). Each warning
 * fills up while the attack winds up, then flashes as it lands, so the
 * player can read and dodge every big hit.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uFill;
uniform float uFlash;
uniform float uShape;   // 0 circle, 1 cone, 2 lane
uniform float uHalfAngle;
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float inside;
  float prog;
  if (uShape < 0.5) {
    inside = step(r, 1.0);
    prog = r;
  } else if (uShape < 1.5) {
    float ang = abs(atan(vUv.x, vUv.y));
    inside = step(r, 1.0) * step(ang, uHalfAngle);
    prog = r;
  } else {
    inside = step(abs(vUv.x), 1.0) * step(abs(vUv.y), 1.0);
    prog = vUv.y * 0.5 + 0.5;
  }
  if (inside < 0.5) discard;
  float edge = uShape < 1.5 ? smoothstep(0.9, 1.0, r) : smoothstep(0.85, 1.0, abs(vUv.x));
  float fill = step(prog, uFill) * 0.45;
  float stripes = 0.12 * step(0.5, fract((vUv.x + vUv.y) * 4.0 - uTime * 1.5));
  float a = (0.12 + stripes + fill + edge * 0.8) * (1.0 - uFlash) + uFlash;
  gl_FragColor = vec4(uColor * a, a * 0.85);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SHAPES = Object.freeze({ circle: 0, cone: 1, lane: 2 });

export class Telegraphs {
  /**
   * @param {THREE.Object3D} root
   * @param {{value:number}} time
   */
  constructor(root, time) {
    this.root = root;
    this.time = time;
    this.geo = new THREE.PlaneGeometry(2, 2);
    this.geo.rotateX(-Math.PI / 2);
    this.active = [];
  }

  /**
   * Show a warning.
   * @param {'circle'|'cone'|'lane'} shape
   * @param {THREE.Vector3} pos centre (circle) / apex (cone) / start (lane)
   * @param {{radius?:number, angle?:number, yaw?:number, length?:number, width?:number, windup:number, color?:number}} o
   * @returns {object} handle (cancel() to remove early)
   */
  show(shape, pos, o) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(o.color ?? 0xff3a1a) },
        uFill: { value: 0 },
        uFlash: { value: 0 },
        uShape: { value: SHAPES[shape] },
        uHalfAngle: { value: ((o.angle ?? 90) * Math.PI) / 360 },
        uTime: this.time,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      fog: false,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.renderOrder = 3;
    const yaw = o.yaw ?? 0;
    if (shape === 'lane') {
      const L = o.length;
      const W = o.width;
      m.scale.set(W / 2, 1, L / 2);
      m.position.copy(pos).add(new THREE.Vector3(-Math.sin(yaw) * L / 2, 0.06, -Math.cos(yaw) * L / 2));
      m.rotation.y = yaw;
    } else {
      m.scale.set(o.radius, 1, o.radius);
      m.position.copy(pos).setY(pos.y + 0.06);
      m.rotation.y = yaw;
    }
    this.root.add(m);
    const t = { mesh: m, mat, windup: o.windup, t: 0, flash: 0, done: false };
    t.cancel = () => (t.done = true);
    this.active.push(t);
    return t;
  }

  /** @param {number} dt */
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i];
      t.t += dt;
      const u = t.mat.uniforms;
      if (t.t < t.windup) u.uFill.value = t.t / t.windup;
      else {
        t.flash += dt * 5;
        u.uFill.value = 1;
        u.uFlash.value = Math.max(0, 1 - t.flash);
        if (t.flash >= 1) t.done = true;
      }
      if (t.done) {
        t.mesh.removeFromParent();
        t.mat.dispose();
        this.active.splice(i, 1);
      }
    }
  }

  clear() {
    for (const t of this.active) {
      t.mesh.removeFromParent();
      t.mat.dispose();
    }
    this.active.length = 0;
  }

  dispose() {
    this.clear();
    this.geo.dispose();
  }
}
