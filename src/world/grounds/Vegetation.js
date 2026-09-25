/**
 * @file Vegetation — the Forbidden Forest and scattered groves (procedural
 * oak, pine and dead-tree variants), boulders on cliffs, shores and the
 * forest floor. Instances switch between full meshes near the camera and
 * cheap stand-ins farther away (camera-facing tree impostors rendered at
 * load time, low-poly rocks). Trees and big rocks get trunk colliders.
 * Foliage sways with the weather's wind.
 */
import * as THREE from 'three';
import { VEGETATION } from '../../data/grounds.js';
import { TREE_SPECIES, ROCKS } from '../../data/vegetation.js';
import { MATERIALS } from '../../data/materials.js';
import { buildTree, buildRock, needleTexture } from '../../procgen/geometry/TreeGenerator.js';
import { Noise } from '../../procgen/textures/noise.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Instanced near / far representation switching by camera distance. */
export class InstancedLOD {
  /**
   * @param {THREE.Object3D} parent
   * @param {{near:{geometry:THREE.BufferGeometry, material:THREE.Material, shadow:boolean}[],
   *          far:{geometry:THREE.BufferGeometry, material:THREE.Material}[]}[]} variants
   * @param {{variant:number, matrix:THREE.Matrix4, pos:THREE.Vector3}[]} instances
   */
  constructor(parent, variants, instances) {
    this.instances = instances;
    this.variants = variants.map((v, vi) => {
      const count = instances.filter((i) => i.variant === vi).length;
      const make = (part, shadow) => {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, count));
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        parent.add(mesh);
        return mesh;
      };
      return {
        near: v.near.map((p) => make(p, p.shadow)),
        far: (v.far ?? []).map((p) => make(p, false)),
      };
    });
    this.nearCount = 0;
    this.farCount = 0;
  }

  /**
   * @param {THREE.Vector3} cam
   * @param {number} nearDist
   * @param {number} maxDist
   */
  update(cam, nearDist, maxDist) {
    const n2 = nearDist * nearDist;
    const m2 = maxDist * maxDist;
    const nearIdx = this.variants.map(() => 0);
    const farIdx = this.variants.map(() => 0);
    for (const inst of this.instances) {
      const d2 = inst.pos.distanceToSquared(cam);
      const V = this.variants[inst.variant];
      if (d2 < n2) {
        const k = nearIdx[inst.variant]++;
        for (const mesh of V.near) mesh.setMatrixAt(k, inst.matrix);
      } else if (d2 < m2 && V.far.length) {
        const k = farIdx[inst.variant]++;
        for (const mesh of V.far) mesh.setMatrixAt(k, inst.matrix);
      }
    }
    this.nearCount = 0;
    this.farCount = 0;
    this.variants.forEach((V, vi) => {
      for (const mesh of V.near) {
        mesh.count = nearIdx[vi];
        mesh.instanceMatrix.needsUpdate = true;
      }
      for (const mesh of V.far) {
        mesh.count = farIdx[vi];
        mesh.instanceMatrix.needsUpdate = true;
      }
      this.nearCount += nearIdx[vi];
      this.farCount += farIdx[vi];
    });
  }

  dispose() {
    for (const V of this.variants) for (const mesh of [...V.near, ...V.far]) mesh.removeFromParent();
  }
}

