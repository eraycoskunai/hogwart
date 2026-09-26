/**
 * @file LessonManager — professors and their lessons. Each professor
 * stands in their classroom (or at the pitch); talking to them during
 * class hours starts a lesson, played with the real game systems:
 *
 *   charms    three cushions to levitate into a glowing circle (timer)
 *   dada      eight practice bolts to parry with Protego
 *   patronus  learn Expecto Patronum (unlocks it) and cast it once
 *   potions   brew from memory: pick each recipe step among four
 *   flight    fly the pitch ring course (medal = grade)
 *
 * A passed lesson gives house points (once per game day; story lessons
 * once) and emits lesson:complete for quests.
 *
 * Events: lesson:start {id}, lesson:complete {id, score, points}, lesson:fail {id}
 */
import * as THREE from 'three';
import { LESSONS, PROFESSORS, CLASS_HOURS } from '../../data/lessons.js';
import { PRACTICE_BOLT } from '../../data/spells.js';
import { HOUSES } from '../../data/character.js';
import { Character } from '../../procgen/characters/Character.js';
import { Animator } from '../../animation/Animator.js';
import { FaceAnimator } from '../../animation/FaceAnimator.js';
import { randomAppearance, mulberry } from '../../procgen/characters/Appearance.js';
import { glowMaterial } from '../../render/SpellVisuals.js';

/** Score needed to pass. */
const PASS = 0.34;
const _v = new THREE.Vector3();

export class LessonManager {
  /**
   * @param {{bus:any, game:any, physics:any, spells:any, caster:any, player:any, races:any, flight:any, housePoints:any, clock:any,
   *          scene:THREE.Scene, library:any, preset:any, interactions:any, dialogue:any, begin:(o:any)=>boolean, end:()=>void, ui:any}} o
   */
  constructor(o) {
    this.o = o;
    this.bus = o.bus;
    /** @type {Record<string, {day:number, best:number, passed:boolean}>} */
    this.records = {};
    this.profs = [];
    this.active = null;
    this.region = null;
    this._offs = [
      o.bus.on('spell:blocked', ({ parry }) => this.active?.id === 'dada' && parry && this.active.parries++),
      o.bus.on('spell:patronus', () => this.active?.id === 'patronus' && this._finish(1)),
      o.bus.on('race:finish', ({ medal }) => this.active?.id === 'flight' && this._finish(medal === 0 ? 1 : medal === 1 ? 0.75 : medal === 2 ? 0.5 : 0.25)),
      o.bus.on('race:abort', () => this.active?.id === 'flight' && this._finish(0)),
    ];
  }

  // ------------------------------------------------------------- region

  setRegion(region) {
    this.clear();
    this.region = region;
    for (const [key, P] of Object.entries(PROFESSORS)) {
      if (P.region !== region.id) continue;
      const [x, y, z] = P.pos;
      const pos = new THREE.Vector3(x, y ?? region.heightAt(x, z), z);
      const c = new Character({ library: this.o.library, preset: { ...this.o.preset, characterTexture: Math.min(512, this.o.preset.characterTexture) }, name: P.name });
      c.build({ firstName: P.first, lastName: P.last, house: P.house, outfit: 'uniform', appearance: randomAppearance(mulberry(P.seed)) });
      c.root.position.copy(pos);
      c.root.rotation.y = P.yaw;
      this.o.scene.add(c.root);
      const face = new FaceAnimator(c);
      const animator = new Animator(c, face);
      animator.ikEnabled = false;
      const prof = { key, P, character: c, face, animator, position: pos, yaw: P.yaw };
      prof.item = this.o.interactions.add({
        id: `lesson:${key}`,
        position: pos.clone().setY(pos.y + 1.2),
        radius: 3.2,
        label: () => `Ders: ${LESSONS[this._lessonFor(key)].name}${this._takenToday(this._lessonFor(key)) ? ' (bugün alındı)' : ''}`,
        enabled: () => !this.active,
        action: () => this.talk(prof),
      });
      this.bus.emit('room:characterAdded', { character: c });
      this.profs.push(prof);
    }
  }

  clear() {
    this._abort();
    for (const p of this.profs) {
      this.o.interactions.remove(p.item);
      p.character.dispose();
      p.character.root.removeFromParent();
    }
    this.profs = [];
  }

  /** Which lesson a professor offers now (Patronus once the story needs it). */
  _lessonFor(key) {
    if (key === 'dada' && this.o.caster.locked.has('patronus') && this.o.game.quests?.step('main7')?.lesson === 'patronus') return 'patronus';
    return key;
  }

  get day() {
    return Math.floor(this.o.clock.days);
  }

  _takenToday(id) {
    return this.records[id]?.day === this.day;
  }

  // --------------------------------------------------------------- talk

