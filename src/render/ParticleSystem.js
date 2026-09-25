/**
 * @file ParticleSystem — GPU particles. Each particle is written once into a
 * ring buffer (start position, velocity, birth time, life, sizes, colours,
 * gravity / drag / spin / shape); the vertex shader integrates the motion
 * and fades it, so thousands of sparks cost one draw call and no per-frame
 * CPU work. Two instances are used: additive (fire, sparks, magic glow) and
 * alpha-blended (smoke, dust, debris).
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aVel;
attribute vec4 aTime;    // birth, life, spin, shape
attribute vec4 aSize;    // start size, end size, gravity, drag
attribute vec4 aColorA;  // start rgb + alpha
attribute vec4 aColorB;  // end rgb + alpha
uniform float uTime;
varying vec4 vColor;
varying vec2 vUv;
varying float vShape;
varying float vAge;
void main() {
  float t = uTime - aTime.x;
  float life = aTime.y;
  if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float k = t / life;
  float drag = aSize.w;
  float fall = drag > 0.001 ? (1.0 - exp(-drag * t)) / drag : t;
  vec3 p = aStart + aVel * fall;
  p.y -= 0.5 * aSize.z * t * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = mix(aSize.x, aSize.y, k);
  float a = aTime.z * t;
  vec2 c = position.xy;
  c = vec2(c.x * cos(a) - c.y * sin(a), c.x * sin(a) + c.y * cos(a));
  mv.xy += c * size;
  gl_Position = projectionMatrix * mv;
  vColor = mix(aColorA, aColorB, k);
  // Fade in quickly, out smoothly.
  vColor.a *= smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.6, 1.0, k));
  vUv = position.xy + 0.5;
  vShape = aTime.w;
  vAge = k;
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
varying vec2 vUv;
varying float vShape;
varying float vAge;
uniform float uAdditive;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d) * 2.0;
  float a;
  if (vShape < 0.5) {
    // Glow: bright core, soft halo.
    a = exp(-r * r * 4.0) + 0.35 * exp(-r * r * 1.2);
  } else if (vShape < 1.5) {
    // Spark: small hard core.
    a = smoothstep(1.0, 0.2, r) * smoothstep(1.0, 0.0, r);
    a = a * a;
  } else if (vShape < 2.5) {
    // Smoke puff: lumpy disc.
    float n = hash(floor(vUv * 6.0)) * 0.25 + 0.75;
    a = smoothstep(1.0, 0.3, r) * n;
  } else {
    // Shard / chip: hard square.
    a = step(max(abs(d.x), abs(d.y)), 0.35);
  }
  if (a < 0.01) discard;
  vec4 col = vec4(vColor.rgb, vColor.a * a);
  if (uAdditive > 0.5) gl_FragColor = vec4(col.rgb * col.a, col.a);
  else gl_FragColor = col;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Shapes. */
export const SHAPE = Object.freeze({ glow: 0, spark: 1, smoke: 2, chip: 3 });

const _c = new THREE.Color();
const _c2 = new THREE.Color();

