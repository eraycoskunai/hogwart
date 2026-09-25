/**
 * @file Castle — assembles Hogwarts from the CASTLE blueprint with the
 * modular kit: halls (plinth, cornice, gable roof, buttresses, rows of
 * pointed windows, corner turrets, great doors), round towers (battered
 * shafts, corbel band, battlements, cone roofs, finials and house
 * pennants), the clock tower with working clock hands, curtain walls,
 * gatehouses and the arched stone viaduct over the ravine. Geometry is
 * merged per material; colliders follow every solid piece.
 */
import * as THREE from 'three';
import { CASTLE, KIT } from '../../data/castle.js';
import { HOUSES } from '../../data/character.js';
import {
  block, battlementsLine, battlementsRing, gableRoof, coneRoof, pyramidRoof, windowUnit, buttress, band, towerShaft,
  archSpan, finial, pennant, door, clockTexture, merge,
} from '../../procgen/geometry/CastleKit.js';

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** Matrix from position + yaw (+ optional pitch around the local Z axis). */
function M(x, y, z, yaw = 0, roll = 0) {
  _e.set(0, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s);
}

export class Castle {
  /**
   * @param {{physics:any, batcher:import('../../procgen/geometry/StaticBatcher.js').StaticBatcher, root:THREE.Group,
   *          heightAt:(x:number, z:number)=>number, materials:Record<string, THREE.Material>}} o
   */
  constructor(o) {
    this.o = o;
    this.colliders = [];
    /** Lamp positions for the grounds lighting ([x, y, z]). */
    this.lamps = [];
    /** Clock hands animated with the game clock. */
    this.clockHands = [];
    this.owned = [];
  }

  build() {
    for (const h of CASTLE.halls) this._hall(h);
    for (const t of CASTLE.towers) this._tower(t);
    for (const t of CASTLE.squareTowers) this._squareTower(t);
    for (const w of CASTLE.walls) this._wall(w);
    for (const g of CASTLE.gates) this._gate(g);
    this._viaduct(CASTLE.viaduct);
    return this;
  }

  // ------------------------------------------------------------ helpers

  _add(geo, matrix, mat, tile = KIT.stoneTile) {
    this.o.batcher.add(geo, matrix, this.o.materials[mat], tile);
    geo.dispose();
  }

  _minGround(x, z, rx, rz, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let m = Infinity;
    for (const [a, b] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lx = a * rx;
      const lz = b * rz;
      m = Math.min(m, this.o.heightAt(x + lx * c + lz * s, z - lx * s + lz * c));
    }
    return m;
  }

  _box(size, matrix, name) {
    this.colliders.push(this.o.physics.addStaticBox(size, matrix, { surface: 'stone', name, rigid: false }));
  }

  _cyl(r, h, matrix, name) {
    this.colliders.push(this.o.physics.addStaticCylinder(r, h, matrix, { surface: 'stone', name, rigid: false }));
  }

  // -------------------------------------------------------------- halls

