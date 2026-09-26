/**
 * @file QuidditchMatch — a full match on the pitch with the player as their
 * house's Seeker. Thirteen AI flyers play around you: Chasers carry, pass
 * and shoot the Quaffle (tackles knock it loose), Keepers guard the three
 * hoops, Beaters bat the Bludgers at the other side — and at you. After a
 * while the Golden Snitch appears, wandering and darting around the pitch;
 * a rival Seeker hunts it too once they spot it (speed and reaction by
 * difficulty). Catching the Snitch is worth 150 and ends the match.
 * Barrel-roll (F) through Bludgers; a hit hurts and shakes you.
 *
 * Events: quidditch:start, quidditch:countdown {n}, quidditch:goal {team, scores, by},
 *         quidditch:save, quidditch:snitch {state}, quidditch:bludger {hit}, quidditch:end {won, scores, caughtBy}
 */
import * as THREE from 'three';
import { QUIDDITCH, BROOMS } from '../../data/flight.js';
import { PITCH } from '../../data/grounds.js';
import { HOUSES } from '../../data/character.js';
import { FlyerKit } from '../../procgen/geometry/BroomKit.js';
import { glowMaterial } from '../../render/SpellVisuals.js';

const Q = QUIDDITCH;
/** Ball sizes (m) and colours. */
const BALLS = Object.freeze({ quaffle: [0.16, '#8e2a1e'], bludger: [0.14, '#1c1a1a'], snitch: [0.05, '#ffd24a'] });
/** Spacing of the line-up at the start (m). */
const LINEUP = 5;
/** Seconds a knocked flyer tumbles. */
const KNOCK = 1.6;
/** Keeper pass delay and beater bat cooldown (s). */
const KEEPER_PASS = 1.4;
const BAT_COOLDOWN = 1.2;
/** Result screen time before cleanup (s). */
const OUTRO = 6;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _t = new THREE.Vector3();

const rand = (a, b) => a + Math.random() * (b - a);