  async talk(prof) {
    const id = this._lessonFor(prof.key);
    const L = LESSONS[id];
    if (!this.o.begin(prof)) return;
    const D = this.o.dialogue;
    D.open({ name: prof.P.name, color: HOUSES[prof.P.house].primary, level: '', progress: 0 });
    let start = false;
    try {
      const h = this.o.clock.hour;
      const say = (t) => {
        prof.face.say(t, 1.1);
        return D.say(t);
      };
      if (h < CLASS_HOURS[0] || h >= CLASS_HOURS[1]) {
        await say(`Dersler saat ${CLASS_HOURS[0]}:00 ile ${CLASS_HOURS[1]}:00 arasında. O zaman gel.`);
        return;
      }
      if (id === 'flight' && !this.o.flight.allowed) return;
      if ((await say(L.intro)) === 'end') return;
      if (id === 'potions') {
        await this._potions(prof, L, say);
        return;
      }
      const go = await D.ask('Hazır mısın?', [{ id: 'yes', label: 'Hazırım!' }, { id: 'no', label: 'Sonra gelirim' }]);
      start = go === 'yes';
    } finally {
      D.close();
      this.o.end();
    }
    if (start) this._start(id, prof);
  }

  // ------------------------------------------------------------ lessons

  _start(id, prof) {
    const L = LESSONS[id];
    const a = { id, prof, t: 0, L };
    this.active = a;
    this.bus.emit('lesson:start', { id, name: L.name });
    if (id === 'charms') this._charmsSetup(a);
    else if (id === 'dada') {
      a.parries = 0;
      a.shots = 0;
      a.next = 1.5;
      const [x, y, z, yaw] = L.spot;
      this.o.player.teleport(new THREE.Vector3(x, y, z), yaw);
    } else if (id === 'patronus') {
      this.o.caster.locked.delete(L.unlock);
      this.o.ui.notice('Yeni büyü: Expecto Patronum (büyü tekerleğinde)');
    } else if (id === 'flight') {
      if (!this.o.races.start(L.race)) this._finish(0);
    }
  }

