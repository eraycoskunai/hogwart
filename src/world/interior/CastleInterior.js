/**
 * @file CastleInterior — the Hogwarts interior region: Entrance Hall, Great
 * Hall, the Staircase Tower with moving staircases, corridors with talking
 * portraits, the Library (locked Restricted Section), classrooms, the
 * Potions dungeon, a secret passage behind a loose brick, the Room of
 * Requirement, ghosts and students. Rooms are streamed and portal-culled
 * (CellStreamer); doors, staircases and ghosts are region-wide.
 *
 * Persistent state (revealed secrets, room shape, door states) lives in
 * ctx.state.castle so it survives region changes and saves.
 */
import * as THREE from 'three';
import { INTERIOR, INTERIOR_MATERIALS, INTERIOR_EXTRA_KEYS, INTERIOR_KIT as IK, LEVELS } from '../../data/interior.js';
import { CellBuilder, INWARD, FACE_YAW, OPPOSITE, M } from './CellBuilder.js';
import { CellStreamer } from './CellStreamer.js';
import { Door } from './Door.js';
import { MovingStaircases } from './MovingStaircases.js';
import { PortraitGallery } from './PortraitGallery.js';
import { Student } from '../../gameplay/Student.js';
import { Ghost } from '../../gameplay/Ghost.js';
import { pointedArch } from '../../procgen/geometry/CastleKit.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const _v = new THREE.Vector3();

/** Seconds a secret wall takes to open. */
const REVEAL_TIME = 2.6;
/** Glass glow by day / by night. */
const GLASS_GLOW = Object.freeze({ day: 1.5, night: 0.12 });

export class CastleInterior {
  /**
   * @param {{scene:THREE.Scene, physics:any, triggers:any, bus:any, preset:any, library:any, lights:any, flames:any,
   *          grading:any, sky:any, interactions:any, ui:{say:Function, toast:Function, choose:Function},
   *          state:any, onExit:Function}} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.id = INTERIOR.id;
    this.name = INTERIOR.name;
    this.outdoor = false;
    this.fogScale = INTERIOR.fogScale;
    this.menuOrbit = INTERIOR.menuOrbit;
    this.cinematics = {};
    this.lockTargets = [];
    this.students = [];
    this.ghosts = [];
    this.root = new THREE.Group();
    this.root.name = 'CastleInterior';
    ctx.scene.add(this.root);
    this.libraryMaterials = [];
    this.owned = [];
    this.items = [];
    this.animations = [];
    this.doors = [];
    this.cellState = new Map(INTERIOR.cells.map((c) => [c.id, { spec: c, cell: null }]));
    ctx.state.castle ??= { revealed: [], variant: null, doors: {} };
    this.state = ctx.state.castle;
    this.state.unlocked ??= [];
    this.spellHandlers = [];
  }

  /** Every library key the region uses. */
  static materialKeys() {
    const keys = new Set(Object.values(INTERIOR_MATERIALS).map((m) => m.key));
    for (const k of INTERIOR_EXTRA_KEYS) keys.add(k);
    keys.add('stainedGlass');
    return [...keys];
  }

  waterLevelAt() {
    return -Infinity;
  }

  waterDepth() {
    return 0;
  }

  // ---------------------------------------------------------------- build

