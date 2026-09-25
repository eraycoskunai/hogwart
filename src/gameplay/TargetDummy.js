/**
 * @file TargetDummy — training dummy: lock-on target, AI state-machine
 * client (idle → alert → targeted) and spell target. It takes damage
 * (floating numbers), wobbles when stunned, freezes into an ice shell,
 * turns to stone, burns, is knocked over by strong hits and gets back up.
 * The duelling variant throws slow practice bolts at the player (Protego
 * practice: parry them back).
 */
import * as THREE from 'three';
import { StateMachine } from '../core/StateMachine.js';
import { ELEMENTS, PRACTICE_BOLT } from '../data/spells.js';

export const DUMMY = Object.freeze({
  alertRange: 9,
  calmRange: 11,
  turnRate: 4,
  lockHeight: 1.35,
  colliderRadius: 0.3,
  colliderHeight: 1.9,
  maxHealth: 100,
  /** Seconds of rest before health refills; knocked-down time. */
  regenDelay: 5,
  knockdown: 3.2,
  /** Push strength (spell impulse × power) that knocks it over. */
  knockImpulse: 13,
  practice: { range: 14, every: [2.6, 4.2], windup: 0.7 },
});

let _count = 0;

export class TargetDummy {
  /**
   * @param {{scene:THREE.Scene, physics:import('../physics/PhysicsWorld.js').PhysicsWorld,
   *          bus:import('../core/EventBus.js').EventBus}} ctx
   * @param {THREE.Vector3} position
   * @param {number} yaw
   * @param {Record<string, THREE.Material>} mats shared materials
   */
  constructor(ctx, position, yaw, mats, opts = {}) {
    this.caster = !!opts.caster;
    this.name = this.caster ? `Düello Mankeni ${++_count}` : `Antrenman Mankeni ${++_count}`;
    this.spells = ctx.spells ?? null;
    this.targets = ctx.spellTargets ?? null;
    this.takesDamage = true;
    this.health = DUMMY.maxHealth;
    this._restTimer = 0;
    this.status = { stunned: 0, frozen: 0, petrified: 0, burning: 0, knocked: 0 };
    this._fall = 0;
    this._castTimer = DUMMY.practice.every[1];
    this._windup = 0;
    this._rnd = Math.random;
    this.bus = ctx.bus;
    this.physics = ctx.physics;
    this.position = position.clone();
    this.baseYaw = yaw;
    this.headYaw = 0;
    this.locked = false;
    this.wobble = 0;

    this.group = this._build(mats);
    this.group.position.copy(position);
    this.group.rotation.y = yaw;
    ctx.scene.add(this.group);

    const m = new THREE.Matrix4().makeTranslation(position.x, position.y + DUMMY.colliderHeight / 2, position.z);
    this.collider = ctx.physics.addStaticCylinder(DUMMY.colliderRadius, DUMMY.colliderHeight, m, {
      surface: 'wood',
      name: this.name,
    });
    this.targets?.add(this.collider, this);

    /** @type {THREE.Vector3|null} */
    this._playerPos = null;
    this.ai = new StateMachine(this, {
      idle: {
        update: (d, dt) => {
          d.headYaw += (0 - d.headYaw) * (1 - Math.exp(-2 * dt));
          if (d._distToPlayer() < DUMMY.alertRange) d.ai.change('alert');
        },
      },
      alert: {
        enter: (d) => {
          d.wobble = 1;
        },
        update: (d, dt) => {
          d._trackPlayer(dt);
          if (d.locked) d.ai.change('targeted');
          else if (d._distToPlayer() > DUMMY.calmRange) d.ai.change('idle');
        },
      },
      targeted: {
        update: (d, dt) => {
          d._trackPlayer(dt);
          if (!d.locked) d.ai.change('alert');
        },
      },
    });
    this.ai.change('idle');

    this._onLock = ({ target }) => {
      this.locked = target === this;
    };
    this.bus.on('camera:lock', this._onLock);
  }