  _hall(h) {
    const alongZ = h.roofAxis === 'z';
    const yaw = alongZ ? Math.PI / 2 : 0;
    const L = alongZ ? h.size[1] : h.size[0];
    const W = alongZ ? h.size[0] : h.size[1];
    const [cx, cz] = h.pos;
    const y0 = CASTLE.groundY;
    const yF = Math.min(y0, this._minGround(cx, cz, L / 2, W / 2, yaw)) - KIT.foundationBelow;
    const base = M(cx, 0, cz, yaw);
    const local = (x, y, z, ry = 0) => base.clone().multiply(M(x, y, z, ry));
    const H = h.height;
    this._add(block(L, H + (y0 - yF), W), local(0, yF, 0), 'stone');
    const P = KIT.plinth;
    this._add(block(L + P.out * 2, P.height, W + P.out * 2), local(0, y0, 0), 'stone');
    this._add(block(L + 0.6, 0.7, W + 0.6), local(0, y0 + H - 0.7, 0), 'stone');
    const rh = (W / 2) * h.roofPitch;
    const { roof, gables } = gableRoof(L, W, rh);
    this._add(roof, local(0, y0 + H, 0), 'roof', 0);
    this._add(gables, local(0, y0 + H, 0), 'stone');
    // Ridge finials.
    for (const sx of [-1, 1]) this._add(finial(), local((sx * L) / 2, y0 + H + rh, 0), 'iron');

    // Door (keep): on the local face matching the requested side.
    let doorFace = null;
    if (h.door) doorFace = this._faceFor(h.door.side, yaw);

    // Windows (+ buttresses between them) on the long faces.
    const Wn = h.windows;
    const count = Math.max(1, Math.floor((L - 4) / Wn.spacing));
    const start = (-(count - 1) * Wn.spacing) / 2;
    for (const face of [1, -1]) {
      for (let k = 0; k < count; k++) {
        const x = start + k * Wn.spacing;
        if (doorFace === (face > 0 ? 'pz' : 'nz') && Math.abs(x) < h.door.width) continue;
        this._window(local(x, y0 + Wn.sill, (face * W) / 2, face > 0 ? 0 : Math.PI), Wn.width, Wn.height);
        if (H > Wn.sill + Wn.height + 7) this._window(local(x, y0 + Wn.sill + Wn.height + 3, (face * W) / 2, face > 0 ? 0 : Math.PI), Wn.width * 0.7, Wn.height * 0.55);
        if (h.buttresses && k < count - 1) {
          this._add(buttress(H * 0.82), local(x + Wn.spacing / 2, y0, (face * W) / 2, face > 0 ? 0 : Math.PI), 'stone');
        }
      }
    }
    // End faces: one tall window each when wide enough.
    if (W > 12) {
      for (const face of [1, -1]) {
        if (doorFace === (face > 0 ? 'px' : 'nx')) continue;
        this._window(local((face * L) / 2, y0 + Wn.sill, 0, face > 0 ? Math.PI / 2 : -Math.PI / 2), Wn.width * 1.3, Wn.height * 1.2);
      }
    }
    if (h.door) this._door(h.door, doorFace, local, L, W, y0);

    // Corner turrets.
    if (h.turrets) {
      const T = KIT.turret;
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const m = local((sx * L) / 2, 0, (sz * W) / 2);
        this._add(towerShaft(T.radius, y0 + H + T.above - yF), m.clone().multiply(M(0, yF, 0)), 'stone');
        this._add(band(T.radius, KIT.corbel.height, KIT.corbel.out), m.clone().multiply(M(0, y0 + H + T.above - 0.8, 0)), 'stone');
        this._add(coneRoof(T.radius, T.roof, 16), m.clone().multiply(M(0, y0 + H + T.above, 0)), 'roof', 0);
        this._add(finial(), m.clone().multiply(M(0, y0 + H + T.above + T.roof, 0)), 'iron');
      }
    }
    this._box(new THREE.Vector3(L, H + rh + (y0 - yF), W), local(0, yF + (H + rh + (y0 - yF)) / 2, 0), h.name);
  }

  /** Local face ('pz' | 'nz' | 'px' | 'nx') whose world normal points to a compass side. */
  _faceFor(side, yaw) {
    const want = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[side];
    const faces = { pz: [0, 1], nz: [0, -1], px: [1, 0], nx: [-1, 0] };
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let best = 'nz';
    let bestDot = -2;
    for (const [k, [lx, lz]] of Object.entries(faces)) {
      const wx = lx * c + lz * s;
      const wz = -lx * s + lz * c;
      const d = wx * want[0] + wz * want[1];
      if (d > bestDot) {
        bestDot = d;
        best = k;
      }
    }
    return best;
  }

  _door(d, face, local, L, W, y0) {
    const ry = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 }[face];
    const off = { pz: [0, W / 2], nz: [0, -W / 2], px: [L / 2, 0], nx: [-L / 2, 0] }[face];
    const m = local(off[0], y0, off[1], ry);
    const { planks, straps } = door(d.width, d.height);
    this._add(planks, m.clone().multiply(M(0, 0, 0.05)), 'wood', 0);
    this._add(straps, m.clone().multiply(M(0, 0, 0.05)), 'iron');
    const frame = windowUnit(d.width, d.height);
    frame.pane.dispose();
    this._add(frame.frame, m, 'stone');
    // Steps up to the door.
    for (let k = 0; k < 3; k++) this._add(block(d.width + 4 - k, 0.18, 1.2 + (2 - k) * 0.9), m.clone().multiply(M(0, k * 0.18 - 0.02, 1 + (2 - k) * 0.45)), 'stone');
  }

  _window(matrix, w, h) {
    const { frame, pane } = windowUnit(w, h);
    this._add(frame, matrix, 'stone');
    this._add(pane, matrix, 'window', 0);
  }

  // ------------------------------------------------------------- towers

  _tower(t) {
    const [cx, cz] = t.pos;
    const y0 = CASTLE.groundY;
    const yF = Math.min(y0, this._minGround(cx, cz, t.radius, t.radius)) - KIT.foundationBelow;
    const H = t.height;
    const r = t.radius;
    const base = M(cx, 0, cz);
    const at = (y, yaw = 0) => base.clone().multiply(M(0, y, 0, yaw));
    this._add(towerShaft(r, H + (y0 - yF)), at(yF), 'stone');
    this._add(band(r * 1.05, KIT.plinth.height, KIT.plinth.out), at(y0), 'stone');
    this._add(band(r, KIT.corbel.height, KIT.corbel.out), at(y0 + H - KIT.corbel.height), 'stone');
    this._add(battlementsRing(r + KIT.corbel.out, 0.6), at(y0 + H), 'stone');
    this._add(coneRoof(r * 0.94, t.roofHeight), at(y0 + H), 'roof', 0);
    const apex = y0 + H + t.roofHeight;
    this._add(finial(), at(apex), 'iron');
    if (t.flag) this._flag(cx, apex + KIT.finial.height * 0.6, cz, t.flag);
    // Rings of windows.
    const rings = t.windowRings;
    for (let k = 0; k < rings; k++) {
      const y = y0 + 6 + ((H - 12) * k) / Math.max(1, rings - 1);
      const count = Math.max(3, Math.floor((Math.PI * 2 * r) / 7));
      for (let i = 0; i < count; i++) {
        const a = ((i + (k % 2) * 0.5) / count) * Math.PI * 2;
        this._window(base.clone().multiply(M(0, 0, 0, a)).multiply(M(0, y, r - 0.08)), 1.4, 3.2);
      }
    }
    this._cyl(r * 1.04, H + t.roofHeight * 0.5 + (y0 - yF), at(yF + (H + t.roofHeight * 0.5 + (y0 - yF)) / 2), t.name);
  }

  _flag(x, y, z, house) {
    const H = HOUSES[house] ?? HOUSES.none;
    const pole = new THREE.CylinderGeometry(0.06, 0.06, KIT.flag.pole, 6);
    pole.translate(0, KIT.flag.pole / 2, 0);
    this._add(pole, M(x, y, z), 'iron');
    const matKey = `flag:${house}`;
    if (!this.o.materials[matKey]) {
      const m = new THREE.MeshStandardMaterial({ color: H.primary, roughness: 0.8, side: THREE.DoubleSide });
      this.o.materials[matKey] = m;
      this.owned.push(m);
    }
    this._add(pennant(), M(x, y + KIT.flag.pole, z, Math.PI * 0.3), matKey, 0);
  }

  _squareTower(t) {
    const [cx, cz] = t.pos;
    const y0 = CASTLE.groundY;
    const S = t.size;
    const yF = Math.min(y0, this._minGround(cx, cz, S / 2, S / 2)) - KIT.foundationBelow;
    const H = t.height;
    const at = (x, y, z, yaw = 0) => M(cx, 0, cz).multiply(M(x, y, z, yaw));
    this._add(block(S, H + (y0 - yF), S), at(0, yF, 0), 'stone');
    this._add(block(S + KIT.plinth.out * 2, KIT.plinth.height, S + KIT.plinth.out * 2), at(0, y0, 0), 'stone');
    this._add(block(S + 0.9, 0.8, S + 0.9), at(0, y0 + H - 0.8, 0), 'stone');
    this._add(pyramidRoof(S, t.roofHeight), at(0, y0 + H, 0), 'roof', 0);
    this._add(finial(), at(0, y0 + H + t.roofHeight, 0), 'iron');
    for (let face = 0; face < 4; face++) {
      const yaw = (face * Math.PI) / 2;
      for (let k = 0; k < 3; k++) this._window(at(0, 0, 0, yaw).multiply(M(0, y0 + 6 + k * 9, S / 2)), 1.6, 3.6);
    }
    if (t.clock) this._clock(cx, cz, S, y0 + H * KIT.clock.above);
    this._box(new THREE.Vector3(S, H + (y0 - yF), S), at(0, yF + (H + (y0 - yF)) / 2, 0), t.name);
  }

  _clock(cx, cz, S, y) {
    const C = KIT.clock;
    const tex = clockTexture();
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: new THREE.Color(0xffd9a0), emissiveMap: tex, emissiveIntensity: 0 });
    const handMat = new THREE.MeshStandardMaterial({ color: 0x1d1712, roughness: 0.5, metalness: 0.6 });
    this.owned.push(tex, faceMat, handMat);
    this.clockMaterial = faceMat;
    const faceGeo = new THREE.CircleGeometry(C.radius, 32);
    const hourGeo = new THREE.BoxGeometry(0.16, C.radius * 0.55, 0.05);
    hourGeo.translate(0, C.radius * 0.24, 0);
    const minGeo = new THREE.BoxGeometry(0.1, C.radius * 0.82, 0.05);
    minGeo.translate(0, C.radius * 0.38, 0);
    this.owned.push(faceGeo, hourGeo, minGeo);
    for (let face = 0; face < 4; face++) {
      const yaw = (face * Math.PI) / 2;
      const g = new THREE.Group();
      g.position.set(cx + Math.sin(yaw) * (S / 2 + 0.05), y, cz + Math.cos(yaw) * (S / 2 + 0.05));
      g.rotation.y = yaw;
      const f = new THREE.Mesh(faceGeo, faceMat);
      const hour = new THREE.Mesh(hourGeo, handMat);
      const minute = new THREE.Mesh(minGeo, handMat);
      hour.position.z = minute.position.z = 0.06;
      g.add(f, hour, minute);
      this.o.root.add(g);
      this.clockHands.push({ hour, minute });
    }
  }

  /**
   * @param {number} hour 0..24 game time
   * @param {number} night 0..1 (dial glows at night)
   */
  updateClock(hour, night) {
    for (const h of this.clockHands) {
      h.hour.rotation.z = -((hour % 12) / 12) * Math.PI * 2;
      h.minute.rotation.z = -((hour % 1) * Math.PI * 2);
    }
    if (this.clockMaterial) this.clockMaterial.emissiveIntensity = night * 0.9;
  }

  // -------------------------------------------------------------- walls

  _wall(w) {
    const [ax, az] = w.from;
    const [bx, bz] = w.to;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dz, dx);
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const { height: H, thickness: T } = CASTLE.wall;
    const y0 = CASTLE.groundY;
    const yF = Math.min(y0, this._minGround(cx, cz, len / 2, T / 2, yaw)) - KIT.foundationBelow;
    const m = (y) => M(cx, y, cz, yaw);
    this._add(block(len, H + (y0 - yF), T), m(yF), 'stone');
    this._add(block(len, KIT.plinth.height, T + KIT.plinth.out * 2), m(y0), 'stone');
    this._add(block(len + 0.2, 0.5, T + 0.5), m(y0 + H - 0.5), 'stone');
    this._add(battlementsLine(len, T), m(y0 + H), 'stone');
    this._box(new THREE.Vector3(len, H + (y0 - yF) + KIT.merlon.height, T), m(yF + (H + (y0 - yF) + KIT.merlon.height) / 2), 'Sur');
  }

  _gate(g) {
    const [cx, cz] = g.pos;
    const y0 = CASTLE.groundY;
    const H = CASTLE.wall.height + 3;
    const T = CASTLE.wall.thickness + 1;
    const at = (x, y, z, yaw = 0) => M(cx, 0, cz, g.yaw).multiply(M(x, y, z, yaw));
    const yF = Math.min(y0, this._minGround(cx, cz, g.span / 2, T, g.yaw)) - KIT.foundationBelow;
    this._add(archSpan(g.span, H + (y0 - yF), T, g.width, g.height + (y0 - yF)), at(0, yF, 0), 'stone');
    this._add(battlementsLine(g.span, T), at(0, y0 + H, 0), 'stone');
    for (const sx of [-1, 1]) {
      const x = (sx * g.span) / 2;
      const tr = at(x, 0, 0);
      this._add(towerShaft(g.towerRadius, g.towerHeight + (y0 - yF)), tr.clone().multiply(M(0, yF, 0)), 'stone');
      this._add(band(g.towerRadius, KIT.corbel.height, KIT.corbel.out), tr.clone().multiply(M(0, y0 + g.towerHeight - KIT.corbel.height, 0)), 'stone');
      this._add(coneRoof(g.towerRadius, g.towerRadius * 2.2, 20), tr.clone().multiply(M(0, y0 + g.towerHeight, 0)), 'roof', 0);
      this._cyl(g.towerRadius * 1.05, g.towerHeight + (y0 - yF), tr.clone().multiply(M(0, yF + (g.towerHeight + (y0 - yF)) / 2, 0)), g.name);
      // Side piers of the arch.
      const pw = (g.span - g.width) / 2;
      this._box(new THREE.Vector3(pw, H + (y0 - yF), T), at(sx * (g.width / 2 + pw / 2), yF + (H + (y0 - yF)) / 2, 0), g.name);
      // Gate lamps.
      this.lamps.push([...new THREE.Vector3(sx * (g.width / 2 + 0.9), y0 + g.height * 0.55, T / 2 + 0.5).applyMatrix4(M(cx, 0, cz, g.yaw)).toArray()]);
    }
    const lintel = H - g.height;
    this._box(new THREE.Vector3(g.width, lintel, T), at(0, y0 + g.height + lintel / 2, 0), g.name);
  }

  // ------------------------------------------------------------ viaduct

  _viaduct(v) {
    const [ax, az] = v.from;
    const [bx, bz] = v.to;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dz, dx);
    const ya = CASTLE.groundY;
    const yb = this.o.heightAt(bx, bz) + 0.05;
    const n = Math.max(1, Math.round(len / v.arch));
    const s = len / n;
    const deckAt = (t) => ya + (yb - ya) * t;
    const pitch = Math.atan2(yb - ya, len);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const cx = ax + dx * t;
      const cz = az + dz * t;
      const g = this._minGround(cx, cz, s / 2, v.width / 2, yaw) - 2;
      const top = deckAt(t) - v.deckThickness;
      const h = top - g;
      if (h <= 0.5) continue;
      const archH = h - 6;
      const archW = s - v.pierWidth;
      this._add(archSpan(s, h, v.width, archH > 3 ? archW : 0, archH), M(cx, g, cz, yaw), 'stone');
      // Piers as colliders (the arch openings stay walkable).
      for (const e of [-1, 1]) {
        const px = cx + (dx / len) * (e * (s / 2 - v.pierWidth / 4));
        const pz = cz + (dz / len) * (e * (s / 2 - v.pierWidth / 4));
        this._box(new THREE.Vector3(v.pierWidth / 2, h, v.width), M(px, g + h / 2, pz, yaw), 'Köprü ayağı');
      }
    }
    // Deck and parapets (follow the slope).
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const my = (ya + yb) / 2;
    const deckLen = Math.hypot(len, yb - ya);
    this._add(block(deckLen, v.deckThickness, v.width), M(mx, my - v.deckThickness, mz, yaw, pitch), 'stone');
    this._box(new THREE.Vector3(deckLen, v.deckThickness, v.width), M(mx, my - v.deckThickness / 2, mz, yaw, pitch), 'Köprü');
    for (const side of [-1, 1]) {
      const ox = Math.sin(yaw) * side * (v.width / 2 - 0.3);
      const oz = Math.cos(yaw) * side * (v.width / 2 - 0.3);
      this._add(block(deckLen, v.parapet, 0.6), M(mx + ox, my, mz + oz, yaw, pitch), 'stone');
      this._add(battlementsLine(deckLen, 0.6), M(mx + ox, my + v.parapet, mz + oz, yaw, pitch), 'stone');
      this._box(new THREE.Vector3(deckLen, v.parapet + 1.1, 0.6), M(mx + ox, my + (v.parapet + 1.1) / 2, mz + oz, yaw, pitch), 'Korkuluk');
      for (const t of [0.25, 0.5, 0.75]) {
        this.lamps.push([ax + dx * t + ox * 0.9, deckAt(t) + v.parapet, az + dz * t + oz * 0.9]);
      }
    }
  }

  dispose() {
    for (const c of this.colliders) this.o.physics.removeCollider(c);
    for (const r of this.owned) r.dispose();
  }
}