export class QuidditchMatch {
  /**
   * @param {{bus:any, player:any, flight:import('./BroomFlight.js').BroomFlight, inventory:import('../Inventory.js').Inventory,
   *          scene:THREE.Scene, particles:{glow:any}, cameraRig:any, settings:any, heightAt:(x:number,z:number)=>number, house:()=>string,
   *          interactions:any, busy:()=>boolean}} o
   */
  constructor(o) {
    this.o = o;
    this.bus = o.bus;
    this.kit = null;
    this.root = new THREE.Group();
    this.root.name = 'Quidditch';
    o.scene.add(this.root);
    this.phase = 'idle';
    this.flyers = [];
    const [cx, cz] = PITCH.center;
    this.center = new THREE.Vector3(cx, o.heightAt(cx, cz), cz);
    // Hoops: team 0 defends the west end (-x), team 1 the east end.
    this.hoops = [-1, 1].map((end) => PITCH.hoopHeights.map((h, k) => {
      const x = cx + end * (PITCH.radii[0] - Q.hoopInset);
      const z = cz + (k - 1) * PITCH.hoopSpacing;
      return new THREE.Vector3(x, o.heightAt(x, z) + h + PITCH.hoopRadius, z);
    }));
    // Match sign-up by the pitch entrance: a pole with a golden pennant.
    const [sx, sz] = Q.signup;
    this._signGeos = [new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8).translate(0, 1.7, 0), new THREE.PlaneGeometry(1.2, 0.8).translate(0.6, 2.9, 0)];
    this._signMats = [new THREE.MeshStandardMaterial({ color: '#d0a13c', roughness: 0.4, metalness: 0.7 }), new THREE.MeshStandardMaterial({ color: '#7c1b1d', roughness: 0.8, side: THREE.DoubleSide })];
    this.sign = new THREE.Group();
    this.sign.add(new THREE.Mesh(this._signGeos[0], this._signMats[0]), new THREE.Mesh(this._signGeos[1], this._signMats[1]));
    this.sign.position.set(sx, o.heightAt(sx, sz), sz);
    o.scene.add(this.sign);
    this.item = o.interactions.add({
      id: 'quidditch',
      position: new THREE.Vector3(sx, o.heightAt(sx, sz) + 1.2, sz),
      radius: 4,
      label: () => {
        const r = o.inventory.quidditch;
        return `Quidditch maçı: Arayıcı ol${r.played ? ` (${r.won}/${r.played} galibiyet)` : ''}`;
      },
      enabled: () => !this.active && !o.busy(),
      action: () => this.start(),
    });
  }

  get active() {
    return this.phase !== 'idle';
  }

  // --------------------------------------------------------------- setup

  /** Team colours: the player's house against a random other house. */
  _teams() {
    let home = this.o.house();
    if (!HOUSES[home] || home === 'none') home = 'gryffindor';
    const others = Object.keys(HOUSES).filter((h) => h !== 'none' && h !== home);
    const away = others[Math.floor(Math.random() * others.length)];
    return [home, away];
  }

  start() {
    if (this.active) return false;
    const f = this.o.flight;
    if (!f.active && !f.mount()) return false;
    const [home, away] = this._teams();
    this.teams = [home, away];
    this.scores = [0, 0];
    this.t = 0;
    this.count = Q.countdown;
    this._shown = Q.countdown + 1;
    this.phase = 'countdown';
    this.result = null;
    this.snitchAt = rand(...Q.snitchDelay);
    const diff = this.o.settings.get('difficulty');
    this.rival = Q.rival[diff] ?? Q.rival.normal;
    this.kit = new FlyerKit();
    const broomGeo = this.kit.broomGeometry(BROOMS.gale);
    // Flyers: team 0 lines up west of centre, team 1 east.
    this.flyers = [];
    for (let team = 0; team < 2; team++) {
      const H = HOUSES[this.teams[team]];
      const side = team === 0 ? -1 : 1;
      const roles = [];
      for (const [role, n] of Object.entries(Q.teamSize)) for (let i = 0; i < n; i++) roles.push(role);
      roles.forEach((role, i) => {
        if (team === 0 && role === 'seeker') return; // that is the player
        const g = this.kit.rider({ robe: H.primary, trim: H.secondary, skin: '#d8b090' }, broomGeo);
        this.root.add(g);
        const pos = new THREE.Vector3(this.center.x + side * 12, this.center.y + 10 + (i % 3) * 2.5, this.center.z + (i - roles.length / 2) * LINEUP * 0.6);
        this.flyers.push({ team, role, g, pos, vel: new THREE.Vector3(), yaw: side > 0 ? Math.PI / 2 : -Math.PI / 2, knock: 0, cd: 0, idx: i, spot: 0 });
      });
    }
    // Balls.
    const ball = (key, glow) => {
      const [r, color] = BALLS[key];
      const m = new THREE.Mesh(this.kit.ball, this.kit.mat(`ball:${key}`, () => new THREE.MeshStandardMaterial({ color, roughness: key === 'snitch' ? 0.25 : 0.7, metalness: key === 'snitch' ? 0.9 : 0.1 })));
      m.scale.setScalar(r);
      m.castShadow = true;
      if (glow) {
        const h = new THREE.Mesh(this.kit.ball, glow);
        h.scale.setScalar(3.2);
        m.add(h);
      }
      this.root.add(m);
      return m;
    };
    this._snitchGlow = glowMaterial('#ffe28a', 0.35, 0);
    this.quaffle = { m: ball('quaffle'), pos: this.center.clone().setY(this.center.y + 12), vel: new THREE.Vector3(), holder: null, shot: null };
    this.bludgers = [0, 1].map((i) => ({ m: ball('bludger'), pos: this.center.clone().add(new THREE.Vector3(0, 6, (i - 0.5) * 6)), vel: new THREE.Vector3(), target: null, retarget: 0, hitCd: 0 }));
    const sm = ball('snitch', this._snitchGlow);
    const wingMat = this.kit.mat('wing', () => new THREE.MeshStandardMaterial({ color: '#f4ecd0', roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    const wings = [-1, 1].map((s) => {
      const w = new THREE.Mesh(this.kit.wing, wingMat);
      w.scale.set(s * 2.6, 1.6, 1);
      sm.add(w);
      return w;
    });
    this.snitch = { m: sm, wings, pos: this.center.clone().setY(this.center.y + 20), vel: new THREE.Vector3(), target: new THREE.Vector3(), cruise: rand(...Q.snitch.cruise), dart: 0, dartIn: rand(...Q.snitch.dartEvery), out: false, seenBy: 0 };
    sm.visible = false;
    // The player: centre-west, facing east.
    const p = this.o.player;
    const at = this.center.clone().add(new THREE.Vector3(-18, 12, 0));
    p.teleport(at, -Math.PI / 2);
    f.yaw = -Math.PI / 2;
    f.pitch = 0;
    f.speed = 0;
    f.velocity.set(0, 0, 0);
    this.gate = at;
    this.o.cameraRig.snapTo(at, -Math.PI / 2, -0.1);
    this.bus.emit('quidditch:start', { teams: this.teams.map((h) => HOUSES[h].label) });
    return true;
  }

  // ------------------------------------------------------------ geometry

  _inAir(p) {
    const [a, b] = PITCH.radii;
    const dx = (p.x - this.center.x) / (a + 6);
    const dz = (p.z - this.center.z) / (b + 6);
    const e = Math.hypot(dx, dz);
    if (e > 1) {
      p.x = this.center.x + (dx / e) * (a + 6);
      p.z = this.center.z + (dz / e) * (b + 6);
    }
    p.y = THREE.MathUtils.clamp(p.y, this.center.y + Q.air[0], this.center.y + Q.air[1]);
    return p;
  }

  _randomAir(out) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    return out.set(this.center.x + Math.cos(a) * r * PITCH.radii[0], this.center.y + rand(Q.air[0] + 2, Q.air[1] - 4), this.center.z + Math.sin(a) * r * PITCH.radii[1]);
  }

  /** Attack end of a team: the hoops it shoots at. */
  _targetHoops(team) {
    return this.hoops[1 - team];
  }

  // --------------------------------------------------------------- steer

  _steer(fl, target, speed, dt, arrive = 1) {
    _v.subVectors(target, fl.pos);
    const d = _v.length();
    const want = d > arrive ? _v.multiplyScalar(Math.min(speed, d * 2) / d) : _v.set(0, 0, 0);
    fl.vel.lerp(want, 1 - Math.exp(-2.5 * dt));
  }

  _players() {
    return this.flyers;
  }

  // ---------------------------------------------------------------- tick

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    if (this.phase === 'idle') return;
    const p = this.o.player;
    const f = this.o.flight;
    if (this.phase === 'countdown') {
      this.count -= dt;
      f.speed = 0;
      f.velocity.set(0, 0, 0);
      p.controller.position.copy(this.gate);
      const left = Math.ceil(this.count);
      if (left < this._shown) {
        this._shown = left;
        this.bus.emit('quidditch:countdown', { n: Math.max(0, left) });
      }
      if (this.count <= 0) {
        this.phase = 'play';
        this.quaffle.vel.set(0, 9, 0);
      }
      return;
    }
    if (this.phase === 'outro') {
      this.t += dt;
      if (this.t > OUTRO) this._cleanup();
      return;
    }
    this.t += dt;
    if (!f.active || p.dead) {
      this._end(1, null, p.dead ? 'Düştün — maçı rakip kazandı.' : 'Süpürgeden indin — hükmen yenilgi.');
      return;
    }
    for (const fl of this.flyers) {
      fl.knock = Math.max(0, fl.knock - dt);
      fl.cd = Math.max(0, fl.cd - dt);
      if (fl.knock > 0) {
        fl.vel.y -= 4 * dt;
        fl.vel.multiplyScalar(Math.exp(-dt));
      } else this._think(fl, dt);
      fl.pos.addScaledVector(fl.vel, dt);
      this._inAir(fl.pos);
    }
    this._stepQuaffle(dt);
    for (const b of this.bludgers) this._stepBludger(b, dt);
    this._stepSnitch(dt);
    if (this.t > Q.maxMatch && this.phase === 'play') this._end(this.scores[0] >= this.scores[1] ? 0 : 1, null, 'Süre doldu.');
  }

  _think(fl, dt) {
    const q = this.quaffle;
    const spd = Q.speeds[fl.role];
    if (fl.role === 'chaser') {
      if (q.holder === fl) {
        // Carry toward the hoops, shoot when close.
        const hoops = this._targetHoops(fl.team);
        const aim = fl.aim ?? (fl.aim = hoops[Math.floor(Math.random() * 3)]);
        const dir = fl.team === 0 ? 1 : -1;
        _t.copy(aim).add(_w.set(-dir * Q.quaffle.shootRange * 0.8, 0, 0));
        this._steer(fl, _t, spd, dt, 2);
        if (fl.pos.distanceTo(aim) < Q.quaffle.shootRange && fl.cd <= 0) this._shoot(fl, aim);
        return;
      }
      const holder = q.holder;
      if (!holder) {
        // Loose ball: nearest two per team chase it.
        this._steer(fl, q.pos, spd, dt, 0.5);
        if (fl.pos.distanceTo(q.pos) < Q.quaffle.grab && !q.shot && (q.from !== fl || q.age > 0.6)) this._grab(fl);
        return;
      }
      if (holder.team === fl.team) {
        // Support: fly ahead and to the side of the carrier.
        const dir = fl.team === 0 ? 1 : -1;
        _t.copy(holder.pos).add(_w.set(dir * 8, (fl.idx % 2) * 3 - 1.5, (fl.idx % 3 - 1) * 9));
        this._steer(fl, this._inAir(_t), spd, dt, 1.5);
        return;
      }
      // Defend: close in on the carrier and try to tackle.
      this._steer(fl, holder.pos, spd * 1.05, dt, 0.5);
      if (fl.pos.distanceTo(holder.pos) < Q.quaffle.tackleRange && Math.random() < Q.quaffle.tackle * dt) {
        this._loose(fl.vel.clone().normalize().multiplyScalar(6));
        holder.knock = 0.8;
        this.bus.emit('quidditch:tackle', {});
      }
      return;
    }
    if (fl.role === 'keeper') {
      // Hover before the own hoops, tracking the ball.
      const own = this.hoops[fl.team];
      const dir = fl.team === 0 ? 1 : -1;
      const mid = own[1];
      _t.set(mid.x + dir * 3, THREE.MathUtils.clamp(q.pos.y, own[0].y - 2, own[1].y + 1), THREE.MathUtils.clamp(q.pos.z, own[0].z - 2, own[2].z + 2));
      this._steer(fl, _t, spd, dt, 0.3);
      if (q.holder === fl && fl.cd <= 0) {
        // Pass out to a Chaser.
        const mate = this.flyers.find((m) => m.team === fl.team && m.role === 'chaser' && m.knock <= 0);
        if (mate) this._throw(fl, mate.pos, Q.quaffle.throwSpeed * 0.7);
      }
      return;
    }
    if (fl.role === 'beater') {
      // Shadow the nearest Bludger and bat it at an opponent.
      let best = null;
      let bd = Infinity;
      for (const b of this.bludgers) {
        const d = b.pos.distanceTo(fl.pos);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      _t.copy(best.pos).add(_w.set(fl.team === 0 ? -2 : 2, 1, 0));
      this._steer(fl, this._inAir(_t), spd, dt, 1);
      if (bd < Q.bludger.beaterHit && fl.cd <= 0) {
        fl.cd = BAT_COOLDOWN;
        const foe = this._pickVictim(fl.team);
        _v.subVectors(foe, best.pos).normalize();
        best.vel.copy(_v).multiplyScalar(Q.bludger.beaterSpeed);
        best.retarget = rand(...Q.bludger.retarget);
        best.hitCd = 0.4;
        this.o.particles.glow.burst(8, best.pos, { speed: [1, 3], life: 0.3, size: 0.06, color: '#ffffff', shape: 1 });
      }
      return;
    }
    // Rival seeker: circle high until the Snitch is spotted, then chase it.
    const s = this.snitch;
    if (s.out && s.seenBy > this.rival.reaction) {
      this._steer(fl, s.pos, this.rival.speed, dt, 0.1);
      // Close is not caught: the grab can slip.
      if (fl.pos.distanceTo(s.pos) < Q.snitch.catchRadius * 1.5 && Math.random() < this.rival.grip * dt) this._catch(1);
    } else {
      const a = this.t * 0.25 + fl.idx;
      _t.set(this.center.x + Math.cos(a) * 30, this.center.y + Q.air[1] - 4, this.center.z + Math.sin(a) * 18);
      this._steer(fl, _t, Q.speeds.seeker * 0.6, dt, 2);
    }
  }

  /** Position of an opponent of `team` to throw a Bludger at (the player counts). */
  _pickVictim(team) {
    const foes = this.flyers.filter((f) => f.team !== team && f.knock <= 0);
    if (team === 1 && (Math.random() < 0.35 || !foes.length)) return this.o.player.position.clone().setY(this.o.player.position.y + 1);
    return foes[Math.floor(Math.random() * foes.length)].pos;
  }

  _grab(fl) {
    const q = this.quaffle;
    q.holder = fl;
    q.shot = null;
    fl.aim = null;
    fl.cd = fl.role === 'keeper' ? KEEPER_PASS : 0.6;
  }

  _loose(vel) {
    const q = this.quaffle;
    q.holder = null;
    q.shot = null;
    q.vel.copy(vel);
  }

  _throw(fl, to, speed) {
    const q = this.quaffle;
    const d = to.distanceTo(fl.pos);
    const tFlight = d / speed;
    q.vel.subVectors(to, fl.pos).normalize().multiplyScalar(speed);
    q.vel.y += (Q.quaffle.gravity * tFlight) / 2;
    q.pos.copy(fl.pos).setY(fl.pos.y + 0.6);
    q.holder = null;
    q.shot = null;
    q.from = fl;
    q.age = 0;
    fl.cd = 1;
  }

  _shoot(fl, aim) {
    this._throw(fl, aim, Q.quaffle.throwSpeed);
    const q = this.quaffle;
    q.shot = { team: fl.team, by: fl, decided: false };
  }

  _stepQuaffle(dt) {
    const q = this.quaffle;
    if (q.holder) {
      const h = q.holder;
      q.pos.copy(h.pos).add(_w.set(0, 0.7, 0));
      q.vel.copy(h.vel);
      return;
    }
    const prevX = q.pos.x;
    q.age = (q.age ?? 0) + dt;
    q.vel.y -= Q.quaffle.gravity * dt;
    q.vel.multiplyScalar(Math.exp(-0.15 * dt));
    q.pos.addScaledVector(q.vel, dt);
    // Ground bounce.
    if (q.pos.y < this.center.y + 0.2) {
      q.pos.y = this.center.y + 0.2;
      q.vel.y = Math.abs(q.vel.y) * 0.4;
      q.vel.x *= 0.7;
      q.vel.z *= 0.7;
      q.shot = null;
    }
    // Shots: keeper save, then goal detection at the hoop line.
    const s = q.shot;
    if (s) {
      const defending = 1 - s.team;
      const hoops = this.hoops[defending];
      const keeper = this.flyers.find((f) => f.team === defending && f.role === 'keeper');
      if (!s.decided && keeper && keeper.knock <= 0 && keeper.pos.distanceTo(q.pos) < Q.keeper.reach * 2) {
        s.decided = true;
        if (Math.random() < Q.keeper.save) {
          this._grab(keeper);
          this.bus.emit('quidditch:save', { team: defending });
          return;
        }
      }
      const hx = hoops[0].x;
      if ((prevX - hx) * (q.pos.x - hx) <= 0) {
        for (const h of hoops) {
          if (Math.hypot(q.pos.y - h.y, q.pos.z - h.z) < PITCH.hoopRadius) {
            this.scores[s.team] += Q.goal;
            this.bus.emit('quidditch:goal', { team: s.team, house: HOUSES[this.teams[s.team]].label, scores: [...this.scores] });
            this.o.particles.glow.burst(60, h, { speed: [2, 6], life: 1, size: 0.12, color: HOUSES[this.teams[s.team]].secondary, shape: 1, drag: 1.5 });
            // Defending keeper restarts play.
            if (keeper) {
              q.pos.copy(keeper.pos);
              this._grab(keeper);
            } else this._loose(_w.set(0, 4, 0));
            return;
          }
        }
        q.shot = null;
      }
    }
    // A catchable ball for the nearest free player of either team.
    if (!q.shot) this._inAir(q.pos);
  }

  _stepBludger(b, dt) {
    const B = Q.bludger;
    b.retarget -= dt;
    b.hitCd = Math.max(0, b.hitCd - dt);
    if (b.retarget <= 0 || !b.target) {
      b.retarget = rand(...B.retarget);
      const all = [...this.flyers.filter((f) => f.knock <= 0), null];
      b.target = Math.random() < 0.3 ? null : all[Math.floor(Math.random() * all.length)];
      b.targetsPlayer = b.target === null;
    }
    const tp = b.targetsPlayer ? _t.copy(this.o.player.position).setY(this.o.player.position.y + 1) : b.target.pos;
    _v.subVectors(tp, b.pos);
    const d = _v.length();
    if (d > 0.01) b.vel.lerp(_v.multiplyScalar(B.speed / d), 1 - Math.exp(-1.2 * dt));
    b.pos.addScaledVector(b.vel, dt);
    this._inAir(b.pos);
    if (b.hitCd > 0) return;
    // Hits.
    const p = this.o.player;
    if (b.pos.distanceTo(_w.copy(p.position).setY(p.position.y + 1)) < B.hitRadius) {
      b.hitCd = 1;
      b.vel.negate().multiplyScalar(0.8);
      b.retarget = 0;
      if (p.invulnerable > 0) {
        this.bus.emit('quidditch:bludger', { hit: false });
        return;
      }
      p.damage(B.damage, 'bludger');
      p.stun(B.knock * 0.5);
      this.o.flight.speed *= 0.4;
      this.o.flight.velocity.addScaledVector(_w.copy(b.vel).normalize(), 6);
      this.bus.emit('quidditch:bludger', { hit: true });
      this.bus.emit('spell:impact', { strength: 0.6 });
      return;
    }
    for (const fl of this.flyers) {
      if (fl.knock > 0 || b.pos.distanceTo(fl.pos) > B.hitRadius) continue;
      fl.knock = KNOCK;
      fl.vel.addScaledVector(_w.copy(b.vel).normalize(), 5);
      if (this.quaffle.holder === fl) this._loose(_w.set(rand(-3, 3), 3, rand(-3, 3)));
      b.hitCd = 1;
      b.vel.negate().multiplyScalar(0.8);
      b.retarget = 0;
      break;
    }
  }

  _stepSnitch(dt) {
    const s = this.snitch;
    const S = Q.snitch;
    if (!s.out) {
      if (this.t >= this.snitchAt) {
        s.out = true;
        this._randomAir(s.pos);
        this._randomAir(s.target);
        s.m.visible = true;
        this.bus.emit('quidditch:snitch', { state: 'out' });
      }
      return;
    }
    const tired = this.t > S.tired ? S.tiredSpeed : 1;
    s.dartIn -= dt;
    if (s.dartIn <= 0) {
      s.dart = rand(...S.dartTime);
      s.dartIn = rand(...S.dartEvery);
      this._randomAir(s.target);
    }
    // Flee the player when they get close.
    const p = this.o.player;
    const pp = _t.copy(p.position).setY(p.position.y + 1.2);
    const dp = pp.distanceTo(s.pos);
    if (dp < 6 && s.dart <= 0 && Math.random() < dt * 1.5) {
      s.dart = rand(...S.dartTime) * 0.6;
      s.target.copy(s.pos).addScaledVector(_v.subVectors(s.pos, pp).normalize(), 25);
      this._inAir(s.target);
    }
    if (s.pos.distanceTo(s.target) < 2) this._randomAir(s.target);
    s.dart -= dt;
    const speed = (s.dart > 0 ? S.dart : s.cruise) * tired;
    _v.subVectors(s.target, s.pos).normalize().multiplyScalar(speed);
    // Jitter: the Snitch never flies straight.
    _v.x += Math.sin(this.t * 7.3) * 2.2;
    _v.y += Math.sin(this.t * 5.1 + 1) * 1.6;
    _v.z += Math.cos(this.t * 6.7) * 2.2;
    s.vel.lerp(_v, 1 - Math.exp(-4 * dt));
    s.pos.addScaledVector(s.vel, dt);
    this._inAir(s.pos);
    // Rival notices it once it has been in sight for a while (it glints).
    const rival = this.flyers.find((f) => f.team === 1 && f.role === 'seeker');
    if (rival && rival.pos.distanceTo(s.pos) < S.visibleRange) s.seenBy += dt;
    if (dp < S.catchRadius) this._catch(0);
  }

  _catch(team) {
    if (this.phase !== 'play') return;
    this.scores[team] += Q.snitchPoints;
    const won = this.scores[0] > this.scores[1] ? 0 : this.scores[1] > this.scores[0] ? 1 : team;
    this.o.particles.glow.burst(120, this.snitch.pos, { speed: [2, 9], life: 1.4, size: 0.12, color: '#ffe28a', shape: 1, drag: 1.2 });
    this._end(won, team, team === 0 ? 'Altın Top\'u yakaladın!' : 'Rakip Arayıcı Altın Top\'u yakaladı!');
  }

  _end(winner, caughtBy, text) {
    if (this.phase !== 'play' && this.phase !== 'countdown') return;
    this.phase = 'outro';
    this.t = 0;
    const won = winner === 0;
    const inv = this.o.inventory;
    inv.quidditch.played++;
    if (won) inv.quidditch.won++;
    if (caughtBy === 0) inv.quidditch.snitches++;
    inv.earn(won ? Q.reward.win : Q.reward.lose, won ? 'Quidditch galibiyeti' : 'Quidditch maçı');
    this.snitch.m.visible = false;
    this.result = { won, text, scores: [...this.scores] };
    this.bus.emit('quidditch:end', { won, text, scores: [...this.scores], teams: this.teams.map((h) => HOUSES[h].label), caughtBy });
  }

  /** Leave the match at once (region change, debug). */
  abort() {
    if (this.phase === 'play' || this.phase === 'countdown') this._end(1, null, 'Maç yarıda kaldı.');
    this._cleanup();
  }

  _cleanup() {
    if (this.phase === 'idle') return;
    for (const fl of this.flyers) fl.g.removeFromParent();
    this.flyers = [];
    for (const b of [this.quaffle, this.snitch, ...(this.bludgers ?? [])]) b?.m.removeFromParent();
    this.quaffle = this.snitch = null;
    this.bludgers = [];
    this._snitchGlow?.dispose();
    this._snitchGlow = null;
    this.kit?.dispose();
    this.kit = null;
    this.phase = 'idle';
  }

  // -------------------------------------------------------------- render

  /** @param {number} dt */
  frame(dt) {
    if (this.phase === 'idle') return;
    for (const fl of this.flyers) {
      const g = fl.g;
      g.position.copy(fl.pos);
      const sp = Math.hypot(fl.vel.x, fl.vel.z);
      if (sp > 0.5) {
        const target = Math.atan2(-fl.vel.x, -fl.vel.z);
        const d = THREE.MathUtils.euclideanModulo(target - fl.yaw + Math.PI, Math.PI * 2) - Math.PI;
        fl.yaw += d * (1 - Math.exp(-6 * dt));
        fl.bank = THREE.MathUtils.lerp(fl.bank ?? 0, -d * 1.2, 1 - Math.exp(-4 * dt));
      }
      const tumble = fl.knock > 0 ? fl.knock * 6 : 0;
      g.rotation.set(-fl.vel.y * 0.04, fl.yaw, (fl.bank ?? 0) + tumble, 'YXZ');
      const cape = g.userData.cape;
      if (cape) cape.rotation.x = Math.sin(performance.now() * 0.012 + fl.idx) * 0.12 * Math.min(1, sp / 8);
    }
    if (this.quaffle) this.quaffle.m.position.copy(this.quaffle.pos);
    for (const b of this.bludgers ?? []) {
      b.m.position.copy(b.pos);
      b.m.rotation.x += dt * 8;
    }
    const s = this.snitch;
    if (s?.out) {
      s.m.position.copy(s.pos);
      const flap = Math.sin(performance.now() * 0.06) * 0.9;
      s.wings[0].rotation.y = flap;
      s.wings[1].rotation.y = -flap;
      s.m.rotation.y = Math.atan2(-s.vel.x, -s.vel.z);
      this._snitchGlow.uniforms.uOpacity.value = 0.25 + Math.max(0, Math.sin(performance.now() * 0.004)) * Q.snitch.glint;
    }
  }

  /** HUD state. */
  get hud() {
    if (this.phase === 'idle') return null;
    return {
      teams: this.teams.map((h) => HOUSES[h].label),
      colors: this.teams.map((h) => HOUSES[h].primary),
      scores: this.scores,
      time: this.phase === 'countdown' ? 0 : this.t,
      snitch: this.snitch?.out ? this.snitch.pos : null,
      result: this.result,
      phase: this.phase,
    };
  }

  get stats() {
    if (this.phase === 'idle') return { Quidditch: '—' };
    const s = this.snitch;
    return { Quidditch: `${this.phase} · ${this.scores[0]}–${this.scores[1]} · ${this.t.toFixed(0)} s · Altın Top ${s?.out ? `dışarıda (rakip ${s.seenBy.toFixed(1)} s)` : `${Math.max(0, this.snitchAt - this.t).toFixed(0)} s sonra`}` };
  }

  /** Debug: release the Snitch right away. */
  releaseSnitch() {
    if (this.phase === 'play' && !this.snitch.out) this.snitchAt = this.t;
  }

  dispose() {
    this.abort();
    this.o.interactions.remove(this.item);
    this.sign.removeFromParent();
    for (const g of this._signGeos) g.dispose();
    for (const m of this._signMats) m.dispose();
    this.root.removeFromParent();
  }
}