  /** @param {(label:string, t:number) => void} [progress] */
  async build(progress = () => {}) {
    const ctx = this.ctx;
    progress('Şato malzemeleri hazırlanıyor…', 0.05);
    this._materials();

    this.gallery = new PortraitGallery({ mats: this.mats, data: INTERIOR, onSay: (name, text) => ctx.ui.say(name, text) });
    this.builder = new CellBuilder({
      physics: ctx.physics,
      lights: ctx.lights,
      flames: ctx.flames,
      sky: ctx.sky,
      mats: this.mats,
      portraits: this.gallery,
      variantOf: () => this.state.variant,
      dummyCtx: { scene: this.root, physics: ctx.physics, bus: ctx.bus, spells: ctx.spells, spellTargets: ctx.spellTargets, mats: { iron: this.mats.iron, wood: this.mats.wood, burlap: this.mats.cloth, rope: this.mats.cloth, target: this.mats.leather } },
      onGate: (g) => this._gate(g),
    });

    // Links: sides, portal volumes, doors and secret walls.
    this.links = INTERIOR.links.map((l, index) => this._link(l, index));

    // Colour grading per room.
    for (const c of INTERIOR.cells) {
      ctx.grading?.addZone({ name: c.name, grade: c.grade, min: [c.min[0], c.min[1] - 0.5, c.min[2]], max: [c.max[0], c.max[1], c.max[2]], indoor: true, ambient: c.ambient });
    }

    progress('Hareketli merdivenler kuruluyor…', 0.2);
    const tower = INTERIOR.cells.find((c) => c.staircases);
    this.stairs = new MovingStaircases({ physics: ctx.physics, root: this.root, mats: this.mats, bus: ctx.bus }, tower.staircases, LEVELS);

    this.streamer = new CellStreamer({
      cells: INTERIOR.cells,
      links: this.links.map((l) => l.stream),
      cfg: INTERIOR.streaming,
      build: (id) => this._buildCell(id),
      unload: (id) => this._unloadCell(id),
      isBuilt: (id) => !!this.cellState.get(id).cell,
      root: (id) => this.cellState.get(id).cell?.root ?? null,
      setLit: (id, lit) => {
        for (const s of this.cellState.get(id).cell?.sources ?? []) s.enabled = lit;
      },
    });

    this._interactions();

    this.spawn = { position: new THREE.Vector3().fromArray(INTERIOR.spawn.position), yaw: INTERIOR.spawn.yaw };
    this.teleports = this._teleports();

    progress('Odalar inşa ediliyor…', 0.35);
    this.streamer.ensureAround(this.spawn.position);
    await nextFrame();
    progress('Hayaletler ve öğrenciler…', 0.9);
    this._studentQueue = [...INTERIOR.students.map((s) => ({ kind: 'student', spec: s })), ...INTERIOR.ghosts.map((g) => ({ kind: 'ghost', spec: g }))];
    return this;
  }

  _materials() {
    const lib = this.ctx.library;
    const mats = {};
    for (const [name, m] of Object.entries(INTERIOR_MATERIALS)) {
      const ov = { tile: m.tile };
      if (m.triplanar != null) ov.triplanar = m.triplanar;
      if (m.surface) ov.surface = m.surface;
      if (m.color != null) ov.color = m.color;
      mats[name] = lib.get(m.key, ov);
      this.libraryMaterials.push(mats[name]);
    }
    for (const k of INTERIOR_EXTRA_KEYS) {
      if (!k.startsWith('tapestry:')) continue;
      mats[`tap:${k}`] = lib.get(k);
      this.libraryMaterials.push(mats[`tap:${k}`]);
    }
    mats.glass = lib.get('stainedGlass', { tile: 1 });
    this.libraryMaterials.push(mats.glass);
    const own = (m) => (this.owned.push(m), m);
    mats.wax = own(new THREE.MeshStandardMaterial({ name: 'wax', color: 0xf1e8cf, roughness: 0.55, emissive: 0x3a2a10, emissiveIntensity: 0.4 }));
    mats.bone = own(new THREE.MeshStandardMaterial({ name: 'bone', color: 0xd8cfb8, roughness: 0.75 }));
    mats.potion = own(new THREE.MeshStandardMaterial({ name: 'potion', color: 0x2a6a2a, emissive: 0x3aff6a, emissiveIntensity: 0.9, roughness: 0.15 }));
    mats.jar = own(new THREE.MeshStandardMaterial({ name: 'jar', color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.78 }));
    mats.frameGold = mats.brass;
    mats.frameWood = mats.wood;
    this.mats = mats;
  }

  // ---------------------------------------------------------------- links

  _revealed(i) {
    return this.state.revealed.includes(i);
  }

  _link(link, index) {
    const a = this.cellState.get(link.a).spec;
    const t = IK.wall;
    const side = link.side;
    const [x0, , z0] = a.min;
    const [x1, , z1] = a.max;
    // Portal plane: between the two rooms' walls.
    let center;
    if (side === 'n') center = new THREE.Vector3(link.at, link.y + link.height / 2, z0 - t);
    else if (side === 's') center = new THREE.Vector3(link.at, link.y + link.height / 2, z1 + t);
    else if (side === 'e') center = new THREE.Vector3(x1 + t, link.y + link.height / 2, link.at);
    else center = new THREE.Vector3(x0 - t, link.y + link.height / 2, link.at);
    const alongX = side === 'n' || side === 's';
    const half = new THREE.Vector3(alongX ? link.width / 2 : t * 1.2, link.height / 2, alongX ? t * 1.2 : link.width / 2);
    const box = new THREE.Box3(center.clone().sub(half), center.clone().add(half));
    const L = { link, index, side, center, secret: link.secret ?? null, door: null, filler: null };
    L.stream = {
      a: link.a,
      b: link.b ?? null,
      box,
      traversable: () => !L.secret || this._revealed(index),
      passable: () => !L.door || L.door.openness > 0.02,
    };
    // Face of room `a` where doors and secret walls sit.
    const face = this._facePoint(a, side, link.at, link.y);
    const yaw = FACE_YAW[INWARD[side]];
    if (link.door && (!L.secret || this._revealed(index))) this._makeDoor(L, face, yaw);
    if (L.secret && !this._revealed(index)) this._makeFiller(L, center, side);
    return L;
  }

