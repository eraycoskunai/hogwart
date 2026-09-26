/**
 * @file BroomKit — procedural brooms and flying figures: a tapered, gently
 * curved handle with footrests and binding rings, a fanned bundle of twigs
 * (each a thin bent prism with its own tint), the Quidditch balls, and a
 * light low-poly rider used for AI players and race ghosts.
 *
 * Every builder returns meshes in its own group plus a dispose(); materials
 * are plain PBR (no textures) so dozens of flyers stay cheap.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from '../characters/Appearance.js';

const _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Add a per-vertex colour attribute of one colour. */
function tint(geo, color) {
  _c.set(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([_c.r, _c.g, _c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/**
 * Broom geometry along -Z (tip at -length·0.62, tail at +length·0.38), handle
 * axis at y = 0.
 * @param {{handle:string, bristles:string, binding:string, length:number, curve:number, fan:number, twigs:number}} spec
 * @param {number} [seed]
 * @returns {{group:THREE.Group, dispose:()=>void}}
 */
export function buildBroom(spec, seed = 1) {
  const rnd = mulberry(seed);
  const L = spec.length;
  const front = -L * 0.62;
  const back = L * 0.2;
  // Handle: tube along a slightly bowed curve, thicker at the tail.
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const z = THREE.MathUtils.lerp(front, back, t);
    pts.push(new THREE.Vector3(0, Math.sin(t * Math.PI) * spec.curve + (t < 0.08 ? (0.08 - t) * 0.5 : 0), z));
  }
  const path = new THREE.CatmullRomCurve3(pts);
  const handle = new THREE.TubeGeometry(path, 24, 0.024, 8, false);
  // Taper: scale radius by position along the handle.
  const pos = handle.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = (z - front) / (back - front);
    const k = 0.75 + t * 0.4;
    const c = path.getPointAt(THREE.MathUtils.clamp(t, 0, 1), _p);
    pos.setX(i, c.x + (pos.getX(i) - c.x) * k);
    pos.setY(i, c.y + (pos.getY(i) - c.y) * k);
  }
  handle.computeVertexNormals();
  tint(handle, spec.handle);
  // Knob at the tip.
  const knob = tint(new THREE.SphereGeometry(0.03, 10, 8).translate(0, 0.04, front), spec.handle);

  // Binding rings where the twigs are tied.
  const metal = [];
  for (const z of [back - 0.02, back + 0.07]) metal.push(new THREE.TorusGeometry(0.052, 0.009, 6, 18).translate(0, 0, z));
  // Footrests (a bent bar under the tail).
  const rest = new THREE.TorusGeometry(0.12, 0.008, 5, 12, Math.PI);
  rest.rotateX(Math.PI / 2);
  rest.rotateY(Math.PI / 2);
  rest.translate(0, -0.12, back - 0.12);
  metal.push(rest);
  for (const s of [-1, 1]) metal.push(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 5).translate(s * 0.05, -0.06, back - 0.12));
  const metalGeo = mergeGeometries(metal.map((g) => tint(g.toNonIndexed(), spec.binding)));
  metal.forEach((g) => g.dispose());

  // Twigs: thin 3-sided prisms fanning out behind the binding.
  const twigs = [];
  const base = new THREE.CylinderGeometry(0.0035, 0.006, 1, 3, 2);
  base.translate(0, 0.5, 0);
  base.rotateX(Math.PI / 2); // along +Z
  const col = new THREE.Color(spec.bristles);
  const tailLen = L * 0.42;
  for (let i = 0; i < spec.twigs; i++) {
    const g = base.clone();
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd());
    const spread = spec.fan * (0.4 + r * 0.9);
    const len = tailLen * (0.75 + rnd() * 0.35);
    // Bend outward along the length.
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const z = p.getZ(k);
      const t = z;
      p.setX(k, p.getX(k) + Math.cos(a) * spread * t * t * 1.2 + Math.cos(a) * r * 0.035);
      p.setY(k, p.getY(k) + Math.sin(a) * spread * t * t * 0.9 + Math.sin(a) * r * 0.035 - t * t * 0.05);
      p.setZ(k, z * len);
    }
    g.translate(0, 0, back - 0.03);
    g.computeVertexNormals();
    const shade = 0.75 + rnd() * 0.45;
    tint(g, _c.copy(col).multiplyScalar(shade).getHex());
    twigs.push(g.toNonIndexed());
    g.dispose();
  }
  base.dispose();
  const twigGeo = mergeGeometries(twigs);
  twigs.forEach((g) => g.dispose());

  const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  const straw = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const brass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.85 });
  const woodGeo = mergeGeometries([handle.toNonIndexed(), knob.toNonIndexed()]);
  handle.dispose();
  knob.dispose();
  const group = new THREE.Group();
  group.name = 'Süpürge';
  for (const [g, m] of [[woodGeo, wood], [twigGeo, straw], [metalGeo, brass]]) {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return {
    group,
    dispose() {
      for (const g of [woodGeo, twigGeo, metalGeo]) g.dispose();
      wood.dispose();
      straw.dispose();
      brass.dispose();
      group.removeFromParent();
    },
  };
}

