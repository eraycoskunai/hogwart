/**
 * @file CellBuilder — turns one interior cell (room) description into
 * geometry, colliders, lights, flames and props. Walls get arched holes for
 * every link and window; static geometry is batched per material, so a
 * whole room costs a handful of draw calls. The returned cell owns
 * everything it created and frees it in dispose() (streaming).
 */
import * as THREE from 'three';
import { StaticBatcher } from '../../procgen/geometry/StaticBatcher.js';
import { windowUnit } from '../../procgen/geometry/CastleKit.js';
import * as K from '../../procgen/geometry/InteriorKit.js';
import { INTERIOR_KIT as IK, INTERIOR_MATERIALS } from '../../data/interior.js';
import { mulberry } from '../../procgen/characters/Appearance.js';
import { TargetDummy } from '../../gameplay/TargetDummy.js';

/** Yaw that turns local +Z toward a compass direction. */
export const FACE_YAW = Object.freeze({ s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 });
/** The direction pointing into the room from a wall. */
export const INWARD = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });
export const OPPOSITE = INWARD;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const Y = new THREE.Vector3(0, 1, 0);

/** Matrix: translation + yaw. */
export function M(x, y, z, yaw = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, yaw), _s);
}

function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * @typedef {object} CellHost
 * @property {any} physics
 * @property {any} lights
 * @property {any} flames
 * @property {any} sky
 * @property {Record<string, THREE.Material>} mats surface + prop materials by name
 * @property {import('./PortraitGallery.js').PortraitGallery} portraits
 * @property {(cellId:string) => string|null} variantOf Room of Requirement shape
 * @property {object} dummyCtx context for TargetDummy
 * @property {(o:object) => void} onGate grille gate found (region makes a door)
 */

export class CellBuilder {
  /** @param {CellHost} host */
  constructor(host) {
    this.host = host;
  }

  /**
   * @param {any} spec cell data
   * @param {{index:number, link:any}[]} links links touching this cell
   */
  build(spec, links) {
    const cell = {
      id: spec.id,
      spec,
      root: new THREE.Group(),
      colliders: [],
      sources: [],
      flames: [],
      animated: [],
      disposables: [],
      dummies: [],
      interactables: [],
      portraitSet: null,
      built: true,
    };
    cell.root.name = `Cell:${spec.id}`;
    this.cell = cell;
    this.spec = spec;
    this.batcher = new StaticBatcher();
    this.rnd = mulberry(hashId(spec.id));
    const t = IK.wall;
    this.min = new THREE.Vector3().fromArray(spec.min);
    this.max = new THREE.Vector3().fromArray(spec.max);
    this.t = t;

    this._shell(links);
    const features = [...(spec.features ?? [])];
    const variant = spec.variants ? this.host.variantOf(spec.id) : null;
    if (variant && spec.variants[variant]) features.push(...spec.variants[variant].features);
    const portraitList = [];
    for (const f of features) {
      if (f.type === 'portraits') portraitList.push(...f.list);
      else this._feature(f);
    }
    if (spec.staircases) this._staircaseLandings(spec);
    if (portraitList.length) {
      const entries = portraitList.map((p) => ({ ...p, position: this._wallPoint(p.side, p.at, p.y, 0.04), yaw: this._yawInward(p.side) }));
      cell.portraitSet = this.host.portraits.buildSet(cell, entries);
    }

    for (const mesh of this.batcher.build({ castShadow: true, receiveShadow: true })) {
      cell.root.add(mesh);
      cell.disposables.push(mesh.geometry);
    }
    cell.dispose = () => this._dispose(cell);
    this.cell = null;
    return cell;
  }

  // ------------------------------------------------------------ helpers

  _add(geo, matrix, mat, tile) {
    const tl = tile ?? INTERIOR_MATERIALS[mat]?.tile ?? 0;
    this.batcher.add(geo, matrix, this.host.mats[mat], tl);
    geo.dispose();
  }

  _box(cx, cy, cz, sx, sy, sz, name = this.spec.name, surface = 'stone', yaw = 0) {
    const m = M(cx, cy, cz, yaw);
    this.cell.colliders.push(this.host.physics.addStaticBox(new THREE.Vector3(sx, sy, sz), m, { surface, name, rigid: false }));
  }

  _cyl(x, y, z, r, h, name, surface = 'stone') {
    this.cell.colliders.push(this.host.physics.addStaticCylinder(r, h, new THREE.Matrix4().makeTranslation(x, y + h / 2, z), { surface, name, rigid: false }));
  }

  /** Point on the inner face of a wall (+ `off` into the room). */
  _wallPoint(side, at, y, off = 0) {
    const { min, max } = this;
    if (side === 'n') return new THREE.Vector3(at, y, min.z + off);
    if (side === 's') return new THREE.Vector3(at, y, max.z - off);
    if (side === 'e') return new THREE.Vector3(max.x - off, y, at);
    return new THREE.Vector3(min.x + off, y, at);
  }

  _yawInward(side) {
    return FACE_YAW[INWARD[side]];
  }

  _light(pos, color, intensity, distance, flicker) {
    const src = this.host.lights.add({ position: pos, color, intensity, distance, flicker });
    this.cell.sources.push(src);
    return src;
  }