  _facePoint(spec, side, at, y) {
    const [x0, , z0] = spec.min;
    const [x1, , z1] = spec.max;
    const inset = 0.12;
    if (side === 'n') return new THREE.Vector3(at, y, z0 - inset);
    if (side === 's') return new THREE.Vector3(at, y, z1 + inset);
    if (side === 'e') return new THREE.Vector3(x1 + inset, y, at);
    return new THREE.Vector3(x0 - inset, y, at);
  }

  _makeDoor(L, face, yaw) {
    const l = L.link;
    const saved = this.state.doors[L.index];
    const door = new Door({ physics: this.ctx.physics, root: this.root, mats: this.mats }, {
      name: l.door.exit ? 'Büyük kapılar' : l.b ? `${this.cellState.get(l.b).spec.name} kapısı` : 'Kapı',
      position: face,
      yaw,
      width: l.width,
      height: l.height,
      leaves: l.door.leaves,
      open: saved ?? l.door.open ?? false,
      exit: l.door.exit,
    });
    L.door = door;
    this.doors.push(door);
    this._doorSpells(door);
    return door;
  }

  /** A block of masonry filling a secret opening. */
  _makeFiller(L, center, side) {
    const l = L.link;
    const depth = IK.wall * 2;
    const shape = pointedArch(l.width, l.height);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
    geo.translate(0, 0, -depth / 2);
    const mesh = new THREE.Mesh(geo, this.mats.stone);
    const yaw = side === 'n' || side === 's' ? 0 : Math.PI / 2;
    mesh.position.set(center.x, l.y, center.z);
    mesh.rotation.y = yaw;
    mesh.castShadow = mesh.receiveShadow = true;
    this.root.add(mesh);
    const size = new THREE.Vector3(l.width, l.height, depth);
    const collider = this.ctx.physics.addStaticBox(size, M(center.x, l.y + l.height / 2, center.z, yaw), { surface: 'stone', name: 'Duvar', rigid: false });
    L.filler = { mesh, collider, base: mesh.position.clone(), yaw };
  }

