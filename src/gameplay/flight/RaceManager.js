/**
 * @file RaceManager — ring races over the grounds. Each course has a start
 * post (pennant, E to start); a race mounts the broom if needed, lines the
 * rider up at the gate, counts down and times the run through glowing
 * rings in order. Rings sit a set height above whatever lies beneath them
 * (terrain, roofs or the lake surface). Finishing awards a medal and
 * Galleons for a better medal, and the fastest run is kept as a ghost
 * that flies along next time.
 *
 * Events: race:start {id}, race:ring {i, n}, race:finish {id, time, medal, best, reward}, race:abort {id, reason}
 */
import * as THREE from 'three';
import { RACES, RACE_RULES, BROOMS } from '../../data/flight.js';
import { glowMaterial } from '../../render/SpellVisuals.js';
import { FlyerKit } from '../../procgen/geometry/BroomKit.js';

const DOWN = new THREE.Vector3(0, -1, 0);
/** Ring look: tube thickness, colours, idle opacity. */
const RING = Object.freeze({ tube: 0.22, next: '#ffd35a', later: '#7ab8ff', passed: '#6aff9a', dim: 0.28 });
/** Start post height and pennant size (m). */
const POST = Object.freeze({ height: 3.2, flag: [1.1, 0.7] });
/** Ghost rider tint and opacity. */
const GHOST = Object.freeze({ color: '#9ad8ff', opacity: 0.45 });
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _cur = new THREE.Vector3();
const _hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };

/** Distance from point p to segment ab. */
function segPoint(a, b, p) {
  _d.subVectors(b, a);
  const l2 = _d.lengthSq();
  const t = l2 > 0 ? THREE.MathUtils.clamp(_a.subVectors(p, a).dot(_d) / l2, 0, 1) : 0;
  return _b.copy(a).addScaledVector(_d, t).distanceTo(p);
}

export class RaceManager {
  /**
   * @param {{bus:any, player:any, flight:import('./BroomFlight.js').BroomFlight, inventory:import('../Inventory.js').Inventory,
   *          physics:any, scene:THREE.Scene, interactions:any, particles:{glow:any}, cameraRig:any}} o
   */
  constructor(o) {
    this.o = o;
    this.bus = o.bus;
    this.root = new THREE.Group();
    this.root.name = 'Yarışlar';
    o.scene.add(this.root);
    this.time = { value: 0 };
    this.kit = new FlyerKit();
    this.region = null;
    this.posts = [];
    /** @type {any} active race */
    this.race = null;
    this.ringGeo = null;
  }

  // -------------------------------------------------------------- region

