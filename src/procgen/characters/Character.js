/**
 * @file Character — assembles a complete student from a saved description:
 * skeleton, sculpted head with facial blend shapes, eyes, hair, clothed
 * body (one atlas material), simulated robe / cape / scarf, glasses, wand
 * and house crest. Owns every GPU resource it creates and disposes them on
 * rebuild. The Animator poses the bones; update() then runs the cloth and
 * level-of-detail.
 *
 * Convention: root at the feet, facing -Z.
 */
import * as THREE from 'three';
import {
  SKIN_TONES, HAIR_COLORS, EYE_COLORS, HOUSES, GLASSES, CLOTH_COLORS, ROBE, CLOTH, CHARACTER_LOD, HAIR_STYLES, REF_HEIGHT,
} from '../../data/character.js';
import { WAND } from '../../data/wands.js';
import { resolveAppearance, sanitizeCharacter, mulberry } from './Appearance.js';
import { jointPositions, buildSkeleton, BONE_INDEX as B } from './Skeleton.js';
import { faceShape, buildHead, HEAD_MORPHS } from './HeadGenerator.js';
import { buildHair } from './HairGenerator.js';
import { bodyShape, buildBody } from './BodyGenerator.js';
import { robeLayout, capeLayout, scarfLayout } from './Garments.js';
import { ClothGarment } from './ClothGarment.js';
import { buildWand, sanitizeWand } from './WandGenerator.js';
import { MeshBuilder } from './MeshKit.js';
import {
  paintFace, paintIris, paintClothing, paintStripes, acquireHairTextures, releaseHairTextures,
} from './CharacterTextures.js';

const IDENTITY = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/** Library keys whose textures characters borrow. */
export const CHARACTER_MATERIAL_KEYS = Object.freeze(['robeFabric', 'skin', 'tapestry:lion', 'tapestry:badger', 'tapestry:eagle', 'tapestry:snake']);

/**
 * Material whose back faces show a lining colour (robes, capes).
 * @param {THREE.MeshPhysicalMaterial} m
 * @param {THREE.Color} lining
 * @param {string} key program cache key
 */