  _flame(pos, o) {
    const i = this.host.flames.add(pos, o);
    if (i >= 0) this.cell.flames.push(i);
    return i;
  }

  // ------------------------------------------------------------- shell

  _shell(links) {
    const { min, max, t, spec } = this;
    const F = IK.floorThickness;
    const wallMat = spec.walls;
    const bottom = min.y - F;
    const top = max.y + t;
    const H = top - bottom;
    const holes = { n: [], s: [], e: [], w: [] };
    for (const { link, side } of links) {
      holes[side].push({ at: link.at, v: link.y - bottom, w: link.width, h: link.height, shape: 'arch', floor: true });
    }
    for (const w of spec.windows ?? []) holes[w.side].push({ at: w.at, v: w.y - bottom, w: w.width, h: w.height, shape: 'arch', window: w });

    for (const side of ['n', 's', 'e', 'w']) {
      const alongX = side === 'n' || side === 's';
      const u0 = alongX ? min.x - t : min.z;
      const len = alongX ? max.x - min.x + 2 * t : max.z - min.z;
      const hs = holes[side].map((h) => ({ ...h, u: h.at - u0 }));
      const geo = K.wallWithHoles(len, H, t, hs);
      let m;
      if (side === 'n') m = M(u0, bottom, min.z - t);
      else if (side === 's') m = M(u0, bottom, max.z);
      else if (side === 'e') m = M(max.x + t, bottom, u0, -Math.PI / 2);
      else m = M(min.x, bottom, u0, -Math.PI / 2);
      this._add(geo, m, wallMat);
      this._wallColliders(side, u0, len, bottom, H, hs);
      // Window frames and panes.
      for (const h of hs) {
        if (h.window) this._window(side, h.at, h.window.y, h.window.width, h.window.height);
        else this._doorFrame(side, h.at, bottom + h.v, h.w, h.h);
      }
    }

    // Floor slab (under the walls too, so doorways have a floor).
    const fx = max.x - min.x + 2 * t;
    const fz = max.z - min.z + 2 * t;
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;
    if (spec.floor) {
      this._add(K.box(fx, F, fz), M(cx, bottom, cz), spec.floor);
      this._box(cx, min.y - F / 2, cz, fx, F, fz, spec.name, spec.floor === 'parquet' || spec.floor === 'wood' ? 'wood' : 'stone');
    }
    // Ceiling.
    const ceilMat = spec.ceiling === 'wood' ? 'wood' : spec.ceiling === 'enchanted' ? wallMat : spec.ceiling;
    this._add(K.box(fx, t, fz), M(cx, max.y, cz), ceilMat);
    this._box(cx, max.y + t / 2, cz, fx, t, fz);
    if (spec.ceiling === 'wood') this._beams();
    if (spec.ceiling === 'enchanted' && this.host.sky) {
      const w = max.x - min.x;
      const d = max.z - min.z;
      const center = new THREE.Vector3(cx, max.y - 0.03, cz);
      const mat = this.host.sky.createCeilingMaterial(center, d * 0.45);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      plane.rotation.x = Math.PI / 2;
      plane.position.copy(center);
      this.cell.root.add(plane);
      this.cell.disposables.push(plane.geometry, mat);
    }
    // Skirting trim along the base of the walls.
    const trim = 0.22;
    for (const side of ['n', 's', 'e', 'w']) {
      const alongX = side === 'n' || side === 's';
      const len = alongX ? max.x - min.x : max.z - min.z;
      const p = this._wallPoint(side, alongX ? cx : cz, min.y, 0.04);
      const g = K.box(len, trim, 0.08);
      this._add(g, M(p.x, p.y, p.z, alongX ? 0 : Math.PI / 2), 'trim');
    }
  }

