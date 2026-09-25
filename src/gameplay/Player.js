/**
 * @file Player — binds input intent, the capsule controller, health / fall
 * damage, respawning and the visual avatar together.
 *
 * Emits: player:damaged, player:healed, player:died, player:respawned,
 *        player:landed, player:jumped, player:state
 */
import * as THREE from 'three';
import { PLAYER, PHYSICS } from '../data/physics.js';
import { DIFFICULTIES } from '../data/settings.js';
import { CharacterController } from '../physics/CharacterController.js';
import { buildMannequin, setMannequinOpacity } from '../procgen/characters/Mannequin.js';
import { ProceduralAnimator } from '../animation/ProceduralAnimator.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _vis = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/** Shortest signed angle difference. */
function angleDelta(a, b) {
  return THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI;
}

export class Player {
  /**
   * @param {{bus:import('../core/EventBus.js').EventBus, physics:import('../physics/PhysicsWorld.js').PhysicsWorld,
   *          settings:import('../core/Settings.js').Settings, scene:THREE.Scene}} ctx
   */
  constructor(ctx) {
    this.bus = ctx.bus;
    this.physics = ctx.physics;
    this.settings = ctx.settings;
    this.controller = new CharacterController(ctx.physics, PLAYER);

    this.rig = buildMannequin();
    this.animator = new ProceduralAnimator(this.rig);
    ctx.scene.add(this.rig.root);

    this.maxHealth = PLAYER.maxHealth;
    this.health = this.maxHealth;
    this.dead = false;
    this.invulnerable = 0;
    this.godMode = false;

    /** Facing yaw of the body (radians, 0 = -Z). */
    this.yaw = 0;
    this._prevYaw = 0;
    this._turnRate = 0;

    /** Intent gathered each frame, consumed by fixed steps. */
    this.intent = {
      move: new THREE.Vector3(),
      moveMag: 0,
      sprint: false,
      walk: false,
      crouch: false,
      aim: false,
      vertical: 0,
    };
    /** Yaw the body should face when strafing (aim / lock-on), or null. */
    this.faceYaw = null;
    this.locomotion = 'idle';

    this.spawnPoint = new THREE.Vector3();
    this.spawnYaw = 0;
    this._respawnTimer = 0;
    this.visualPosition = new THREE.Vector3();
  }

  get position() {
    return this.controller.position;
  }

  get speed() {
    const v = this.controller.velocity;
    return Math.hypot(v.x, v.z);
  }

  /**
   * @param {THREE.Vector3} pos
   * @param {number} yaw
   */
  setSpawn(pos, yaw) {
    this.spawnPoint.copy(pos);
    this.spawnYaw = yaw;
  }

  /**
   * @param {THREE.Vector3} pos
   * @param {number} [yaw]
   */
  teleport(pos, yaw = this.yaw) {
    this.controller.teleport(pos);
    this.yaw = this._prevYaw = yaw;
    this.bus.emit('player:teleported', { position: pos.clone(), yaw });
  }

  // ---------------------------------------------------------------- intent

  /**
   * Gather input once per frame.
   * @param {import('../core/Input.js').Input} input
   * @param {import('../render/ThirdPersonCamera.js').ThirdPersonCamera} cam
   */
  gatherInput(input, cam) {
    const it = this.intent;
    if (this.dead) {
      it.move.set(0, 0, 0);
      it.moveMag = 0;
      it.aim = false;
      it.crouch = false;
      this.controller.jumpHeld = false;
      return;
    }
    const axis = input.moveAxis();
    cam.flatForward(_fwd);
    cam.flatRight(_right);
    it.move.set(0, 0, 0).addScaledVector(_fwd, axis.y).addScaledVector(_right, axis.x);
    it.moveMag = Math.min(1, it.move.length());
    if (it.moveMag > 1e-3) it.move.normalize();
    it.sprint = input.down('sprint');
    it.walk = input.down('walk') || (axis.analog && it.moveMag < 0.55);
    it.crouch = input.down('crouch');
    it.aim = input.down('aim');
    it.vertical = (input.down('jump') ? 1 : 0) - (input.down('crouch') ? 1 : 0);

    if (input.pressed('jump') && !this.controller.noclip) this.controller.requestJump();
    this.controller.jumpHeld = input.down('jump');

    if (this.controller.noclip) {
      // Fly along the camera's full view direction.
      cam.camera.getWorldDirection(_tmp);
      it.move.set(0, 0, 0).addScaledVector(_tmp, axis.y).addScaledVector(_right, axis.x);
      it.move.y += it.vertical;
      it.moveMag = Math.min(1, it.move.length());
      if (it.moveMag > 1e-3) it.move.normalize();
    }
  }