  _build(mats) {
    const g = new THREE.Group();
    const cast = (m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    // Base plate + post
    const base = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.12, 20), mats.iron));
    base.position.y = 0.06;
    g.add(base);
    const post = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 10), mats.wood));
    post.position.y = 0.66;
    g.add(post);
    // Swivel (rotates toward the player)
    this.swivel = new THREE.Group();
    this.swivel.position.y = 1.0;
    g.add(this.swivel);
    // Straw sack body
    const sackProfile = [
      [0.05, 0], [0.24, 0.05], [0.29, 0.25], [0.27, 0.48], [0.2, 0.62], [0.08, 0.68],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const sack = cast(new THREE.Mesh(new THREE.LatheGeometry(sackProfile, 20), mats.burlap));
    sack.scale.set(1, 1, 0.8);
    this.swivel.add(sack);
    // Rope bands
    for (const y of [0.14, 0.5]) {
      const band = cast(new THREE.Mesh(new THREE.TorusGeometry(y < 0.3 ? 0.275 : 0.24, 0.012, 6, 28), mats.rope));
      band.rotation.x = Math.PI / 2;
      band.scale.set(1, 0.8, 1);
      band.position.y = y;
      this.swivel.add(band);
    }
    // Crossbar arms
    const arm = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8), mats.wood));
    arm.rotation.z = Math.PI / 2;
    arm.position.y = 0.52;
    this.swivel.add(arm);
    // Target disc on the chest
    const disc = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 24), mats.target));
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 0.33, -0.235);
    this.swivel.add(disc);
    this.disc = disc;
    if (this.caster) {
      // A practice wand in its right "hand" and a violet target.
      const wand = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.4, 6), mats.wood));
      wand.rotation.x = -Math.PI / 2;
      wand.position.set(0.47, 0.52, -0.2);
      this.swivel.add(wand);
      this.disc.material = mats.glow;
    }
    // Head
    const head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mats.burlap));
    head.scale.set(1, 1.1, 1);
    head.position.y = 0.82;
    this.swivel.add(head);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.01), mats.rope);
      eye.position.set(sx * 0.05, 0.85, -0.148);
      eye.rotation.z = sx * 0.6;
      this.swivel.add(eye);
      const eye2 = eye.clone();
      eye2.rotation.z = -sx * 0.6;
      this.swivel.add(eye2);
    }
    // Lock highlight ring
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.02, 8, 40), mats.glow);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    g.add(this.ring);
    // Status shells (ice / stone / soot) over the sack and head.
    this.shells = [];
    for (const m of [sack, head]) {
      const sh = new THREE.Mesh(m.geometry, mats.glow);
      sh.position.copy(m.position);
      sh.scale.copy(m.scale).multiplyScalar(1.07);
      sh.visible = false;
      this.swivel.add(sh);
      this.shells.push(sh);
    }
    return g;
  }

  _distToPlayer() {
    if (!this._playerPos) return Infinity;
    return Math.hypot(this._playerPos.x - this.position.x, this._playerPos.z - this.position.z);
  }

  _trackPlayer(dt) {
    if (!this._playerPos) return;
    const world = Math.atan2(-(this._playerPos.x - this.position.x), -(this._playerPos.z - this.position.z));
    const target = THREE.MathUtils.euclideanModulo(world - this.baseYaw + Math.PI, Math.PI * 2) - Math.PI;
    const d = THREE.MathUtils.euclideanModulo(target - this.headYaw + Math.PI, Math.PI * 2) - Math.PI;
    this.headYaw += d * (1 - Math.exp(-DUMMY.turnRate * dt));
  }

  // --- SpellTarget interface

  /** @param {THREE.Vector3} out */
  center(out) {
    return out.set(this.position.x, this.position.y + 1.2, this.position.z);
  }

  /**
   * React to a spell.
   * @param {{effect:string, spell:any, power:number, dir:THREE.Vector3}} ev
   * @returns {boolean}
   */
  onSpell(ev) {
    const S = this.status;
    const E = ELEMENTS;
    const dmg = (ev.spell.damage ?? 0) * ev.power;
    switch (ev.effect) {
      case 'unlock':
      case 'repair':
        return false;
      case 'finite':
        for (const k of Object.keys(S)) if (k !== 'knocked') S[k] = 0;
        return true;
      case 'freeze':
        if (S.burning > 0) S.burning = 0;
        else S.frozen = E.freeze.duration;
        break;
      case 'petrify':
        S.petrified = E.petrify.duration;
        break;
      case 'ignite':
        if (S.frozen > 0) S.frozen = 0;
        else S.burning = E.burn.duration;
        break;
      case 'stun':
      case 'disarm':
        S.stunned = E.stun.duration;
        break;
      default:
        break;
    }
    const shove = (ev.spell.impulse ?? 0) * ev.power;
    if (shove >= DUMMY.knockImpulse || ev.effect === 'slam' || (ev.effect === 'explode' && ev.power > 0.4) || (S.petrified > 0 && ev.effect === 'push')) {
      this._knock();
    }
    this.wobble = Math.min(1.5, this.wobble + 0.6 + shove * 0.03);
    this._hurt(dmg);
    return true;
  }

  _hurt(amount) {
    if (amount <= 0) return;
    this.health -= amount;
    this._restTimer = DUMMY.regenDelay;
    if (this.health <= 0) this._knock();
  }

  _knock() {
    this.status.knocked = DUMMY.knockdown;
    this.status.frozen = 0;
    this.status.petrified = 0;
  }

  get alive() {
    return this.status.knocked <= 0;
  }

  // --- LockTarget interface
  /** @param {THREE.Vector3} out */
  getLockPoint(out) {
    return out.set(this.position.x, this.position.y + DUMMY.lockHeight, this.position.z);
  }

  isLockable() {
    return true;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos
   */
  fixedUpdate(dt, playerPos) {
    this._playerPos = playerPos;
    const S = this.status;
    const held = S.frozen > 0 || S.petrified > 0 || S.knocked > 0;
    if (!held) this.ai.update(dt);
    this.wobble = Math.max(0, this.wobble - dt * 1.5);
    for (const k of Object.keys(S)) S[k] = Math.max(0, S[k] - dt);
    if (S.knocked <= 0 && this.health <= 0) this.health = DUMMY.maxHealth;
    if (S.burning > 0) this._hurt(ELEMENTS.burn.dps * dt);
    if (this._restTimer > 0) this._restTimer -= dt;
    else this.health = Math.min(DUMMY.maxHealth, this.health + 20 * dt);
    this._fall += ((S.knocked > 0 ? 1 : 0) - this._fall) * (1 - Math.exp(-(S.knocked > 0 ? 9 : 3) * dt));
    if (this.caster && !held && S.stunned <= 0 && this.ai.current !== 'idle') this._practice(dt);
  }

  /** Duelling dummy: wind up (glowing disc), then throw a practice bolt. */
  _practice(dt) {
    const P = DUMMY.practice;
    if (!this.spells || !this._playerPos || this._distToPlayer() > P.range) return;
    if (this._windup > 0) {
      this._windup -= dt;
      if (this._windup <= 0) {
        const from = this.center(new THREE.Vector3()).setY(this.position.y + 1.45);
        const to = this._playerPos.clone().setY(this._playerPos.y + 1.1);
        const dir = to.sub(from).normalize();
        from.addScaledVector(dir, DUMMY.colliderRadius + 0.25);
        this.spells.launch(PRACTICE_BOLT, { id: 'practice', from, dir, owner: this });
        this._castTimer = P.every[0] + this._rnd() * (P.every[1] - P.every[0]);
      }
      return;
    }
    this._castTimer -= dt;
    if (this._castTimer <= 0) this._windup = P.windup;
  }

  /** @param {number} time */
  render(time) {
    const S = this.status;
    const still = S.frozen > 0 || S.petrified > 0;
    this.swivel.rotation.y = this.headYaw + (S.stunned > 0 && !still ? Math.sin(time * 14) * 0.5 : 0);
    this.swivel.rotation.z = still ? 0 : Math.sin(time * 9) * 0.06 * this.wobble;
    // Knocked over backwards on its base.
    this.group.rotation.set(-this._fall * 1.35, this.baseYaw, 0, 'YXZ');
    this.ring.visible = this.locked;
    if (this.locked) this.ring.rotation.z = time * 1.5;
    // Status shells.
    const V = this.spells?.visuals;
    const mat = !V ? null : S.frozen > 0 ? V.iceMat : S.petrified > 0 ? V.stoneMat : S.burning > 0 ? V.charMat : null;
    for (const sh of this.shells) {
      sh.visible = !!mat;
      if (mat) sh.material = mat;
    }
    if (this.caster) this.disc.scale.setScalar(1 + (this._windup > 0 ? Math.sin(time * 30) * 0.25 + 0.4 : 0));
    // Fire and stun stars.
    if (this.spells && S.burning > 0) {
      const p = this.position;
      for (let k = 0; k < 2; k++) {
        this.spells.glow.spawn({ x: p.x + (Math.random() - 0.5) * 0.4, y: p.y + 1 + Math.random() * 0.8, z: p.z + (Math.random() - 0.5) * 0.4 }, { x: 0, y: 1.3, z: 0 }, { life: 0.5, size: 0.28, endSize: 0.04, color: '#ffd060', endColor: '#ff2a00', drag: 1.5 });
      }
    }
    if (this.spells && S.stunned > 0 && Math.random() < 0.3) {
      const a = time * 6;
      const p = this.position;
      this.spells.glow.spawn({ x: p.x + Math.cos(a) * 0.3, y: p.y + 2.05, z: p.z + Math.sin(a) * 0.3 }, { x: 0, y: 0, z: 0 }, { life: 0.4, size: 0.09, color: '#ffe070', shape: 1 });
    }
  }

  /** Debug-panel description. */
  get debugState() {
    const st = Object.entries(this.status).filter(([, v]) => v > 0).map(([k]) => k).join(',');
    return `${this.ai.current} (${this._distToPlayer().toFixed(1)} m) · can ${Math.ceil(this.health)}${st ? ` · ${st}` : ''}`;
  }

  dispose() {
    this.bus.off('camera:lock', this._onLock);
    this.physics.removeCollider(this.collider);
    this.targets?.remove(this);
    this.group.traverse((o) => o.geometry?.dispose());
    this.group.removeFromParent();
  }
}