/**
 * Shared resources for many simple flyers (AI players, ghosts).
 */
export class FlyerKit {
  constructor() {
    this.geos = [];
    this.mats = new Map();
    const keep = (g) => (this.geos.push(g), g);
    // Low-poly seated rider, facing -Z, seat at y = 0.
    const parts = [];
    parts.push(new THREE.CapsuleGeometry(0.17, 0.42, 3, 8).rotateX(-0.55).translate(0, 0.34, 0.05)); // torso
    parts.push(new THREE.SphereGeometry(0.12, 10, 8).translate(0, 0.72, -0.16)); // head
    for (const s of [-1, 1]) {
      parts.push(new THREE.CapsuleGeometry(0.06, 0.34, 2, 6).rotateX(1.25).translate(s * 0.12, 0.02, -0.12)); // thigh
      parts.push(new THREE.CapsuleGeometry(0.05, 0.32, 2, 6).rotateX(0.2).translate(s * 0.14, -0.2, -0.3)); // shin
      parts.push(new THREE.CapsuleGeometry(0.045, 0.4, 2, 6).rotateX(1.2).translate(s * 0.15, 0.38, -0.26)); // arm
    }
    this.body = keep(mergeGeometries(parts.map((g) => g.toNonIndexed())));
    parts.forEach((g) => g.dispose());
    // Robe tail flapping behind.
    this.cape = keep(new THREE.PlaneGeometry(0.46, 0.7, 1, 3).translate(0, -0.35, 0).rotateX(-1.2).translate(0, 0.5, 0.28));
    this.ball = keep(new THREE.SphereGeometry(1, 16, 12));
    this.wing = keep(new THREE.PlaneGeometry(1, 0.45).translate(0.5, 0, 0));
    this.broomSpec = null;
  }

  /** Cached material by key. */
  mat(key, make) {
    let m = this.mats.get(key);
    if (!m) {
      m = make();
      this.mats.set(key, m);
    }
    return m;
  }

  /**
   * A rider on a simple broom.
   * @param {{robe:string, trim:string, skin:string}} c
   * @param {THREE.BufferGeometry} broomGeo shared broom geometry (single mesh)
   */
  rider(c, broomGeo) {
    const g = new THREE.Group();
    const robe = this.mat(`robe:${c.robe}`, () => new THREE.MeshStandardMaterial({ color: c.robe, roughness: 0.85 }));
    const trim = this.mat(`trim:${c.trim}`, () => new THREE.MeshStandardMaterial({ color: c.trim, roughness: 0.7, side: THREE.DoubleSide }));
    const broom = this.mat('broom', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    const body = new THREE.Mesh(this.body, robe);
    body.position.y = 0.06;
    const cape = new THREE.Mesh(this.cape, trim);
    const b = new THREE.Mesh(broomGeo, broom);
    for (const m of [body, cape, b]) {
      m.castShadow = true;
      g.add(m);
    }
    g.userData.cape = cape;
    return g;
  }

  /**
   * Single-mesh broom (for flyers): merged handle + twigs with vertex colours.
   * @param {any} spec BROOMS entry
   */
  broomGeometry(spec) {
    const b = buildBroom({ ...spec, twigs: 26 }, 7);
    const geos = b.group.children.map((m) => m.geometry.clone());
    b.dispose();
    const g = mergeGeometries(geos);
    geos.forEach((x) => x.dispose());
    this.geos.push(g);
    return g;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.geos.length = 0;
    this.mats.clear();
  }
}