function withLining(m, lining, key) {
  m.userData.uLining = { value: lining };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLining = m.userData.uLining;
    shader.fragmentShader = `uniform vec3 uLining;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n\tif (!gl_FrontFacing) diffuseColor.rgb = uLining * (0.82 + 0.18 * diffuseColor.g * 4.0);',
    );
  };
  m.customProgramCacheKey = () => key;
  return m;
}

export class Character {
  /**
   * @param {{library?:import('../../render/MaterialLibrary.js').MaterialLibrary, preset:any, name?:string}} o
   */
  constructor(o) {
    this.library = o.library ?? null;
    this.preset = o.preset;
    this.root = new THREE.Group();
    this.root.name = o.name ?? 'Character';
    this.data = null;
    this.bones = [];
    this.bone = {};
    this.skeleton = null;
    this.headMesh = null;
    this.garments = [];
    this.capsules = [];
    this.morph = Object.fromEntries(HEAD_MORPHS.map((k) => [k, 0]));
    this.wandTip = null;
    this.opacity = 1;
    this._owned = [];
    this._borrowed = [];
    this._views = [];
    this._materials = [];
    this._mouth = { value: 0 };
    this.buildMs = 0;
    this.simulateCloth = true;
    /** Bind-space joints of the current build (animator / IK read them). */
    this.joints = null;
  }

  /**
   * (Re)build from a character description.
   * @param {any} data {appearance, house, outfit, wand, firstName, lastName}
   */
  build(data) {
    const t0 = performance.now();
    const timings = {};
    let tMark = t0;
    const mark = (name) => {
      const now = performance.now();
      timings[name] = now - tMark;
      tMark = now;
    };
    const old = this._snapshot();
    const d = sanitizeCharacter(data);
    const seedBase = hashString(`${d.firstName}|${d.lastName}`);
    d.wand = sanitizeWand(d.wand, mulberry(seedBase));
    this.data = d;
    const a = d.appearance;
    const v = resolveAppearance(a);
    this.params = v;
    const preset = this.preset;

    // ---- Skeleton
    const J = jointPositions({ height: v.height, build: v.build, shoulders: v.shoulders, headScale: v.headScale });
    const F = faceShape(v);
    J.eyeL = J.headCenter.clone().add(new THREE.Vector3(-F.eye.x, F.eye.y, F.eye.z));
    J.eyeR = J.headCenter.clone().add(new THREE.Vector3(F.eye.x, F.eye.y, F.eye.z));
    this.joints = J;
    const rig = buildSkeleton(J);
    this.bones = rig.bones;
    this.bone = rig.byName;
    this.skeleton = rig.skeleton;
    this.restPositions = rig.rest;
    this.root.add(rig.bones[0]);
    const S = bodyShape(J, v);
    this.shape = S;
    this.height = v.height;

    const house = HOUSES[d.house] ?? HOUSES.none;
    const tone = SKIN_TONES[a.skinTone];
    const hairColor = HAIR_COLORS[a.hairColor].color;
    const style = HAIR_STYLES[a.hairStyle];
    const lib = this.library;
    const borrow = (key) => {
      const t = lib?.acquireTextures(key) ?? null;
      if (t) this._borrowed.push(key);
      return t;
    };
    const own = (x) => (this._owned.push(x), x);
    const view = (key, map, channel) => {
      const t = lib?.textureView(key, map, channel) ?? null;
      if (t) this._views.push(t);
      return t;
    };
    const mat = (m) => (this._materials.push(m), m);

    // ---- Head (+ ears, lids, lashes, teeth) and the painted face.
    const head = buildHead(F, { headBone: B.head, neckBone: B.neck, detail: preset.headDetail ?? 1 });
    head.geometry.translate(J.headCenter.x, J.headCenter.y, J.headCenter.z);
    own(head.geometry);
    mark('head');
    const faceTex = own(paintFace({ size: preset.characterTexture ?? 1024, F, grid: head.grid, style, tone, hair: hairColor, freckles: a.freckles, seed: seedBase }));
    mark('face');
    const skinMat = mat(new THREE.MeshPhysicalMaterial({
      map: faceTex,
      roughness: 0.56,
      sheen: 0.35,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color(tone.red),
    }));
    const skinNormal = view('skin', 'normal', 1);
    if (skinNormal) {
      skinMat.normalMap = skinNormal;
      skinMat.normalScale.setScalar(0.35);
    }
    const mouth = this._mouth;
    skinMat.onBeforeCompile = (shader) => {
      shader.uniforms.uMouthOpen = mouth;
      shader.vertexShader = `attribute float aMouth;\nvarying float vMouth;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvMouth = aMouth;');
      shader.fragmentShader = `uniform float uMouthOpen;\nvarying float vMouth;\n${shader.fragmentShader}`.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n\tdiffuseColor.rgb *= 1.0 - clamp(vMouth, 0.0, 1.0) * mix(0.3, 0.93, uMouthOpen);',
      );
    };
    skinMat.customProgramCacheKey = () => 'characterSkin';
    const headMesh = this._skinned(head.geometry, skinMat, 'faceMesh');
    this.headMesh = headMesh;

    // ---- Eyes.
    const eyeGeo = own(eyeballGeometry(F.eye.r));
    const eyeMat = mat(new THREE.MeshPhysicalMaterial({ map: own(paintIris(EYE_COLORS[a.eyeColor].color, seedBase)), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 }));
    for (const side of ['L', 'R']) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.name = `eye${side}`;
      this.bone[`eye${side}`].add(eye);
    }

    // ---- Hair.
    const hairGeo = buildHair(F, head.sdf, a.hairStyle, { headBone: B.head, neckBone: B.neck, chestBone: B.chest, seed: seedBase });
    hairGeo.translate(J.headCenter.x, J.headCenter.y, J.headCenter.z);
    own(hairGeo);
    mark('hair');
    const hairTex = acquireHairTextures();
    this._hairTextures = true;
    const hc = new THREE.Color(hairColor);
    const hairMat = mat(new THREE.MeshPhysicalMaterial({
      color: hc,
      map: hairTex.map,
      normalMap: hairTex.normal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.46,
      anisotropy: 0.55,
      sheen: 0.25,
      sheenRoughness: 0.35,
      sheenColor: hc.clone().lerp(new THREE.Color(1, 1, 1), 0.3),
      side: THREE.DoubleSide,
    }));
    this._skinned(hairGeo, hairMat, 'hair');

    // ---- Body: clothing atlas + skin (neck, hands).
    const body = buildBody(J, S, { outfit: d.outfit, lower: a.lower });
    own(body.clothes);
    own(body.skin);
    mark('body');
    const atlas = paintClothing({ size: preset.characterTexture ?? 1024, outfit: d.outfit, house: d.house, lower: a.lower, number: 1 + (seedBase % 9), seed: seedBase });
    own(atlas.map);
    own(atlas.rough);
    mark('atlas');
    const fabric = borrow('robeFabric');
    const clothesMat = mat(new THREE.MeshPhysicalMaterial({
      map: atlas.map,
      roughnessMap: atlas.rough,
      roughness: 1,
      sheen: 0.45,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color(0x4a4a52),
      side: THREE.DoubleSide,
    }));
    const fabricNormal = view('robeFabric', 'normal', 1);
    if (fabricNormal) {
      clothesMat.normalMap = fabricNormal;
      clothesMat.normalScale.setScalar(0.6);
    }
    this._skinned(body.clothes, clothesMat, 'clothes');
    this._skinned(body.skin, skinMat, 'skinBody');

    // ---- Garments (cloth simulation).
    this.garments = [];
    if (d.outfit === 'uniform') {
      const robeMat = mat(withLining(new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(CLOTH_COLORS.robe).multiplyScalar(3.2),
        map: fabric?.albedo ?? null,
        normalMap: fabric?.normal ?? null,
        roughness: 0.9,
        sheen: 1,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color(0x3a3c48),
        side: THREE.DoubleSide,
      }), new THREE.Color(house.lining), 'characterRobe'));
      if (!fabric) robeMat.color.set(CLOTH_COLORS.robe);
      this._garment(robeLayout(J, S), robeMat, 'robe');
      if (a.scarf) {
        const stripes = own(paintStripes(d.house));
        const scarfMat = mat(new THREE.MeshPhysicalMaterial({ map: stripes, normalMap: fabric?.normal ?? null, roughness: 0.95, sheen: 0.8, sheenRoughness: 0.8, sheenColor: new THREE.Color(house.secondary), side: THREE.DoubleSide }));
        this._garment(scarfLayout(J, S), scarfMat, 'scarf');
      }
      if (house.crest) this._crest(J, S, borrow(house.crest));
    } else {
      const capeMat = mat(withLining(new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(house.primary),
        normalMap: fabric?.normal ?? null,
        roughness: 0.85,
        sheen: 0.8,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(house.secondary),
        side: THREE.DoubleSide,
      }), new THREE.Color(house.secondary).multiplyScalar(0.7), 'characterCape'));
      this._garment(capeLayout(J, S), capeMat, 'cape');
    }

    mark('garments');
    // ---- Glasses.
    const gl = GLASSES[a.glasses];
    if (gl?.shape) this._glasses(J, F, gl);

    // ---- Wand in the right hand.
    const wand = buildWand(d.wand);
    own(wand.geometry);
    own(wand.texture);
    mat(wand.material);
    const axis = new THREE.Vector3(...WAND.handAxis).normalize();
    wand.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const sc = S.s;
    wand.group.position.set(WAND.handOffset[0] * sc, WAND.handOffset[1] * sc, WAND.handOffset[2] * sc).addScaledVector(axis, -WAND.grip * wand.length);
    this.bone.handR.add(wand.group);
    this.wandTip = wand.tip;
    this.wandAxis = axis;

    // ---- Collision capsules for the cloth.
    this.capsules = [
      { name: 'hips', a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.095 * sc * Math.sqrt(v.build) },
      { name: 'torso', a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.085 * sc * Math.sqrt(v.build) },
      { name: 'thighL', a: new THREE.Vector3(), b: new THREE.Vector3(), r: S.legRadius(0.15)[0] },
      { name: 'thighR', a: new THREE.Vector3(), b: new THREE.Vector3(), r: S.legRadius(0.15)[0] },
      { name: 'shinL', a: new THREE.Vector3(), b: new THREE.Vector3(), r: S.legRadius(0.65)[0] },
      { name: 'shinR', a: new THREE.Vector3(), b: new THREE.Vector3(), r: S.legRadius(0.65)[0] },
      { name: 'foreArmL', a: new THREE.Vector3(), b: new THREE.Vector3(), r: S.armRadius(0.8)[0] },
      { name: 'foreArmR', a: new THREE.Vector3(), b: new THREE.Vector3(), r: S.armRadius(0.8)[0] },
    ];

    this._disposeSnapshot(old);
    this.root.updateMatrixWorld(true);
    mark('rest');
    this.timings = timings;
    this.buildMs = performance.now() - t0;
    return this;
  }

  // ---------------------------------------------------------------- parts

  _skinned(geometry, material, name) {
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.bind(this.skeleton, IDENTITY);
    const h = this.params.height;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.5, 0), h * 0.95);
    this.root.add(mesh);
    return mesh;
  }

  _garment(spec, material, name) {
    const g = new ClothGarment(spec, this.skeleton, material, name);
    this.root.add(g.mesh);
    this.garments.push(g);
    return g;
  }

  _crest(J, S, tex) {
    if (!tex) return;
    const s = S.s;
    const [w, h] = ROBE.crest.size;
    const [cx, cy] = ROBE.crest.pos;
    const x = cx * s;
    const y = cy * s;
    const T = S.torsoAt(y);
    const off = ROBE.offset * s + 0.0035 * s;
    const zAt = (px) => T.z - (T.rzF + off) * Math.sqrt(Math.max(0, 1 - (px / (T.rx + off)) ** 2));
    const mb = new MeshBuilder();
    mb.grid(4, 1, (u, fv) => {
      const px = x + (u - 0.5) * w * s;
      const py = y + (fv - 0.5) * h * s;
      return { p: [px, py, zAt(px)], uv: [u, 1 - fv], uv1: [u, fv], w: S.torsoWeights(px, py) };
    }, { flip: true });
    const geo = mb.build();
    this._owned.push(geo);
    const m = new THREE.MeshPhysicalMaterial({ map: tex.albedo, alphaTest: 0.5, roughness: 0.8, sheen: 0.6, sheenRoughness: 0.6 });
    this._materials.push(m);
    const mesh = this._skinned(geo, m, 'crest');
    mesh.castShadow = false;
  }

  _glasses(J, F, G) {
    const group = new THREE.Group();
    group.name = 'glasses';
    const s = F.s;
    const frameMat = new THREE.MeshStandardMaterial({ color: G.color, metalness: 0.85, roughness: 0.28 });
    const lensMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02, clearcoat: 1, depthWrite: false });
    this._materials.push(frameMat, lensMat);
    const z = F.eye.z - F.eye.r - 0.009 * s;
    const rx = G.rx * s;
    const ry = G.ry * s;
    const wire = G.wire * s;
    const rim = (sx) => {
      const cx = sx * F.eye.x;
      const pts = [];
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        let x = Math.cos(a);
        let y = Math.sin(a);
        if (G.shape === 'square') {
          const k = 4;
          x = Math.sign(x) * Math.pow(Math.abs(x), 2 / k);
          y = Math.sign(y) * Math.pow(Math.abs(y), 2 / k);
        }
        pts.push(new THREE.Vector3(cx + x * rx, F.eye.y + y * ry, z + (1 - Math.abs(x)) * 0.001 * s));
      }
      return pts;
    };
    for (const sx of [-1, 1]) {
      const pts = rim(sx);
      const curvePts = G.shape === 'half' ? pts.slice(0, 21) : pts;
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePts, G.shape !== 'half'), 48, wire, 6, G.shape !== 'half');
      this._owned.push(geo);
      group.add(new THREE.Mesh(geo, frameMat));
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
      const lens = new THREE.ShapeGeometry(shape, 24);
      lens.translate(0, 0, z);
      this._owned.push(lens);
      const lm = new THREE.Mesh(lens, lensMat);
      lm.renderOrder = 2;
      group.add(lm);
      // Temple arm back to the ear.
      const outer = new THREE.Vector3(sx * (F.eye.x + rx), F.eye.y, z);
      const hinge = new THREE.Vector3(sx * (F.cranium.r[0] + 0.004 * s), F.eye.y, F.eye.z + 0.012 * s);
      const ear = new THREE.Vector3(sx * (F.cranium.r[0] + 0.002 * s), F.eye.y - 0.012 * s, 0.02 * s);
      const arm = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([outer, hinge, ear]), 16, wire * 0.9, 5, false);
      this._owned.push(arm);
      group.add(new THREE.Mesh(arm, frameMat));
    }
    // Bridge.
    const bridge = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-F.eye.x + rx * 0.98, F.eye.y + ry * 0.2, z),
      new THREE.Vector3(0, F.eye.y + ry * 0.45, z - 0.002 * s),
      new THREE.Vector3(F.eye.x - rx * 0.98, F.eye.y + ry * 0.2, z),
    ]), 12, wire, 5, false);
    this._owned.push(bridge);
    group.add(new THREE.Mesh(bridge, frameMat));
    for (const m of group.children) m.castShadow = false;
    group.position.subVectors(J.headCenter, J.head);
    this.bone.head.add(group);
  }

  // ------------------------------------------------------------- runtime

  /** Set a facial blend shape (0..1). */
  setMorph(name, value) {
    const i = this.headMesh?.morphTargetDictionary?.[name];
    if (i === undefined) return;
    this.headMesh.morphTargetInfluences[i] = value;
    this.morph[name] = value;
    if (name === 'jawOpen') this._mouth.value = value;
  }

  /** World position of the wand tip. @param {THREE.Vector3} out */
  getWandTip(out) {
    return this.wandTip ? this.wandTip.getWorldPosition(out) : out.copy(this.root.position);
  }

  /**
   * Cloth, capsules and level of detail. Call after the animator posed the bones.
   * @param {number} dt
   * @param {{camera?:THREE.Camera, wind?:THREE.Vector3, groundY?:number}} env
   */
  update(dt, env = {}) {
    this.root.updateMatrixWorld(true);
    const b = this.bone;
    const set = (cap, a, bb) => {
      a.getWorldPosition(cap.a);
      bb.getWorldPosition(cap.b);
    };
    const [hips, torso, thL, thR, shL, shR, faL, faR] = this.capsules;
    set(hips, b.thighL, b.thighR);
    hips.a.y += 0.02 * this.shape.s;
    hips.b.y += 0.02 * this.shape.s;
    set(torso, b.spine, b.neck);
    set(thL, b.thighL, b.shinL);
    set(thR, b.thighR, b.shinR);
    set(shL, b.shinL, b.footL);
    set(shR, b.shinR, b.footR);
    set(faL, b.foreArmL, b.handL);
    set(faR, b.foreArmR, b.handR);

    let dist = 0;
    if (env.camera) dist = env.camera.position.distanceTo(_v.setFromMatrixPosition(this.root.matrixWorld));
    const simulate = this.simulateCloth && dist < CLOTH.simDistance;
    const clothEnv = {
      capsules: this.capsules,
      wind: env.wind ?? _w.set(0, 0, 0),
      groundY: env.groundY ?? -Infinity,
      simulate,
      iterations: this.preset.clothIterations ?? 4,
    };
    for (const g of this.garments) g.update(dt, this.root, clothEnv);
    this.root.visible = dist < CHARACTER_LOD.hide && this.opacity > 0.02;
    const castShadow = dist < CHARACTER_LOD.shadows;
    if (castShadow !== this._castShadow) {
      this._castShadow = castShadow;
      this.root.traverse((o) => {
        if (o.isMesh && o.name !== 'crest' && o.parent?.name !== 'glasses') o.castShadow = castShadow;
      });
    }
  }

  /** Reset cloth to the current pose (after teleport). */
  resetCloth() {
    for (const g of this.garments) g.reset();
  }

  /**
   * Fade the whole character (camera very close).
   * @param {number} opacity
   */
  setOpacity(opacity) {
    if (Math.abs(opacity - this.opacity) < 1e-3) return;
    this.opacity = opacity;
    const transparent = opacity < 0.999;
    for (const m of this._materials) {
      if (m.userData.baseTransparent === undefined) m.userData.baseTransparent = m.transparent;
      const t = transparent || m.userData.baseTransparent;
      if (m.transparent !== t) {
        m.transparent = t;
        m.needsUpdate = true;
      }
      if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
      m.opacity = m.userData.baseOpacity * opacity;
      if (!m.userData.baseTransparent) m.depthWrite = !transparent;
    }
    this.root.visible = opacity > 0.02;
  }

  /** Materials (for CSM registration by the owner). */
  get materials() {
    return this._materials;
  }

  get stats() {
    let tris = 0;
    this.root.traverse((o) => {
      if (o.isMesh && o.geometry.index) tris += o.geometry.index.count / 3;
    });
    const particles = this.garments.reduce((n, g) => n + g.sim.count, 0);
    return { bones: this.bones.length, triangles: tris, particles, buildMs: this.buildMs, height: this.params?.height ?? REF_HEIGHT };
  }

  // -------------------------------------------------------------- dispose

  _snapshot() {
    const snap = {
      owned: this._owned, borrowed: this._borrowed, views: this._views, materials: this._materials, garments: this.garments,
      children: [...this.root.children], hair: this._hairTextures,
    };
    this._owned = [];
    this._borrowed = [];
    this._views = [];
    this._materials = [];
    this.garments = [];
    this._hairTextures = false;
    return snap;
  }

  _disposeSnapshot(s) {
    for (const g of s.garments) g.dispose();
    for (const c of s.children) {
      // A skeleton's bone texture is a GPU resource of its own (recreated on
      // the next render if the skeleton is still in use).
      c.traverse((o) => o.isSkinnedMesh && o.skeleton?.dispose());
      c.removeFromParent();
    }
    for (const x of s.owned) x.dispose?.();
    for (const m of s.materials) m.dispose();
    for (const k of s.borrowed) this.library?.releaseTextures(k);
    for (const v of s.views) this.library?.releaseTextureView(v);
    if (s.hair) releaseHairTextures();
  }

  dispose() {
    this._disposeSnapshot(this._snapshot());
    this.root.removeFromParent();
  }
}

/** Eyeball with a planar-projected front (iris in the texture centre). */
function eyeballGeometry(r) {
  const g = new THREE.SphereGeometry(r, 24, 16);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (z < 0) uv.setXY(i, 0.5 + (x / r) * 0.5, 0.5 - (y / r) * 0.5);
    else uv.setXY(i, 0.03, 0.5);
  }
  return g;
}

/** Small stable string hash (seeds per-character detail). */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
