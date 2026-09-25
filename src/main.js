/**
 * @file main.js — bootstraps every system and runs the game loop:
 * fixed 1/60 s physics steps, variable-rate rendering with interpolation.
 *
 * Game flow (StateMachine): boot → creator → play ⇄ pause, play → cinematic → play,
 * boot / play → gallery, any → loading (region change) → play.
 */
import * as THREE from 'three';
import { GAME } from './data/game.js';
import { CAMERA } from './data/camera.js';
import { PLAYER } from './data/physics.js';
import { QUALITY_PRESETS } from './data/quality.js';
import { LAKE } from './data/grounds.js';
import { bus } from './core/EventBus.js';
import { StateMachine } from './core/StateMachine.js';
import { Settings } from './core/Settings.js';
import { SaveSystem } from './core/SaveSystem.js';
import { Input } from './core/Input.js';
import { Time } from './core/Time.js';
import { AssetCache } from './core/AssetCache.js';
import { Debug } from './core/Debug.js';
import { Renderer } from './render/Renderer.js';
import { Atmosphere } from './render/Atmosphere.js';
import { GameClock } from './world/GameClock.js';
import { ThirdPersonCamera } from './render/ThirdPersonCamera.js';
import { CinematicCamera } from './render/CinematicCamera.js';
import { DebugDraw } from './render/DebugDraw.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { TriggerSystem } from './physics/TriggerSystem.js';
import { Player } from './gameplay/Player.js';
import { RegionManager } from './world/RegionManager.js';
import { HUD } from './ui/HUD.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { GalleryPanel } from './ui/GalleryPanel.js';
import { TextureFactory } from './procgen/textures/TextureFactory.js';
import { MaterialLibrary } from './render/MaterialLibrary.js';
import { MaterialGallery } from './world/MaterialGallery.js';
import { TEXTURE_GEN_VERSION, TEXTURE_CACHE_DB, MAX_TEXTURE_WORKERS } from './data/materials.js';
import { CHARACTER_MATERIAL_KEYS } from './procgen/characters/Character.js';
import { sanitizeCharacter, randomAppearance, randomName } from './procgen/characters/Appearance.js';
import { describeWand, wandStats } from './procgen/characters/WandGenerator.js';
import { HOUSES } from './data/character.js';
import { CreatorStage } from './world/CreatorStage.js';
import { CharacterCreator } from './ui/CharacterCreator.js';

/** Boot progress-bar ranges for each loading stage. */
const BOOT_STAGES = Object.freeze({ textures: [0.12, 0.3], region: [0.36, 0.86] });
/** Save layout migrations: version → upgrade to the next version. */
const SAVE_MIGRATIONS = Object.freeze({
  // v2 adds the created character (older saves get the default student).
  1: (d) => ({ ...d, character: null }),
});
/** How far the head / wand targets are projected along the view (m). */
const VIEW_TARGET = Object.freeze({ look: 10, aim: 60, studentLook: 6, studentCone: 0.75 });
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const _v = new THREE.Vector3();
const _focus = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _look = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();
const _wind = new THREE.Vector3();
const _head = new THREE.Vector3();
const _hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };

