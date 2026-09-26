/**
 * @file SpellCaster — the player's magic: selected spell, focus (mana),
 * cooldowns, mastery (spells grow stronger with use), the spell wheel,
 * scroll selection, gesture casting ($1 recognizer; a clean drawing gives
 * a bonus), cast animations (the spell leaves the wand on the clip's
 * `release` event), held spells (Protego, Leviosa), Lumos / Nox and the
 * charged Patronus. Wand stats nudge power, speed, accuracy and cost.
 *
 * Events: spell:cast {id}, spell:levelUp {id, level}, spell:message {text},
 *         spell:selected {id}, spell:fail {reason}
 */
import * as THREE from 'three';
import { SPELLS, SPELL_WHEEL, FOCUS, MASTERY, CASTING, GESTURES, PATRONUS_FORMS, PATRONUS_LABELS } from '../../data/spells.js';
import { Unistroke, shapePoints } from './Unistroke.js';
import { wandStats } from '../../procgen/characters/WandGenerator.js';
import { hashString } from '../../procgen/characters/Character.js';

const _dir = new THREE.Vector3();
const _v = new THREE.Vector3();
const _hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };
/** Seconds to wait for the animation's release event before casting anyway. */
const RELEASE_TIMEOUT = 1.4;
/** Seconds the body keeps facing the aim after a cast. */
const FACE_TIME = 0.9;

export class SpellCaster {
  /**
   * @param {{bus:any, player:any, system:import('./SpellSystem.js').SpellSystem, physics:any, lights:any, camera:THREE.Camera, cameraRig:any}} o
   */
  constructor(o) {
    this.bus = o.bus;
    this.player = o.player;
    this.system = o.system;
    this.physics = o.physics;
    this.lights = o.lights;
    this.camera = o.camera;
    this.rig = o.cameraRig;
    this.selected = 'stupefy';
    this.focus = FOCUS.max;
    this._regenDelay = 0;
    this.cooldowns = {};
    this.xp = {};
    this.pending = null;
    this.lumos = null;
    this.shieldAge = -1;
    this.unlimited = false;
    this.gesture = { active: false, points: [], cursor: { x: 0, y: 0 }, result: null };
    this.wheel = { open: false, x: 0, y: 0, hover: null };
    this.recognizer = new Unistroke(CASTING.gesture);
    for (const [id, s] of Object.entries(SPELLS)) this.recognizer.add(id, shapePoints(GESTURES[s.gesture]));
    this._offAnim = this.bus.on('player:animEvent', ({ name }) => {
      if (name === 'release' && this.pending) this._perform();
    });
    this._offHit = this.bus.on('spell:hit', ({ id, owner }) => {
      if (owner === 'player' && SPELLS[id]) this._gain(id, MASTERY.xpHit);
    });
    this._offCombo = this.bus.on('spell:combo', ({ name }) => {
      this.bus.emit('spell:message', { text: `KOMBO: ${name}!` });
      if (this._lastCast) this._gain(this._lastCast, MASTERY.xpCombo);
    });
  }

  // ------------------------------------------------------------- mastery

  level(id) {
    const xp = this.xp[id] ?? 0;
    let lv = 1;
    MASTERY.levels.forEach((need, i) => {
      if (xp >= need) lv = i + 1;
    });
    return lv;
  }

  /** 0..1 progress to the next level. */
  progress(id) {
    const lv = this.level(id);
    const L = MASTERY.levels;
    if (lv >= L.length) return 1;
    return ((this.xp[id] ?? 0) - L[lv - 1]) / (L[lv] - L[lv - 1]);
  }

  _gain(id, xp) {
    const before = this.level(id);
    this.xp[id] = (this.xp[id] ?? 0) + xp;
    const after = this.level(id);
    if (after > before) this.bus.emit('spell:levelUp', { id, level: after });
  }

  _wand() {
    return wandStats(this.player.character.data?.wand);
  }