export class ParticleSystem {
  /**
   * @param {number} capacity
   * @param {{additive:boolean, time:{value:number}}} o
   */
  constructor(capacity, o) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    const attr = (name, n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.a = {
      start: attr('aStart', 3),
      vel: attr('aVel', 3),
      time: attr('aTime', 4),
      size: attr('aSize', 4),
      colorA: attr('aColorA', 4),
      colorB: attr('aColorB', 4),
    };
    // Unborn particles: birth far in the future.
    for (let i = 0; i < capacity; i++) this.a.time.array[i * 4] = 1e9;
    geo.instanceCount = capacity;
    this.geometry = geo;
    this.time = o.time;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: o.time, uAdditive: { value: o.additive ? 1 : 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.additive ? 6 : 4;
    this.mesh.name = o.additive ? 'Partiküller (parlak)' : 'Partiküller (duman)';
    this.capacity = capacity;
    this.next = 0;
    this._dirtyLo = Infinity;
    this._dirtyHi = -1;
    this._wrapped = false;
    this.emitted = 0;
  }

  /**
   * Spawn one particle.
   * @param {{x:number,y:number,z:number}} p
   * @param {{x:number,y:number,z:number}} v
   * @param {{life:number, size:number, endSize?:number, color:THREE.ColorRepresentation, endColor?:THREE.ColorRepresentation,
   *          alpha?:number, endAlpha?:number, gravity?:number, drag?:number, spin?:number, shape?:number, delay?:number}} o
   */
  spawn(p, v, o) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (this.next === 0) this._wrapped = true;
    const A = this.a;
    A.start.array.set([p.x, p.y, p.z], i * 3);
    A.vel.array.set([v.x, v.y, v.z], i * 3);
    A.time.array.set([this.time.value + (o.delay ?? 0), o.life, o.spin ?? 0, o.shape ?? 0], i * 4);
    A.size.array.set([o.size, o.endSize ?? o.size, o.gravity ?? 0, o.drag ?? 0], i * 4);
    _c.set(o.color);
    _c2.set(o.endColor ?? o.color);
    A.colorA.array.set([_c.r, _c.g, _c.b, o.alpha ?? 1], i * 4);
    A.colorB.array.set([_c2.r, _c2.g, _c2.b, o.endAlpha ?? o.alpha ?? 1], i * 4);
    this._dirtyLo = Math.min(this._dirtyLo, i);
    this._dirtyHi = Math.max(this._dirtyHi, i);
    this.emitted++;
  }

  /**
   * Spawn a burst with randomised directions.
   * @param {number} count
   * @param {THREE.Vector3} pos
   * @param {{speed:number|[number,number], spread?:number, dir?:THREE.Vector3, jitter?:number} & object} o
   */
  burst(count, pos, o) {
    const [s0, s1] = Array.isArray(o.speed) ? o.speed : [o.speed * 0.5, o.speed];
    const spread = o.spread ?? 1;
    for (let k = 0; k < count; k++) {
      let x = Math.random() * 2 - 1;
      let y = Math.random() * 2 - 1;
      let z = Math.random() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      x /= l;
      y /= l;
      z /= l;
      if (o.dir) {
        x = o.dir.x + x * spread;
        y = o.dir.y + y * spread;
        z = o.dir.z + z * spread;
        const m = Math.hypot(x, y, z) || 1;
        x /= m;
        y /= m;
        z /= m;
      }
      const s = s0 + Math.random() * (s1 - s0);
      const j = o.jitter ?? 0;
      this.spawn(
        { x: pos.x + (Math.random() - 0.5) * j, y: pos.y + (Math.random() - 0.5) * j, z: pos.z + (Math.random() - 0.5) * j },
        { x: x * s, y: y * s + (o.lift ?? 0), z: z * s },
        { ...o, life: o.life * (0.7 + Math.random() * 0.6), size: o.size * (0.7 + Math.random() * 0.6), spin: (Math.random() - 0.5) * (o.spin ?? 0) },
      );
    }
  }

  /** Upload the parts of the buffers written this frame. */
  update() {
    if (this._dirtyHi < 0) return;
    const lo = this._wrapped ? 0 : this._dirtyLo;
    const hi = this._wrapped ? this.capacity - 1 : this._dirtyHi;
    for (const a of Object.values(this.a)) {
      const n = a.itemSize;
      a.clearUpdateRanges?.();
      a.addUpdateRange(lo * n, (hi - lo + 1) * n);
      a.needsUpdate = true;
    }
    this._dirtyLo = Infinity;
    this._dirtyHi = -1;
    this._wrapped = false;
  }

  /** Kill everything (region change). */
  clear() {
    const t = this.a.time.array;
    for (let i = 0; i < this.capacity; i++) t[i * 4] = 1e9;
    this.a.time.clearUpdateRanges?.();
    this.a.time.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