/** Wind sway for instanced foliage / trunks (displacement grows with height). */
function addWind(m, wind, leaf) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r);
    shader.uniforms.uWindT = wind.time;
    shader.uniforms.uWindS = wind.strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindT;\nuniform float uWindS;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hgt = max(transformed.y, 0.0);
          float ph = dot(ip.xz, vec2(0.13, 0.17)) + uWindT;
          vec2 sway = vec2(sin(ph), cos(ph * 0.83)) * uWindS * hgt * hgt * 0.0035;
          ${leaf ? 'sway += vec2(sin(uWindT * 3.1 + transformed.x * 1.7 + ip.x), cos(uWindT * 2.7 + transformed.z * 1.9)) * uWindS * 0.03 * hgt * 0.1;' : ''}
          transformed.xz += sway;
        }`);
  };
  const key = leaf ? 'windLeaf' : 'windTrunk';
  m.customProgramCacheKey = () => key;
}

/** Camera-facing (around Y) instanced billboard. */
function billboardMaterial(texture, size, tint) {
  const m = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.45, side: THREE.DoubleSide, color: tint, roughness: 0.95 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSize = { value: size };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uSize;\nvec3 bbCenter; vec3 bbToCam; float bbScale;')
      .replace('#include <beginnormal_vertex>', `
        bbCenter = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        bbScale = length(instanceMatrix[1].xyz);
        bbToCam = cameraPosition - bbCenter;
        bbToCam.y = 0.0;
        bbToCam = normalize(bbToCam + vec3(1e-4, 0.0, 0.0));
        vec3 objectNormal = normalize(bbToCam + vec3(0.0, 0.6, 0.0));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(1.0, 0.0, 0.0);
        #endif`)
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize((viewMatrix * vec4(objectNormal, 0.0)).xyz);\n#ifdef FLIP_SIDED\ntransformedNormal = -transformedNormal;\n#endif')
      .replace('#include <project_vertex>', `
        vec3 bbRight = vec3(bbToCam.z, 0.0, -bbToCam.x);
        vec3 bbWorld = bbCenter + bbRight * position.x * uSize.x * bbScale + vec3(0.0, position.y * uSize.y * bbScale, 0.0);
        vec4 mvPosition = viewMatrix * vec4(bbWorld, 1.0);
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(bbWorld, 1.0);');
  };
  m.customProgramCacheKey = () => 'treeBillboard';
  return m;
}

export class Vegetation {
  /**
   * @param {{scene:THREE.Scene, renderer:THREE.WebGLRenderer, physics:any, library:any, preset:any}} ctx
   * @param {import('./TerrainData.js').TerrainData} terrain
   * @param {THREE.Group} root
   */
  constructor(ctx, terrain, root) {
    this.ctx = ctx;
    this.terrain = terrain;
    this.root = root;
    this.colliders = [];
    this.owned = [];
    this.borrowed = [];
    this.wind = { time: { value: 0 }, strength: { value: 0.6 } };
    this._timer = 0;
    this.N = new Noise(terrain.T.seed + 17);
  }

  build() {
    this._buildTrees();
    this._buildRocks();
    return this;
  }

  // -------------------------------------------------------------- trees

  _materials() {
    const lib = this.ctx.library;
    const bark = lib.acquireTextures('bark');
    const leaves = lib.acquireTextures('leaves');
    this.borrowed.push('bark', 'leaves');
    const barkMat = (tint) => {
      const m = new THREE.MeshStandardMaterial({ map: bark?.albedo ?? null, normalMap: bark?.normal ?? null, color: tint, roughness: 0.95 });
      addWind(m, this.wind, false);
      this.owned.push(m);
      return m;
    };
    const leafMat = (tex, tint) => {
      const m = new THREE.MeshStandardMaterial({ map: tex, normalMap: tex === leaves?.albedo ? leaves.normal : null, color: tint, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
      addWind(m, this.wind, true);
      this.owned.push(m);
      return m;
    };
    const needles = needleTexture();
    this.owned.push(needles);
    return {
      oak: { trunk: barkMat(TREE_SPECIES.oak.barkTint), leaves: leafMat(leaves?.albedo ?? null, TREE_SPECIES.oak.leafTint) },
      pine: { trunk: barkMat(TREE_SPECIES.pine.barkTint), leaves: leafMat(needles, TREE_SPECIES.pine.needleTint) },
      dead: { trunk: barkMat(TREE_SPECIES.dead.barkTint), leaves: leafMat(leaves?.albedo ?? null, TREE_SPECIES.dead.leafTint) },
    };
  }

  /** Render a tree variant from the side into a texture (unlit albedo + alpha). */
  _impostor(tree, mats) {
    const R = this.ctx.renderer;
    const size = VEGETATION.impostorSize;
    const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
    rt.texture.generateMipmaps = true;
    rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.owned.push(rt);
    const scene = new THREE.Scene();
    const basic = (m) => new THREE.MeshBasicMaterial({ map: m.map, color: m.color, alphaTest: m.alphaTest, side: THREE.DoubleSide });
    const trunkM = basic(mats.trunk);
    const leafM = basic(mats.leaves);
    trunkM.color.multiplyScalar(0.55);
    leafM.color.multiplyScalar(0.7);
    scene.add(new THREE.Mesh(tree.trunk, trunkM));
    if (tree.leaves) scene.add(new THREE.Mesh(tree.leaves, leafM));
    const box = new THREE.Box3().setFromObject(scene);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    const h = box.max.y;
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, -50, 50);
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    const prev = R.getRenderTarget();
    const prevClear = R.getClearAlpha();
    const prevColor = R.getClearColor(new THREE.Color());
    const prevTone = R.toneMapping;
    R.setRenderTarget(rt);
    R.setClearColor(0x3a4a28, 0);
    R.toneMapping = THREE.NoToneMapping;
    R.clear();
    R.render(scene, cam);
    R.setRenderTarget(prev);
    R.setClearColor(prevColor, prevClear);
    R.toneMapping = prevTone;
    trunkM.dispose();
    leafM.dispose();
    return { texture: rt.texture, size: new THREE.Vector2(w, h) };
  }

  _buildTrees() {
    const V = VEGETATION;
    const T = this.terrain;
    const lib = this.ctx.library;
    const mats = this._materials();
    const barkTile = MATERIALS.bark.tile ?? 2;
    const species = ['oak', 'pine', 'dead'];
    const variants = [];
    const variantInfo = [];
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    this.owned.push(quad);
    for (const sp of species) {
      for (let k = 0; k < V.variantsPerSpecies; k++) {
        const tree = buildTree(sp, 1000 + variants.length * 77, barkTile);
        this.owned.push(tree.trunk);
        if (tree.leaves) this.owned.push(tree.leaves);
        const imp = this._impostor(tree, mats[sp]);
        const bb = billboardMaterial(imp.texture, imp.size, 0xffffff);
        this.owned.push(bb);
        const near = [{ geometry: tree.trunk, material: mats[sp].trunk, shadow: true }];
        if (tree.leaves) near.push({ geometry: tree.leaves, material: mats[sp].leaves, shadow: true });
        variants.push({ near, far: [{ geometry: quad, material: bb }] });
        variantInfo.push({ species: sp, tree });
      }
    }
    void lib;
    // Placement: jittered grid, density from the forest mask.
    const instances = [];
    const N = this.N;
    const half = T.T.size / 2 - 10;
    const g = V.grid;
    const rnd = (a, b) => {
      const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return h - Math.floor(h);
    };
    for (let z = -half; z < half; z += g) {
      for (let x = -half; x < half; x += g) {
        const jx = x + (rnd(x, z) - 0.5) * g * 0.9;
        const jz = z + (rnd(z, x + 3) - 0.5) * g * 0.9;
        const forest = T.mask(jx, jz, 1);
        const density = forest > 0.3 ? V.forestDensity * forest : V.meadowDensity * (0.4 + N.fbm01(jx / 1600 + 0.5, jz / 1600 + 0.5, 6, 3) * 1.2);
        if (rnd(jx + 7, jz - 3) > density) continue;
        if (!this._treeAllowed(jx, jz)) continue;
        const y = T.heightAt(jx, jz);
        const mix = forest > 0.3 ? V.forestMix : V.meadowMix;
        const pick = rnd(jx - 11, jz + 5);
        let sp = 'oak';
        let acc = 0;
        for (const [name, w] of Object.entries(mix)) {
          acc += w;
          if (pick <= acc) {
            sp = name;
            break;
          }
        }
        const vi = species.indexOf(sp) * V.variantsPerSpecies + Math.floor(rnd(jz, jx) * V.variantsPerSpecies);
        const scale = 0.8 + rnd(jx * 3, jz) * 0.5;
        _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd(jx, jz * 2) * Math.PI * 2);
        const pos = new THREE.Vector3(jx, y, jz);
        const matrix = new THREE.Matrix4().compose(pos, _q, _s.setScalar(scale));
        instances.push({ variant: vi, matrix, pos });
        const info = variantInfo[vi];
        const r = info.tree.trunkRadius * scale;
        const C = V.trunkCollider;
        this.colliders.push(this.ctx.physics.addStaticCylinder(r, C.height, new THREE.Matrix4().makeTranslation(jx, y + C.height / 2 - 0.3, jz), {
          surface: 'wood', name: TREE_SPECIES[sp].label, segments: C.segments, cameraBlocking: false, rigid: false,
        }));
      }
    }
    this.trees = new InstancedLOD(this.root, variants, instances);
    this.treeCount = instances.length;
  }

  _treeAllowed(x, z) {
    const V = VEGETATION;
    const T = this.terrain;
    for (const c of V.clearings) if (Math.hypot(x - c.center[0], z - c.center[1]) < c.radius) return false;
    const y = T.heightAt(x, z);
    if (y < T.level + V.minAboveWater) return false;
    T.normalAt(x, z, _n);
    if (_n.y < V.minNormalY) return false;
    if (T.mask(x, z, 0) > 0.05 || T.mask(x, z, 2) > 0.05) return false;
    if (T.pathDistance(x, z) < V.pathClearance) return false;
    return true;
  }

  // -------------------------------------------------------------- rocks

  _buildRocks() {
    const V = VEGETATION.rocks;
    const T = this.terrain;
    const lib = this.ctx.library;
    const mat = lib.get('rock');
    this.rockMaterial = mat;
    const variants = [];
    for (let k = 0; k < ROCKS.variants; k++) {
      const hi = buildRock(500 + k * 31);
      const lo = new THREE.IcosahedronGeometry(1, 1);
      lo.scale(1.05, 0.75, 1.05);
      lo.translate(0, ROCKS.flatten * 0.8, 0);
      this.owned.push(hi, lo);
      variants.push({ near: [{ geometry: hi, material: mat, shadow: true }], far: [{ geometry: lo, material: mat }] });
    }
    const instances = [];
    const N = this.N;
    let seed = 1;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const half = T.T.size / 2 - 20;
    const place = (count, test, scaleRange, sink) => {
      let tries = 0;
      let placed = 0;
      while (placed < count && tries < count * 40) {
        tries++;
        const x = (rnd() * 2 - 1) * half;
        const z = (rnd() * 2 - 1) * half;
        if (!test(x, z)) continue;
        const y = T.heightAt(x, z);
        const s = scaleRange[0] + rnd() * (scaleRange[1] - scaleRange[0]);
        T.normalAt(x, z, _n);
        _q.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, _n.clone().lerp(THREE.Object3D.DEFAULT_UP, 0.4).normalize());
        _q.multiply(new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rnd() * Math.PI * 2));
        const pos = new THREE.Vector3(x, y - s * sink, z);
        const matrix = new THREE.Matrix4().compose(pos, _q, new THREE.Vector3(s * (0.8 + rnd() * 0.4), s * (0.7 + rnd() * 0.5), s * (0.8 + rnd() * 0.4)));
        instances.push({ variant: Math.floor(rnd() * ROCKS.variants), matrix, pos });
        if (s > ROCKS.colliderMin) {
          this.colliders.push(this.ctx.physics.addStaticCylinder(s * 0.8, s * 1.2, new THREE.Matrix4().makeTranslation(x, y + s * 0.3, z), { surface: 'stone', name: 'Kaya', segments: 10, rigid: false }));
        }
        placed++;
      }
    };
    const slope = (x, z) => T.normalAt(x, z, _n).y;
    const inClearing = (x, z) => VEGETATION.clearings.slice(0, 1).some((c) => Math.hypot(x - c.center[0], z - c.center[1]) < c.radius - 30);
    place(V.cliffCount, (x, z) => slope(x, z) < 0.72 && !inClearing(x, z) && T.heightAt(x, z) > T.level - 1, ROCKS.cliff, 0.35);
    place(V.shoreCount, (x, z) => Math.abs(T.heightAt(x, z) - T.level) < 1.2 && T.pathDistance(x, z) > 4, ROCKS.shore, 0.3);
    place(V.forestCount, (x, z) => T.mask(x, z, 1) > 0.5 && slope(x, z) > 0.75 && T.pathDistance(x, z) > 5, ROCKS.forest, 0.35);
    place(V.meadowCount, (x, z) => T.mask(x, z, 1) < 0.2 && slope(x, z) > 0.8 && T.heightAt(x, z) > T.level + 1 && !this._nearClearing(x, z) && T.pathDistance(x, z) > 6 && N.fbm01(x / 1600 + 0.5, z / 1600 + 0.5, 8, 2) > 0.5, ROCKS.meadow, 0.4);
    this.rocks = new InstancedLOD(this.root, variants, instances);
    this.rockCount = instances.length;
  }

  _nearClearing(x, z) {
    return VEGETATION.clearings.some((c) => Math.hypot(x - c.center[0], z - c.center[1]) < c.radius + 5);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} cam
   * @param {{nearScale:number, maxDist:number, wind:number}} o
   */
  update(dt, cam, o) {
    this.wind.time.value += dt * (0.8 + o.wind * 0.6);
    this.wind.strength.value = 0.35 + o.wind * 0.9;
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = VEGETATION.refresh;
    this.trees.update(cam, VEGETATION.nearDistance * o.nearScale, o.maxDist);
    this.rocks.update(cam, VEGETATION.nearDistance * 1.4 * o.nearScale, o.maxDist);
  }

  /** Force an immediate LOD refresh (after teleports). */
  refresh() {
    this._timer = 0;
  }

  dispose() {
    this.trees?.dispose();
    this.rocks?.dispose();
    for (const c of this.colliders) this.ctx.physics.removeCollider(c);
    for (const r of this.owned) r.dispose();
    for (const k of this.borrowed) this.ctx.library.releaseTextures(k);
    if (this.rockMaterial) this.ctx.library.release(this.rockMaterial);
  }
}