  /** Build start posts when the region has race courses (the grounds). */
  setRegion(region) {
    this.clear();
    this.region = region;
    if (!region?.allowFlight || region.id !== 'grounds') return;
    const postGeo = new THREE.CylinderGeometry(0.09, 0.12, POST.height, 8).translate(0, POST.height / 2, 0);
    const flagGeo = new THREE.PlaneGeometry(POST.flag[0], POST.flag[1]).translate(POST.flag[0] / 2, POST.height - POST.flag[1] / 2 - 0.1, 0);
    this._postGeos = [postGeo, flagGeo];
    this._postMats = [new THREE.MeshStandardMaterial({ color: '#6a4a2e', roughness: 0.8 }), glowMaterial(RING.next, 0.85, 0.2)];
    this._postMats[1].side = THREE.DoubleSide;
    for (const R of RACES) {
      const [x, z] = R.start;
      const y = region.heightAt(x, z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.add(new THREE.Mesh(postGeo, this._postMats[0]), new THREE.Mesh(flagGeo, this._postMats[1]));
      this.root.add(g);
      const pos = new THREE.Vector3(x, y + 1.2, z);
      const item = this.o.interactions.add({
        id: `race:${R.id}`,
        position: pos,
        radius: RACE_RULES.postRadius,
        label: () => this._postLabel(R),
        enabled: () => !this.race,
        action: () => this.start(R.id),
      });
      this.posts.push({ R, g, item, pos });
    }
  }

  _postLabel(R) {
    const rec = this.o.inventory.races[R.id];
    const best = rec && Number.isFinite(rec.best) ? ` · en iyi ${fmt(rec.best)}${rec.medal >= 0 ? ` (${RACE_RULES.medalNames[rec.medal]})` : ''}` : '';
    return `Yarış: ${R.name}${best}`;
  }

  // -------------------------------------------------------------- race

  /** Ring world positions for a course. */
  _rings(R) {
    const out = [];
    const phys = this.o.physics;
    for (const [x, z, h] of R.points) {
      const top = 600;
      const hit = phys.raycast(_a.set(x, top, z), DOWN, top + 200, { dynamic: false, kinematic: false }, _hit);
      let ground = hit ? hit.point.y : this.region.heightAt(x, z);
      const wl = this.region.waterLevelAt?.(x, z) ?? -Infinity;
      ground = Math.max(ground, wl);
      out.push(new THREE.Vector3(x, ground + h, z));
    }
    return out;
  }

  /** @param {string} id */
  start(id) {
    if (this.race) return false;
    const R = RACES.find((r) => r.id === id);
    if (!R || !this.region?.allowFlight) return false;
    const f = this.o.flight;
    if (!f.active && !f.mount()) return false;
    const rings = this._rings(R);
    const [sx, sz] = R.start;
    const gate = new THREE.Vector3(sx, this.region.heightAt(sx, sz) + 3, sz);
    const dir = _d.subVectors(rings[0], gate);
    const yaw = Math.atan2(-dir.x, -dir.z);
    const p = this.o.player;
    p.teleport(gate, yaw);
    f.yaw = yaw;
    f.pitch = 0;
    f.speed = 0;
    f.velocity.set(0, 0, 0);
    f.stamina = 100;
    this.o.cameraRig.snapTo(gate, yaw, -0.08);
    // Ring meshes, each facing along the course.
    this.ringGeo ??= new THREE.TorusGeometry(1, RING.tube, 10, 40);
    const meshes = rings.map((c, i) => {
      const m = new THREE.Mesh(this.ringGeo, glowMaterial(RING.later, RING.dim, 0.2));
      m.scale.setScalar(R.ringRadius);
      m.position.copy(c);
      const prev = i === 0 ? gate : rings[i - 1];
      const next = rings[i + 1] ?? c.clone().add(_a.subVectors(c, prev));
      _a.subVectors(next, prev).normalize();
      m.lookAt(_b.copy(c).add(_a));
      this.root.add(m);
      return m;
    });
    const rec = this.o.inventory.races[R.id];
    this.race = {
      R, rings, meshes, gate, i: 0, t: 0, count: RACE_RULES.countdown, shown: RACE_RULES.countdown + 1,
      ghostRec: [], ghostT: 0, prev: p.position.clone(),
      ghostRun: rec?.ghost?.length ? rec.ghost : null, best: rec && Number.isFinite(rec.best) ? rec.best : null,
    };
    if (this.race.ghostRun) this._makeGhost();
    this._highlight();
    this.bus.emit('race:start', { id: R.id, name: R.name });
    return true;
  }

  _makeGhost() {
    const spec = BROOMS[this.o.inventory.broom];
    this._ghostBroom ??= this.kit.broomGeometry(spec);
    const g = this.kit.rider({ robe: GHOST.color, trim: GHOST.color, skin: GHOST.color }, this._ghostBroom);
    g.traverse((m) => {
      if (m.isMesh) {
        m.material = m.material.clone();
        m.material.transparent = true;
        m.material.opacity = GHOST.opacity;
        m.material.depthWrite = false;
        m.castShadow = false;
        this._ghostMats ??= [];
        this._ghostMats.push(m.material);
      }
    });
    this.root.add(g);
    this.race.ghost = g;
  }

  _highlight() {
    const r = this.race;
    r.meshes.forEach((m, i) => {
      const u = m.material.uniforms;
      if (i < r.i) {
        u.uColor.value.set(RING.passed);
        u.uOpacity.value = 0.12;
      } else if (i === r.i) {
        u.uColor.value.set(RING.next);
        u.uOpacity.value = 0.95;
      } else {
        u.uColor.value.set(RING.later);
        u.uOpacity.value = i === r.i + 1 ? 0.5 : RING.dim;
      }
    });
  }

  /** @param {string} reason */
  abort(reason) {
    const r = this.race;
    if (!r) return;
    this.bus.emit('race:abort', { id: r.R.id, reason });
    this._end();
  }

  _end() {
    const r = this.race;
    if (!r) return;
    for (const m of r.meshes) {
      m.material.dispose();
      m.removeFromParent();
    }
    r.ghost?.removeFromParent();
    for (const m of this._ghostMats ?? []) m.dispose();
    this._ghostMats = [];
    this.race = null;
  }

  _finish() {
    const r = this.race;
    const R = r.R;
    const time = r.t;
    const medal = R.medals.findIndex((m) => time <= m);
    const rec = this.o.inventory.recordRace(R.id, time, medal, r.ghostRec);
    let reward = 0;
    if (medal >= 0 && (rec.prevMedal < 0 || medal < rec.prevMedal)) reward = R.reward[medal];
    if (reward) this.o.inventory.earn(reward, `${R.name} — ${RACE_RULES.medalNames[medal]} madalya`);
    this.bus.emit('race:finish', { id: R.id, name: R.name, time, medal, best: rec.best, reward });
    this.o.particles.glow.burst(80, this.o.player.position.clone().setY(this.o.player.position.y + 1), { speed: [2, 8], life: 1.2, size: 0.12, color: '#ffd35a', shape: 1, drag: 1.5 });
    this._end();
  }

  // -------------------------------------------------------------- update

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    const r = this.race;
    if (!r) return;
    const f = this.o.flight;
    const p = this.o.player;
    if (r.count > 0) {
      // Hold at the gate during the countdown.
      r.count -= dt;
      f.speed = 0;
      f.velocity.set(0, 0, 0);
      p.controller.position.copy(r.gate);
      const left = Math.ceil(r.count);
      if (left < r.shown) {
        r.shown = left;
        this.bus.emit('race:countdown', { n: Math.max(0, left) });
      }
      r.prev.copy(p.position).setY(p.position.y + 1);
      return;
    }
    if (!f.active || p.dead) {
      this.abort(p.dead ? 'Yarış bitti — yere düştün.' : 'Süpürgeden indin, yarış iptal.');
      return;
    }
    r.t += dt;
    // Ghost recording (x, y, z, yaw).
    r.ghostT += dt;
    if (r.ghostT >= RACE_RULES.ghostStep) {
      r.ghostT -= RACE_RULES.ghostStep;
      const q = p.position;
      r.ghostRec.push(Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10, Math.round(q.z * 10) / 10, Math.round(f.yaw * 100) / 100);
    }
    // Ring passing: the rider's chest segment this step within the radius.
    const cur = _cur.copy(p.position);
    cur.y += 1;
    const from = r.prev;
    const ring = r.rings[r.i];
    if (segPoint(from, cur, ring) < r.R.ringRadius) {
      this.o.particles.glow.burst(40, ring, { speed: [1, 5], life: 0.6, size: 0.1, color: RING.passed, shape: 1, drag: 2, jitter: r.R.ringRadius });
      r.i++;
      this.bus.emit('race:ring', { i: r.i, n: r.rings.length });
      if (r.i >= r.rings.length) {
        this._finish();
        return;
      }
      this._highlight();
    }
    r.prev.copy(p.position).setY(p.position.y + 1);
    if (p.position.distanceTo(r.rings[r.i]) > RACE_RULES.abandonDistance) this.abort('Parkurdan çok uzaklaştın, yarış iptal.');
  }