  _wishSpeed() {
    const it = this.intent;
    const c = this.controller;
    if (c.noclip) return PLAYER.noclipSpeed * it.moveMag * (it.sprint ? 2.5 : 1);
    if (it.moveMag < 1e-3) return 0;
    let s = PLAYER.runSpeed;
    if (c.crouching) s = PLAYER.crouchSpeed;
    else if (it.aim) s = PLAYER.aimSpeed;
    else if (it.walk) s = PLAYER.walkSpeed;
    else if (it.sprint && c.grounded) s = PLAYER.sprintSpeed;
    else if (it.sprint && !c.grounded && this.speed > PLAYER.runSpeed) s = PLAYER.sprintSpeed;
    return s * it.moveMag;
  }

  // ----------------------------------------------------------------- step

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    const c = this.controller;
    this._prevYaw = this.yaw;

    if (this.dead) {
      this._respawnTimer -= dt;
      this.intent.moveMag = 0;
      c.wantCrouch = false;
      c.step(dt, this.intent.move, 0);
      if (this._respawnTimer <= 0) this.respawn();
      return;
    }

    if (this.invulnerable > 0) this.invulnerable -= dt;
    c.wantCrouch = this.intent.crouch && !c.noclip;
    c.step(dt, this.intent.move, this._wishSpeed());

    for (const e of c.events) {
      if (e.type === 'land') this._onLand(e);
      else if (e.type === 'jump') this.bus.emit('player:jumped', {});
    }

    // Facing: toward movement, or toward the aim/lock yaw while strafing.
    this.yaw += c.yawDelta;
    let target = null;
    if (this.faceYaw !== null) target = this.faceYaw;
    else if (this.speed > 0.4 && this.intent.moveMag > 0.05) {
      const v = c.velocity;
      target = Math.atan2(-v.x, -v.z);
    }
    if (target !== null) {
      const d = angleDelta(this.yaw, target);
      this.yaw += d * (1 - Math.exp(-PLAYER.turnRate * dt));
    }
    this._turnRate = angleDelta(this._prevYaw, this.yaw) / dt;

    if (c.position.y < PHYSICS.killPlaneY) this.kill('void');

