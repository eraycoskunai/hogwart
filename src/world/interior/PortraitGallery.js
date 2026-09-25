/**
 * @file PortraitGallery — the castle's talking portraits. Each room's
 * portraits are painted once into one atlas texture and drawn as a single
 * mesh (plus batched gilded / dark-wood frames). The few portraits nearest
 * the player come alive: a live canvas overlay is repainted a dozen times a
 * second so the figure sways, breathes, blinks, follows the player with its
 * eyes and moves its mouth while it talks.
 */
import * as THREE from 'three';
import { StaticBatcher } from '../../procgen/geometry/StaticBatcher.js';
import { box, merge } from '../../procgen/geometry/InteriorKit.js';
import { portraitSpec, paintPortrait, paintBackground, REST_POSE } from '../../procgen/textures/PortraitPainter.js';
import { INTERIOR_KIT as IK } from '../../data/interior.js';
import { mulberry } from '../../procgen/characters/Appearance.js';

const P = IK.portrait;
const Y = new THREE.Vector3(0, 1, 0);
const _to = new THREE.Vector3();
const _r = new THREE.Vector3();
const _n = new THREE.Vector3();

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Ornate frame (outer moulding + inner lip) around a w × h painting, facing +Z. */
function frameGeometry(w, h) {
  const f = P.frame;
  const d = P.depth;
  const list = [];
  for (const [bw, bh, x, y] of [[w + f * 2, f, 0, h / 2 + f / 2], [w + f * 2, f, 0, -h / 2 - f / 2], [f, h, -w / 2 - f / 2, 0], [f, h, w / 2 + f / 2, 0]]) {
    list.push(box(bw, bh, d, x, y - bh / 2, d / 2));
  }
  const lip = f * 0.35;
  for (const [bw, bh, x, y] of [[w, lip, 0, h / 2 - lip / 2], [w, lip, 0, -h / 2 + lip / 2], [lip, h, -w / 2 + lip / 2, 0], [lip, h, w / 2 - lip / 2, 0]]) {
    list.push(box(bw, bh, d * 0.6, x, y - bh / 2, d * 0.3 + 0.01));
  }
  // Corner rosettes.
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const g = new THREE.SphereGeometry(f * 0.55, 8, 6);
    g.scale(1, 1, 0.5);
    g.translate((x * (w + f)) / 2, (y * (h + f)) / 2, d);
    list.push(g);
  }
  return merge(list);
}

export class PortraitGallery {
  /**
   * @param {{mats:Record<string, THREE.Material>, data:any, onSay:(name:string, text:string, portrait:any) => void}} o
   */
  constructor(o) {
    this.mats = o.mats;
    this.data = o.data;
    this.onSay = o.onSay;
    /** @type {Set<any>} */
    this.sets = new Set();
    this.live = [];
    for (let i = 0; i < P.animCount; i++) this.live.push(this._makeLive());
    this._frameTimer = 0;
    this.time = 0;
    this._lastGreet = -1e9;
  }

  _makeLive() {
    const [cw, ch] = P.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const bg = document.createElement('canvas');
    bg.width = cw;
    bg.height = ch;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.visible = false;
    mesh.name = 'Canlı portre';
    return { canvas, g: canvas.getContext('2d'), bg, bgG: bg.getContext('2d'), tex, mat, mesh, portrait: null };
  }

  /** Name, lines and painting for a portrait. */
  _describe(key, override) {
    const seed = hash(key);
    const rnd = mulberry(seed);
    const names = this.data.portraitNames;
    return {
      seed,
      name: override?.name ?? names[Math.floor(rnd() * names.length)],
      spec: portraitSpec(seed, override?.spec),
      frame: rnd() < 0.7 ? 'frameGold' : 'frameWood',
      rnd,
    };
  }

