/**
 * @file SpiderQueen — boss of the Forbidden Forest lair, fought in three
 * phases that use the arena:
 *   1  bites (cone), leg sweeps (ring), web volleys, calls spiderlings
 *   2  at 66 % health she climbs into the canopy web: venom rains on
 *      telegraphed circles, spiderlings keep coming, she barely takes
 *      damage — burn (Incendio) or blast (Confringo) the three glowing web
 *      anchors and she crashes down, stunned (finisher window)
 *   3  enraged: telegraphed straight-line charges, faster everything
 * Every big attack is announced by a ground telegraph.
 */
import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { BOSS, ENEMY_SPELLS, COMBAT } from '../../data/combat.js';
import { spiderModel } from '../../procgen/creatures/EnemyModels.js';
import { selector, action, RUNNING } from '../ai/BehaviorTree.js';
import { glowMaterial } from '../../render/SpellVisuals.js';

const _v = new THREE.Vector3();
const PHASE_LABEL = ['', 'Aşama 1 — Yuva', 'Aşama 2 — Tepedeki ağ', 'Aşama 3 — Öfke'];

export class SpiderQueen extends Enemy {
  constructor(mgr, pos, o = {}) {
    const def = BOSS.spiderQueen;
    super(mgr, 'spiderQueen', { ...def, sight: 60, fov: 360, hearing: 60, lowHealthRetreat: 0 }, pos, { ...o, healthScale: mgr.difficulty.health });
    this.boss = true;
    this.model = spiderModel(mgr.cache, { scale: def.scale, color: def.color, eyes: def.eyes, queen: true });
    mgr.root.add(this.model.root);
    this.phase = 1;
    this.center0 = new THREE.Vector3(def.arena.center[0], pos.y, def.arena.center[1]);
    this._cd = { bite: 0, sweep: 2, volley: 3, summon: 6, rain: 1, charge: 2 };
    this.spawned = [];
    this.anchors = [];
    this.hanging = false;
    this.fallT = 0;
    this._buildArena();
    this.tree = selector(action((e, dt) => e.fight(dt), 'boss'));
  }

  // --------------------------------------------------------------- arena

