/**
 * @file Player — binds input intent, the capsule controller, health / fall
 * damage, respawning and the visual avatar (procedural student character
 * with skeletal animation, IK, facial animation and cloth) together.
 *
 * Combat moves: dodge roll with invulnerability frames, being stunned
 * (controls locked), slowed (webs) and a non-lethal mode for duels.
 *
 * Emits: player:dodged, player:stunned, player:yielded, player:damaged, player:healed, player:died, player:respawned,
 *        player:landed, player:jumped, player:state, player:rebuilt
 */
import * as THREE from 'three';
import { PLAYER, PHYSICS } from '../data/physics.js';
import { DIFFICULTIES } from '../data/settings.js';
import { CharacterController } from '../physics/CharacterController.js';
import { Character } from '../procgen/characters/Character.js';
import { Animator } from '../animation/Animator.js';
import { FaceAnimator } from '../animation/FaceAnimator.js';
import { makeGroundProbe } from '../animation/GroundProbe.js';
import { COMBAT } from '../data/combat.js';

/** Seconds a pained expression stays after taking damage. */
const PAIN_SECONDS = 0.9;
/** Smoothing (1/s) of the climb-rate and acceleration signals fed to the animator. */
const SIGNAL_SMOOTH = 8;
/** Camera distance over which the avatar fades out when the camera is very close. */
const FADE = Object.freeze({ start: 0.55, range: 0.6 });

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
   *          settings:import('../core/Settings.js').Settings, scene:THREE.Scene, preset:any,
   *          library?:import('../render/MaterialLibrary.js').MaterialLibrary, character?:any}} ctx
   */
  constructor(ctx) {
    this.bus = ctx.bus;
    this.physics = ctx.physics;
    this.settings = ctx.settings;
    this.controller = new CharacterController(ctx.physics, PLAYER);

    this.character = new Character({ library: ctx.library, preset: ctx.preset, name: 'Player' });
    this.character.build(ctx.character ?? null);
    this.face = new FaceAnimator(this.character);
    this.animator = new Animator(this.character, this.face);
    this.animator.onEvent = (name, clip) => this.bus.emit('player:animEvent', { name, clip });
    ctx.scene.add(this.character.root);
    this._ground = makeGroundProbe(ctx.physics);
    /** World point the head turns to (set by the game each frame) or null. */
    this.lookTarget = null;
    /** Water surface query (x, z) → height, supplied by the active region. */
    this.waterLevelAt = null;
    /** World point the wand aims at while aiming, or null. */
    this.aimTarget = null;
    this._climb = 0;
    this._accel = 0;
    this._prevSpeed = 0;
    this._prevGround = new THREE.Vector3();
    this._pain = 0;

    this.maxHealth = PLAYER.maxHealth;
    this.health = this.maxHealth;
    this.dead = false;
    this.invulnerable = 0;
    this.godMode = false;
    /** Seconds of lost control (hit hard / stunning curse). */
    this.stunned = 0;
    /** Seconds of reduced speed (webbed). */
    this.slowed = 0;
    /** Seconds left in a dodge roll, its direction and cooldown. */
    this.dodging = 0;
    this._dodgeDir = new THREE.Vector3();
    this._dodgeCd = 0;
    /** Duels: health stops at 1 and the player yields instead of dying. */
    this.nonLethal = false;

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
    if (this.stunned > 0) {
      it.move.set(0, 0, 0);
      it.moveMag = 0;
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
    if (this.slowed > 0) s = PLAYER.walkSpeed;
    else if (c.crouching) s = PLAYER.crouchSpeed;
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
    if (this.stunned > 0) this.stunned -= dt;
    if (this.slowed > 0) this.slowed -= dt;
    if (this._dodgeCd > 0) this._dodgeCd -= dt;
    c.wantCrouch = this.intent.crouch && !c.noclip && !c.swimming && this.stunned <= 0;
    c.waterLevel = this.waterLevelAt ? this.waterLevelAt(c.position.x, c.position.z) : -Infinity;
    if (this.dodging > 0) {
      this.dodging -= dt;
      const D = COMBAT.dodge;
      c.velocity.x = this._dodgeDir.x * D.speed;
      c.velocity.z = this._dodgeDir.z * D.speed;
      c.step(dt, this._dodgeDir, D.speed);
    } else c.step(dt, this.intent.move, this.stunned > 0 ? 0 : this._wishSpeed());

    for (const e of c.events) {
      if (e.type === 'land') this._onLand(e);
      else if (e.type === 'jump') this.bus.emit('player:jumped', {});
      else if (e.type === 'swimStart' || e.type === 'swimEnd') this.bus.emit('player:swim', { swimming: e.type === 'swimStart' });
    }

    // Facing: toward movement, or toward the aim/lock yaw while strafing.
    this.yaw += c.yawDelta;
    let target = null;
    if (this.dodging > 0) target = null;
    else if (this.faceYaw !== null) target = this.faceYaw;
    else if (this.speed > 0.4 && this.intent.moveMag > 0.05) {
      const v = c.velocity;
      target = Math.atan2(-v.x, -v.z);
    }
    if (target !== null) {
      const d = angleDelta(this.yaw, target);
      this.yaw += d * (1 - Math.exp(-PLAYER.turnRate * dt));
    }
    this._turnRate = angleDelta(this._prevYaw, this.yaw) / dt;

    // Animation signals: ground climb rate (stairs) and forward acceleration.
    const k = 1 - Math.exp(-SIGNAL_SMOOTH * dt);
    const horiz = Math.hypot(c.position.x - this._prevGround.x, c.position.z - this._prevGround.z);
    const rise = c.grounded && horiz > 1e-3 ? (c.position.y - this._prevGround.y) / horiz : 0;
    this._climb += (THREE.MathUtils.clamp(rise, -1, 1) - this._climb) * k;
    this._prevGround.copy(c.position);
    const speed = this.speed;
    this._accel += ((speed - this._prevSpeed) / dt - this._accel) * k;
    this._prevSpeed = speed;

    if (c.position.y < PHYSICS.killPlaneY) this.kill('void');

    const loco = this._computeLocomotion();
    if (loco !== this.locomotion) {
      this.locomotion = loco;
      this.bus.emit('player:state', { state: loco });
    }
  }

  // ---------------------------------------------------------------- combat

  /** Can a dodge start now? */
  get canDodge() {
    const c = this.controller;
    return !this.dead && this.stunned <= 0 && this.dodging <= 0 && this._dodgeCd <= 0 && c.grounded && !c.swimming && !c.noclip;
  }

  /**
   * Roll in `dir` (flat; falls back to backwards) with invulnerability frames.
   * @param {THREE.Vector3} dir
   * @returns {boolean} started
   */
  dodge(dir) {
    if (!this.canDodge) return false;
    const D = COMBAT.dodge;
    this._dodgeDir.copy(dir).setY(0);
    if (this._dodgeDir.lengthSq() < 1e-4) this._dodgeDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this._dodgeDir.normalize();
    this.dodging = D.duration;
    this._dodgeCd = D.duration + D.cooldown;
    this.invulnerable = Math.max(this.invulnerable, D.iframes);
    this.controller.wantCrouch = false;
    this.animator.play('dodgeRoll', { speed: 1.25 });
    this.bus.emit('player:dodged', {});
    return true;
  }

  /** Lose control for `t` seconds. @param {number} t */
  stun(t) {
    if (this.dead || this.godMode || !(t > 0)) return;
    this.stunned = Math.max(this.stunned, t);
    this.dodging = 0;
    this.animator.play('stun');
    this.bus.emit('player:stunned', { time: t });
  }

  /** Move at walking pace for `t` seconds. @param {number} t */
  slow(t) {
    if (this.dead || this.godMode) return;
    this.slowed = Math.max(this.slowed, t);
  }

  /** Clear combat states (respawn, region change, duel end). */
  clearCombat() {
    this.stunned = this.slowed = this.dodging = this._dodgeCd = 0;
    this.animator.stop('stun');
  }

  _computeLocomotion() {
    const c = this.controller;
    if (this.dead) return 'dead';
    if (c.noclip) return 'fly';
    if (c.swimming) return this.speed > 0.3 ? 'swim' : 'tread';
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
    if (this.nonLethal && this.health <= 0) {
      this.health = 1;
      this._pain = PAIN_SECONDS;
      this.bus.emit('player:damaged', { amount: dmg, source, health: this.health, max: this.maxHealth });
      this.bus.emit('player:yielded', { source });
      return;
    }
    this._pain = PAIN_SECONDS;
    this.animator.play('hit');
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
    this.animator.stopAll();
    this.animator.play('collapse');
    this.face.blinkLock = 1;
    this.bus.emit('player:died', { cause });
  }

  respawn() {
    this.dead = false;
    this.health = this.maxHealth;
    this.invulnerable = PLAYER.invulnerableAfterRespawn;
    this.clearCombat();
    this.controller.wantCrouch = false;
    this.controller.height = PLAYER.height;
    this.controller.crouching = false;
    this.teleport(this.spawnPoint, this.spawnYaw);
    this.animator.stop('collapse');
    this.face.blinkLock = 0;
    this.bus.emit('player:respawned', { position: this.spawnPoint.clone() });
  }

  // --------------------------------------------------------------- render

  /**
   * Update the avatar for rendering.
   * @param {number} dt frame delta
   * @param {number} alpha interpolation factor
   * @param {number} cameraDistance used to fade the avatar when the camera is close
   * @param {{camera?:THREE.Camera, wind?:THREE.Vector3}} [env]
   */
  render(dt, alpha, cameraDistance, env = {}) {
    const c = this.controller;
    c.getInterpolatedPosition(alpha, _vis);
    _vis.y += c.stepOffset;
    this.visualPosition.copy(_vis);
    const root = this.character.root;
    root.position.copy(_vis);
    root.rotation.set(0, this._prevYaw + angleDelta(this._prevYaw, this.yaw) * alpha, 0);

    if (this._pain > 0) this._pain -= dt;
    this.face.setExpression(this.dead ? 'pain' : this._pain > 0 ? 'pain' : 'neutral');
    this.face.update(dt);
    this.animator.update(dt, {
      speed: this.dead ? 0 : this.speed,
      grounded: c.grounded || c.noclip,
      vy: c.velocity.y,
      crouching: c.crouching,
      aiming: this.intent.aim && !this.dead,
      turnRate: this._turnRate,
      accel: this._accel,
      climb: this._climb,
      sliding: c.onSteepSlope && !c.grounded && !c.swimming,
      swimming: c.swimming && !this.dead,
      lookTarget: this.dead ? null : this.lookTarget,
      aimTarget: this.aimTarget,
      ground: c.noclip ? null : this._ground,
    });
    this.character.update(dt, { camera: env.camera, wind: env.wind, groundY: c.grounded ? _vis.y : -Infinity });
    const fade = THREE.MathUtils.clamp((cameraDistance - FADE.start) / FADE.range, 0, 1);
    this.character.setOpacity(fade);
  }

  /**
   * Replace the avatar (character creator, loading a save).
   * @param {any} data character description
   */
  setCharacter(data) {
    this.character.build(data);
    this.animator.stopAll();
    this.character.resetCloth();
    this.bus.emit('player:rebuilt', { character: this.character });
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