  _charmsSetup(a) {
    const L = a.L;
    const C = L.cushion;
    a.bodies = [];
    a.geo = new THREE.BoxGeometry(...C.size);
    a.mat = new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.85 });
    for (const [x, y, z] of C.spots) {
      const mesh = new THREE.Mesh(a.geo, a.mat);
      mesh.castShadow = true;
      this.o.scene.add(mesh);
      const body = this.o.physics.addDynamicBox({ size: new THREE.Vector3(...C.size), mass: C.mass, position: new THREE.Vector3(x, y, z), mesh, surface: 'cloth', name: 'Minder' });
      a.bodies.push({ body, mesh });
    }
    const [tx, ty, tz] = L.target.pos;
    a.ringGeo = new THREE.RingGeometry(L.target.radius * 0.85, L.target.radius, 48).rotateX(-Math.PI / 2);
    a.ringMat = glowMaterial('#9ad8ff', 0.8, 1);
    a.ring = new THREE.Mesh(a.ringGeo, a.ringMat);
    a.ring.position.set(tx, ty + 0.03, tz);
    this.o.scene.add(a.ring);
    this.o.caster.select?.('leviosa');
  }

  _charmsCount(a) {
    const [tx, ty, tz] = a.L.target.pos;
    let n = 0;
    for (const { body } of a.bodies) {
      const p = body.body.position;
      if (Math.hypot(p.x - tx, p.z - tz) < a.L.target.radius && p.y < ty + 1.2) n++;
    }
    return n;
  }

  async _potions(prof, L, say) {
    const D = this.o.dialogue;
    const recipe = L.recipe;
    if ((await say(`Tarif: ${recipe.map((s, i) => `${i + 1}) ${s.right}`).join('  ')}`)) === 'end') return;
    let mistakes = 0;
    const [cx, cy, cz] = L.cauldron;
    const pot = new THREE.Vector3(cx, cy, cz);
    for (let i = 0; i < recipe.length; i++) {
      const s = recipe[i];
      const opts = [s.right, ...s.wrong].map((label, k) => ({ id: k === 0 ? 'ok' : `x${k}`, label })).sort(() => Math.random() - 0.5);
      const pick = await D.ask(`Adım ${i + 1}: ne yapıyorsun?`, opts);
      if (pick === null) return;
      const good = pick === 'ok';
      if (!good) mistakes++;
      this.o.spells.glow.burst(16, pot, { speed: [0.5, 1.5], life: 0.8, size: 0.12, color: good ? '#b08aff' : '#6a8a3a', lift: 1, shape: 0 });
      if (!good) this.o.spells.smoke.burst(8, pot, { speed: [0.3, 1], life: 1.6, size: 0.4, endSize: 1.1, color: '#3a3a2a', alpha: 0.5, endAlpha: 0, shape: 2, lift: 0.8 });
    }
    const score = Math.max(0, 1 - mistakes / recipe.length);
    if (mistakes >= 3) {
      this.o.spells.glow.burst(40, pot, { speed: [2, 6], life: 0.6, size: 0.2, color: '#ff8a3a', shape: 1 });
      this.bus.emit('spell:explosion', { pos: pot, power: 0.4 });
    }
    this.active = { id: 'potions', prof, L, t: 0 };
    await say(score >= 0.8 ? L.praise : L.poor);
    this._finish(score);
  }

  /** End the running lesson with a score 0…1. */
  _finish(score) {
    const a = this.active;
    if (!a) return;
    this._cleanup(a);
    this.active = null;
    const L = a.L;
    const rec = (this.records[a.id] ??= { day: -1, best: 0, passed: false });
    rec.best = Math.max(rec.best, score);
    if (score < PASS) {
      this.o.ui.say(a.prof.P.name, L.poor);
      this.bus.emit('lesson:fail', { id: a.id, score });
      return;
    }
    let points = 0;
    const first = L.story ? !rec.passed : rec.day !== this.day;
    if (first) {
      points = Math.round(L.points * score);
      this.o.housePoints.award(points, L.name);
    }
    rec.day = this.day;
    rec.passed = true;
    if (a.id !== 'potions') this.o.ui.say(a.prof.P.name, L.praise);
    this.bus.emit('lesson:complete', { id: a.id, score, points });
  }

  _abort() {
    if (!this.active) return;
    this._cleanup(this.active);
    this.active = null;
  }

  _cleanup(a) {
    if (a.bodies) {
      for (const { body, mesh } of a.bodies) {
        this.o.physics.removeDynamic(body);
        mesh.removeFromParent();
      }
      a.geo.dispose();
      a.mat.dispose();
      a.ring.removeFromParent();
      a.ringGeo.dispose();
      a.ringMat.dispose();
      a.bodies = null;
    }
  }

  // -------------------------------------------------------------- update

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    const L = a.L;
    if (a.id === 'charms') {
      a.count = this._charmsCount(a);
      if (a.count >= a.bodies.length) this._finish(1);
      else if (a.t > L.time) this._finish(a.count / a.bodies.length);
    } else if (a.id === 'dada') {
      a.next -= dt;
      if (a.shots < L.shots && a.next <= 0) {
        a.next = L.every;
        a.shots++;
        const from = a.prof.character.getWandTip(new THREE.Vector3());
        const to = this.o.player.position.clone().setY(this.o.player.position.y + 1.2);
        const handler = { center: (out) => out.copy(a.prof.position).setY(a.prof.position.y + 1.2) };
        a.prof.animator.play('castFlick');
        this.o.spells.launch(PRACTICE_BOLT, { id: 'practice', from, dir: to.sub(from).normalize(), owner: handler });
      }
      if (a.shots >= L.shots && a.next < -1.5) this._finish(a.parries / L.shots);
    } else if (a.id === 'patronus' && a.t > L.time) this._finish(0);
  }

  /** Panel for the HUD while a lesson runs. */
  get hud() {
    const a = this.active;
    if (!a || a.id === 'potions' || a.id === 'flight') return null;
    const L = a.L;
    if (a.id === 'charms') return { name: L.name, text: `Minderler çemberde: ${a.count ?? 0}/${a.bodies?.length ?? 3}`, time: Math.max(0, L.time - a.t) };
    if (a.id === 'dada') return { name: L.name, text: `Savuşturma: ${a.parries}/${L.shots} · atış ${a.shots}/${L.shots}`, time: null };
    return { name: L.name, text: 'Expecto Patronum büyüsünü yap', time: Math.max(0, L.time - a.t) };
  }

  /**
   * @param {number} dt
   * @param {{camera:THREE.Camera, wind:THREE.Vector3, playerHead:THREE.Vector3}} env
   */
  render(dt, env) {
    const streamer = this.region?.streamer;
    const pp = this.o.player.position;
    for (const p of this.profs) {
      const vis = (streamer ? streamer.isVisibleAt(p.position) : true) && p.position.distanceTo(pp) < 90;
      p.character.root.visible = vis;
      if (!vis) continue;
      const near = p.position.distanceTo(pp) < 7;
      p.face.setExpression(near ? 'smile' : 'neutral');
      p.face.update(dt);
      p.animator.update(dt, {
        speed: 0, grounded: true, vy: 0, crouching: false, aiming: false, turnRate: 0, accel: 0, climb: 0, sliding: false,
        lookTarget: near ? env.playerHead : null, aimTarget: null, ground: null,
      });
      p.character.update(dt, { camera: env.camera, wind: env.wind, groundY: p.position.y });
    }
    const a = this.active;
    if (a?.ring) a.ringMat.uniforms.uOpacity.value = 0.6 + Math.sin(performance.now() * 0.005) * 0.25;
    void _v;
  }

  serialize() {
    return structuredClone(this.records);
  }

  deserialize(d) {
    this.records = {};
    for (const [k, r] of Object.entries(d ?? {})) if (k in LESSONS && r) this.records[k] = { day: Number(r.day) || -1, best: Number(r.best) || 0, passed: !!r.passed };
  }

  get stats() {
    return { Ders: this.active ? `${this.active.id} · ${this.active.t.toFixed(0)} s` : '—', 'Ders kayıtları': Object.entries(this.records).map(([k, r]) => `${k} ${Math.round(r.best * 100)}%`).join(' · ') || '—' };
  }

  dispose() {
    this.clear();
    for (const off of this._offs) off();
  }
}