    const loco = this._computeLocomotion();
    if (loco !== this.locomotion) {
      this.locomotion = loco;
      this.bus.emit('player:state', { state: loco });
    }
  }

  _computeLocomotion() {
    const c = this.controller;
    if (this.dead) return 'dead';
    if (c.noclip) return 'fly';
    if (!c.grounded) return c.velocity.y > 0 ? 'jump' : c.onSteepSlope ? 'slide' : 'fall';
    const s = this.speed;
    if (c.crouching) return s > 0.3 ? 'crouchWalk' : 'crouch';
    if (s < 0.3) return 'idle';
    if (s <= PLAYER.walkSpeed + 0.3) return 'walk';
    if (s <= PLAYER.runSpeed + 0.3) return 'run';
    return 'sprint';
  }

  _onLand(e) {
    const F = PLAYER.fallDamage;
    const h = e.fallHeight;
    this.bus.emit('player:landed', { fallHeight: h, impactSpeed: e.impactSpeed });
    this.animator.land(Math.min(1, h / F.safeHeight));
    if (h > F.safeHeight) {
      const t = THREE.MathUtils.clamp((h - F.safeHeight) / (F.lethalHeight - F.safeHeight), 0, 1);
      const dmg = Math.pow(t, F.exponent) * this.maxHealth;
      this.damage(Math.max(1, Math.round(dmg)), 'fall', true);
    }
  }

  // --------------------------------------------------------------- health

  /**
   * @param {number} amount
   * @param {string} [source]
   * @param {boolean} [ignoreDifficulty] fall damage is absolute (lethal stays lethal)
   */
  damage(amount, source = 'unknown', ignoreDifficulty = false) {
    if (this.dead || this.godMode || this.invulnerable > 0 || amount <= 0) return;
    const scale = ignoreDifficulty ? 1 : DIFFICULTIES[this.settings.get('difficulty')]?.damageTaken ?? 1;
    const dmg = amount * scale;
    this.health = Math.max(0, this.health - dmg);
    this.bus.emit('player:damaged', { amount: dmg, source, health: this.health, max: this.maxHealth });
    if (this.health <= 0) this.kill(source);
  }

  /** @param {number} amount */
  heal(amount) {
    if (this.dead) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.bus.emit('player:healed', { amount, health: this.health, max: this.maxHealth });
  }

  /** @param {string} cause */
  kill(cause) {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    this._respawnTimer = PLAYER.respawnDelay;
    this.bus.emit('player:died', { cause });
  }

  respawn() {
    this.dead = false;
    this.health = this.maxHealth;
    this.invulnerable = PLAYER.invulnerableAfterRespawn;
    this.controller.wantCrouch = false;
    this.controller.height = PLAYER.height;
    this.controller.crouching = false;
    this.teleport(this.spawnPoint, this.spawnYaw);
    this.bus.emit('player:respawned', { position: this.spawnPoint.clone() });
  }

  // --------------------------------------------------------------- render

  /**
   * Update the avatar for rendering.
   * @param {number} dt frame delta
   * @param {number} alpha interpolation factor
   * @param {number} cameraDistance used to fade the avatar when the camera is close
   */
  render(dt, alpha, cameraDistance) {
    const c = this.controller;
    c.getInterpolatedPosition(alpha, _vis);
    _vis.y += c.stepOffset;
    this.visualPosition.copy(_vis);
    const root = this.rig.root;
    root.position.copy(_vis);
    root.rotation.y = this._prevYaw + angleDelta(this._prevYaw, this.yaw) * alpha;

    this.animator.update(dt, {
      speed: this.dead ? 0 : this.speed,
      runSpeed: PLAYER.runSpeed,
      grounded: c.grounded || c.noclip,
      vy: c.velocity.y,
      crouching: c.crouching,
      aiming: this.intent.aim && !this.dead,
      turnRate: this._turnRate,
    });
    // Collapse pose while unconscious.
    const deadT = this.dead ? 1 : 0;
    root.rotation.x += ((deadT ? -Math.PI / 2 + 0.15 : 0) - root.rotation.x) * (1 - Math.exp(-6 * dt));
    root.position.y += Math.sin(-root.rotation.x) * 0.25;

    const fade = THREE.MathUtils.clamp((cameraDistance - 0.55) / 0.6, 0, 1);
    setMannequinOpacity(this.rig, fade);
  }

  // ---------------------------------------------------------------- saves

  serialize() {
    const p = this.controller.position;
    return {
      position: [p.x, p.y, p.z],
      yaw: this.yaw,
      health: this.health,
    };
  }

  /** @param {{position:number[], yaw:number, health:number}} data */
  deserialize(data) {
    if (!data || !Array.isArray(data.position)) return;
    this.dead = false;
    this.health = THREE.MathUtils.clamp(Number(data.health) || this.maxHealth, 1, this.maxHealth);
    this.teleport(new THREE.Vector3().fromArray(data.position), Number(data.yaw) || 0);
  }
}
