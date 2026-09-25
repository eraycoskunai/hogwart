/**
 * @file TargetDummy — training dummy used as a lock-on target and as the
 * first AI state-machine client (idle → alert → targeted). Later phases
 * reuse it in the Defence classroom.
 */
import * as THREE from 'three';
import { StateMachine } from '../core/StateMachine.js';

export const DUMMY = Object.freeze({
  alertRange: 9,
  calmRange: 11,
  turnRate: 4,
  lockHeight: 1.35,
  colliderRadius: 0.3,
  colliderHeight: 1.9,
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
  constructor(ctx, position, yaw, mats) {
    this.name = `Antrenman Mankeni ${++_count}`;
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
    this.ai.update(dt);
    this.wobble = Math.max(0, this.wobble - dt * 1.5);
  }

  /** @param {number} time */
  render(time) {
    this.swivel.rotation.y = this.headYaw;
    this.swivel.rotation.z = Math.sin(time * 9) * 0.06 * this.wobble;
    this.ring.visible = this.locked;
    if (this.locked) this.ring.rotation.z = time * 1.5;
  }

  /** Debug-panel description. */
  get debugState() {
    return `${this.ai.current} (${this._distToPlayer().toFixed(1)} m)`;
  }

  dispose() {
    this.bus.off('camera:lock', this._onLock);
    this.physics.removeCollider(this.collider);
    this.group.traverse((o) => o.geometry?.dispose());
    this.group.removeFromParent();
  }
}

