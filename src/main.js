/**
 * @file main.js — bootstraps every system and runs the game loop:
 * fixed 1/60 s physics steps, variable-rate rendering with interpolation.
 *
 * Game flow (StateMachine): boot → play ⇄ pause, play → cinematic → play.
 */
import * as THREE from 'three';
import { GAME } from './data/game.js';
import { CAMERA } from './data/camera.js';
import { PLAYER } from './data/physics.js';
import { QUALITY_PRESETS } from './data/quality.js';
import { TEST_ROOM } from './data/testRoom.js';
import { bus } from './core/EventBus.js';
import { StateMachine } from './core/StateMachine.js';
import { Settings } from './core/Settings.js';
import { SaveSystem } from './core/SaveSystem.js';
import { Input } from './core/Input.js';
import { Time } from './core/Time.js';
import { AssetCache } from './core/AssetCache.js';
import { Debug } from './core/Debug.js';
import { Renderer } from './render/Renderer.js';
import { Sky } from './render/Sky.js';
import { SceneLighting } from './render/SceneLighting.js';
import { ThirdPersonCamera } from './render/ThirdPersonCamera.js';
import { CinematicCamera } from './render/CinematicCamera.js';
import { DebugDraw } from './render/DebugDraw.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { TriggerSystem } from './physics/TriggerSystem.js';
import { Player } from './gameplay/Player.js';
import { TestRoom } from './world/TestRoom.js';
import { HUD } from './ui/HUD.js';
import { PauseMenu } from './ui/PauseMenu.js';

const MENU_ORBIT = Object.freeze({ radius: 46, height: 19, speed: 0.045, look: [0, 3, -6] });
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const _v = new THREE.Vector3();

class Game {
  constructor() {
    this.bus = bus;
    this.settings = new Settings(bus, GAME.storagePrefix);
    this.saves = new SaveSystem({ prefix: GAME.storagePrefix, version: GAME.saveVersion, slots: GAME.saveSlots });
    this.time = new Time(GAME);
    this.cache = new AssetCache();
    this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
    this.bootEl = document.getElementById('boot');
    this.playtime = 0;
    this._autosaveTimer = GAME.autosaveInterval;
    this._hadPointerLock = false;
    this.toggles = { collision: false, noclip: false, god: false, hud: true };
    this._loop = (t) => this.frame(t);
  }

  _progress(label, t) {
    const bar = document.querySelector('.boot-progress i');
    const txt = document.querySelector('.boot-status');
    if (bar) bar.style.width = `${Math.round(t * 100)}%`;
    if (txt) txt.textContent = label;
  }

