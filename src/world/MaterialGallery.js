/**
 * @file MaterialGallery — a studio scene that shows every procedural
 * material on a pedestal (balls for general surfaces, blocks for masonry
 * and floors, cards for decals/sprites, a pool for water, a ribbon for
 * spell trails). Orbit camera, click-to-focus, live weathering controls.
 * The stained-glass sample projects coloured light through a spotlight.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MATERIALS, parseMaterialKey } from '../data/materials.js';
import { GENERATORS } from '../procgen/textures/materials/index.js';
import { labelTexture } from '../procgen/textures/DevTextures.js';
import { createStudioEnvironment } from '../render/Environment.js';

export const GALLERY = Object.freeze({
  spacing: 3,
  rowSpacing: 5.2,
  pedestalHeight: 0.9,
  sampleY: 1.9,
  /** Camera offset from a focused sample (in front, slightly above). */
  focusOffset: [0.6, 0.7, 3.4],
  focusLerp: 5,
  spin: 0.15,
  fov: 45,
});

const BLOCK_CATEGORIES = new Set(['Taş']);
const BLOCK_KEYS = new Set(['woodParquet', 'grass', 'dirt', 'mud', 'carpet', 'cobblestone', 'flagstone']);
const CARD_KEYS = new Set(['tapestry', 'parchment', 'waxSeal', 'leaves', 'hair', 'magicInk', 'candleFlame', 'books', 'stainedGlass']);

/** Human-readable label for a catalogue key. */
export function materialLabel(key) {
  const { id, variant } = parseMaterialKey(key);
  const g = GENERATORS[id];
  return variant ? `${g?.label ?? id} · ${variant}` : g?.label ?? id;
}

export class MaterialGallery {
  /**
   * @param {{renderer:import('../render/Renderer.js').Renderer, library:import('../render/MaterialLibrary.js').MaterialLibrary,
   *          bus:import('../core/EventBus.js').EventBus}} o
   */
  constructor(o) {
    this.o = o;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.samples = [];
    this.selected = null;
    this._focusTarget = null;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._down = null;
    this.active = false;
    this._camGoal = new THREE.Vector3();
    this._focusOffset = new THREE.Vector3().fromArray(GALLERY.focusOffset);
  }

  /** Material keys grouped by category, in catalogue order. */
  static groups() {
    /** @type {Map<string, string[]>} */
    const groups = new Map();
    for (const key of Object.keys(MATERIALS)) {
      const cat = GENERATORS[parseMaterialKey(key).id]?.category ?? 'Diğer';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(key);
    }
    return groups;
  }

  /** Build the scene (materials must already be loaded). */
  open() {
    const R = this.o.renderer;
    this.active = true;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x15131a);
    this.env = createStudioEnvironment(R.renderer);
    scene.environment = this.env;
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(GALLERY.fov, R.aspect, 0.05, 400);
    this.controls = new OrbitControls(this.camera, R.canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 60;

    const key = new THREE.DirectionalLight(0xfff2e0, 2.2);
    key.position.set(8, 14, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -40;
    sc.right = sc.top = 40;
    sc.far = 80;
    key.shadow.bias = -0.0004;
    scene.add(key, key.target);
    this.keyLight = key;
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2420, 0.35));

