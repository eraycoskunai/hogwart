/**
 * @file TrailRibbons — camera-facing ribbon trails behind spell bolts. All
 * ribbons share one dynamic geometry (one draw call): each keeps a short
 * history of positions and is rebuilt every frame as a strip that tapers
 * and fades toward its tail. Released ribbons shrink away instead of
 * vanishing.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 aColor;
varying vec4 vColor;
varying float vEdge;
attribute float aEdge;
void main() {
  vColor = aColor;
  vEdge = aEdge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
varying float vEdge;
void main() {
  float soft = 1.0 - abs(vEdge);
  float a = vColor.a * soft * soft;
  gl_FragColor = vec4(vColor.rgb * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const _t = new THREE.Vector3();
const _side = new THREE.Vector3();
const _view = new THREE.Vector3();
const _c = new THREE.Color();

export class TrailRibbons {
  /**
   * @param {number} count ribbons in the pool
   * @param {number} points history length per ribbon
   */
  constructor(count, points) {
    this.count = count;
    this.points = points;
    const verts = count * points * 2;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 4);
    const edge = new Float32Array(verts);
    for (let i = 0; i < verts; i++) edge[i] = i % 2 ? 1 : -1;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
    const index = [];
    for (let r = 0; r < count; r++) {
      for (let i = 0; i < points - 1; i++) {
        const a = (r * points + i) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setIndex(index);
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'İz şeritleri';
    this.ribbons = Array.from({ length: count }, (_, i) => ({ id: i, active: false, fading: 0, hist: [], color: new THREE.Color(), width: 0.1 }));
  }

  /**
   * @param {THREE.ColorRepresentation} color
   * @param {number} width
   * @returns {object|null}
   */
  acquire(color, width) {
    const r = this.ribbons.find((x) => !x.active && x.fading <= 0);
    if (!r) return null;
    r.active = true;
    r.fading = 0;
    r.hist.length = 0;
    r.color.set(color);
    r.width = width;
    return r;
  }

  /** Append the ribbon's newest point. */
  push(r, p) {
    if (!r) return;
    r.hist.unshift(p.clone());
    if (r.hist.length > this.points) r.hist.pop();
  }

  /** Let the ribbon fade out. */
  release(r) {
    if (!r || !r.active) return;
    r.active = false;
    r.fading = 1;
  }

  /**
   * Rebuild all strips.
   * @param {number} dt
   * @param {THREE.Camera} camera
   */
  update(dt, camera) {
    const P = this.points;
    for (const r of this.ribbons) {
      const base = r.id * P * 2;
      if (!r.active && r.fading > 0) {
        r.fading -= dt * 3.5;
        if (r.hist.length > 1) r.hist.pop();
      }
      const alive = r.active || r.fading > 0;
      const n = r.hist.length;
      for (let i = 0; i < P; i++) {
        const v = (base + i * 2) * 3;
        const c = (base + i * 2) * 4;
        if (!alive || n < 2) {
          this.col[c + 3] = this.col[c + 7] = 0;
          continue;
        }
        const k = Math.min(i, n - 1);
        const p = r.hist[k];
        const q = r.hist[Math.min(k + 1, n - 1)];
        const o = r.hist[Math.max(k - 1, 0)];
        _t.subVectors(o, q);
        if (_t.lengthSq() < 1e-8) _t.set(0, 0, 1);
        _view.subVectors(camera.position, p);
        _side.crossVectors(_t, _view).normalize();
        const f = 1 - k / (P - 1);
        const w = r.width * (0.25 + 0.75 * f);
        this.pos[v] = p.x + _side.x * w;
        this.pos[v + 1] = p.y + _side.y * w;
        this.pos[v + 2] = p.z + _side.z * w;
        this.pos[v + 3] = p.x - _side.x * w;
        this.pos[v + 4] = p.y - _side.y * w;
        this.pos[v + 5] = p.z - _side.z * w;
        const a = f * f * (r.active ? 1 : Math.max(0, r.fading)) * (i < n ? 1 : 0);
        _c.copy(r.color);
        for (const off of [0, 4]) {
          this.col[c + off] = _c.r;
          this.col[c + off + 1] = _c.g;
          this.col[c + off + 2] = _c.b;
          this.col[c + off + 3] = a;
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
  }

  clear() {
    for (const r of this.ribbons) {
      r.active = false;
      r.fading = 0;
      r.hist.length = 0;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
