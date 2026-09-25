/**
 * @file HogwartsGrounds — the outdoor region: generated valley terrain
 * (chunked LOD mesh + heightfield collider), the Black Lake, the castle
 * built from the modular kit, the Forbidden Forest and groves, rocks,
 * GPU grass, lamps, the Quidditch pitch, the keeper's hut, students,
 * info triggers, a forest colour-grading zone and a fly-over cinematic.
 * Implements the same region interface as the test hall.
 */
import * as THREE from 'three';
import {
  GROUNDS, TERRAIN, LAKE, GRASS, GROUND_STUDENTS, GROUND_TRIGGERS, GROUND_TELEPORTS, GROUND_CINEMATICS,
} from '../../data/grounds.js';
import { CASTLE, KIT } from '../../data/castle.js';
import { HOUSES } from '../../data/character.js';
import { StaticBatcher } from '../../procgen/geometry/StaticBatcher.js';
import { TerrainData } from './TerrainData.js';
import { TerrainMesh } from './TerrainMesh.js';
import { Castle } from './Castle.js';
import { Vegetation } from './Vegetation.js';
import { Props } from './Props.js';
import { createTerrainMaterial, packLayers } from '../../render/TerrainMaterial.js';
import { createLakeMaterial } from '../../render/LakeMaterial.js';
import { createWindowMaterial } from '../../render/WindowMaterial.js';
import { GrassField } from '../../render/GrassField.js';
import { Student } from '../../gameplay/Student.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Library keys for the castle's materials: name → [key, overrides]. */
const MATERIAL_MAP = Object.freeze({
  stone: ['hogwartsStone', { tile: KIT.stoneTile }],
  roof: ['roofSlate', {}],
  wood: ['woodPlanks', {}],
  iron: ['wroughtIron', {}],
  gold: ['brass', {}],
  thatch: ['thatch', {}],
  hutStone: ['rock', { tile: 2.5 }],
});

export class HogwartsGrounds {
  /**
   * @param {{scene:THREE.Scene, physics:any, triggers:any, bus:any, preset:any, library:any, lights:any,
   *          flames:any, grading:any, sky:any, renderer:THREE.WebGLRenderer}} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.id = GROUNDS.id;
    this.name = GROUNDS.name;
    this.fogScale = GROUNDS.fogScale;
    this.outdoor = true;
    this.menuOrbit = GROUNDS.menuOrbit;
    this.root = new THREE.Group();
    this.root.name = 'HogwartsGrounds';
    ctx.scene.add(this.root);
    this.students = [];
    this.triggerZones = [];
    this.libraryMaterials = [];
    this.owned = [];
    this.lockTargets = [];
    this.cinematics = GROUND_CINEMATICS;
  }

  /** Every library key the region uses. */
  static materialKeys() {
    const keys = new Set(Object.values(MATERIAL_MAP).map(([k]) => k));
    for (const k of TERRAIN.layers) keys.add(k);
    for (const h of Object.values(HOUSES)) if (h.crest) keys.add(h.crest);
    keys.add('water');
    keys.add('bark');
    keys.add('leaves');
    keys.add('candleFlame');
    return [...keys];
  }

  /** Ground height under (x, z). */
  heightAt(x, z) {
    return this.terrain.heightAt(x, z);
  }

  /** Water surface height at (x, z) or -Infinity on dry land. */
  waterLevelAt(x, z) {
    return this.terrain.waterDepth(x, z) > 0 ? LAKE.level : -Infinity;
  }

  /** Water depth below the surface at (x, z). */
  waterDepth(x, z) {
    return this.terrain.waterDepth(x, z);
  }

  /** Resolve [x, y|null, z] with the terrain height. */
  _p(pos) {
    const [x, y, z] = pos;
    return new THREE.Vector3(x, y ?? this.terrain.heightAt(x, z), z);
  }