  _buildArena() {
    const C = BOSS.spiderQueen.canopy;
    const mgr = this.mgr;
    const g = new THREE.Group();
    g.name = 'Örümcek yuvası';
    mgr.root.add(g);
    this.arena = g;
    const top = this.center0.y + C.height + 1;
    // Canopy web: radial and ring threads.
    const pts = [];
    const R = C.anchorRadius + 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push(this.center0.x, top, this.center0.z, this.center0.x + Math.cos(a) * R, top + 1.5, this.center0.z + Math.sin(a) * R);
    }
    for (let r = 2; r <= R; r += 2.2) {
      for (let i = 0; i < 32; i++) {
        const a0 = (i / 32) * Math.PI * 2;
        const a1 = ((i + 1) / 32) * Math.PI * 2;
        const y = top + (r / R) * 1.5;
        pts.push(this.center0.x + Math.cos(a0) * r, y, this.center0.z + Math.sin(a0) * r, this.center0.x + Math.cos(a1) * r, y, this.center0.z + Math.sin(a1) * r);
      }
    }
    const webGeo = new THREE.BufferGeometry();
    webGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.webMat = new THREE.LineBasicMaterial({ color: 0xe8e4dc, transparent: true, opacity: 0.55 });
    this.web = new THREE.LineSegments(webGeo, this.webMat);
    g.add(this.web);
    this._arenaGeos = [webGeo];
    // Anchors: glowing silk columns from the canopy down to the ground.
    this.anchorMat = glowMaterial('#d8f0ff', 0.9, 0.3);
    const colGeo = new THREE.CylinderGeometry(0.35, 0.6, 1, 10, 1, true);
    colGeo.translate(0, 0.5, 0);
    this._arenaGeos.push(colGeo);
    for (let i = 0; i < C.anchors; i++) {
      const a = (i / C.anchors) * Math.PI * 2 + 0.4;
      const x = this.center0.x + Math.cos(a) * C.anchorRadius;
      const z = this.center0.z + Math.sin(a) * C.anchorRadius;
      const y = mgr.groundAt(x, z, this.center0.y);
      const mesh = new THREE.Mesh(colGeo, this.anchorMat);
      mesh.position.set(x, y, z);
      mesh.scale.set(1, top - y, 1);
      mesh.visible = false;
      g.add(mesh);
      const collider = mgr.physics.addStaticCylinder(0.6, top - y, new THREE.Matrix4().makeTranslation(x, y + (top - y) / 2, z), { surface: 'cloth', name: 'Ağ çapası', rigid: false });
      collider.enabled = false;
      const anchor = { mesh, collider, health: C.anchorHealth, burning: 0, alive: false, pos: new THREE.Vector3(x, y + 1.5, z) };
      anchor.handler = {
        name: 'Ağ çapası',
        takesDamage: true,
        center: (out) => out.copy(anchor.pos),
        onSpell: (ev) => {
          if (!anchor.alive) return false;
          if (ev.effect === 'ignite') anchor.burning = 3;
          else anchor.health -= (ev.effect === 'explode' ? 40 : 6) * ev.power;
          return true;
        },
      };
      mgr.targets.add(collider, anchor.handler);
      this.anchors.push(anchor);
    }
  }

  // -------------------------------------------------------------- phases

  _enterCanopy() {
    const C = BOSS.spiderQueen.canopy;
    this.phase = 2;
    this.cancelAction();
    this.hanging = true;
    this.mgr.bus.emit('combat:bossPhase', { enemy: this, phase: 2, label: PHASE_LABEL[2] });
    this.mgr.bus.emit('spell:message', { text: 'Nyxara tepedeki ağa tırmandı! Parlayan ağ çapalarını yak ya da patlat.' });
    for (const a of this.anchors) {
      a.alive = true;
      a.health = C.anchorHealth;
      a.mesh.visible = true;
      a.collider.enabled = true;
    }
  }

  _fall() {
    const C = BOSS.spiderQueen.canopy;
    this.hanging = false;
    this.phase = 3;
    this.status.staggered = C.fallStun;
    this.poise = 0;
    this.controller.teleport(this.center0.clone().setY(this.center0.y + 2));
    this.mgr.bus.emit('spell:impact', { strength: 1, hitStop: true });
    this.mgr.spells.visuals.shockwave(this.center0.clone().setY(this.center0.y + 0.2), '#e8e0d0', 9, 0.6);
    this.mgr.bus.emit('combat:bossPhase', { enemy: this, phase: 3, label: PHASE_LABEL[3] });
    this.mgr.bus.emit('spell:message', { text: 'Nyxara yere çakıldı — şimdi bitirici büyünün tam zamanı!' });
  }

  get phaseLabel() {
    return PHASE_LABEL[this.phase];
  }

  // ----------------------------------------------------------------- fight

  fight(dt) {
    const B = BOSS.spiderQueen;
    const player = this.mgr.player;
    const pp = player.position;
    if (!this.engaged) {
      this.facePoint(pp, dt, 2);
      return RUNNING;
    }
    if (this.phase === 1 && this.health < this.maxHealth * B.phases[1]) {
      this._enterCanopy();
      return RUNNING;
    }
    if (this.hanging) return this._canopy(dt);
    const fast = this.phase === 3 ? 1.35 : 1;
    const d = this.distanceToPlayer();
    // Summon spiderlings now and then.
    if (this._cd.summon <= 0 && this.spawned.filter((s) => !s.dead).length < B.summon.max) {
      this._cd.summon = B.summon.cooldown / fast;
      for (let i = 0; i < B.summon.count; i++) this.spawned.push(this.mgr.spawnEnemy('spiderling', this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0.5, (Math.random() - 0.5) * 4)), this.zone));
      this.mgr.bus.emit('spell:message', { text: 'Yavru örümcekler yuvadan dökülüyor!' });
      return RUNNING;
    }
    if (this.phase === 3 && this._cd.charge <= 0 && d > 6) return this._charge(fast);
    if (d < B.bite.range + this.def.radius + 0.5 && this._cd.bite <= 0) return this._bite(fast);
    if (d < B.sweep.radius && this._cd.sweep <= 0) return this._sweep(fast);
    if (d > 8 && this._cd.volley <= 0 && this.canSee()) return this._volley(fast);
    this.moveTo(pp, B.speed[1] * fast, dt, B.bite.range);
    return RUNNING;
  }

  _bite(fast) {
    const S = BOSS.spiderQueen.bite;
    this._cd.bite = S.cooldown / fast;
    this.startAction({
      name: 'bite', windup: S.windup / fast, recovery: 0.6,
      telegraph: { shape: 'cone', radius: S.range + this.def.radius, angle: S.angle, yaw: this.yaw, color: 0xff2a0a },
      onWindup: (e, k, dt) => e.facePoint(e.mgr.player.position, dt, 3),
      onStrike: (e) => e.meleeHit(S.range + e.def.radius, S.angle + 10, S.damage, 'light'),
    });
    return RUNNING;
  }

  _sweep(fast) {
    const S = BOSS.spiderQueen.sweep;
    this._cd.sweep = S.cooldown / fast;
    this.startAction({
      name: 'sweep', windup: S.windup / fast, recovery: 0.8,
      telegraph: { shape: 'circle', radius: S.radius, color: 0xff2a0a },
      onStrike: (e) => {
        e.meleeHit(S.radius, 360, S.damage, 'light');
        e.mgr.spells.visuals.shockwave(e.position.clone().setY(e.position.y + 0.1), '#a08060', S.radius, 0.4);
      },
    });
    return RUNNING;
  }

  _volley(fast) {
    const S = BOSS.spiderQueen.volley;
    this._cd.volley = S.cooldown / fast;
    this.startAction({
      name: 'volley', windup: S.windup / fast, recovery: 0.5,
      onWindup: (e, k, dt) => e.facePoint(e.mgr.player.position, dt, 6),
      onStrike: (e) => {
        const from = e.center(new THREE.Vector3()).addScaledVector(e.forward, e.def.radius + 1);
        for (let i = 0; i < S.count; i++) {
          const to = e.mgr.player.position.clone().setY(e.mgr.player.position.y + 1);
          to.x += (i - (S.count - 1) / 2) * 2.2;
          e.mgr.spells.launch(i % 2 ? ENEMY_SPELLS.venom : ENEMY_SPELLS.web, { id: i % 2 ? 'venom' : 'web', from, dir: to.sub(from).normalize().add(new THREE.Vector3(0, 0.1, 0)).normalize(), owner: e, ignore: e.mgr.allyIgnore(e) });
        }
      },
    });
    return RUNNING;
  }

  _charge(fast) {
    const S = BOSS.spiderQueen.charge;
    this._cd.charge = S.cooldown;
    this.facePoint(this.mgr.player.position, 1, 60);
    this.startAction({
      name: 'charge', windup: S.windup / fast, active: S.length / S.speed, recovery: 1.3,
      telegraph: { shape: 'lane', length: S.length, width: S.width, yaw: this.yaw, color: 0xff1a00 },
      onStrike: (e) => {
        e._chargeHit = false;
      },
      onActive: (e) => {
        e.walk(e.forward.clone(), S.speed);
        e.controller.velocity.x = e.forward.x * S.speed;
        e.controller.velocity.z = e.forward.z * S.speed;
        if (!e._chargeHit && e.distanceToPlayer() < e.def.radius + 1.2) {
          e._chargeHit = true;
          e.meleeHit(e.def.radius + 1.6, 360, S.damage, 'heavy');
        }
      },
    });
    return RUNNING;
  }

  /** Phase 2: hang in the web and rain venom. */
  _canopy(dt) {
    const C = BOSS.spiderQueen.canopy;
    const pp = this.mgr.player.position;
    this.facePoint(pp, dt, 2);
    this._cd.rain -= dt;
    if (this._cd.rain <= 0) {
      this._cd.rain = C.rainEvery;
      const at = pp.clone();
      at.x += (Math.random() - 0.5) * 3;
      at.z += (Math.random() - 0.5) * 3;
      at.y = this.mgr.groundAt(at.x, at.z, pp.y);
      const tg = this.mgr.telegraphs.show('circle', at, { radius: C.rainRadius, windup: C.rainWindup, color: 0x9aff3a });
      this.mgr.later(C.rainWindup, () => {
        tg.cancel?.();
        this.mgr.spells.glow.burst(40, at, { speed: [1, 4], life: 0.8, size: 0.25, color: '#9aff3a', endColor: '#2a6a10', dir: new THREE.Vector3(0, 1, 0), spread: 0.9, gravity: 6 });
        this.mgr.spells.smoke.burst(10, at, { speed: [0.3, 1], life: 2, size: 0.5, endSize: 1.4, color: '#4a7a2a', alpha: 0.4, endAlpha: 0, shape: 2, lift: 0.5 });
        const p = this.mgr.player.position;
        if (Math.hypot(p.x - at.x, p.z - at.z) < C.rainRadius) this.mgr.strikePlayer(this, C.rainDamage, null);
      });
    }
    if (this._cd.summon <= 0 && this.spawned.filter((s) => !s.dead).length < BOSS.spiderQueen.summon.max) {
      this._cd.summon = BOSS.spiderQueen.summon.cooldown;
      for (let i = 0; i < 2; i++) this.spawned.push(this.mgr.spawnEnemy('spiderling', this.anchors[i % this.anchors.length].pos.clone(), this.zone));
    }
    return RUNNING;
  }

  // -------------------------------------------------------------- update

  onSpell(ev) {
    if (this.hanging) ev.power *= 0.2;
    return super.onSpell(ev);
  }

  fixedUpdate(dt) {
    for (const k of Object.keys(this._cd)) this._cd[k] -= dt;
    if (this.hanging) {
      // Hang from the canopy: no controller, collider follows.
      const C = BOSS.spiderQueen.canopy;
      this.time += dt;
      this.position.lerp(_v.copy(this.center0).setY(this.center0.y + C.height), 1 - Math.exp(-2 * dt));
      this.velocity.set(0, 0, 0);
      this._perception(dt);
      for (const k of Object.keys(this.status)) this.status[k] = Math.max(0, this.status[k] - dt);
      this.tree && this.fight(dt);
      this.mgr.physics.moveKinematic(this.body, _v.copy(this.position).setY(this.position.y + this.colliderOffset), this.body.quat);
      // Anchors burn / break.
      let alive = 0;
      for (const a of this.anchors) {
        if (!a.alive) continue;
        if (a.burning > 0) {
          a.burning -= dt;
          a.health -= 22 * dt;
          const p = a.pos;
          this.mgr.spells.glow.spawn({ x: p.x + (Math.random() - 0.5) * 0.8, y: p.y + Math.random() * 3, z: p.z + (Math.random() - 0.5) * 0.8 }, { x: 0, y: 1.5, z: 0 }, { life: 0.6, size: 0.4, endSize: 0.05, color: '#ffd060', endColor: '#ff2a00', drag: 1.5 });
        }
        if (a.health <= 0) {
          a.alive = false;
          a.mesh.visible = false;
          a.collider.enabled = false;
          this.mgr.spells.visuals.flash(a.pos, '#ffe0a0', 2, 0.4);
          this.mgr.bus.emit('spell:message', { text: `Ağ çapası koptu! (${this.anchors.filter((x) => x.alive).length} kaldı)` });
        } else alive++;
      }
      if (alive === 0) this._fall();
      return;
    }
    super.fixedUpdate(dt);
  }

  render(dt) {
    const m = this.model;
    m.root.position.copy(this.position);
    m.root.rotation.y = this.yaw;
    m.root.rotation.x = this.hanging ? Math.PI : 0;
    if (this.hanging) m.root.position.y += BOSS.spiderQueen.height;
    const a = this.action;
    m.update(dt, { speed: this.speed, action: a ? (a.struck ? 'strike' : 'windup') : null, k: a ? Math.min(1, a.t / a.windup) : 0, dead: this.dead, deadT: this.deadTime, time: this.time });
    this.anchorMat.uniforms.uOpacity.value = 0.6 + Math.sin(this.time * 3) * 0.25;
  }

  onDeath() {
    for (const s of this.spawned) if (!s.dead) s.die();
    this.mgr.bus.emit('combat:bossDefeated', { enemy: this });
  }

  get gone() {
    return this.dead && this.deadTime > COMBAT.corpseTime * 3;
  }

  dispose() {
    super.dispose();
    this.model.dispose();
    for (const a of this.anchors) {
      this.mgr.targets.remove(a.handler);
      this.mgr.physics.removeCollider(a.collider);
    }
    for (const g of this._arenaGeos) g.dispose();
    this.webMat.dispose();
    this.anchorMat.dispose();
    this.arena.removeFromParent();
  }
}