  /**
   * Paint a room's portraits into an atlas and build its meshes.
   * @param {any} cell
   * @param {{side:string, at:number, y:number, size:number[], position:THREE.Vector3, yaw:number, override?:any, id?:string}[]} entries
   */
  buildSet(cell, entries) {
    const [cw, ch] = P.canvas;
    const cols = Math.ceil(Math.sqrt(entries.length));
    const rows = Math.ceil(entries.length / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * cw;
    canvas.height = rows * ch;
    const g = canvas.getContext('2d');
    const quads = [];
    const batcher = new StaticBatcher();
    const portraits = entries.map((e, i) => {
      const d = this._describe(e.id ?? `${cell.id}:${e.side}:${e.at}:${e.y}`, e.override);
      const col = i % cols;
      const row = Math.floor(i / cols);
      paintPortrait(g, col * cw, row * ch, cw, ch, d.spec);
      const [w, h] = e.size;
      const quad = new THREE.PlaneGeometry(w, h);
      const uv = quad.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / cols, 1 - (row + 1 - uv.getY(k)) / rows);
      const m = new THREE.Matrix4().compose(e.position.clone().add(new THREE.Vector3(0, 0, P.depth * 0.3).applyAxisAngle(Y, e.yaw)), new THREE.Quaternion().setFromAxisAngle(Y, e.yaw), new THREE.Vector3(1, 1, 1));
      quad.applyMatrix4(m);
      quads.push(quad);
      const frame = frameGeometry(w, h);
      batcher.add(frame, new THREE.Matrix4().compose(e.position, new THREE.Quaternion().setFromAxisAngle(Y, e.yaw), new THREE.Vector3(1, 1, 1)), this.mats[d.frame], 0);
      frame.dispose();
      return {
        ...d,
        cell,
        position: e.position.clone(),
        yaw: e.yaw,
        size: e.size,
        matrix: m,
        blink: 0,
        nextBlink: 1 + d.rnd() * 4,
        talk: 0,
        greeted: -1e9,
        live: null,
        guardian: !!e.override?.guardian,
      };
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 });
    const geo = merge(quads);
    for (const q of quads) q.dispose();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = `Portreler:${cell.id}`;
    cell.root.add(mesh);
    const frames = batcher.build({ castShadow: false, receiveShadow: true });
    for (const f of frames) cell.root.add(f);
    const set = {
      cell,
      portraits,
      mesh,
      dispose: () => {
        for (const p of portraits) if (p.live) this._release(p.live);
        geo.dispose();
        mat.dispose();
        tex.dispose();
        for (const f of frames) f.geometry.dispose();
        this.sets.delete(set);
      },
    };
    this.sets.add(set);
    return set;
  }

  _release(live) {
    if (live.portrait) live.portrait.live = null;
    live.portrait = null;
    live.mesh.visible = false;
    live.mesh.removeFromParent();
  }

  _assign(live, p) {
    this._release(live);
    const [cw, ch] = P.canvas;
    live.bgG.clearRect(0, 0, cw, ch);
    paintBackground(live.bgG, 0, 0, cw, ch, p.spec);
    live.portrait = p;
    p.live = live;
    live.mesh.scale.set(p.size[0], p.size[1], 1);
    live.mesh.position.set(0, 0, 0.004).applyAxisAngle(Y, p.yaw).add(p.position).add(_n.set(0, 0, P.depth * 0.3).applyAxisAngle(Y, p.yaw));
    live.mesh.quaternion.setFromAxisAngle(Y, p.yaw);
    live.mesh.visible = true;
    p.cell.root.add(live.mesh);
  }