  /** Colliders for a wall with openings (solid spans + sills + lintels). */
  _wallColliders(side, u0, len, bottom, H, holes) {
    const { min, max, t } = this;
    const doors = holes.filter((h) => h.floor);
    const cuts = new Set([0, len]);
    for (const h of doors) {
      cuts.add(THREE.MathUtils.clamp(h.u - h.w / 2, 0, len));
      cuts.add(THREE.MathUtils.clamp(h.u + h.w / 2, 0, len));
    }
    const xs = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i];
      const b = xs[i + 1];
      if (b - a < 1e-3) continue;
      const mid = (a + b) / 2;
      // Vertical solid ranges: [0, H] minus openings covering this span.
      let ranges = [[0, H]];
      for (const h of doors) {
        if (mid < h.u - h.w / 2 || mid > h.u + h.w / 2) continue;
        const next = [];
        for (const [r0, r1] of ranges) {
          if (h.v + h.h <= r0 || h.v >= r1) next.push([r0, r1]);
          else {
            if (h.v > r0) next.push([r0, h.v]);
            if (h.v + h.h < r1) next.push([h.v + h.h, r1]);
          }
        }
        ranges = next;
      }
      for (const [r0, r1] of ranges) {
        if (r1 - r0 < 0.02) continue;
        const cy = bottom + (r0 + r1) / 2;
        const u = u0 + mid;
        const sz = b - a;
        if (side === 'n') this._box(u, cy, min.z - t / 2, sz, r1 - r0, t);
        else if (side === 's') this._box(u, cy, max.z + t / 2, sz, r1 - r0, t);
        else if (side === 'e') this._box(max.x + t / 2, cy, u, t, r1 - r0, sz);
        else this._box(min.x - t / 2, cy, u, t, r1 - r0, sz);
      }
    }
  }

  _doorFrame(side, at, y, w, h) {
    const p = this._wallPoint(side, at, y, 0);
    const yaw = this._yawInward(side);
    const g = K.archFrame(w, h, 0.22, 0.12);
    this._add(g, M(p.x, p.y, p.z, yaw), 'trim');
  }

  _window(side, at, y, w, h) {
    const t = this.t;
    const p = this._wallPoint(side, at, y, 0);
    const yaw = this._yawInward(side);
    const { frame, pane } = windowUnit(w, h);
    this._add(frame, M(p.x, p.y, p.z, yaw), 'trim');
    // Pane in the middle of the wall's depth.
    const back = this._wallPoint(side, at, y, -t * 0.5);
    this._add(pane, M(back.x, back.y, back.z, yaw), 'glass', 0);
  }

  _beams() {
    const { min, max } = this;
    const alongX = max.x - min.x < max.z - min.z;
    const span = alongX ? max.x - min.x : max.z - min.z;
    const lenAxis = alongX ? [min.z, max.z] : [min.x, max.x];
    for (let a = lenAxis[0] + 1.5; a < lenAxis[1] - 0.5; a += 3) {
      const g = K.box(span, 0.35, 0.3);
      if (alongX) this._add(g, M((min.x + max.x) / 2, max.y - 0.35, a), 'wood');
      else this._add(g, M(a, max.y - 0.35, (min.z + max.z) / 2, Math.PI / 2), 'wood');
    }
  }

  // ------------------------------------------------------------ features

  _feature(f) {
    const fn = this[`_f_${f.type}`];
    if (!fn) throw new Error(`Bilinmeyen iç mekân öğesi: ${f.type}`);
    fn.call(this, f);
  }

  _f_columns(f) {
    const h = this.max.y - this.min.y;
    for (const [x, z] of f.positions) {
      this._add(K.column(f.radius, h), M(x, this.min.y, z), f.mat ?? 'trim');
      this._cyl(x, this.min.y, z, f.radius * 1.15, h, 'Sütun');
    }
  }

  _f_carpet(f) {
    const [x0, z0] = f.from;
    const [x1, z1] = f.to;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const g = new THREE.PlaneGeometry(f.width, len);
    g.rotateX(-Math.PI / 2);
    this._add(g, M((x0 + x1) / 2, this.min.y + 0.012, (z0 + z1) / 2, yaw), 'carpet');
  }

  _f_rug(f) {
    const g = new THREE.PlaneGeometry(f.size[0], f.size[1]);
    g.rotateX(-Math.PI / 2);
    this._add(g, M(f.pos[0], this.min.y + 0.012, f.pos[1]), 'carpet');
  }

  _f_tapestries(f) {
    for (const tp of f.list) {
      const mat = this.host.mats[`tap:${tp.key}`];
      const [w, h] = tp.size;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      const p = this._wallPoint(tp.side, tp.at, tp.y, 0.04);
      cloth.position.copy(p);
      cloth.rotation.y = this._yawInward(tp.side);
      cloth.receiveShadow = true;
      this.cell.root.add(cloth);
      this.cell.disposables.push(cloth.geometry);
      // Brass rod on top.
      this._add(K.cyl(0.03, 0.03, w + 0.3, 6), M(p.x, p.y + h / 2 + 0.02, p.z, this._yawInward(tp.side)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, -(w + 0.3) / 2, 0)), 'brass');
    }
  }

  _f_torches(f) {
    const T = IK.torch;
    for (const [side, at, base] of f.list) {
      const y0 = (base ?? this.min.y) + T.height;
      const p = this._wallPoint(side, at, y0, 0);
      const yaw = this._yawInward(side);
      const { iron, wood } = K.torchBracket();
      this._add(iron, M(p.x, p.y, p.z, yaw), 'iron');
      this._add(wood, M(p.x, p.y, p.z, yaw), 'wood');
      const flame = this._wallPoint(side, at, y0 + 0.12, 0.32);
      const light = this._wallPoint(side, at, y0 + 0.4, 0.6);
      const src = this._light(light.toArray(), T.color, T.intensity, T.distance, 'torch');
      this._flame(flame.toArray(), { width: 0.26, height: 0.56, brightness: 1.8, source: src });
    }
  }

  _f_lights(f) {
    for (const l of f.list) this._light(l.pos, l.color, l.intensity, l.distance, l.flicker);
  }

  _f_armor(f) {
    for (const a of f.list) {
      const [x, z] = a.pos;
      this._add(K.armor(), M(x, this.min.y, z, FACE_YAW[OPPOSITE[a.face]]), 'iron');
      this._cyl(x, this.min.y, z, IK.armor.collider, IK.armor.height, 'Zırh', 'metal');
    }
  }

  _f_chandelier(f) {
    const [x, y, z] = f.pos;
    const { iron, candles } = K.chandelier(f.radius, f.candles);
    this._add(iron, M(x, y, z), 'iron');
    for (const c of candles) {
      this._add(K.candle(), M(x + c.x, y + c.y, z + c.z), 'wax', 0);
      this._flame([x + c.x, y + c.y + 0.25, z + c.z], { width: 0.08, height: 0.18, brightness: 1.6 });
    }
    const l = f.light;
    this._light([x, y - 0.4, z], l.color, l.intensity, l.distance, 'candle');
  }

  _f_candles(f) {
    const { min, max } = this;
    const n = f.count;
    const geo = K.candle(0.26, 0.035);
    const mesh = new THREE.InstancedMesh(geo, this.host.mats.wax, n);
    mesh.castShadow = false;
    const [y0, y1] = f.height;
    const list = [];
    for (let i = 0; i < n; i++) {
      const px = min.x + 1 + this.rnd() * (max.x - min.x - 2);
      const pz = min.z + 1 + this.rnd() * (max.z - min.z - 2);
      const py = min.y + y0 + this.rnd() * (y1 - y0);
      const flame = this._flame([px, py + 0.26, pz], { width: 0.09, height: 0.2, brightness: 1.8 });
      list.push({ x: px, y: py, z: pz, phase: this.rnd() * Math.PI * 2, speed: 0.6 + this.rnd() * 0.5, flame });
    }
    this.cell.root.add(mesh);
    this.cell.disposables.push(geo);
    const flames = this.host.flames;
    this.cell.animated.push((time) => {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const y = c.y + Math.sin(time * c.speed + c.phase) * 0.12;
        _m.compose(_v.set(c.x, y, c.z), _q.identity(), _s);
        mesh.setMatrixAt(i, _m);
        if (c.flame >= 0) flames.setPosition(c.flame, c.x, y + 0.26, c.z);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  _f_dais(f) {
    const [x0, z0] = f.min;
    const [x1, z1] = f.max;
    const h = f.height;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const y = this.min.y;
    this._add(K.box(x1 - x0, h, z1 - z0), M(cx, y, cz), f.mat);
    this._box(cx, y + h / 2, cz, x1 - x0, h, z1 - z0, 'Kürsü');
    const side = f.stepSide ?? 's';
    const n = f.steps;
    const depth = 0.35;
    for (let i = 0; i < n; i++) {
      const sh = (h * (n - i - 1)) / n;
      if (sh <= 0.01) continue;
      const off = depth * (i + 0.5);
      if (side === 's') {
        this._add(K.box(x1 - x0, sh, depth), M(cx, y, z1 + off), f.mat);
        this._box(cx, y + sh / 2, z1 + off, x1 - x0, sh, depth, 'Basamak');
      } else {
        this._add(K.box(depth, sh, z1 - z0), M(x1 + off, y, cz), f.mat);
        this._box(x1 + off, y + sh / 2, cz, depth, sh, z1 - z0, 'Basamak');
      }
    }
  }

  _table(x, z, length, axis, y, mat) {
    const yaw = axis === 'z' ? Math.PI / 2 : 0;
    const top = 0.82;
    const width = 1.2;
    this._add(K.longTable(length, width, top), M(x, y, z, yaw), mat);
    this._box(x, y + top / 2, z, length, top, width, 'Masa', 'wood', yaw);
  }

  _f_tables(f) {
    for (const t of f.list) {
      const [x, z] = t.pos;
      const y = this.min.y + (t.y ?? 0);
      this._table(x, z, t.length, t.axis, y, f.mat);
      const yaw = t.axis === 'z' ? Math.PI / 2 : 0;
      for (const side of [-1, 1]) {
        const bx = t.axis === 'z' ? x + side * 1.05 : x;
        const bz = t.axis === 'z' ? z : z + side * 1.05;
        this._add(K.bench(t.length - 0.4), M(bx, y, bz, yaw), f.mat);
        this._box(bx, y + 0.23, bz, t.length - 0.4, 0.46, 0.42, 'Sıra', 'wood', yaw);
      }
    }
  }

  _f_staffTable(f) {
    const [x, z] = f.pos;
    const y = this.min.y + f.y;
    this._table(x, z, f.length, 'x', y, f.mat);
    for (let i = 0; i < f.chairs; i++) {
      const cx = x - f.length / 2 + 0.9 + (i * (f.length - 1.8)) / Math.max(1, f.chairs - 1);
      this._add(K.chair(true), M(cx, y, z - 0.95, Math.PI), f.mat);
      this._box(cx, y + 0.5, z - 0.95, 0.5, 1, 0.5, 'Sandalye', 'wood');
    }
    // Goblets and plates along the table.
    for (let i = 0; i < f.chairs; i++) {
      const cx = x - f.length / 2 + 0.9 + (i * (f.length - 1.8)) / Math.max(1, f.chairs - 1);
      this._add(K.cyl(0.04, 0.025, 0.16, 8), M(cx + 0.25, y + 0.82, z - 0.2), 'brass');
      this._add(K.cyl(0.13, 0.12, 0.02, 14), M(cx, y + 0.82, z - 0.25), 'brass');
    }
  }

  _f_lectern(f) {
    const [x, z] = f.pos;
    const { wood, gold } = K.lectern(f.owl);
    const yaw = FACE_YAW[OPPOSITE[f.face]];
    this._add(wood, M(x, this.min.y, z, yaw), f.owl ? 'brass' : 'wood');
    if (gold) this._add(gold, M(x, this.min.y, z, yaw), 'brass');
    this._cyl(x, this.min.y, z, 0.35, 1.5, 'Kürsü');
  }

  _shelf(from, to, height, double, face, mat) {
    const B = IK.bookshelf;
    const alongX = Math.abs(to[0] - from[0]) > Math.abs(to[1] - from[1]);
    const f = face ?? (alongX ? 's' : 'e');
    const yaw = FACE_YAW[f];
    const lx = new THREE.Vector3(1, 0, 0).applyAxisAngle(Y, yaw);
    const a = new THREE.Vector3(from[0], 0, from[1]);
    const b = new THREE.Vector3(to[0], 0, to[1]);
    const origin = b.clone().sub(a).dot(lx) > 0 ? a : b;
    const length = a.distanceTo(b);
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(Y, yaw);
    if (!double) origin.addScaledVector(fwd, -B.depth / 2);
    const { frame, books } = K.bookshelf(length, height, double);
    const m = M(origin.x, this.min.y, origin.z, yaw);
    this._add(frame, m, mat);
    this._add(books, m, 'books', 0);
    const c = a.clone().add(b).multiplyScalar(0.5);
    const depth = double ? B.depth * 2 : B.depth;
    this._box(c.x, this.min.y + height / 2, c.z, alongX ? length : depth, height, alongX ? depth : length, 'Kitaplık', 'wood');
  }

  _f_bookshelves(f) {
    for (const s of f.list) {
      const alongX = Math.abs(s.to[0] - s.from[0]) > Math.abs(s.to[1] - s.from[1]);
      const k = alongX ? 0 : 1;
      let spans = [[s.from, s.to]];
      for (const [g0, g1] of s.gaps ?? []) {
        const next = [];
        for (const [p, q] of spans) {
          const lo = Math.min(p[k], q[k]);
          const hi = Math.max(p[k], q[k]);
          if (g1 <= lo || g0 >= hi) next.push([p, q]);
          else {
            const mk = (v) => (k === 0 ? [v, p[1]] : [p[0], v]);
            if (g0 > lo) next.push([mk(lo), mk(g0)]);
            if (g1 < hi) next.push([mk(g1), mk(hi)]);
          }
        }
        spans = next;
      }
      for (const [p, q] of spans) this._shelf(p, q, f.height, s.double, s.face, f.mat);
    }
  }

  _f_grille(f) {
    const y = this.min.y;
    const g0 = f.gate.at - f.gate.width / 2;
    const g1 = f.gate.at + f.gate.width / 2;
    for (const [a, b] of [[f.from, g0], [g1, f.to]]) {
      if (b - a < 0.05) continue;
      this._add(K.grille(b - a, f.height), M(a, y, f.z), 'iron');
      this._box((a + b) / 2, y + f.height / 2, f.z, b - a, f.height, 0.1, 'Parmaklık', 'metal');
    }
    this._add(K.box(f.gate.width + 0.3, 0.3, 0.3), M(f.gate.at, y + f.height + 0.2, f.z), 'iron');
    this.host.onGate({ cell: this.spec.id, at: f.gate.at, z: f.z, y, width: f.gate.width, height: f.height });
  }

  _f_lamps(f) {
    for (const [x, z] of f.list) {
      const y = this.min.y + 0.82;
      this._add(K.cyl(0.08, 0.1, 0.03, 10), M(x, y, z), 'brass');
      this._add(K.candle(0.18, 0.025), M(x, y + 0.03, z), 'wax', 0);
      this._flame([x, y + 0.21, z], { width: 0.07, height: 0.15, brightness: 1.4 });
      // Open book beside the lamp.
      const g = K.box(0.36, 0.03, 0.26);
      this._add(g, M(x + 0.3, y, z + 0.1, 0.3), 'leather', 0);
    }
  }

  _f_desks(f) {
    const yaw = FACE_YAW[OPPOSITE[f.face]];
    for (const [x, z] of f.list) {
      const y = this.min.y;
      this._add(K.desk(), M(x, y, z, yaw), 'wood');
      const back = new THREE.Vector3(0, 0, 0.6).applyAxisAngle(Y, yaw);
      this._add(K.bench(IK.desk.width), M(x + back.x, y, z + back.z, yaw), 'wood');
      const alongX = f.face === 'n' || f.face === 's';
      this._box(x, y + IK.desk.height / 2, z, alongX ? IK.desk.width : IK.desk.depth, IK.desk.height, alongX ? IK.desk.depth : IK.desk.width, 'Sıra', 'wood');
      if (f.cauldron) {
        const { iron, liquid } = K.cauldron();
        this._add(iron, M(x, y + IK.desk.height, z), 'iron');
        this._add(liquid, M(x, y + IK.desk.height, z), 'potion', 0);
      } else {
        // Quill, inkpot and a book on each desk.
        const fwd = new THREE.Vector3(0.35, 0, -0.1).applyAxisAngle(Y, yaw);
        this._add(K.cyl(0.03, 0.035, 0.06, 8), M(x + fwd.x, y + IK.desk.height, z + fwd.z), 'iron');
        this._add(K.box(0.3, 0.04, 0.22), M(x - fwd.x * 0.6, y + IK.desk.height, z - fwd.z * 0.6, yaw + 0.2), 'leather', 0);
      }
    }
  }

  _f_teacherDesk(f) {
    const [x, z] = f.pos;
    const y = this.min.y + (f.y ?? 0);
    const yaw = FACE_YAW[OPPOSITE[f.face]];
    const g = K.merge([K.box(2.2, 0.08, 0.95, 0, 0.8), K.box(0.08, 0.8, 0.9, -1.05), K.box(0.08, 0.8, 0.9, 1.05), K.box(2.1, 0.7, 0.05, 0, 0.1, -0.42)]);
    this._add(g, M(x, y, z, yaw), 'wood');
    const back = new THREE.Vector3(0, 0, 0.75).applyAxisAngle(Y, yaw);
    this._add(K.chair(true), M(x + back.x, y, z + back.z, yaw), 'wood');
    const alongX = f.face === 'n' || f.face === 's';
    this._box(x, y + 0.44, z, alongX ? 2.2 : 0.95, 0.88, alongX ? 0.95 : 2.2, 'Öğretmen masası', 'wood');
    for (let i = 0; i < (f.books ?? 3); i++) {
      this._add(K.box(0.34 - (i % 2) * 0.04, 0.07, 0.25), M(x + 0.6, y + 0.88 + i * 0.07, z, yaw + i * 0.15), 'leather', 0);
    }
    this._add(K.candle(0.2, 0.03), M(x - 0.7, y + 0.88, z), 'wax', 0);
    this._flame([x - 0.7, y + 1.1, z], { width: 0.07, height: 0.16, brightness: 1.5 });
  }

  _f_blackboard(f) {
    const p = this._wallPoint(f.side, f.at, f.y, 0.06);
    const yaw = this._yawInward(f.side);
    this._add(K.merge([K.box(f.width + 0.2, 0.12, 0.08, 0, -0.06), K.box(f.width + 0.2, 0.1, 0.08, 0, f.height), K.box(0.1, f.height, 0.08, -f.width / 2 - 0.05), K.box(0.1, f.height, 0.08, f.width / 2 + 0.05)]), M(p.x, p.y, p.z, yaw), 'wood');
    const tex = chalkTexture(f.title, f.lines);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(f.width, f.height), mat);
    board.position.copy(p).add(new THREE.Vector3(0, f.height / 2, 0));
    board.rotation.y = yaw;
    this.cell.root.add(board);
    this.cell.disposables.push(board.geometry, mat, tex);
  }

  _f_skeleton(f) {
    this._add(K.dragonSkeleton(), M(f.pos[0], f.pos[1], f.pos[2], 0.2), 'bone', 0);
  }

  _f_cushions(f) {
    const [[x0, z0], [x1, z1]] = f.area;
    for (let i = 0; i < f.count; i++) {
      const g = K.box(0.55, 0.16, 0.55);
      g.rotateY(this.rnd() * Math.PI);
      this._add(g, M(x0 + this.rnd() * (x1 - x0), this.min.y + (i % 3) * 0.15, z0 + this.rnd() * (z1 - z0)), 'cloth');
    }
  }

  _f_mats(f) {
    for (const [x, z, w, d] of f.list) this._add(K.box(w, 0.08, d), M(x, this.min.y, z), 'leather', 0);
  }

  _f_dummies(f) {
    const ctx = this.host.dummyCtx;
    for (const [x, z, yaw] of f.list) this.cell.dummies.push(new TargetDummy(ctx, new THREE.Vector3(x, this.min.y, z), yaw, ctx.mats));
  }

  _f_fireplace(f) {
    const p = this._wallPoint(f.side, f.at, this.min.y, 0);
    const yaw = this._yawInward(f.side);
    this._add(K.fireplace(), M(p.x, p.y, p.z, yaw), 'trim');
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(Y, yaw);
    const c = p.clone().addScaledVector(fwd, 0.6);
    const r = new THREE.Vector3(1, 0, 0).applyAxisAngle(Y, yaw);
    this._box(c.x, p.y + 1, c.z, Math.abs(r.x) * 2.9 + Math.abs(fwd.x) * 1.2, 2, Math.abs(r.z) * 2.9 + Math.abs(fwd.z) * 1.2, 'Şömine');
    const src = this._light([c.x + fwd.x * 0.6, p.y + 0.8, c.z + fwd.z * 0.6], 0xff8a3a, 12, 12, 'torch');
    for (let i = -1; i <= 1; i++) this._flame([c.x + r.x * i * 0.35, p.y + 0.32, c.z + r.z * i * 0.35], { width: 0.45, height: 0.8, brightness: 2, source: src });
    // Logs.
    for (const s of [-0.3, 0.3]) this._add(K.cyl(0.07, 0.07, 1, 8), M(c.x + r.x * s, p.y + 0.37, c.z + r.z * s, yaw).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, -0.5, 0)), 'wood');
  }

  _f_armchairs(f) {
    for (const [x, z, face] of f.list) {
      const yaw = FACE_YAW[OPPOSITE[face]];
      const { frame, cushion } = K.armchair();
      this._add(frame, M(x, this.min.y, z, yaw), 'wood');
      this._add(cushion, M(x, this.min.y, z, yaw), 'leather', 0);
      this._box(x, this.min.y + 0.5, z, 0.9, 1, 0.9, 'Koltuk', 'wood', yaw);
    }
  }

  _f_crates(f) {
    for (const [x, z, n] of f.list) {
      const s = IK.crate.size;
      this._add(K.crateStack(n, hashId(`${x},${z}`) % 99991 + 1), M(x, this.min.y, z), 'woodLight');
      this._box(x, this.min.y + (s * n * 0.92) / 2, z, s, s * n * 0.92, s, 'Sandık', 'wood');
    }
  }

  _f_junk(f) {
    const [[x0, z0], [x1, z1]] = f.area;
    for (let i = 0; i < f.count; i++) {
      const x = x0 + this.rnd() * (x1 - x0);
      const z = z0 + this.rnd() * (z1 - z0);
      const kind = this.rnd();
      if (kind < 0.35) this._add(K.cyl(0.32, 0.36, 0.9, 12), M(x, this.min.y, z), 'woodLight');
      else if (kind < 0.7) this._add(K.chair(this.rnd() < 0.3), M(x, this.min.y + (this.rnd() < 0.3 ? 0.9 : 0), z, this.rnd() * 6), 'wood');
      else this._add(K.box(0.5 + this.rnd(), 0.3 + this.rnd() * 0.8, 0.4 + this.rnd() * 0.5), M(x, this.min.y, z, this.rnd() * 3), 'leather', 0);
    }
    this._box((x0 + x1) / 2, this.min.y + 0.5, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, 'Eşya yığını', 'wood');
  }

  _f_chest(f) {
    const [x, z] = f.pos;
    const yaw = FACE_YAW[OPPOSITE[f.face]];
    const { wood, iron } = K.chest();
    this._add(wood, M(x, this.min.y, z, yaw), 'wood');
    this._add(iron, M(x, this.min.y, z, yaw), 'iron');
    this._box(x, this.min.y + 0.3, z, 1.1, 0.6, 0.62, 'Sandık', 'wood', yaw);
    this.cell.interactables.push({ kind: 'read', position: new THREE.Vector3(x, this.min.y + 0.6, z), radius: 2, label: 'Sandığı aç', text: f.note });
  }

  _f_candleCluster(f) {
    for (const [x, z, y] of f.list) {
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 0.1;
        const h = 0.14 + i * 0.05;
        this._add(K.candle(h, 0.025), M(x + ox, this.min.y + y, z), 'wax', 0);
        this._flame([x + ox, this.min.y + y + h, z], { width: 0.06, height: 0.13, brightness: 1.3 });
      }
    }
  }

  _f_jarShelves(f) {
    const J = IK.jar;
    for (const s of f.list) {
      const alongX = s.side === 'n' || s.side === 's';
      const yaw = this._yawInward(s.side);
      const start = this._wallPoint(s.side, s.at - s.length / 2, s.y, 0.02);
      const lx = new THREE.Vector3(1, 0, 0).applyAxisAngle(Y, yaw);
      // Local +X must run from `at - length/2` toward `at + length/2`.
      const dirSign = (alongX ? lx.x : lx.z) >= 0 ? 1 : -1;
      const origin = dirSign > 0 ? start : this._wallPoint(s.side, s.at + s.length / 2, s.y, 0.02);
      const { wood, jars } = K.jarShelf(s.length, 3, hashId(`${s.side}${s.at}`) % 9973 + 1);
      const m = M(origin.x, origin.y, origin.z, yaw);
      this._add(wood, m, 'wood');
      const geo = new THREE.CylinderGeometry(J.radius, J.radius * 0.9, J.height, 10);
      geo.translate(0, J.height / 2, 0);
      const mesh = new THREE.InstancedMesh(geo, this.host.mats.jar, jars.length);
      const col = new THREE.Color();
      jars.forEach((j, i) => {
        _m.compose(_v.set(j.x, j.y, j.z), _q.identity(), new THREE.Vector3(j.s, j.s, j.s));
        mesh.setMatrixAt(i, m.clone().multiply(_m));
        mesh.setColorAt(i, col.setHSL(0.15 + j.hue * 0.6, 0.55, 0.35));
      });
      this.cell.root.add(mesh);
      this.cell.disposables.push(geo);
    }
  }

  _f_guardian(f) {
    const p = this._wallPoint(f.side, f.at, f.y, 0.06);
    this.cell.guardian = { position: p, side: f.side, size: f.size, yaw: this._yawInward(f.side) };
  }

  // ------------------------------------------------------------ tower

  _f_balconies(f) {
    const [cx, cz] = f.center;
    const { min, max } = this;
    const S = f.shaft;
    const th = f.thickness;
    const R = IK.railing;
    for (const lv of f.levels) {
      const has = new Set(lv.sides);
      const y = lv.y;
      const rect = {
        n: [min.x, max.x, min.z, cz - S],
        s: [min.x, max.x, cz + S, max.z],
        e: [cx + S, max.x, has.has('n') ? cz - S : min.z, has.has('s') ? cz + S : max.z],
        w: [min.x, cx - S, has.has('n') ? cz - S : min.z, has.has('s') ? cz + S : max.z],
      };
      for (const side of lv.sides) {
        const [x0, x1, z0, z1] = rect[side];
        this._add(K.box(x1 - x0, th, z1 - z0), M((x0 + x1) / 2, y - th, (z0 + z1) / 2), f.mat);
        this._box((x0 + x1) / 2, y - th / 2, (z0 + z1) / 2, x1 - x0, th, z1 - z0, 'Balkon');
        // Corbels under the slab, along the wall.
        const alongX = side === 'n' || side === 's';
        const a0 = alongX ? x0 : z0;
        const a1 = alongX ? x1 : z1;
        const wallLine = side === 'n' ? min.z + 0.3 : side === 's' ? max.z - 0.3 : side === 'e' ? max.x - 0.3 : min.x + 0.3;
        for (let a = a0 + 1; a < a1 - 0.5; a += 2.4) {
          const g = new THREE.ConeGeometry(0.28, 0.9, 4);
          g.rotateX(Math.PI);
          g.translate(0, -0.45, 0);
          this._add(g, alongX ? M(a, y - th, wallLine) : M(wallLine, y - th, a), 'trim');
        }
        // Railing along the inner edge with a gap where the flights meet.
        const gapLo = (alongX ? cx : cz) - f.gap / 2;
        const gapHi = (alongX ? cx : cz) + f.gap / 2;
        const inner = side === 'n' ? cz - S : side === 's' ? cz + S : side === 'e' ? cx + S : cx - S;
        const lo = alongX ? (has.has('w') ? cx - S : min.x) : (has.has('n') ? cz - S : min.z);
        const hi = alongX ? (has.has('e') ? cx + S : max.x) : (has.has('s') ? cz + S : max.z);
        for (const [r0, r1] of [[lo, gapLo], [gapHi, hi]]) {
          if (r1 - r0 < 0.2) continue;
          const g = K.railing(r1 - r0);
          if (alongX) this._add(g, M(r0, y, inner), 'trim');
          else this._add(g, M(inner, y, r0, -Math.PI / 2), 'trim');
          if (alongX) this._box((r0 + r1) / 2, y + R.height / 2, inner, r1 - r0, R.height, R.thickness, 'Korkuluk');
          else this._box(inner, y + R.height / 2, (r0 + r1) / 2, R.thickness, R.height, r1 - r0, 'Korkuluk');
        }
      }
    }
  }

  /** Small plinth landings where the flights touch the tower floor. */
  _staircaseLandings(spec) {
    const [cx, cz] = spec.staircases.center;
    this._add(K.cyl(1.2, 1.3, 0.25, 20), M(cx, this.min.y, cz), 'trim');
  }

  _f_stairs(f) {
    const [tx, ty, tz] = f.top;
    const dirs = { w: [-1, 0], e: [1, 0], n: [0, -1], s: [0, 1] };
    const [dx, dz] = dirs[f.dir];
    const ox = tx + dx * f.run;
    const oz = tz + dz * f.run;
    const oy = ty - f.rise;
    // Local -Z rises: point it back toward the top.
    const rising = { w: 'e', e: 'w', n: 's', s: 'n' }[f.dir];
    const yaw = FACE_YAW[OPPOSITE[rising]];
    this._add(K.stairSteps(f.width, f.rise, f.run, f.steps), M(ox, oy, oz, yaw), f.mat);
    const r = f.rise / f.steps;
    const t = f.run / f.steps;
    for (let i = 0; i < f.steps; i++) {
      const h = r * (i + 1);
      const d = t * (i + 0.5);
      const alongX = dx !== 0;
      this._box(ox - dx * d, oy + h / 2, oz - dz * d, alongX ? t : f.width, h, alongX ? f.width : t, 'Basamak');
    }
    if (f.landing) {
      const lx = tx - dx * f.landing / 2;
      const lz = tz - dz * f.landing / 2;
      const alongX = dx !== 0;
      this._add(K.box(alongX ? f.landing : f.width, f.rise, alongX ? f.width : f.landing), M(lx, oy, lz), f.mat);
      this._box(lx, oy + f.rise / 2, lz, alongX ? f.landing : f.width, f.rise, alongX ? f.width : f.landing, 'Sahanlık');
    }
  }

  // ----------------------------------------------------------- dispose

  _dispose(cell) {
    const h = this.host;
    for (const c of cell.colliders) h.physics.removeCollider(c);
    for (const s of cell.sources) h.lights.remove(s);
    for (const i of cell.flames) h.flames.remove(i);
    for (const d of cell.dummies) d.dispose();
    cell.portraitSet?.dispose();
    for (const d of cell.disposables) d.dispose();
    cell.root.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    cell.root.removeFromParent();
    cell.colliders.length = 0;
    cell.sources.length = 0;
    cell.flames.length = 0;
    cell.built = false;
  }
}

/** Chalk writing on a slate board. */
function chalkTexture(title, lines) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 224;
  const g = c.getContext('2d');
  g.fillStyle = '#1f2a24';
  g.fillRect(0, 0, c.width, c.height);
  // Smudges of old chalk.
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(230,230,220,${0.02 + (i % 5) * 0.008})`;
    g.beginPath();
    g.ellipse((i * 97) % 512, (i * 53) % 224, 30 + (i % 7) * 8, 8 + (i % 3) * 5, (i % 4) * 0.4, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(240,238,228,0.9)';
  g.font = 'bold 34px Georgia, serif';
  g.fillText(title, 24, 50);
  g.fillRect(24, 60, g.measureText(title).width, 3);
  g.font = 'italic 24px Georgia, serif';
  lines.forEach((l, i) => g.fillText(l, 30, 104 + i * 38));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