class Game {
  constructor() {
    this.bus = bus;
    this.settings = new Settings(bus, GAME.storagePrefix);
    this.saves = new SaveSystem({ prefix: GAME.storagePrefix, version: GAME.saveVersion, slots: GAME.saveSlots }, SAVE_MIGRATIONS);
    /** The created student (appearance, name, house, outfit, wand). */
    this.characterData = sanitizeCharacter(null);
    this.time = new Time(GAME);
    this.cache = new AssetCache();
    this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
    this.bootEl = document.getElementById('boot');
    this.loadingEl = document.getElementById('loading');
    this.playtime = 0;
    this._autosaveTimer = GAME.autosaveInterval;
    this._hadPointerLock = false;
    this.toggles = { collision: false, noclip: false, god: false, hud: true, skeleton: false, ik: true, cloth: true };
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

    // Procedural materials: generated in workers, cached in IndexedDB.
    this.textureFactory = new TextureFactory(bus, { version: TEXTURE_GEN_VERSION, dbName: TEXTURE_CACHE_DB, maxWorkers: MAX_TEXTURE_WORKERS });
    this.library = new MaterialLibrary({ bus, renderer: this.renderer.renderer, factory: this.textureFactory, size: preset.textureSize });
    const [p0, p1] = BOOT_STAGES.textures;
    const offProgress = bus.on('textures:progress', ({ done, total }) => {
      this._progress(`Dokular üretiliyor… ${done} / ${total}`, p0 + (p1 - p0) * (total ? done / total : 1));
    });
    const t0 = performance.now();
    // Materials every region shares: the student and the flame sprites.
    await this.library.load([...CHARACTER_MATERIAL_KEYS, 'candleFlame'], 'Dokular');
    offProgress();

    // Time of day, sky, lighting, weather and post-processing.
    this.clock = new GameClock(bus);
    this.atmosphere = new Atmosphere({ renderer: this.renderer, scene: this.scene, camera: this.camera, bus, settings: this.settings, library: this.library, clock: this.clock });
    this.atmosphere.initFlames(this.library.acquireTextures('candleFlame').albedo);

    this._progress('Fizik dünyası kuruluyor…', 0.32);
    await nextFrame();
    this.physics = new PhysicsWorld(bus);
    this.triggers = new TriggerSystem(bus);

    const atm = this.atmosphere;
    this.regions = new RegionManager({
      scene: this.scene, physics: this.physics, triggers: this.triggers, bus, preset, library: this.library,
      lights: atm.lights, flames: atm.flames, grading: atm.grading, sky: atm.sky, renderer: this.renderer.renderer,
    });
    const [r0, r1] = BOOT_STAGES.region;
    this.room = await this.regions.load(RegionManager.defaultId, (label, t) => this._progress(label, r0 + (r1 - r0) * t));
    this.textureLoadMs = performance.now() - t0;
    this._applyRegionView();

    this._progress('Karakter hazırlanıyor…', 0.88);
    await nextFrame();
    this.player = new Player({ bus, physics: this.physics, settings: this.settings, scene: this.scene, library: this.library, preset, character: this.characterData });
    // Keep the wand rolled for this student.
    this.characterData.wand = this.player.character.data.wand;
    this.player.waterLevelAt = (x, z) => this.room.waterLevelAt(x, z);
    this.player.setSpawn(this.room.spawn.position, this.room.spawn.yaw);
    this.player.teleport(this.room.spawn.position, this.room.spawn.yaw);
    this.atmosphere.registerNow();
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
      onLoad: async (slot) => {
        if (await this.loadGame(slot)) this.fsm.change('play');
      },
    });
    this.gallery = new MaterialGallery({ renderer: this.renderer, library: this.library, bus });
    this.galleryPanel = new GalleryPanel(document.getElementById('gallery'), {
      gallery: this.gallery,
      library: this.library,
      bus,
      onExit: () => this.fsm.change(this._galleryReturn ?? 'boot'),
      onRegenerate: async () => {
        await this.textureFactory.clearPersistentCache();
        this.hud.notice('Doku önbelleği temizlendi; sonraki açılışta yeniden üretilecek');
      },
    });
    this.creatorStage = new CreatorStage({ renderer: this.renderer, library: this.library, bus });
    this.creator = new CharacterCreator(document.getElementById('creator'), {
      stage: this.creatorStage,
      onDone: (data) => this._finishCreator(data),
      onCancel: () => this.fsm.change(this._creatorReturn ?? 'boot'),
    });
    this.debugDraw = new DebugDraw(this.scene, this.physics, this.triggers);
    this.debug = new Debug(document.getElementById('debug'), bus, this._debugProvider());

    this._spawningStudents = true;
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
        exit: (g, next) => {
          if (next === 'gallery' || next === 'creator') return;
          g.bootEl.classList.add('gone');
          g.hud.setVisible(g.toggles.hud);
          g.cameraRig.blendFromCurrent(1.4);
        },
        update: (g, dt) => {
          const o = g.room.menuOrbit;
          g._menuAngle += dt * o.speed;
          const a = g._menuAngle;
          g.camera.position.set(o.center[0] + Math.sin(a) * o.radius, o.center[1] + o.height, o.center[2] + Math.cos(a) * o.radius);
          g.camera.lookAt(_v.fromArray(o.look));
        },
      },
      loading: {
        enter: (g, _prev, label) => {
          g.input.gameplayEnabled = false;
          g.input.clearAll();
          g.input.exitPointerLock();
          g.hud.setVisible(false);
          g.pauseMenu.close();
          g.loadingEl.querySelector('.loading-title').textContent = label ?? '';
          g._loadingProgress('', 0);
          g.loadingEl.classList.add('show');
        },
        exit: (g) => {
          g.loadingEl.classList.remove('show');
          g.hud.setVisible(g.toggles.hud);
        },
      },
      creator: {
        enter: (g, prev, opts = {}) => {
          g._creatorReturn = prev === 'play' || prev === 'pause' ? 'play' : 'boot';
          g._creatorMode = opts.mode ?? 'edit';
          g.input.gameplayEnabled = false;
          g.input.exitPointerLock();
          g.hud.setVisible(false);
          g.bootEl.classList.add('gone');
          const start = opts.mode === 'new' ? { ...g.characterData, appearance: randomAppearance(Math.random), ...randomName(Math.random), wand: null } : g.characterData;
          g.creatorStage.open(start);
          g.creator.show(start, { confirmLabel: opts.mode === 'new' ? 'Maceraya başla' : 'Kaydet' });
        },
        exit: (g, next) => {
          g.creator.hide();
          g.creatorStage.close();
          if (next === 'boot') g.bootEl.classList.remove('gone');
          else {
            g.hud.setVisible(g.toggles.hud);
            g.cameraRig.blendFromCurrent(1.2);
          }
        },
        update: (g, dt) => g.creatorStage.update(dt),
      },
      gallery: {
        enter: async (g, prev) => {
          g._galleryReturn = prev === 'boot' ? 'boot' : 'play';
          g.input.gameplayEnabled = false;
          g.input.exitPointerLock();
          g.hud.setVisible(false);
          g.bootEl.classList.add('gone');
          g.galleryPanel.show();
          // The roof occluder belongs to the game world, not the gallery studio.
          g.library.shared.occ.uOccEnabled.value = 0;
          await g.library.load(g.library.keys, 'Galeri dokuları');
          if (!g.fsm.is('gallery')) return;
          g.gallery.open();
          g.gallery.setLightAngle(0.9);
        },
        exit: (g, next) => {
          g.gallery.close();
          g.galleryPanel.hide();
          if (next === 'boot') g.bootEl.classList.remove('gone');
          else g.hud.setVisible(g.toggles.hud);
        },
        update: (g, dt) => {
          g.gallery.update(dt);
          if (g.input.pressed('pause')) g.fsm.change(g._galleryReturn);
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
    if (input.pressed('quickLoad')) {
      this.loadGame('auto').then((ok) => {
        if (ok && !this.fsm.is('play')) this.fsm.change('play');
      });
    }
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
    bus.on('render:quality', () => this._applyRegionView());
    bus.on('player:swim', ({ swimming }) => {
      if (swimming) this.hud.notice('Yüzüyorsun — zıplama ve çömelme devre dışı');
      this._deepWarned = false;
    });
    bus.on('weather:changed', ({ label }) => this.hud?.notice(`Hava: ${label}`));
    bus.on('player:rebuilt', () => this.atmosphere.registerNow());
    bus.on('room:characterAdded', () => this.atmosphere.registerNow());
    bus.on('trigger:enter', ({ data }) => {
      if (data.cinematic && this.fsm.is('play')) {
        const shot = this.room.cinematics?.[data.cinematic];
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
      btn.addEventListener('click', async () => {
        if (this.regions.loading) return;
        if (btn.dataset.boot === 'gallery') {
          this.fsm.change('gallery');
          return;
        }
        if (btn.dataset.boot === 'new') {
          this.fsm.change('creator', { mode: 'new' });
          return;
        }
        if (btn.dataset.boot === 'continue') await this.loadGame(this.saves.latestSlot());
        this.fsm.change('play');
      });
    }
  }

  // ------------------------------------------------------------- regions

  _loadingProgress(label, t) {
    this.loadingEl.querySelector('.loading-bar i').style.width = `${Math.round(t * 100)}%`;
    this.loadingEl.querySelector('.loading-status').textContent = label;
  }

  /** Camera range and fog density for the active region and quality. */
  _applyRegionView() {
    const preset = this.renderer.preset;
    this.camera.far = this.room.outdoor ? preset.worldDrawDistance : preset.drawDistance;
    this.camera.updateProjectionMatrix();
    this.atmosphere.fogScale = this.room.fogScale ?? 1;
  }

  /**
   * Replace the active region (loading screen) and place the player.
   * Leaves the game in the 'loading' state; the caller picks the next one.
   * @param {string} id
   * @param {{position:THREE.Vector3, yaw:number}} [at] default: the region spawn
   * @returns {Promise<boolean>}
   */
  async switchRegion(id, at) {
    if (this.regions.loading || !RegionManager.has(id)) return false;
    this.cameraRig.releaseLock();
    this.fsm.change('loading', `${RegionManager.list().find((r) => r.id === id).name} yükleniyor…`);
    await nextFrame();
    this.room = await this.regions.load(id, (label, t) => this._loadingProgress(label, t));
    this._applyRegionView();
    this.player.setSpawn(this.room.spawn.position, this.room.spawn.yaw);
    const pos = at?.position ?? this.room.spawn.position;
    const yaw = at?.yaw ?? this.room.spawn.yaw;
    this.player.teleport(pos, yaw);
    this.cameraRig.snapTo(pos, yaw);
    this.room.onTeleport();
    this.debug.setTeleports(this.room.teleports);
    this._spawningStudents = true;
    this.atmosphere.registerNow();
    this.player.character.simulateCloth = this.toggles.cloth;
    return true;
  }

  // ------------------------------------------------------------ creator

  /** @param {any} data character returned by the creator */
  _finishCreator(data) {
    const wand = this.creatorStage.character?.data?.wand ?? null;
    this.characterData = sanitizeCharacter({ ...data, wand });
    this.player.setCharacter(this.characterData);
    this.characterData.wand = this.player.character.data.wand;
    if (this._creatorMode === 'new') {
      this.playtime = 0;
      this.player.teleport(this.room.spawn.position, this.room.spawn.yaw);
      this.cameraRig.snapTo(this.room.spawn.position, this.room.spawn.yaw);
    }
    this.fsm.change('play');
    this.hud.notice(`Hoş geldin, ${this.characterData.firstName}!`);
  }

  /** Point the player's head / wand: lock target, aim point, nearby students or the view. */
  _updateViewTargets() {
    const p = this.player;
    const cam = this.camera;
    cam.getWorldDirection(_dir);
    if (this.cameraRig.getLockPoint(_look)) {
      p.lookTarget = _look;
    } else {
      // Nearest student roughly in front of the player.
      let best = null;
      let bestD = VIEW_TARGET.studentLook;
      _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      for (const st of this.room.students) {
        st.headPoint(_v);
        const d = _v.distanceTo(p.position);
        if (d > bestD) continue;
        _to.subVectors(_v, p.position).setY(0).normalize();
        if (_to.dot(_fwd) < VIEW_TARGET.studentCone) continue;
        best = st;
        bestD = d;
      }
      if (best) p.lookTarget = best.headPoint(_look);
      else p.lookTarget = _look.copy(cam.position).addScaledVector(_dir, VIEW_TARGET.look);
    }
    if (p.intent.aim) {
      const hit = this.physics.raycast(cam.position, _dir, VIEW_TARGET.aim, {}, _hit);
      p.aimTarget = hit ? _aim.copy(hit.point) : _aim.copy(cam.position).addScaledVector(_dir, VIEW_TARGET.aim);
      p.lookTarget = p.aimTarget;
    } else p.aimTarget = null;
  }

  // ----------------------------------------------------------- save/load

  serialize() {
    return {
      region: this.room.id,
      clock: this.clock.serialize(),
      weather: this.atmosphere.weather.serialize(),
      playtime: this.playtime,
      character: this.characterData,
      player: this.player.serialize(),
      camera: { yaw: this.cameraRig.yaw, pitch: this.cameraRig.pitch },
    };
  }

  saveGame(slot, label) {
    const ok = this.saves.save(slot, this.serialize(), label);
    this.hud.notice(ok ? `Kaydedildi: ${slot === 'auto' ? 'otomatik yuva' : `yuva ${slot}`}` : 'Kayıt başarısız (depolama kapalı?)');
    return ok;
  }

  /**
   * @param {string|number|null} slot
   * @returns {Promise<boolean>}
   */
  async loadGame(slot) {
    const env = slot == null ? null : this.saves.load(slot);
    if (!env) {
      this.hud.notice('Kayıt bulunamadı');
      return false;
    }
    const d = env.data;
    const region = RegionManager.has(d.region) ? d.region : RegionManager.defaultId;
    if (region !== this.room.id && !(await this.switchRegion(region))) return false;
    this.playtime = Number(d.playtime) || 0;
    const character = sanitizeCharacter(d.character);
    if (JSON.stringify(character) !== JSON.stringify(this.characterData)) {
      this.characterData = character;
      this.player.setCharacter(character);
      this.characterData.wand = this.player.character.data.wand;
    }
    this.player.deserialize(d.player);
    this.room.onTeleport();
    this.clock.deserialize(d.clock);
    this.atmosphere.weather.deserialize(d.weather);
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
      regions: RegionManager.list(),
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
          Bölge: { Ad: this.room.name, ...(this.room.stats ?? {}) },
          'Zaman ve hava': this.atmosphere.stats,
          Karakter: this._characterStats(),
          Dokular: {
            'Çözünürlük': `${this.library.size} px`,
            'İşçi (worker)': this.textureFactory.stats.workers || 'yok (ana iş parçacığı)',
            'Malzeme / doku seti': `${this.library.stats.materials} / ${this.library.stats.textures}`,
            'Arka planda yükseltilen': this.library.stats.pending,
            'Üretilen / önbellek': `${this.textureFactory.stats.generated} / ${this.textureFactory.stats.cacheHits}`,
            'Açılış yüklemesi': `${fmt(this.textureLoadMs / 1000, 1)} s`,
            Islaklık: fmt(this.library.shared.uWetness.value),
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
          this.room.onTeleport();
        },
        region: async (id) => {
          if (id === this.room.id || !(this.fsm.is('play') || this.fsm.is('pause'))) return;
          if (await this.switchRegion(id)) this.fsm.change('play');
        },
        toggle: (key) => {
          this.toggles[key] = !this.toggles[key];
          if (key === 'collision') this.debugDraw.visible = this.toggles.collision;
          if (key === 'noclip') this.player.controller.noclip = this.toggles.noclip;
          if (key === 'god') this.player.godMode = this.toggles.god;
          if (key === 'hud') this.hud.setVisible(this.toggles.hud);
          if (key === 'skeleton') this._ensureSkeletonHelper();
          if (key === 'ik') {
            this.player.animator.ikEnabled = this.toggles.ik;
            this.player.animator.lookEnabled = this.toggles.ik;
          }
          if (key === 'cloth') {
            this.player.character.simulateCloth = this.toggles.cloth;
            for (const st of this.room.students) st.character.simulateCloth = this.toggles.cloth;
          }
        },
        timeScale: (v) => {
          this.time.scale = v;
        },
        cinematic: () => {
          const shot = Object.values(this.room.cinematics ?? {})[0];
          if (this.fsm.is('play') && shot) this.fsm.change('cinematic', shot);
        },
        damage: () => this.player.damage(25, 'debug', true),
        heal: () => this.player.heal(this.player.maxHealth),
        resetProps: () => this.physics.resetAllDynamics(),
        hitStop: () => this.time.hitStop(0.25, 0.05),
        shake: () => this.cameraRig.addTrauma(0.8),
        gallery: () => this.fsm.change('gallery'),
        setHour: (h) => this.clock.setHour(h),
        timeSpeed: (v) => {
          this.clock.speed = v;
        },
        weather: (type) => {
          this.atmosphere.weather.auto = false;
          this.atmosphere.weather.set(type);
        },
        weatherAuto: () => {
          this.atmosphere.weather.auto = true;
          this.atmosphere.weather.roll();
        },
        strike: () => this.atmosphere.weather.strike(400),
        anim: (name, loop) => {
          const a = this.player.animator;
          if (loop && a.isPlaying(name)) a.stop(name);
          else a.play(name, { loop });
        },
        expression: (name) => this.player.face.setExpression(name),
        say: () => this.player.face.say(`Merhaba, ben ${this.characterData.firstName}.`),
        house: (h) => this._editCharacter({ house: h }),
        outfit: () => this._editCharacter({ outfit: this.characterData.outfit === 'uniform' ? 'quidditch' : 'uniform' }),
        randomCharacter: () => this._editCharacter({ appearance: randomAppearance(Math.random), ...randomName(Math.random) }),
        editCharacter: () => {
          if (this.fsm.is('play') || this.fsm.is('pause')) this.fsm.change('creator', { mode: 'edit' });
        },
      },
    };
  }

  /** Apply a partial change to the player's character (debug). */
  _editCharacter(patch) {
    this.characterData = sanitizeCharacter({ ...this.characterData, ...patch });
    this.player.setCharacter(this.characterData);
    this.characterData.wand = this.player.character.data.wand;
    this.player.character.simulateCloth = this.toggles.cloth;
    this._ensureSkeletonHelper();
  }

  _ensureSkeletonHelper() {
    if (this.skeletonHelper) {
      this.scene.remove(this.skeletonHelper);
      this.skeletonHelper.dispose();
      this.skeletonHelper = null;
    }
    if (!this.toggles.skeleton) return;
    this.skeletonHelper = new THREE.SkeletonHelper(this.player.character.root);
    this.skeletonHelper.material.depthTest = false;
    this.skeletonHelper.renderOrder = 10;
    this.scene.add(this.skeletonHelper);
  }

  _characterStats() {
    const c = this.player.character;
    const st = c.stats;
    const a = this.player.animator.summary;
    const d = this.characterData;
    const ws = wandStats(d.wand);
    const pct = (x) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
    return {
      Ad: `${d.firstName} ${d.lastName} · ${HOUSES[d.house].label}`,
      Asa: describeWand(d.wand),
      'Asa etkisi': `güç ${pct(ws.power)} · kontrol ${pct(ws.control)} · hız ${pct(ws.speed)} · odak ${pct(ws.focus)}`,
      'Kemik / üçgen': `${st.bones} / ${st.triangles.toLocaleString('tr-TR')}`,
      'Kumaş parçacığı': st.particles,
      'Üretim süresi': `${st.buildMs.toFixed(0)} ms`,
      Animasyon: `${a.locomotion} · faz ${a.phase.toFixed(2)} · ${a.actions}`,
      IK: `${a.ik} · kalça ${(a.hipsDrop * 100).toFixed(1)} cm`,
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
    // Background students are generated one per frame after boot.
    const busy = this.fsm.is('creator') || this.fsm.is('gallery') || this.fsm.is('loading');
    if (this._spawningStudents && !busy) this._spawningStudents = this.room.spawnNextStudent();
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
    this.library.update(time.dt);
    if (this.fsm.is('gallery')) {
      if (this.gallery.active) this.gallery.render();
    } else if (this.fsm.is('creator')) {
      if (this.creatorStage.active) this.creatorStage.render();
    } else if (!this.fsm.is('loading')) {
      // Game time runs everywhere except in menus.
      const gameHours = this.fsm.is('pause') ? 0 : this.clock.update(time.dt);
      this.lateUpdate(time.unscaledDt, alpha);
      this.atmosphere.update(time.unscaledDt, gameHours, _focus.copy(this.player.visualPosition).setY(this.player.visualPosition.y + 1.5));
      this.hud.setClock(`${this.clock.format()} · ${this.atmosphere.weather.label}`);
      this.atmosphere.render();
    }
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
    if (c.swimming && !this._deepWarned && this.room.waterDepth(c.position.x, c.position.z) > LAKE.deepWarning) {
      this._deepWarned = true;
      this.hud.toast('Çok derin sulardasın — Kara Göl\'de fazla açılma, kıyıya dön!');
    }

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
    const w = this.atmosphere.weather.wind;
    _wind.set(w.x, 0, w.y);
    if (!this.fsm.is('boot')) this._updateViewTargets();
    player.render(dt, alpha, this.fsm.is('boot') ? 10 : this.cameraRig.distance, { camera: this.camera, wind: _wind });
    _head.copy(player.visualPosition).setY(player.visualPosition.y + player.character.height * 0.93);
    this.room.updateCharacters(dt, { camera: this.camera, player: player.visualPosition, playerHead: _head, wind: _wind });
    this.physics.syncVisuals(alpha);
    if (this.skeletonHelper) this.skeletonHelper.visible = this.toggles.skeleton;

    if (this.fsm.is('cinematic')) this.cinematic.update(dt);
    else if (!this.fsm.is('boot')) {
      this.cameraRig.update(dt, player.visualPosition, { crouching: player.controller.crouching, speed: player.speed });
    }

    this.room.render(this.time.elapsed, this.atmosphere.night);
    this.room.frame(dt, this.camera, { night: this.atmosphere.night, hour: this.clock.hour, wind: this.atmosphere.weather.wind });
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