  /** @param {number} dt */
  frame(dt) {
    this.time.value += dt;
    const r = this.race;
    if (!r) return;
    // Pulse the next ring.
    const m = r.meshes[r.i];
    if (m) m.material.uniforms.uOpacity.value = 0.75 + Math.sin(this.time.value * 6) * 0.2;
    // Ghost playback.
    if (r.ghost && r.count <= 0) {
      const g = r.ghostRun;
      const n = g.length / 4;
      const k = Math.min(n - 1.001, r.t / RACE_RULES.ghostStep);
      const i = Math.floor(k);
      const u = k - i;
      const at = (j, o) => g[Math.min(n - 1, j) * 4 + o];
      r.ghost.position.set(
        THREE.MathUtils.lerp(at(i, 0), at(i + 1, 0), u),
        THREE.MathUtils.lerp(at(i, 1), at(i + 1, 1), u) + 0.8,
        THREE.MathUtils.lerp(at(i, 2), at(i + 1, 2), u),
      );
      r.ghost.rotation.set(0, at(i, 3), 0);
      r.ghost.visible = k < n - 1.01;
    } else if (r.ghost) {
      r.ghost.position.copy(r.gate).setY(r.gate.y + 0.8);
    }
  }

  /** State for the HUD (null when no race). */
  get hud() {
    const r = this.race;
    if (!r) return null;
    const R = r.R;
    return { name: R.name, time: Math.max(0, r.t), ring: r.i, rings: r.rings.length, next: r.rings[r.i], best: r.best, medals: R.medals, countdown: r.count > 0 };
  }

  get stats() {
    const r = this.race;
    return { Yarış: r ? `${r.R.name} · halka ${r.i}/${r.rings.length} · ${fmt(r.t)}${r.ghostRun ? ' · hayalet' : ''}` : '—' };
  }

  clear() {
    this._end();
    for (const p of this.posts) {
      this.o.interactions.remove(p.item);
      p.g.removeFromParent();
    }
    this.posts = [];
    for (const g of this._postGeos ?? []) g.dispose();
    for (const m of this._postMats ?? []) m.dispose();
    this._postGeos = this._postMats = null;
  }

  dispose() {
    this.clear();
    this.ringGeo?.dispose();
    this.kit.dispose();
    this.root.removeFromParent();
  }
}

/** m:ss.s */
export function fmt(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
