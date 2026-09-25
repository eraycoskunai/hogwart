/**
 * @file TestRoom — builds the Phase 1 engine test hall from data:
 * measured ramps and stairs, fall-damage towers with an elevator, sliding
 * and rotating kinematic platforms, pushable props, a crouch tunnel, pillar
 * forest, jump course, lock-on dummies, lamps, labels and info triggers.
 * Surfaces use procedural PBR materials from the MaterialLibrary (Phase 2).
 */
import * as THREE from 'three';
import { StaticBatcher, applyWorldUVs } from '../procgen/geometry/StaticBatcher.js';
import { labelTexture, runeCircleTexture } from '../procgen/textures/DevTextures.js';
import { PathMover, RotateMover } from './Movers.js';
import { TargetDummy } from '../gameplay/TargetDummy.js';
import { disposeObject3D } from '../core/AssetCache.js';

const DEG = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);

const LAMP = Object.freeze({ postHeight: 3.1, intensity: 14, distance: 16, decay: 2 });
const LABEL = Object.freeze({ floorWidth: 2.4, floorHeight: 0.6, wallWidth: 1.8, wallHeight: 0.45 });

export class TestRoom {
  /**
   * @param {{scene:THREE.Scene, physics:import('../physics/PhysicsWorld.js').PhysicsWorld,
   *          triggers:import('../physics/TriggerSystem.js').TriggerSystem,
   *          bus:import('../core/EventBus.js').EventBus,
   *          library:import('../render/MaterialLibrary.js').MaterialLibrary,
   *          preset:import('../data/quality.js').QUALITY_PRESETS.medium}} ctx
   * @param {typeof import('../data/testRoom.js').TEST_ROOM} data
   */
  constructor(ctx, data) {
    this.ctx = ctx;
    this.data = data;
    this.root = new THREE.Group();
    this.root.name = data.name;
    ctx.scene.add(this.root);

    this.batcher = new StaticBatcher();
    /** @type {Record<string, THREE.Material>} */
    this.materials = {};
    /** Materials borrowed from the library (released on dispose). */
    this.libraryMaterials = [];
    /** @type {THREE.Texture[]} */
    this.textures = [];
    /** @type {import('../physics/Collider.js').Collider[]} */
    this.colliders = [];
    this.movers = [];
    /** @type {import('../physics/PhysicsWorld.js').DynamicBody[]} */
    this.dynamicBodies = [];
    this.dummies = [];
    this.lamps = [];
    this.triggerZones = [];
    this.animated = [];

    const s = data.spawn;
    this.spawn = { position: new THREE.Vector3().fromArray(s.position), yaw: s.yaw };
    this.teleports = data.teleports.map((t) => ({ name: t.name, position: new THREE.Vector3().fromArray(t.pos), yaw: t.yaw }));
    this.cinematics = data.cinematics;

    this._onQuality = ({ preset }) => this._applyLampBudget(preset.maxDynamicLights);
    ctx.bus.on('render:quality', this._onQuality);
  }

  /**
   * Every material key the room needs (preload before build()).
   * @param {typeof import('../data/testRoom.js').TEST_ROOM} data
   */
  static materialKeys(data) {
    const keys = new Set(Object.values(data.materials).map((m) => m.key));
    for (const t of data.decorations.tapestries) keys.add(t.key);
    return [...keys];
  }

  /** Every lock-on capable entity. */
  get lockTargets() {
    return this.dummies;
  }

  // ---------------------------------------------------------------- build

  build() {
    this._createMaterials();
    this._buildShell();
    for (const r of this.data.ramps) this._buildRamp(r);
    for (const s of this.data.stairs) this._buildStairs(s);
    for (const b of this.data.blocks) this._buildBlock(b);
    for (const c of this.data.cylinders) this._buildCylinder(c);
    for (const m of this.data.movers) this._buildMover(m);
    this._buildProps();
    this._buildDummies();
    this._buildLamps();
    this._buildTriggers();
    this._buildDecorations();

    for (const mesh of this.batcher.build()) this.root.add(mesh);
    this._applyLampBudget(this.ctx.preset.maxDynamicLights);
    return this;
  }

  _tex(t) {
    this.textures.push(t);
    return t;
  }