  async init() {
    this._progress('Grafik motoru hazırlanıyor…', 0.1);
    await nextFrame();
    this.renderer = new Renderer(this.canvas, this.settings, bus);
    const preset = this.renderer.preset;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), this.renderer.aspect, CAMERA.near, preset.drawDistance);
    this.input = new Input(bus, this.canvas, this.settings);

    const env = TEST_ROOM.environment;
    this.sky = new Sky(env.sky);
    this.scene.add(this.sky.mesh);
    this.scene.fog = new THREE.FogExp2(env.fog.color, env.fog.density * preset.fogDensityScale);
    this.lighting = new SceneLighting(this.scene, bus, env.lighting, preset);
    this.sky.setSunDirection(this.lighting.sunDir);

    this._progress('Fizik dünyası kuruluyor…', 0.3);
    await nextFrame();
    this.physics = new PhysicsWorld(bus);
    this.triggers = new TriggerSystem(bus);

    this._progress('Test salonu inşa ediliyor…', 0.5);
    await nextFrame();
    this.room = new TestRoom({ scene: this.scene, physics: this.physics, triggers: this.triggers, bus, preset }, TEST_ROOM).build();

    this._progress('Karakter hazırlanıyor…', 0.75);
    await nextFrame();
    this.player = new Player({ bus, physics: this.physics, settings: this.settings, scene: this.scene });
    this.player.setSpawn(this.room.spawn.position, this.room.spawn.yaw);
    this.player.teleport(this.room.spawn.position, this.room.spawn.yaw);
    this.cameraRig = new ThirdPersonCamera(this.camera, this.physics, this.settings, bus);
    this.cameraRig.snapTo(this.room.spawn.position, this.room.spawn.yaw);
    this.cinematic = new CinematicCamera(this.camera, bus);

    this._progress('Arayüz yükleniyor…', 0.9);
    await nextFrame();
    this.hud = new HUD(document.getElementById('hud'), bus, this.input);
    this.pauseMenu = new PauseMenu(document.getElementById('menu'), {
      settings: this.settings,
      input: this.input,
      saves: this.saves,
      onResume: () => this.fsm.change('play'),
      onSave: (slot) => this.saveGame(slot, `Yuva ${slot}`),
      onLoad: (slot) => {
        if (this.loadGame(slot)) this.fsm.change('play');
      },
    });
    this.debugDraw = new DebugDraw(this.scene, this.physics, this.triggers);
    this.debug = new Debug(document.getElementById('debug'), bus, this._debugProvider());

    this._wireEvents();
    this.fsm = new StateMachine(this, this._states(), (from, to) => bus.emit('game:state', { from, to }));
    this._progress('Hazır', 1);
    this.fsm.change('boot');
    requestAnimationFrame(this._loop);
  }

  // ------------------------------------------------------------- states

  _states() {
    return {
      boot: {
        enter: (g) => {
          g.input.gameplayEnabled = false;
          g.hud.setVisible(false);
          g.bootEl.classList.add('ready');
          const hasSave = g.saves.latestSlot() !== null;
          g.bootEl.querySelector('[data-boot="continue"]').toggleAttribute('hidden', !hasSave);
          g._menuAngle = 0;
        },
        exit: (g) => {
          g.bootEl.classList.add('gone');
          g.hud.setVisible(g.toggles.hud);
          g.cameraRig.blendFromCurrent(1.4);
        },
        update: (g, dt) => {
          g._menuAngle += dt * MENU_ORBIT.speed;
          const a = g._menuAngle;
          g.camera.position.set(Math.sin(a) * MENU_ORBIT.radius, MENU_ORBIT.height, Math.cos(a) * MENU_ORBIT.radius);
          g.camera.lookAt(_v.fromArray(MENU_ORBIT.look));
        },
      },
      play: {
        enter: (g) => {
          g.input.gameplayEnabled = true;
          g.pauseMenu.close();
          g.input.requestPointerLock();
        },
        update: (g, dt) => g._updatePlay(dt),
      },
      pause: {
        enter: (g) => {
          g.input.gameplayEnabled = false;
          g.input.clearAll();
          g.input.exitPointerLock();
          g.pauseMenu.open();
        },
        exit: (g) => g.pauseMenu.close(),
        update: (g) => {
          if (g.input.pressed('pause') && !g.input.isRebinding) g.fsm.change('play');
        },
      },
      cinematic: {
        enter: (g, _prev, shot) => {
          g.input.gameplayEnabled = false;
          g.player.intent.move.set(0, 0, 0);
          g.player.intent.moveMag = 0;
          g.cameraRig.releaseLock();
          g.cinematic.play(shot);
          g.hud.prompt('Boşluk / Esc: atla');
        },
        exit: (g) => {
          g.hud.prompt('');
          g.cameraRig.blendFromCurrent(CAMERA.cinematic.blendOut);
        },
        update: (g) => {
          g.input.gameplayEnabled = true; // read skip keys only
          const skip = g.input.pressed('jump') || g.input.pressed('pause');
          g.input.gameplayEnabled = false;
          if (skip) g.cinematic.skip();
        },
      },
    };
  }

  _updatePlay(dt) {
    const input = this.input;
    if (input.pressed('pause')) {
      this.fsm.change('pause');
      return;
    }
    if (input.pressed('help')) this.hud.toggleHelp();
    if (input.pressed('quickSave')) this.saveGame('auto', 'Hızlı kayıt');
    if (input.pressed('quickLoad')) this.loadGame('auto');
    if (input.pressed('shoulderSwap')) this.cameraRig.swapShoulder();
    if (input.pressed('lockOn') && !this.player.dead) this.cameraRig.toggleLock(this.room.lockTargets, this.player.position);

    this.cameraRig.handleLook(input, this.time.unscaledDt, this.room.lockTargets, this.player.position);
    this.player.gatherInput(input, this.cameraRig);
    this.cameraRig.aiming = this.player.intent.aim && !this.player.dead;
    this.cameraRig.sprinting = this.player.intent.sprint;
  }

  // ------------------------------------------------------------- events

  _wireEvents() {
    bus.on('render:resize', ({ width, height }) => {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });
    bus.on('render:quality', ({ preset }) => {
      this.camera.far = preset.drawDistance;
      this.camera.updateProjectionMatrix();
      this.scene.fog.density = TEST_ROOM.environment.fog.density * preset.fogDensityScale;
    });
    bus.on('trigger:enter', ({ data }) => {
      if (data.cinematic && this.fsm.is('play')) {
        const shot = this.room.cinematics[data.cinematic];
        if (shot) this.fsm.change('cinematic', shot);
      } else if (data.message) this.hud.toast(data.message);
    });
    bus.on('cinematic:end', () => {
      if (this.fsm.is('cinematic')) this.fsm.change('play');
    });
    bus.on('player:landed', ({ fallHeight }) => {
      if (fallHeight > PLAYER.fallDamage.shakeHeight) this.cameraRig.addTrauma(Math.min(0.9, fallHeight / 14));
    });
    bus.on('player:damaged', ({ amount }) => {
      this.cameraRig.addTrauma(Math.min(0.6, amount / 60));
      if (amount >= 20) this.time.hitStop(0.06, 0.1);
    });
    bus.on('player:died', () => this.cameraRig.releaseLock());
    bus.on('player:respawned', ({ position }) => this.cameraRig.snapTo(position, this.player.yaw));
    bus.on('input:pointerLock', ({ locked }) => {
      if (locked) this._hadPointerLock = true;
      else if (this.fsm.is('play') && this._hadPointerLock) this.fsm.change('pause');
    });
    this.canvas.addEventListener('click', () => {
      if (this.fsm.is('play')) this.input.requestPointerLock();
    });

    for (const btn of this.bootEl.querySelectorAll('[data-boot]')) {
      btn.addEventListener('click', () => {
        if (btn.dataset.boot === 'continue') this.loadGame(this.saves.latestSlot());
        this.fsm.change('play');
      });
    }
  }

  // ----------------------------------------------------------- save/load

  serialize() {
    return {
      region: TEST_ROOM.id,
      playtime: this.playtime,
      player: this.player.serialize(),
      camera: { yaw: this.cameraRig.yaw, pitch: this.cameraRig.pitch },
    };
  }

  saveGame(slot, label) {
    const ok = this.saves.save(slot, this.serialize(), label);
    this.hud.notice(ok ? `Kaydedildi: ${slot === 'auto' ? 'otomatik yuva' : `yuva ${slot}`}` : 'Kayıt başarısız (depolama kapalı?)');
    return ok;
  }

  loadGame(slot) {
    const env = slot == null ? null : this.saves.load(slot);
    if (!env) {
      this.hud.notice('Kayıt bulunamadı');
      return false;
    }
    const d = env.data;
    this.playtime = Number(d.playtime) || 0;
    this.player.deserialize(d.player);
    this.cameraRig.snapTo(this.player.position, Number(d.camera?.yaw) || this.player.yaw, Number(d.camera?.pitch) || CAMERA.defaultPitch);
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.notice('Kayıt yüklendi');
    return true;
  }

  // ----------------------------------------------------------------- debug

  _debugProvider() {
    const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
    return {
      teleports: this.room.teleports,
      getToggles: () => ({ ...this.toggles }),
      getEntities: () => this.room.debugEntities,
      getSections: () => {
        const r = this.renderer.stats;
        const p = this.physics.stats;
        const c = this.player.controller;
        const mem = /** @type {any} */ (performance).memory;
        return {
          Performans: {
            FPS: fmt(this.time.fps, 0),
            'Kare (ms)': `${fmt(this.time.frameMs, 1)} / en kötü ${fmt(this.time.worstFrameMs, 1)}`,
            'Çizim çağrısı': r.calls,
            Üçgen: r.triangles.toLocaleString('tr-TR'),
            'Geometri / doku': `${r.geometries} / ${r.textures}`,
            Shader: r.programs,
            'Piksel oranı': fmt(r.pixelRatio),
            Bellek: mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : 'desteklenmiyor',
            Kalite: QUALITY_PRESETS[this.renderer.quality].label,
          },
          Fizik: {
            'Adım (ms)': fmt(p.stepMs, 2),
            'Statik üçgen': p.staticTriangles,
            'Izgara hücresi': p.cells,
            'Dinamik (uyanık)': `${p.dynamics} (${p.awake})`,
            Kinematik: p.kinematics,
          },
          Oyuncu: {
            Durum: `${this.player.locomotion}${c.crouching ? ' · çömelik' : ''}`,
            Konum: `${fmt(c.position.x)} ${fmt(c.position.y)} ${fmt(c.position.z)}`,
            Hız: `${fmt(this.player.speed)} m/s · dikey ${fmt(c.velocity.y)}`,
            Zemin: c.grounded ? `evet (${c.groundCollider?.name ?? '?'} · ${fmt((Math.acos(c.groundNormal.y) * 180) / Math.PI, 0)}°)` : 'hayır',
            Can: `${Math.ceil(this.player.health)} / ${this.player.maxHealth}`,
            Kamera: `mesafe ${fmt(this.cameraRig.collisionDistance)} · kilit ${this.cameraRig.lockTarget?.name ?? 'yok'}`,
            'Oyun durumu': this.fsm.current,
          },
        };
      },
      actions: {
        teleport: (i) => {
          const t = this.room.teleports[i];
          if (!t) return;
          this.player.teleport(t.position, t.yaw);
          this.cameraRig.snapTo(t.position, t.yaw);
        },
        toggle: (key) => {
          this.toggles[key] = !this.toggles[key];
          if (key === 'collision') this.debugDraw.visible = this.toggles.collision;
          if (key === 'noclip') this.player.controller.noclip = this.toggles.noclip;
          if (key === 'god') this.player.godMode = this.toggles.god;
          if (key === 'hud') this.hud.setVisible(this.toggles.hud);
        },
        timeScale: (v) => {
          this.time.scale = v;
        },
        cinematic: () => {
          if (this.fsm.is('play')) this.fsm.change('cinematic', this.room.cinematics.tour);
        },
        damage: () => this.player.damage(25, 'debug', true),
        heal: () => this.player.heal(this.player.maxHealth),
        resetProps: () => this.physics.resetAllDynamics(),
        hitStop: () => this.time.hitStop(0.25, 0.05),
        shake: () => this.cameraRig.addTrauma(0.8),
      },
    };
  }

  // ------------------------------------------------------------------ loop

  /** @param {number} now */
  frame(now) {
    requestAnimationFrame(this._loop);
    const time = this.time;
    time.tick(now);
    this.input.update();

    if (this.input.pressed('debug')) this.debug.toggle();
    this.fsm.update(time.unscaledDt);

    const simulate = this.fsm.is('play') || this.fsm.is('cinematic');
    if (simulate) {
      let steps = 0;
      while (time.consumeStep(steps)) {
        this.fixedUpdate(time.fixedStep);
        steps++;
      }
    } else {
      time.accumulator = Math.max(0, time.accumulator - time.dt);
    }
    const alpha = time.computeAlpha();
    this.lateUpdate(time.unscaledDt, alpha);
    this.renderer.render(this.scene, this.camera);
    this.debug.update(time.unscaledDt * 1000, time.unscaledDt);
    this.input.endFrame();
  }

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    const player = this.player;
    this.room.fixedUpdate(dt, player.position);

    const lock = this.cameraRig.lockTarget;
    if (player.intent.aim) player.faceYaw = this.cameraRig.yaw;
    else if (lock) {
      lock.getLockPoint(_v).sub(player.position);
      player.faceYaw = Math.atan2(-_v.x, -_v.z);
    } else player.faceYaw = null;

    player.fixedUpdate(dt);
    const c = player.controller;
    this.physics.syncPlayerProxy(c.position, c.velocity, c.radius, c.height);
    this.physics.step(dt);
    this.triggers.update(c.position, c.height, c.radius);

    this.playtime += dt;
    if (this.fsm.is('play')) {
      this._autosaveTimer -= dt;
      if (this._autosaveTimer <= 0 && !player.dead) {
        this._autosaveTimer = GAME.autosaveInterval;
        this.saves.save('auto', this.serialize(), 'Otomatik');
      }
    }
  }

  /**
   * @param {number} dt real frame delta
   * @param {number} alpha
   */
  lateUpdate(dt, alpha) {
    const player = this.player;
    player.render(dt, alpha, this.fsm.is('boot') ? 10 : this.cameraRig.distance);
    this.physics.syncVisuals(alpha);

    if (this.fsm.is('cinematic')) this.cinematic.update(dt);
    else if (!this.fsm.is('boot')) {
      this.cameraRig.update(dt, player.visualPosition, { crouching: player.controller.crouching, speed: player.speed });
    }

    this.lighting.update(player.visualPosition);
    this.sky.update(this.camera);
    this.room.render(this.time.elapsed);
    this.debugDraw.update(player.controller, player.visualPosition);

    let lockScreen = null;
    if (this.cameraRig.getLockPoint(_v) && !this.fsm.is('cinematic')) {
      _v.project(this.camera);
      if (_v.z < 1) {
        lockScreen = { x: ((_v.x + 1) / 2) * this.renderer.width, y: ((1 - _v.y) / 2) * this.renderer.height };
      }
    }
    const lb = this.fsm.is('cinematic') ? CAMERA.cinematic.letterbox * Math.min(1, this.cinematic.t * 2, (1 - this.cinematic.progress) * this.cinematic.shot.duration * 2) : 0;
    this.hud.update(dt, {
      aiming: this.cameraRig.aimBlend > 0.5 && this.fsm.is('play'),
      lockScreen,
      letterbox: lb,
      showHealth: !this.fsm.is('cinematic'),
    });
  }
}

// --------------------------------------------------------------------- boot

function showFatal(err) {
  console.error(err);
  const el = document.querySelector('.boot-status');
  if (el) el.textContent = `Başlatılamadı: ${err?.message ?? err}. WebGL destekleyen güncel bir tarayıcı gerekli.`;
  document.getElementById('boot')?.classList.add('error');
}

const game = new Game();
game.init().catch(showFatal);
// Exposed for console debugging only.
window.__game = game;