  cost(id) {
    const s = SPELLS[id];
    const lv = this.level(id) - 1;
    return s.cost * (1 - MASTERY.costPerLevel * lv) * (1 - this._wand().focus);
  }

  cooldownOf(id) {
    return SPELLS[id].cooldown * (1 - MASTERY.cooldownPerLevel * (this.level(id) - 1));
  }

  power(id) {
    return (1 + MASTERY.powerPerLevel * (this.level(id) - 1)) * (1 + this._wand().power);
  }

  // ----------------------------------------------------------- selection

  select(id) {
    if (!SPELLS[id] || id === this.selected) return;
    if (this.selected === 'protego') this._shieldOff();
    this.selected = id;
    this.bus.emit('spell:selected', { id });
  }

  cycle(step) {
    const i = SPELL_WHEEL.indexOf(this.selected);
    this.select(SPELL_WHEEL[(i + step + SPELL_WHEEL.length) % SPELL_WHEEL.length]);
  }

  /** Remaining cooldown fraction 0..1. */
  cooldownFraction(id) {
    const c = this.cooldowns[id] ?? 0;
    return c > 0 ? c / this.cooldownOf(id) : 0;
  }

  // ---------------------------------------------------------------- input

  /**
   * Per-frame input (play state).
   * @param {import('../../core/Input.js').Input} input
   * @param {number} dt
   * @returns {boolean} true when the mouse is taken (wheel / gesture) and the camera must not look
   */
  handleInput(input, dt) {
    const p = this.player;
    if (p.dead) return false;
    // Spell wheel.
    if (input.down('spellWheel')) {
      if (!this.wheel.open) Object.assign(this.wheel, { open: true, x: 0, y: 0, hover: null });
      this.wheel.x += input.mouseDelta.x + input.lookStick.x * 12;
      this.wheel.y += input.mouseDelta.y + input.lookStick.y * 12;
      const r = Math.hypot(this.wheel.x, this.wheel.y);
      if (r > 30) {
        const a = (Math.atan2(this.wheel.x, -this.wheel.y) + Math.PI * 2) % (Math.PI * 2);
        this.wheel.hover = SPELL_WHEEL[Math.floor((a / (Math.PI * 2)) * SPELL_WHEEL.length + 0.5) % SPELL_WHEEL.length];
      }
      return true;
    }
    if (this.wheel.open) {
      this.wheel.open = false;
      if (this.wheel.hover) this.select(this.wheel.hover);
    }
    // Gesture drawing.
    if (input.down('gesture')) {
      const g = this.gesture;
      if (!g.active) Object.assign(g, { active: true, points: [{ x: 0, y: 0 }], cursor: { x: 0, y: 0 }, result: null });
      g.cursor.x += input.mouseDelta.x * CASTING.gesture.scale + input.lookStick.x * 10;
      g.cursor.y += input.mouseDelta.y * CASTING.gesture.scale + input.lookStick.y * 10;
      const last = g.points[g.points.length - 1];
      if (Math.hypot(g.cursor.x - last.x, g.cursor.y - last.y) > 3) g.points.push({ ...g.cursor });
      return true;
    }
    if (this.gesture.active) this._finishGesture();
    if (input.wheelDelta) this.cycle(Math.sign(input.wheelDelta));

    // Casting.
    const sel = SPELLS[this.selected];
    if (sel.kind === 'shield') {
      if (input.down('cast')) this._shieldHold(dt);
      else this._shieldOff();
    } else if (input.pressed('cast')) this.tryCast(this.selected);
    return false;
  }

  _finishGesture() {
    const g = this.gesture;
    g.active = false;
    if (g.points.length < CASTING.gesture.minPoints) {
      g.result = { ok: false, text: 'Çok kısa bir hareket' };
      return;
    }
    const r = this.recognizer.recognize(g.points);
    if (r.name && r.score >= CASTING.gesture.accept) {
      g.result = { ok: true, text: `${SPELLS[r.name].name} (${Math.round(r.score * 100)}%)`, id: r.name };
      this.select(r.name);
      if (SPELLS[r.name].kind !== 'shield') this.tryCast(r.name, 1);
    } else {
      g.result = { ok: false, text: 'Jest tanınmadı' };
      this.bus.emit('spell:fail', { reason: 'gesture' });
    }
  }