  _createMaterials() {
    const lib = this.ctx.library;
    for (const [name, m] of Object.entries(this.data.materials)) {
      const ov = {};
      if (m.tile != null) ov.tile = m.tile;
      if (m.triplanar != null) ov.triplanar = m.triplanar;
      if (m.surface) ov.surface = m.surface;
      const mat = lib.get(m.key, ov);
      this.libraryMaterials.push(mat);
      this.materials[name] = mat;
    }
    const std = (name, o) => (this.materials[name] = new THREE.MeshStandardMaterial({ name, ...o }));
    std('rope', { color: 0x5a4630, roughness: 0.95 });
    std('target', { map: this._tex(this._targetTexture()), roughness: 0.7 });
    std('lampGlass', { color: 0xfff1d0, emissive: 0xffc27a, emissiveIntensity: 2.4, roughness: 0.2 });
    this.materials.glow = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.85 });
  }

  _targetTexture() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    for (let i = 5; i > 0; i--) {
      g.fillStyle = i % 2 ? '#b8322a' : '#f1e6cc';
      g.beginPath();
      g.arc(size / 2, size / 2, (i / 5) * (size / 2), 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /**
   * Static box: collider + batched visual.
   * @param {THREE.Matrix4} matrix
   * @param {THREE.Vector3} size
   * @param {string} matKey
   * @param {string} [surface]
   */
  _staticBox(matrix, size, matKey, surface = 'stone') {
    this.colliders.push(this.ctx.physics.addStaticBox(size, matrix, { surface, name: matKey }));
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = this.materials[matKey];
    this.batcher.add(geo, matrix, mat, this.data.materials[matKey]?.tile ?? 2);
    geo.dispose();
  }

  _buildShell() {
    const d = this.data;
    const [fx, fy, fz] = d.floor.size;
    const floorM = new THREE.Matrix4().makeTranslation(0, -fy / 2, 0);
    this._staticBox(floorM, new THREE.Vector3(fx, fy, fz), 'floor');

    const h = d.walls.height;
    const t = d.walls.thickness;
    const hx = fx / 2 + t / 2;
    const hz = fz / 2 + t / 2;
    const walls = [
      [0, h / 2, -hz, fx + 2 * t, h, t],
      [0, h / 2, hz, fx + 2 * t, h, t],
      [-hx, h / 2, 0, t, h, fz],
      [hx, h / 2, 0, t, h, fz],
    ];
    for (const [x, y, z, sx, sy, sz] of walls) {
      this._staticBox(new THREE.Matrix4().makeTranslation(x, y, z), new THREE.Vector3(sx, sy, sz), 'wall');
    }
    // Title banner on the north wall.
    const title = this._labelMesh(d.name.toUpperCase(), d.title.width, d.title.height, { width: 1024, height: 150 });
    title.position.set(d.title.x, d.title.y, -fz / 2 + 0.02);
    this.root.add(title);
  }

  _yawMatrix(pos, yaw = 0) {
    return new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(pos),
      new THREE.Quaternion().setFromAxisAngle(Y, yaw),
      ONE,
    );
  }

  _buildRamp(r) {
    const theta = r.angle * DEG;
    const run = r.rise / Math.tan(theta);
    const w = r.width;
    const h = r.rise;
    const base = this._yawMatrix(r.pos, r.yaw ?? 0);

    // Solid wedge (triangular prism) rising toward local -Z.
    const verts = [
      [-w / 2, 0, 0], [w / 2, 0, 0], [-w / 2, 0, -run], [w / 2, 0, -run], [-w / 2, h, -run], [w / 2, h, -run],
    ];
    const faces = [[0, 2, 3, 1], [2, 4, 5, 3], [0, 1, 5, 4], [0, 4, 2], [1, 3, 5]];
    this.colliders.push(this.ctx.physics.addStaticConvex(verts, faces, base, { surface: 'stone', name: 'ramp' }));
    const pos = [];
    for (const f of faces) {
      for (let i = 1; i < f.length - 1; i++) for (const idx of [f[0], f[i], f[i + 1]]) pos.push(...verts[idx]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    this.batcher.add(geo, base, this.materials.ramp, this.data.materials.ramp.tile ?? 2);
    geo.dispose();

    if (r.platformDepth > 0) {
      const pd = r.platformDepth;
      const m = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, h / 2, -run - pd / 2));
      this._staticBox(m, new THREE.Vector3(w, h, pd), 'platform');
    }
    if (r.label) this._floorLabel(r.label, base, new THREE.Vector3(0, 0, 1.3));
  }

  _buildStairs(s) {
    const base = this._yawMatrix(s.pos, s.yaw ?? 0);
    const { width: w, stepHeight: sh, stepDepth: sd, steps: n } = s;
    for (let i = 1; i <= n; i++) {
      const m = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, (i * sh) / 2, -(i - 0.5) * sd));
      this._staticBox(m, new THREE.Vector3(w, i * sh, sd), 'stairs');
    }
    const top = n * sh;
    const m = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, top / 2, -(n * sd + s.landingDepth / 2)));
    this._staticBox(m, new THREE.Vector3(w, top, s.landingDepth), 'platform');
    if (s.label) this._floorLabel(s.label, base, new THREE.Vector3(0, 0, 1.3));
  }

  _buildBlock(b) {
    const size = new THREE.Vector3().fromArray(b.size);
    const m = this._yawMatrix(b.pos, b.yaw ?? 0);
    this._staticBox(m, size, b.material ?? 'wall');
    if (b.label) {
      const lbl = this._labelMesh(b.label, LABEL.wallWidth, LABEL.wallHeight);
      const y = Math.min(size.y / 2 - 0.5, 2 - size.y / 2) + (b.labelY ?? 0);
      if (b.labelFace === 'south') lbl.position.set(b.pos[0], b.pos[1] + y, b.pos[2] + size.z / 2 + 0.015);
      this.root.add(lbl);
    }
  }

  _buildCylinder(c) {
    const m = new THREE.Matrix4().makeTranslation(c.pos[0], c.pos[1] + c.height / 2, c.pos[2]);
    this.colliders.push(this.ctx.physics.addStaticCylinder(c.radius, c.height, m, { surface: 'stone', name: 'pillar' }));
    const geo = new THREE.CylinderGeometry(c.radius, c.radius, c.height, 28);
    const key = c.material ?? 'pillar';
    this.batcher.add(geo, m, this.materials[key], this.data.materials[key]?.tile ?? 2);
    geo.dispose();
  }

  _buildMover(md) {
    const size = new THREE.Vector3().fromArray(md.size);
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    applyWorldUVs(geo, 2);
    const mesh = new THREE.Mesh(geo, this.materials.mover);
    mesh.castShadow = mesh.receiveShadow = true;
    // Glowing edge rails so moving platforms read clearly.
    const railGeo = new THREE.BoxGeometry(size.x + 0.04, 0.06, 0.06);
    for (const sz of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, this.materials.lampGlass);
      rail.position.set(0, size.y / 2 - 0.02, (sz * size.z) / 2);
      mesh.add(rail);
    }
    this.root.add(mesh);

    const start = new THREE.Vector3().fromArray(md.type === 'path' ? md.points[0] : md.position);
    const quat = new THREE.Quaternion();
    mesh.position.copy(start);
    const body = this.ctx.physics.addKinematicBox(size, mesh, start, quat, { surface: 'metal', name: md.id });
    const mover = md.type === 'path' ? new PathMover(body, md) : new RotateMover(body, md);
    mover.id = md.id;
    this.movers.push(mover);
  }

  _buildProps() {
    const p = this.data.props;
    const crateGeos = new Map();
    const crateGeo = (s) => {
      if (!crateGeos.has(s)) crateGeos.set(s, new THREE.BoxGeometry(s, s, s));
      return crateGeos.get(s);
    };
    const addCrate = (x, y, z, s, mass, dark) => {
      const mesh = new THREE.Mesh(crateGeo(s), dark ? this.materials.crateDark : this.materials.crate);
      mesh.castShadow = mesh.receiveShadow = true;
      this.root.add(mesh);
      const pos = new THREE.Vector3(x, y, z);
      mesh.position.copy(pos);
      this.dynamicBodies.push(this.ctx.physics.addDynamicBox({
        size: new THREE.Vector3(s, s, s), mass, position: pos, mesh, surface: 'wood', name: `Sandık ${s} m`,
      }));
    };
    p.crates.forEach((c, i) => addCrate(c.pos[0], c.pos[1] + c.size / 2 + 0.01, c.pos[2], c.size, c.mass, i % 2 === 1));
    for (const py of p.pyramids) {
      const gap = py.size * 1.01;
      for (let row = 0; row < py.rows; row++) {
        const count = py.rows - row;
        for (let i = 0; i < count; i++) {
          const x = py.pos[0] + (i - (count - 1) / 2) * gap;
          addCrate(x, py.pos[1] + py.size / 2 + row * py.size + 0.005, py.pos[2], py.size, py.mass, (row + i) % 2 === 0);
        }
      }
    }
    for (const b of p.balls) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 28, 18), this.materials.ball);
      mesh.castShadow = mesh.receiveShadow = true;
      this.root.add(mesh);
      const pos = new THREE.Vector3(b.pos[0], b.pos[1] + b.radius + 0.01, b.pos[2]);
      mesh.position.copy(pos);
      this.dynamicBodies.push(
        this.ctx.physics.addDynamicSphere({ radius: b.radius, mass: b.mass, position: pos, mesh, surface: 'leather', name: `Top ${b.radius} m` }),
      );
    }
  }

  _buildDummies() {
    for (const d of this.data.dummies) {
      const dummy = new TargetDummy(this.ctx, new THREE.Vector3().fromArray(d.pos), d.yaw, this.materials);
      this.dummies.push(dummy);
    }
  }

  _buildLamps() {
    const postGeo = new THREE.CylinderGeometry(0.06, 0.09, LAMP.postHeight, 10);
    const capGeo = new THREE.ConeGeometry(0.22, 0.2, 6);
    const glassGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.34, 6);
    const baseGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.16, 10);
    for (const l of this.data.lamps) {
      const g = new THREE.Group();
      g.position.fromArray(l.pos);
      const post = new THREE.Mesh(postGeo, this.materials.iron);
      post.position.y = LAMP.postHeight / 2;
      const base = new THREE.Mesh(baseGeo, this.materials.iron);
      base.position.y = 0.08;
      const glass = new THREE.Mesh(glassGeo, this.materials.lampGlass);
      glass.position.y = LAMP.postHeight + 0.17;
      const cap = new THREE.Mesh(capGeo, this.materials.iron);
      cap.position.y = LAMP.postHeight + 0.44;
      for (const m of [post, base, cap]) m.castShadow = m.receiveShadow = true;
      g.add(post, base, glass, cap);
      const light = new THREE.PointLight(l.color, LAMP.intensity, LAMP.distance, LAMP.decay);
      light.position.y = LAMP.postHeight + 0.17;
      g.add(light);
      this.root.add(g);
      this.lamps.push({ group: g, light, glass, phase: Math.random() * 10 });
      const m = new THREE.Matrix4().makeTranslation(l.pos[0], LAMP.postHeight / 2, l.pos[2]);
      this.colliders.push(this.ctx.physics.addStaticCylinder(0.12, LAMP.postHeight, m, { surface: 'metal', name: 'lamba', cameraBlocking: false }));
    }
  }

  /** @param {number} max */
  _applyLampBudget(max) {
    this.lamps.forEach((l, i) => {
      l.light.visible = i < max;
    });
  }

  _buildTriggers() {
    for (const t of this.data.triggers) {
      const m = new THREE.Matrix4().makeTranslation(...t.pos);
      const zone = this.ctx.triggers.add({
        id: t.id,
        size: new THREE.Vector3().fromArray(t.size),
        matrix: m,
        data: { message: t.message, cinematic: t.cinematic ?? null },
      });
      this.triggerZones.push(zone);
      if (t.cinematic) {
        const tex = this._tex(runeCircleTexture('#ffd36b'));
        const pad = new THREE.Mesh(
          new THREE.PlaneGeometry(t.size[0], t.size[2]),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(t.pos[0], 0.02, t.pos[2]);
        this.root.add(pad);
        this.animated.push((time) => {
          pad.rotation.z = time * 0.4;
          pad.material.opacity = 0.65 + Math.sin(time * 2.2) * 0.25;
        });
      }
    }
  }

  _buildDecorations() {
    const dec = this.data.decorations;
    const lib = this.ctx.library;
    const rodGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 10);
    rodGeo.rotateZ(Math.PI / 2);
    for (const t of dec.tapestries) {
      const mat = lib.get(t.key);
      this.libraryMaterials.push(mat);
      const [w, h] = t.size;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 12, 12), mat);
      // Gentle folds so the hanging cloth catches light.
      const pos = cloth.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        pos.setZ(i, Math.sin((x / w) * Math.PI * 5) * 0.03 * (0.4 + (0.5 - y / h) * 0.6));
      }
      cloth.geometry.computeVertexNormals();
      cloth.position.fromArray(t.pos);
      cloth.castShadow = cloth.receiveShadow = true;
      this.root.add(cloth);
      const rod = new THREE.Mesh(rodGeo, this.materials.rod);
      rod.scale.set(w + 0.3, 1, 1);
      rod.position.set(t.pos[0], t.pos[1] + h / 2 + 0.02, t.pos[2] + 0.06);
      rod.castShadow = true;
      this.root.add(rod);
    }

    const p = dec.pool;
    const [sx, sz] = p.size;
    const r = p.rim;
    const rh = p.rimHeight;
    const rims = [
      [0, (sz - r) / 2, sx, r],
      [0, -(sz - r) / 2, sx, r],
      [(sx - r) / 2, 0, r, sz - 2 * r],
      [-(sx - r) / 2, 0, r, sz - 2 * r],
    ];
    for (const [ox, oz, w, d] of rims) {
      const m = new THREE.Matrix4().makeTranslation(p.pos[0] + ox, rh / 2, p.pos[2] + oz);
      this._staticBox(m, new THREE.Vector3(w, rh, d), 'rim');
    }
    const water = new THREE.Mesh(new THREE.PlaneGeometry(sx - 2 * r, sz - 2 * r), this.materials.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(p.pos[0], p.waterLevel, p.pos[2]);
    water.receiveShadow = true;
    this.root.add(water);
  }

  // --------------------------------------------------------------- labels

  _labelMesh(text, w, h, texOpts = {}) {
    const tex = this._tex(labelTexture(text, { bg: 'rgba(20,18,26,0.72)', ...texOpts }));
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.renderOrder = 2;
    return mesh;
  }

  _floorLabel(text, base, offset) {
    const mesh = this._labelMesh(text, LABEL.floorWidth, LABEL.floorHeight);
    const m = base.clone().multiply(new THREE.Matrix4().compose(
      new THREE.Vector3(offset.x, 0.015, offset.z),
      new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2),
      ONE,
    ));
    m.decompose(mesh.position, mesh.quaternion, mesh.scale);
    this.root.add(mesh);
  }

  // ---------------------------------------------------------------- tick

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos
   */
  fixedUpdate(dt, playerPos) {
    for (const m of this.movers) m.step(dt, this.ctx.physics);
    for (const d of this.dummies) d.fixedUpdate(dt, playerPos);
  }

  /** @param {number} time */
  render(time) {
    for (const d of this.dummies) d.render(time);
    for (const fn of this.animated) fn(time);
    for (const l of this.lamps) {
      // Gentle flame-like flicker.
      const f = 1 + Math.sin(time * 7.3 + l.phase) * 0.04 + Math.sin(time * 13.1 + l.phase * 2) * 0.03;
      l.light.intensity = LAMP.intensity * f;
    }
  }

  /** Entities exposed to the debug panel. */
  get debugEntities() {
    return [
      ...this.dummies.map((d) => ({ name: d.name, state: d.debugState })),
      ...this.movers.map((m) => ({ name: `Platform: ${m.id}`, state: m.debugState })),
    ];
  }

  dispose() {
    this.ctx.bus.off('render:quality', this._onQuality);
    for (const d of this.dummies) d.dispose();
    for (const c of this.colliders) this.ctx.physics.removeCollider(c);
    for (const d of this.dynamicBodies) this.ctx.physics.removeDynamic(d);
    for (const m of this.movers) this.ctx.physics.removeKinematic(m.body);
    for (const z of this.triggerZones) this.ctx.triggers.remove(z);
    disposeObject3D(this.root);
    for (const t of this.textures) t.dispose();
    const borrowed = new Set(this.libraryMaterials);
    for (const m of Object.values(this.materials)) if (!borrowed.has(m)) m.dispose();
    for (const m of this.libraryMaterials) this.ctx.library.release(m);
  }
}