  /** Open a secret link: slide the masonry away, then drop its collider. */
  _reveal(L, onDone) {
    if (this._revealed(L.index)) return;
    this.state.revealed.push(L.index);
    const f = L.filler;
    if (!f) return;
    this.ctx.physics.removeCollider(f.collider);
    const back = new THREE.Vector3(0, 0, IK.wall * 2.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw);
    // Push away from the room of `a`.
    const inward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), FACE_YAW[INWARD[L.side]]);
    if (back.dot(inward) > 0) back.negate();
    let t = 0;
    this.animations.push((dt) => {
      t = Math.min(1, t + dt / REVEAL_TIME);
      const k = t * t * (3 - 2 * t);
      f.mesh.position.copy(f.base).addScaledVector(back, Math.min(1, k * 1.6)).setY(f.base.y - Math.max(0, k - 0.6) * L.link.height * 2.5);
      if (t < 1) return true;
      f.mesh.removeFromParent();
      f.mesh.geometry.dispose();
      L.filler = null;
      onDone?.();
      return false;
    });
  }

  _gate(g) {
    if (this.gate) return;
    const lock = INTERIOR.locks.find((l) => l.cell === g.cell && l.grille);
    const door = new Door({ physics: this.ctx.physics, root: this.root, mats: this.mats }, {
      name: 'Yasak Bölüm kapısı',
      position: new THREE.Vector3(g.at, g.y, g.z),
      yaw: 0,
      width: g.width,
      height: g.height,
      leaves: 2,
      kind: 'grille',
      lock: lock && !this.state.unlocked.includes('restricted') ? { message: lock.message, spell: lock.spell, unlocked: lock.unlocked, id: 'restricted' } : null,
    });
    this.gate = door;
    this.doors.push(door);
    this._doorSpells(door);
    this.items.push(this.ctx.interactions.add({
      id: 'gate:restricted',
      position: new THREE.Vector3(g.at, g.y + 1.2, g.z),
      radius: 2.4,
      label: () => (door.lock ? 'Kilitli kapı' : door.label),
      action: () => this._useDoor(door),
    }));
  }

  /** Doors answer to Alohomora (unlock + open) and Depulso (burst open). */
  _doorSpells(door) {
    const T = this.ctx.spellTargets;
    if (!T) return;
    const handler = {
      name: door.name,
      center: (out) => out.copy(door.position).setY(door.position.y + 1.2),
      onSpell: (ev) => {
        if (door.exit) return false;
        if (ev.effect === 'unlock') {
          if (door.lock) {
            if (door.lock.spell && door.lock.spell !== 'alohomora') return false;
            const msg = door.lock.unlocked ?? 'Klik! Kilit açıldı.';
            if (door.lock.id) this.state.unlocked.push(door.lock.id);
            door.unlock();
            this.ctx.ui.toast(msg);
          }
          if (!door.open) this._useDoor(door);
          return true;
        }
        if (ev.effect === 'push' && !door.lock && !door.open) {
          this._useDoor(door);
          return true;
        }
        return false;
      },
    };
    for (const leaf of door.leaves) T.add(leaf.body.collider, handler);
    this.spellHandlers.push(handler);
  }

  // ----------------------------------------------------------- interaction

  _useDoor(door) {
    if (door.exit) {
      this.ctx.onExit(INTERIOR.exit);
      return;
    }
    const r = door.use();
    if (!r.ok) this.ctx.ui.toast(r.message);
    const i = this.links.findIndex((l) => l.door === door);
    if (i >= 0) this.state.doors[i] = door.open;
  }

  _interactions() {
    const I = this.ctx.interactions;
    for (const L of this.links) if (L.door) this._doorItem(L);
    // Secret brick on the 3rd floor.
    const B = INTERIOR.secretBrick;
    const brickLink = this.links.find((l) => l.secret === 'brick');
    const bspec = this.cellState.get(B.cell).spec;
    const brickPos = this._facePoint(bspec, B.side, B.at, B.y);
    this.items.push(I.add({
      id: 'secret:brick',
      position: brickPos,
      radius: 2,
      label: 'Aşınmış tuğlaya dokun',
      enabled: () => !this._revealed(brickLink.index),
      action: () => {
        this.ctx.ui.toast(B.opened);
        this._reveal(brickLink);
      },
    }));
    // Room of Requirement wall.
    const reqLink = this.links.find((l) => l.secret === 'requirement');
    const reqPos = this._facePoint(this.cellState.get(reqLink.link.a).spec, reqLink.side, reqLink.link.at, reqLink.link.y + 1.2);
    this.items.push(I.add({
      id: 'secret:requirement',
      position: reqPos,
      radius: 2.6,
      label: () => (this._revealed(reqLink.index) ? 'İhtiyacını düşün (kapı belirir)' : 'Duvarın önünde bir ihtiyaç düşün'),
      // Every visit starts with a wish: the closed door only answers to one.
      enabled: () => !this._playerInside('requirement') && (!this._revealed(reqLink.index) || (reqLink.door && !reqLink.door.open)),
      action: () => this._chooseRequirement(reqLink),
    }));
    // Portraits (nearest in front of the player) and the guardian.
    this._portraitProvider = I.addProvider((pos) => {
      const p = this.gallery.nearest(pos, IK.portrait.talkRange);
      if (!p) return null;
      return {
        id: `portrait:${p.seed}`,
        position: p.position,
        radius: IK.portrait.talkRange,
        label: p.guardian ? `${p.name} — parola söyle` : `${p.name} ile konuş`,
        action: () => {
          if (p.guardian) {
            this.gallery.say(p, INTERIOR.guardian.ask);
            setTimeout(() => this.gallery.say(p, INTERIOR.guardian.refuse), 1600);
          } else this.gallery.say(p, this.gallery.line(p));
        },
      };
    });
  }

  _doorItem(L) {
    const door = L.door;
    const wish = L.secret === 'requirement';
    this.items.push(this.ctx.interactions.add({
      id: `door:${L.index}`,
      position: door.position.clone().setY(L.link.y + 1.2),
      radius: L.link.width / 2 + 2,
      label: () => door.label,
      enabled: wish ? () => door.open || this._playerInside(L.link.b) : undefined,
      action: () => this._useDoor(door),
    }));
  }

  _playerInside(cellId) {
    return this.streamer.playerCell === cellId;
  }

  async _chooseRequirement(L) {
    const spec = this.cellState.get(L.link.b).spec;
    const options = Object.entries(spec.variants).map(([id, v]) => ({ id, label: v.label }));
    const pick = await this.ctx.ui.choose('İhtiyaç Odası', 'Neye ihtiyacın var?', options);
    if (!pick || this._disposed) return;
    const changed = pick !== this.state.variant;
    this.state.variant = pick;
    this.ctx.ui.toast(spec.variants[pick].line);
    if (!this._revealed(L.index)) {
      this._reveal(L, () => {
        const face = this._facePoint(this.cellState.get(L.link.a).spec, L.side, L.link.at, L.link.y);
        this._makeDoor(L, face, FACE_YAW[INWARD[L.side]]).use();
        this._doorItem(L);
      });
      return;
    }
    if (changed && this.cellState.get(L.link.b).cell) {
      // Reshape: rebuild the room with its new furniture.
      this._unloadCell(L.link.b);
      this._buildCell(L.link.b);
    }
    if (L.door && !L.door.open) this._useDoor(L.door);
  }

  // ---------------------------------------------------------------- cells

  _buildCell(id) {
    const st = this.cellState.get(id);
    if (st.cell) return;
    const links = [];
    for (const L of this.links) {
      if (L.link.a === id) links.push({ link: L.link, side: L.side });
      else if (L.link.b === id) links.push({ link: L.link, side: OPPOSITE[L.side] });
    }
    const cell = this.builder.build(st.spec, links);
    this.root.add(cell.root);
    for (const it of cell.interactables) {
      if (it.kind === 'read') {
        cell.items = cell.items ?? [];
        cell.items.push(this.ctx.interactions.add({ id: `read:${id}`, position: it.position, radius: it.radius, label: it.label, action: () => this.ctx.ui.toast(it.text, 9) }));
      }
    }
    if (cell.guardian) {
      const g = cell.guardian;
      const G = INTERIOR.guardian;
      const set = this.gallery.buildSet(cell, [{ side: g.side, at: 0, y: g.position.y, size: g.size, position: g.position.clone().setY(g.position.y + g.size[1] / 2), yaw: g.yaw, id: 'guardian', override: { guardian: true, name: G.name, spec: { female: true, cloth: '#c86a8a', cloth2: '#e8c0c8', hat: 'none', beard: 'none', collar: 'lace', hairStyle: 'curls', back: 'drape', backColor: '#3a1a28', pet: 'none', old: false } } }]);
      cell.disposables.push(set);
    }
    st.cell = cell;
  }

  _unloadCell(id) {
    const st = this.cellState.get(id);
    if (!st.cell) return;
    for (const it of st.cell.items ?? []) this.ctx.interactions.remove(it);
    st.cell.dispose();
    st.cell = null;
  }

  // ------------------------------------------------------------- teleports

  _teleports() {
    const list = [];
    const at = (name, x, y, z, yaw = 0) => list.push({ name, position: new THREE.Vector3(x, y, z), yaw });
    at('Giriş Holü', 0, 0, 11.5, 0);
    at('Büyük Salon', 0, 0, -15, 0);
    at('Merdiven Kulesi (zemin)', 36, 0, 6, Math.PI / 4);
    at('Kule 1. kat balkonu', 40, LEVELS[1], -7.8, Math.PI);
    at('Kule 2. kat balkonu', 40, LEVELS[2], -7.8, Math.PI);
    at('Kule 3. kat balkonu', 40, LEVELS[3], -7.8, Math.PI);
    at('Kütüphane', 34, 7, -33, Math.PI / 2);
    at('KSKS sınıfı', 34.5, 14, -33, Math.PI / 2);
    at('Tılsım sınıfı', 45.5, 14, -30, -Math.PI / 2);
    at('3. kat koridoru', 40, 21, -18, 0);
    at('İksir zindanı', -33, -6, 6, Math.PI / 2);
    at('Zindan merdiveni', -17, 0, 6, Math.PI / 2);
    at('Düello Kulübü', 17.4, 0, 12.5, -Math.PI / 2);
    at('Yasak Bölüm kapısı (zırhlar)', 26.2, 7, -34, 0);
    return list;
  }

  // ------------------------------------------------------------ characters

  spawnNextStudent() {
    const next = this._studentQueue?.shift();
    if (next) {
      if (next.kind === 'student') {
        const st = new Student({ ...this.ctx, scene: this.root }, next.spec);
        this.students.push(st);
        this.ctx.bus.emit('room:characterAdded', { character: st.character });
      } else {
        const g = new Ghost({ ...this.ctx, scene: this.root }, next.spec, (name, text) => this.ctx.ui.say(name, text));
        this.ghosts.push(g);
      }
    }
    return !!this._studentQueue?.length;
  }

  updateCharacters(dt, env) {
    for (const s of this.students) {
      const vis = this.streamer.isVisibleAt(s.position) && this._hasFloor(s.position);
      s.character.root.visible = vis;
      if (vis) s.update(dt, env);
    }
    for (const g of this.ghosts) {
      g.visible = this.streamer.isVisibleAt(g.position);
      g.update(dt, env);
    }
  }

  /** Students only stand in built rooms. */
  _hasFloor(p) {
    const c = this.streamer.cellAt(p, 0.1);
    return !c || !!this.cellState.get(c.id).cell;
  }

  // ------------------------------------------------------------------ tick

  fixedUpdate(dt, playerPos) {
    for (const d of this.doors) d.step(dt);
    this.stairs.step(dt);
    for (const st of this.cellState.values()) for (const d of st.cell?.dummies ?? []) d.fixedUpdate(dt, playerPos);
  }

  /**
   * @param {number} dt
   * @param {THREE.Camera} camera
   * @param {{night:number, player:THREE.Vector3, playerHead:THREE.Vector3}} env
   */
  frame(dt, camera, env) {
    this.streamer.update(dt, env.player, camera);
    this.gallery.update(dt, env.playerHead ?? env.player);
    for (let i = this.animations.length - 1; i >= 0; i--) if (!this.animations[i](dt)) this.animations.splice(i, 1);
    this.mats.glass.emissiveIntensity = THREE.MathUtils.lerp(GLASS_GLOW.day, GLASS_GLOW.night, env.night);
    this.mats.potion.emissiveIntensity = 0.7 + Math.sin(performance.now() / 400) * 0.25;
  }

  /**
   * @param {number} time
   * @param {number} night
   * @param {number} [alpha] physics interpolation
   */
  render(time, night, alpha = 1) {
    this.stairs.render(alpha);
    for (const st of this.cellState.values()) {
      const c = st.cell;
      if (!c || !c.root.visible) continue;
      for (const fn of c.animated) fn(time);
      for (const d of c.dummies) d.render(time);
    }
  }

  /** Streams the rooms around a new position at once. */
  onTeleport(pos) {
    if (pos) this.streamer.ensureAround(pos);
  }

  get debugEntities() {
    return [
      ...this.ghosts.map((g) => ({ name: `Hayalet: ${g.name}`, state: g.debugState })),
      ...this.students.map((s) => ({ name: s.name, state: s.debugState })),
      { name: 'Hareketli merdivenler', state: this.stairs.debugState },
    ];
  }

  get stats() {
    const s = this.streamer.stats;
    return {
      'Oda (yüklü / görünür)': `${s.built} / ${s.visible} (${INTERIOR.cells.length})`,
      'Portal · kuyruk': `${s.portals} · ${s.queued}`,
      'Oyuncu / kamera odası': `${this.streamer.playerCell ?? '—'} / ${this.streamer.cameraCell ?? '—'}`,
      Portreler: this.gallery.stats,
      Kapılar: `${this.doors.filter((d) => d.open).length} açık / ${this.doors.length}`,
      Merdivenler: this.stairs.debugState,
    };
  }

  dispose() {
    this._disposed = true;
    const ctx = this.ctx;
    for (const id of this.cellState.keys()) this._unloadCell(id);
    for (const it of this.items) ctx.interactions.remove(it);
    if (this._portraitProvider) ctx.interactions.removeProvider(this._portraitProvider);
    for (const h of this.spellHandlers) ctx.spellTargets?.remove(h);
    for (const d of this.doors) d.dispose();
    for (const L of this.links) {
      if (!L.filler) continue;
      ctx.physics.removeCollider(L.filler.collider);
      L.filler.mesh.geometry.dispose();
    }
    this.stairs.dispose();
    this.gallery.dispose();
    for (const s of this.students) s.dispose();
    for (const g of this.ghosts) g.dispose();
    this.root.removeFromParent();
    for (const m of this.owned) m.dispose();
    for (const m of this.libraryMaterials) ctx.library.release(m);
  }
}