  /** Portraits on built, visible walls. */
  *all() {
    for (const s of this.sets) if (s.cell.root.visible) yield* s.portraits;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} viewer player head
   */
  update(dt, viewer) {
    this.time += dt;
    // Pick the nearest portraits (in front of their painting) to animate.
    const near = [];
    for (const p of this.all()) {
      _to.subVectors(viewer, p.position);
      const d = _to.length();
      if (d > P.animRange) continue;
      _n.set(0, 0, 1).applyAxisAngle(Y, p.yaw);
      if (_to.dot(_n) < 0) continue;
      near.push([d, p]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const wanted = new Set(near.slice(0, P.animCount).map((x) => x[1]));
    for (const live of this.live) if (live.portrait && !wanted.has(live.portrait)) this._release(live);
    for (const p of wanted) {
      if (p.live) continue;
      const free = this.live.find((l) => !l.portrait);
      if (free) this._assign(free, p);
    }
    // Greet a player who walks right up to a portrait.
    for (const [d, p] of near) {
      if (d < P.talkRange && this.time - p.greeted > P.talkCooldown * 3 && this.time - this._lastGreet > P.greetGap && p.talk <= 0 && !p.guardian) {
        p.greeted = this.time;
        this._lastGreet = this.time;
        const g = this.data.portraitGreetings;
        this.say(p, g[Math.floor(p.rnd() * g.length)]);
      }
      if (d >= P.talkRange) break;
    }
    // Animate.
    for (const p of wanted) {
      if (p.talk > 0) p.talk -= dt;
      p.nextBlink -= dt;
      if (p.nextBlink <= 0) {
        p.blink = 1;
        p.nextBlink = 2.5 + p.rnd() * 4;
      }
      p.blink = Math.max(0, p.blink - dt * 7);
    }
    this._frameTimer -= dt;
    if (this._frameTimer > 0) return;
    this._frameTimer = 1 / P.animFps;
    const [cw, ch] = P.canvas;
    for (const live of this.live) {
      const p = live.portrait;
      if (!p) continue;
      const t = this.time + p.seed % 100;
      // Viewer direction in the painting's frame.
      _to.subVectors(viewer, p.position);
      const dist = Math.max(0.5, _to.length());
      _r.set(1, 0, 0).applyAxisAngle(Y, p.yaw);
      const lookX = THREE.MathUtils.clamp((_to.dot(_r) / dist) * 1.6, -1, 1);
      const lookY = THREE.MathUtils.clamp((-_to.y / dist) * 1.6, -1, 1);
      const talking = p.talk > 0;
      const pose = {
        ...REST_POSE,
        dx: Math.sin(t * 0.45) * 0.01 + lookX * 0.02,
        dy: Math.sin(t * 0.3) * 0.004,
        tilt: Math.sin(t * 0.6) * 0.035 - lookX * 0.05,
        breathe: Math.sin(t * 1.7),
        blink: p.blink > 0.5 ? 1 : p.blink * 2,
        mouth: talking ? 0.3 + 0.7 * Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3)) : 0,
        lookX,
        lookY,
      };
      paintPortrait(live.g, 0, 0, cw, ch, p.spec, pose, live.bg);
      live.tex.needsUpdate = true;
    }
  }

  /** Make a portrait speak (subtitle + mouth). */
  say(p, text) {
    p.talk = Math.min(6, 1 + text.length * 0.05);
    this.onSay(p.name, text, p);
  }

  /** A random line for a portrait. */
  line(p) {
    const L = this.data.portraitLines;
    return L[Math.floor(p.rnd() * L.length)];
  }

  /**
   * Nearest portrait the player can talk to.
   * @param {THREE.Vector3} pos player feet
   * @param {number} range
   */
  nearest(pos, range) {
    let best = null;
    let bestD = range;
    for (const p of this.all()) {
      _to.subVectors(pos, p.position).setY(0);
      const d = _to.length();
      if (d > bestD) continue;
      _n.set(0, 0, 1).applyAxisAngle(Y, p.yaw);
      if (_to.dot(_n) < 0.2) continue;
      if (Math.abs(pos.y + 1.5 - p.position.y) > 2.2) continue;
      best = p;
      bestD = d;
    }
    return best;
  }

  get stats() {
    let n = 0;
    for (const s of this.sets) n += s.portraits.length;
    return `${n} (canlı ${this.live.filter((l) => l.portrait).length})`;
  }

  dispose() {
    for (const s of [...this.sets]) s.dispose();
    for (const l of this.live) {
      l.mesh.geometry.dispose();
      l.mat.dispose();
      l.tex.dispose();
      l.mesh.removeFromParent();
    }
  }
}