  // ---------------------------------------------------------------- casting

  /**
   * @param {string} id
   * @param {number} [gestureBonus] 0 normal, 1 clean gesture
   * @returns {boolean}
   */
  tryCast(id, gestureBonus = 0) {
    const s = SPELLS[id];
    const p = this.player;
    if (!s || p.dead || this.pending) return false;
    if ((this.cooldowns[id] ?? 0) > 0) return false;
    const cost = this.cost(id) * (1 - CASTING.gesture.bonusCost * gestureBonus);
    if (!this.unlimited && this.focus < cost) {
      this.bus.emit('spell:fail', { reason: 'focus' });
      this.bus.emit('spell:message', { text: 'Yeterli odak yok' });
      return false;
    }
    if (!this.unlimited) {
      this.focus -= cost;
      this._regenDelay = FOCUS.regenDelay;
    }
    this.cooldowns[id] = this.cooldownOf(id);
    const speed = 1 + this._wand().speed * CASTING.speedFactor;
    this.pending = { id, bonus: gestureBonus, timer: RELEASE_TIMEOUT };
    this._faceTimer = FACE_TIME;
    p.animator.play(s.clip, { speed });
    p.face.say(s.name, 1.8);
    this.bus.emit('spell:cast', { id });
    this._gain(id, MASTERY.xpCast);
    this._lastCast = id;
    return true;
  }

  /** Where the wand points: lock-on target, else the crosshair's world point. */
  aimPoint(out) {
    if (this.rig.getLockPoint(out)) return out;
    this.camera.getWorldDirection(_dir);
    const hit = this.physics.raycast(this.camera.position, _dir, CASTING.aimRange, {}, _hit);
    return hit ? out.copy(hit.point) : out.copy(this.camera.position).addScaledVector(_dir, CASTING.aimRange);
  }

  _perform() {
    const { id, bonus } = this.pending;
    this.pending = null;
    const s = SPELLS[id];
    const p = this.player;
    const from = p.character.getWandTip(new THREE.Vector3());
    const aim = this.aimPoint(new THREE.Vector3());
    const dir = aim.clone().sub(from).normalize();
    // Wand control narrows the random spread.
    const spread = THREE.MathUtils.degToRad(CASTING.spread) * Math.max(0, 1 - this._wand().control * 8) * (bonus ? 0.3 : 1);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    const power = this.power(id) * (1 + CASTING.gesture.bonusPower * bonus);
    const sys = this.system;
    const lev = sys.levitated;

    switch (s.kind) {
      case 'bolt':
        // Spells aimed while something is levitating act on it (combos).
        if (lev && (s.effect === 'push' || s.effect === 'slam')) {
          const b = lev.body;
          sys.releaseLevitation(true);
          if (s.effect === 'push') {
            this.physics.applyImpulse(b, dir.clone().multiplyScalar(s.impulse * power * Math.max(4, b.mass) * 0.9));
            this.bus.emit('spell:combo', { name: 'Fırlatma' });
          } else {
            this.physics.applyImpulse(b, new THREE.Vector3(0, -s.impulse * power * b.mass * 1.4, 0));
            this.bus.emit('spell:combo', { name: 'Çarpma' });
            sys._shatterBody(b, 'slam');
          }
          sys.glow.burst(20, from, { speed: [1, 4], life: 0.4, size: 0.08, color: s.color, dir, spread: 0.6 });
          break;
        }
        if (lev && s.effect === 'pull') {
          this._levitateDistance = CASTING.levitate.minDistance;
          break;
        }
        sys.launch(s, { id, from, dir, power, owner: 'player' });
        break;
      case 'self':
        this._self(id, s, from, power);
        break;
      case 'levitate':
        if (lev) {
          sys.releaseLevitation(false);
          break;
        }
        this._grab(from, dir);
        break;
      case 'patronus': {
        const forms = PATRONUS_FORMS;
        const d = p.character.data ?? {};
        const form = forms[hashString(`${d.firstName ?? ''}${d.lastName ?? ''}`) % forms.length];
        sys.patronus(from, dir, form);
        this.bus.emit('spell:message', { text: `Patronus'un bir ${PATRONUS_LABELS[form]}!` });
        break;
      }
      default:
        break;
    }
  }