  /**
   * Build everything (yields between heavy steps).
   * @param {(label:string, t:number) => void} [progress]
   */
  async build(progress = () => {}) {
    const ctx = this.ctx;
    const lib = ctx.library;
    progress('Arazi şekilleniyor…', 0.05);
    await nextFrame();
    this.terrain = new TerrainData(TERRAIN, { paving: CASTLE.paving });
    const T = this.terrain;
    this.heightfield = ctx.physics.addHeightfield({ x0: T.x0, z0: T.z0, cell: T.cell, nx: T.n, nz: T.n, heights: T.heights, name: 'Arazi', surface: 'grass' });

    progress('Arazi dokuları…', 0.25);
    await nextFrame();
    this.heightTex = T.heightTexture();
    this.splatTex = T.splatTexture();
    this.grassTex = T.grassTexture();
    this.owned.push(this.heightTex, this.splatTex, this.grassTex);
    this._buildTerrainMaterial();
    this.terrainMesh = new TerrainMesh(T, this.terrainMaterial, TERRAIN);
    this.root.add(this.terrainMesh.group);

    // Lake.
    const L = TERRAIN.lake;
    const water = lib.acquireTextures('water');
    this._borrowedTextures = ['water'];
    this.lakeMaterial = createLakeMaterial({ tex: water, shared: lib.shared, height: this.heightTex, uvTransform: T.uvTransform, level: LAKE.level, lake: LAKE });
    this.owned.push(this.lakeMaterial);
    const lakeGeo = new THREE.PlaneGeometry(L.radii[0] * 2.4, L.radii[1] * 2.4, 1, 1);
    lakeGeo.rotateX(-Math.PI / 2);
    this.owned.push(lakeGeo);
    this.lake = new THREE.Mesh(lakeGeo, this.lakeMaterial);
    this.lake.position.set(L.center[0], LAKE.level, L.center[1]);
    this.lake.receiveShadow = true;
    this.lake.renderOrder = 1;
    this.root.add(this.lake);

    progress('Şato inşa ediliyor…', 0.4);
    await nextFrame();
    const mats = {};
    for (const [name, [key, ov]] of Object.entries(MATERIAL_MAP)) {
      const m = lib.get(key, ov);
      this.libraryMaterials.push(m);
      mats[name] = m;
    }
    for (const [h, H] of Object.entries(HOUSES)) {
      if (!H.crest) continue;
      const m = lib.get(H.crest);
      this.libraryMaterials.push(m);
      mats[`tapestry:${h}`] = m;
    }
    this.windowMaterial = createWindowMaterial({ color: KIT.windowColor, lit: KIT.windowLit });
    this.owned.push(this.windowMaterial, this.windowMaterial.userData.texture);
    mats.window = this.windowMaterial;
    this.materials = mats;
    const batcher = new StaticBatcher();
    const heightAt = (x, z) => T.heightAt(x, z);
    this.castle = new Castle({ physics: ctx.physics, batcher, root: this.root, heightAt, materials: mats }).build();

    progress('Tepeler, köprü ve saha…', 0.55);
    await nextFrame();
    this.props = new Props({ physics: ctx.physics, lights: ctx.lights, library: lib, batcher, root: this.root, heightAt, materials: mats }).build(this.castle.lamps);
    for (const mesh of batcher.build()) this.root.add(mesh);

    progress('Orman büyüyor…', 0.7);
    await nextFrame();
    this.vegetation = new Vegetation({ ...ctx, renderer: ctx.renderer }, T, this.root).build();

    progress('Çimen…', 0.88);
    await nextFrame();
    this.grass = new GrassField(this.root, { height: this.heightTex, density: this.grassTex, uvTransform: T.uvTransform, shared: lib.shared, count: GRASS.counts[ctx.preset.grass] ?? 0 });

    // Triggers, grading, spawn, teleports, students.
    for (const t of GROUND_TRIGGERS) {
      const p = this._p(t.pos);
      p.y += t.size[1] / 2;
      this.triggerZones.push(ctx.triggers.add({
        id: t.id,
        size: new THREE.Vector3().fromArray(t.size),
        matrix: new THREE.Matrix4().makeTranslation(p.x, p.y, p.z),
        data: { message: t.message, cinematic: t.cinematic ?? null },
      }));
    }
    const F = TERRAIN.forest;
    ctx.grading?.addZone({
      name: 'Yasak Orman', grade: 'forest', indoor: false,
      min: [F.center[0] - F.radii[0] * 0.95, -50, F.center[1] - F.radii[1] * 0.95],
      max: [F.center[0] + F.radii[0] * 0.9, 400, F.center[1] + F.radii[1] * 0.9],
    });
    this.spawn = { position: this._p(GROUNDS.spawn.position), yaw: GROUNDS.spawn.yaw };
    this.teleports = GROUND_TELEPORTS.map((t) => ({ name: t.name, position: this._p(t.pos), yaw: t.yaw }));
    this._studentQueue = GROUND_STUDENTS.map((s) => ({
      ...s,
      pos: this._p(s.pos).toArray(),
      to: s.to ? this._p(s.to).toArray() : undefined,
      target: s.target ? this._p(s.target).toArray() : undefined,
    }));
    progress('Hazır', 1);
    return this;
  }