    const lib = this.o.library;
    const groups = MaterialGallery.groups();
    const floorMat = lib.get('flagstone', { tile: 4 });
    this._borrowed = [floorMat];
    const floorSize = 120;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorSize, floorSize), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x2b2a2e, roughness: 0.6, metalness: 0.1 });
    const pedestalGeo = new THREE.CylinderGeometry(0.75, 0.85, GALLERY.pedestalHeight, 32);
    this._owned = [pedestalMat, pedestalGeo];

    let row = 0;
    let maxCols = 0;
    for (const keys of groups.values()) maxCols = Math.max(maxCols, keys.length);
    for (const [cat, keys] of groups) {
      const z = -row * GALLERY.rowSpacing;
      const x0 = -((keys.length - 1) * GALLERY.spacing) / 2;
      const catLabel = this._label(cat, 3.2, 0.7, true);
      catLabel.position.set(x0 - GALLERY.spacing * 1.1, 1.2, z);
      catLabel.rotation.y = 0.35;
      scene.add(catLabel);
      keys.forEach((k, i) => {
        const x = x0 + i * GALLERY.spacing;
        const ped = new THREE.Mesh(pedestalGeo, pedestalMat);
        ped.position.set(x, GALLERY.pedestalHeight / 2, z);
        ped.castShadow = ped.receiveShadow = true;
        scene.add(ped);
        const sample = this._makeSample(k, x, z);
        const label = this._label(materialLabel(k), 2.6, 0.45, false);
        label.position.set(x, 0.55, z + 0.9);
        label.rotation.x = -0.5;
        scene.add(label);
        this.samples.push({ key: k, object: sample, position: new THREE.Vector3(x, GALLERY.sampleY, z) });
      });
      row++;
    }
    const depth = (row - 1) * GALLERY.rowSpacing;
    this.camera.position.set(0, 9, 12);
    this.controls.target.set(0, 1.5, -depth / 2);
    this.controls.update();

    this._onPointerDown = (e) => {
      this._down = { x: e.clientX, y: e.clientY };
    };
    this._onPointerUp = (e) => {
      if (!this._down) return;
      const moved = Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y);
      this._down = null;
      if (moved < 5) this._pick(e);
    };
    R.canvas.addEventListener('pointerdown', this._onPointerDown);
    R.canvas.addEventListener('pointerup', this._onPointerUp);
    this._onResize = ({ width, height }) => {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    };
    this._unsubResize = this.o.bus.on('render:resize', this._onResize);
  }

  _label(text, w, h, big) {
    const tex = labelTexture(text, { bg: big ? 'rgba(90,20,24,0.85)' : 'rgba(20,18,26,0.8)', width: 1024, height: Math.round(1024 * (h / w)) });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    this._owned.push(tex, mat, mesh.geometry);
    return mesh;
  }

  _makeSample(key, x, z) {
    const lib = this.o.library;
    const d = MATERIALS[key];
    const { id } = parseMaterialKey(key);
    const cat = GENERATORS[id]?.category;
    const mat = lib.get(key);
    this._borrowed.push(mat);
    let geo;
    let obj;
    const y = GALLERY.sampleY;
    if (d.type === 'water') {
      geo = new THREE.CircleGeometry(0.72, 48);
      obj = new THREE.Mesh(geo, mat);
      obj.rotation.x = -Math.PI / 2;
      obj.position.set(x, GALLERY.pedestalHeight + 0.02, z);
    } else if (d.type === 'trail') {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.8, -0.3, 0), new THREE.Vector3(-0.3, 0.3, 0.2), new THREE.Vector3(0.3, -0.1, -0.2), new THREE.Vector3(0.8, 0.4, 0),
      ]);
      geo = ribbonGeometry(curve, 64, 0.22);
      obj = new THREE.Mesh(geo, mat);
      obj.position.set(x, y, z);
    } else if (d.type === 'flame') {
      geo = new THREE.PlaneGeometry(0.5, 1.0);
      obj = new THREE.Mesh(geo, mat);
      obj.position.set(x, y - 0.3, z);
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0xefe6cf, roughness: 0.6 }));
      candle.position.set(x, GALLERY.pedestalHeight + 0.3, z);
      candle.castShadow = true;
      this._owned.push(candle.geometry, candle.material);
      this.scene.add(candle);
      const light = new THREE.PointLight(0xffa04a, 3, 4, 2);
      light.position.set(x, y - 0.3, z + 0.2);
      this.scene.add(light);
      this.flameLight = light;
    } else if (d.type === 'ghost') {
      geo = new THREE.SphereGeometry(0.7, 48, 32);
      obj = new THREE.Mesh(geo, mat);
      obj.position.set(x, y, z);
    } else if (CARD_KEYS.has(id)) {
      geo = new THREE.PlaneGeometry(1.5, 1.5);
      obj = new THREE.Mesh(geo, mat);
      obj.position.set(x, y + 0.1, z);
      if (id === 'stainedGlass') this._addGlassProjector(obj, lib.textures.get(key).tex.emissive, x, z);
    } else if (BLOCK_CATEGORIES.has(cat) || BLOCK_KEYS.has(id)) {
      geo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
      obj = new THREE.Mesh(geo, mat);
      obj.position.set(x, y, z);
      obj.rotation.y = 0.5;
    } else {
      geo = new THREE.SphereGeometry(0.7, 64, 40);
      obj = new THREE.Mesh(geo, mat);
      obj.position.set(x, y, z);
    }
    obj.castShadow = d.type !== 'flame' && d.type !== 'ink' && d.type !== 'trail';
    obj.receiveShadow = true;
    obj.userData.galleryKey = key;
    this._owned.push(geo);
    this.scene.add(obj);
    return obj;
  }

  /** Spotlight behind the glass projects its colours onto the floor in front. */
  _addGlassProjector(glass, colourTex, x, z) {
    const spot = new THREE.SpotLight(0xffffff, 60, 12, 0.5, 0.3, 1.5);
    spot.position.set(x, GALLERY.sampleY + 1.6, z - 2.2);
    spot.target.position.set(x, 0, z + 2.6);
    spot.map = colourTex;
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512);
    this.scene.add(spot, spot.target);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    back.position.set(0, 0, -0.02);
    back.rotation.y = Math.PI;
    glass.add(back);
    this._owned.push(back.geometry, back.material);
  }

  _pick(e) {
    const rect = this.o.renderer.canvas.getBoundingClientRect();
    this._pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects(this.samples.map((s) => s.object), false);
    if (hits.length) this.select(hits[0].object.userData.galleryKey);
  }

  /** Focus a sample and announce the selection. @param {string} key */
  select(key) {
    const s = this.samples.find((x) => x.key === key);
    if (!s) return;
    this.selected = key;
    this._focusTarget = s.position.clone();
    this.o.bus.emit('gallery:select', { key, material: s.object.material });
  }

  /** @param {number} angle radians around the scene */
  setLightAngle(angle) {
    this.keyLight.position.set(Math.cos(angle) * 16, 14, Math.sin(angle) * 16);
  }

  /** @param {number} dt */
  update(dt) {
    if (!this.active) return;
    if (this._focusTarget) {
      const k = 1 - Math.exp(-GALLERY.focusLerp * dt);
      const t = this.controls.target;
      t.lerp(this._focusTarget, k);
      this._camGoal.copy(this._focusTarget).add(this._focusOffset);
      this.camera.position.lerp(this._camGoal, k);
      if (t.distanceTo(this._focusTarget) < 0.01 && this.camera.position.distanceTo(this._camGoal) < 0.01) this._focusTarget = null;
    }
    for (const s of this.samples) {
      const d = MATERIALS[s.key];
      if (d.type !== 'water' && !CARD_KEYS.has(parseMaterialKey(s.key).id) && d.type !== 'flame') s.object.rotation.y += GALLERY.spin * dt;
    }
    if (this.flameLight) this.flameLight.intensity = 3 * (0.85 + Math.sin(performance.now() / 70) * 0.08 + Math.sin(performance.now() / 23) * 0.05);
    // While auto-focusing, the camera is driven directly (no orbit damping).
    if (this._focusTarget) this.camera.lookAt(this.controls.target);
    else this.controls.update();
  }

  render() {
    this.o.renderer.render(this.scene, this.camera);
  }

  close() {
    if (!this.active) return;
    this.active = false;
    const R = this.o.renderer;
    R.canvas.removeEventListener('pointerdown', this._onPointerDown);
    R.canvas.removeEventListener('pointerup', this._onPointerUp);
    this._unsubResize?.();
    this.controls.dispose();
    for (const m of this._borrowed) this.o.library.release(m);
    for (const r of this._owned) r.dispose?.();
    this.scene.traverse((o) => {
      if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
    });
    this.env.dispose();
    this.samples = [];
    this.scene = null;
    this.selected = null;
  }
}

/** Flat ribbon along a curve (for trail previews). */
function ribbonGeometry(curve, segments, width) {
  const pos = [];
  const uv = [];
  const idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    side.crossVectors(tan, up).normalize().multiplyScalar(width / 2);
    const w = Math.sin(t * Math.PI);
    pos.push(p.x + side.x * w, p.y + width / 2 * w, p.z + side.z * w, p.x - side.x * w, p.y - width / 2 * w, p.z - side.z * w);
    uv.push(t * 2, 1, t * 2, 0);
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