  _self(id, s, from, power) {
    const sys = this.system;
    if (s.effect === 'lumos') {
      if (!this.lumos) this.lumos = this.lights.add({ position: from.clone(), color: s.light.color, intensity: s.light.intensity, distance: s.light.distance, priority: 5 });
      sys.glow.burst(14, from, { speed: [0.3, 1.2], life: 0.6, size: 0.1, color: s.color });
    } else if (s.effect === 'nox') {
      if (this.lumos) {
        this.lights.remove(this.lumos);
        this.lumos = null;
        sys.glow.burst(8, from, { speed: [0.2, 0.6], life: 0.5, size: 0.06, color: '#8a9ab0' });
      }
    } else if (s.effect === 'heal') {
      const p = this.player;
      p.heal(Math.round(s.heal * power));
      const c = p.position.clone().setY(p.position.y + 1);
      sys.visuals.aura(c, s.color, 1.1, 1.2);
      for (let k = 0; k < 30; k++) {
        const a = (k / 30) * Math.PI * 6;
        sys.glow.spawn({ x: c.x + Math.cos(a) * 0.6, y: c.y - 0.9 + k * 0.05, z: c.z + Math.sin(a) * 0.6 }, { x: 0, y: 0.8, z: 0 }, { life: 1, size: 0.1, color: s.color, delay: k * 0.02 });
      }
      this.bus.emit('spell:hit', { id, owner: 'player' });
    }
  }

  _grab(from, dir) {
    const hit = this.physics.raycast(from, dir, CASTING.aimRange * 0.5, {}, _hit);
    const body = hit?.collider?.kind === 'dynamic' ? hit.collider.body : null;
    if (!body) {
      this.bus.emit('spell:message', { text: 'Havaya kaldırılacak bir nesneye nişan al' });
      this.cooldowns.leviosa = 0;
      return;
    }
    const cam = this.camera;
    this._levitateDistance = Math.max(CASTING.levitate.minDistance, Math.min(CASTING.levitate.distance, hit.distance));
    const anchor = new THREE.Vector3();
    const ok = this.system.levitate(body, () => {
      cam.getWorldDirection(_v);
      _v.y = Math.max(_v.y, -0.2);
      const p = this.player.position;
      return anchor.set(p.x, p.y + CASTING.levitate.height, p.z).addScaledVector(_v.normalize(), this._levitateDistance + 0.8);
    });
    if (ok) this.bus.emit('spell:hit', { id: 'leviosa', owner: 'player' });
  }

  // ---------------------------------------------------------------- shield

  _shieldHold(dt) {
    const s = SPELLS.protego;
    if (this.shieldAge < 0) {
      if ((this.cooldowns.protego ?? 0) > 0 || (!this.unlimited && this.focus < s.cost)) return;
      if (!this.unlimited) this.focus -= s.cost;
      this.shieldAge = 0;
      this.player.animator.play('shield', { loop: true });
      this.bus.emit('spell:cast', { id: 'protego' });
      this._gain('protego', MASTERY.xpCast);
    }
    this.shieldAge += dt;
    if (!this.unlimited) {
      this.focus -= CASTING.shield.drain * dt * (1 - this._wand().focus);
      this._regenDelay = FOCUS.regenDelay;
      if (this.focus <= 0) {
        this.focus = 0;
        this._shieldOff();
      }
    }
  }