  _buildTerrainMaterial() {
    const lib = this.ctx.library;
    const layers = TERRAIN.layers;
    const sets = layers.map((k) => lib.mapData(k));
    const sizes = sets.map((s) => s.size);
    const albedo = packLayers(sets.map((s) => s.maps.albedo), sizes, true, lib.anisotropy);
    const normal = packLayers(sets.map((s) => s.maps.normal), sizes, false, lib.anisotropy);
    this.layerArrays = { albedo, normal };
    this.terrainMaterial = createTerrainMaterial({
      albedo, normal, splat: this.splatTex, uvTransform: this.terrain.uvTransform,
      tiles: TERRAIN.layerTile, rockSlope: TERRAIN.rockSlope, shared: lib.shared,
    });
    this.owned.push(this.terrainMaterial);
    // Rebuild the arrays when preview textures upgrade to full resolution.
    this._offUpgrade?.();
    this._offUpgrade = this.ctx.bus.on('textures:upgraded', ({ key }) => {
      if (!layers.includes(key)) return;
      const s = layers.map((k) => lib.mapData(k));
      const sz = s.map((x) => x.size);
      const a = packLayers(s.map((x) => x.maps.albedo), sz, true, lib.anisotropy);
      const n = packLayers(s.map((x) => x.maps.normal), sz, false, lib.anisotropy);
      this.layerArrays.albedo.dispose();
      this.layerArrays.normal.dispose();
      this.layerArrays = { albedo: a, normal: n };
      this.terrainMaterial.userData.terrain.uLayerAlbedo.value = a;
      this.terrainMaterial.userData.terrain.uLayerNormal.value = n;
    });
  }

  // ------------------------------------------------------------ students

  spawnNextStudent() {
    const spec = this._studentQueue?.shift();
    if (spec) {
      const st = new Student(this.ctx, spec);
      this.students.push(st);
      this.ctx.bus.emit('room:characterAdded', { character: st.character });
    }
    return !!this._studentQueue?.length;
  }

  updateCharacters(dt, env) {
    for (const s of this.students) s.update(dt, env);
  }

  // ---------------------------------------------------------------- tick

  fixedUpdate() {}

  /**
   * Per-frame work that needs the camera (LOD, grass, wind, clock).
   * @param {number} dt
   * @param {THREE.Camera} camera
   * @param {{night:number, hour:number, wind:THREE.Vector2}} env
   */
  frame(dt, camera, env) {
    const P = this.ctx.preset;
    const cam = camera.position;
    this.terrainMesh.update(cam);
    const wind = Math.min(1, env.wind.length() / 3);
    this.vegetation.update(dt, cam, { nearScale: P.vegetationScale ?? 1, maxDist: camera.far, wind });
    this.grass.update(dt, cam, wind);
    this.props.update(dt, env.night, env.wind);
    this.castle.updateClock(env.hour, env.night);
    this.windowMaterial.userData.night.value = THREE.MathUtils.smoothstep(env.night, 0.15, 0.6);
  }

  render() {}

  /** Called after teleports so LODs refresh at once. */
  onTeleport() {
    this.vegetation?.refresh();
  }

  get debugEntities() {
    return this.students.map((s) => ({ name: s.name, state: s.debugState }));
  }

  get stats() {
    return {
      'Arazi LOD (1/2/4)': this.terrainMesh.stats,
      'Ağaç (yakın / uzak)': `${this.vegetation.trees.nearCount} / ${this.vegetation.trees.farCount} (${this.vegetation.treeCount})`,
      'Kaya (yakın / uzak)': `${this.vegetation.rocks.nearCount} / ${this.vegetation.rocks.farCount}`,
      Çimen: this.grass.count,
    };
  }

  dispose() {
    const ctx = this.ctx;
    this._offUpgrade?.();
    for (const s of this.students) s.dispose();
    for (const z of this.triggerZones) ctx.triggers.remove(z);
    this.vegetation?.dispose();
    this.grass?.dispose();
    this.props?.dispose();
    this.castle?.dispose();
    this.terrainMesh?.dispose();
    if (this.heightfield) ctx.physics.removeHeightfield(this.heightfield);
    this.root.traverse((o) => {
      if (o.isMesh && o.geometry && !o.isInstancedMesh) o.geometry.dispose();
    });
    this.root.removeFromParent();
    this.layerArrays?.albedo.dispose();
    this.layerArrays?.normal.dispose();
    for (const r of this.owned) r.dispose();
    for (const m of this.libraryMaterials) ctx.library.release(m);
    for (const k of this._borrowedTextures ?? []) ctx.library.releaseTextures(k);
  }
}