  /** Drop a raised Protego (dodging, being stunned). */
  cancelShield() {
    this._shieldOff();
  }

  _shieldOff() {
    if (this.shieldAge < 0) return;
    this.shieldAge = -1;
    this.player.animator.stop('shield');
    this.cooldowns.protego = this.cooldownOf('protego');
  }

  // ----------------------------------------------------------------- update

  /** @param {number} dt */
  update(dt) {
    if (this._faceTimer > 0) this._faceTimer -= dt;
    for (const k of Object.keys(this.cooldowns)) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    if (this._regenDelay > 0) this._regenDelay -= dt;
    else this.focus = Math.min(FOCUS.max, this.focus + FOCUS.regen * dt);
    if (this.pending) {
      this.pending.timer -= dt;
      if (this.pending.timer <= 0) this._perform();
    }
    const p = this.player;
    if (p.dead) {
      this._shieldOff();
      if (this.system.levitated) this.system.releaseLevitation(false);
    }
    const tip = p.character.getWandTip(_v);
    if (this.lumos) {
      this.lumos.position.copy(tip);
      if (Math.random() < 0.4) this.system.glow.spawn(tip, { x: (Math.random() - 0.5) * 0.3, y: 0.2, z: (Math.random() - 0.5) * 0.3 }, { life: 0.5, size: 0.06, color: '#e8f4ff', shape: 1 });
      this.system.glow.spawn(tip, { x: 0, y: 0, z: 0 }, { life: 0.06, size: 0.35, color: '#dcecff', alpha: 0.9 });
    }
    // Levitation drains focus while held.
    if (this.system.levitated && !this.unlimited) {
      this.focus -= CASTING.levitate.drain * dt;
      this._regenDelay = FOCUS.regenDelay;
      if (this.focus <= 0) {
        this.focus = 0;
        this.system.releaseLevitation(false);
      }
    }
    // Shield bubble.
    const up = this.shieldAge >= 0;
    const center = p.position.clone().setY(p.position.y + 1);
    this.system.shield = up ? { center, radius: CASTING.shield.radius, age: this.shieldAge } : null;
    this.system.visuals.setShield(up ? center : null, CASTING.shield.radius, up ? Math.min(1, this.shieldAge * 6) : 0);
  }

  /** The body should turn toward the aim (casting, shielding, levitating). */
  get facing() {
    return !!this.pending || this._faceTimer > 0 || this.shieldAge >= 0 || !!this.system.levitated;
  }

  // ---------------------------------------------------------------- saves

  serialize() {
    return { selected: this.selected, xp: { ...this.xp }, lumos: !!this.lumos };
  }

  deserialize(d) {
    if (!d) return;
    if (SPELLS[d.selected]) this.selected = d.selected;
    this.xp = {};
    for (const [k, v] of Object.entries(d.xp ?? {})) if (SPELLS[k] && Number.isFinite(v)) this.xp[k] = v;
    this.focus = FOCUS.max;
    if (!d.lumos && this.lumos) this._self('nox', SPELLS.nox, this.player.position, 1);
  }

  /** Drop per-region things (lights) before a region change. */
  reset() {
    if (this.lumos) {
      this.lights.remove(this.lumos);
      this.lumos = null;
    }
    this._shieldOff();
    this.pending = null;
  }

  get stats() {
    return {
      Seçili: `${SPELLS[this.selected].name} · usta ${this.level(this.selected)}`,
      Odak: `${Math.round(this.focus)} / ${FOCUS.max}${this.unlimited ? ' (sınırsız)' : ''}`,
      'Kalkan / Lumos / Havada': `${this.shieldAge >= 0 ? 'açık' : '—'} / ${this.lumos ? 'açık' : '—'} / ${this.system.levitated?.body.name ?? '—'}`,
    };
  }

  dispose() {
    this._offAnim();
    this._offHit();
    this._offCombo();
    this.reset();
  }
}
