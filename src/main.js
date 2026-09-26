/**
 * @file main.js — bootstraps every system and runs the game loop:
 * fixed 1/60 s physics steps, variable-rate rendering with interpolation.
 *
 * Game flow (StateMachine): boot → creator → play ⇄ pause, play → cinematic → play,
 * boot / play → gallery, any → loading (region change) → play, play ⇄ choice.
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
import { Interaction } from './gameplay/Interaction.js';
import { SpellTargets } from './gameplay/spells/SpellTargets.js';
import { SpellSystem } from './gameplay/spells/SpellSystem.js';
import { SpellCaster } from './gameplay/spells/SpellCaster.js';
import { SpellHUD } from './ui/SpellHUD.js';
import { EncounterManager } from './gameplay/combat/EncounterManager.js';
import { DuelClub } from './gameplay/combat/DuelClub.js';
import { CombatHUD } from './ui/CombatHUD.js';
import { Inventory } from './gameplay/Inventory.js';
import { BroomFlight } from './gameplay/flight/BroomFlight.js';
import { BroomShop } from './gameplay/flight/BroomShop.js';
import { RaceManager } from './gameplay/flight/RaceManager.js';
import { QuidditchMatch } from './gameplay/flight/QuidditchMatch.js';
import { FlightHUD } from './ui/FlightHUD.js';
import { ECONOMY, BROOMS } from './data/flight.js';
import { Relationships } from './gameplay/social/Relationships.js';
import { SocialManager } from './gameplay/social/SocialManager.js';
import { DialogueUI } from './ui/DialogueUI.js';
import { FriendsPanel } from './ui/FriendsPanel.js';
import { COMPANIONS } from './data/companions.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { MusicDirector } from './audio/MusicDirector.js';
import { Voice } from './audio/Voice.js';
import { SoundDirector } from './audio/SoundDirector.js';
import { FaceAnimator } from './animation/FaceAnimator.js';
import { HousePoints } from './gameplay/story/HousePoints.js';
import { QuestSystem } from './gameplay/story/QuestSystem.js';
import { LessonManager } from './gameplay/story/LessonManager.js';
import { StoryDirector } from './gameplay/story/StoryDirector.js';
import { StoryUI } from './ui/StoryUI.js';
import { LESSONS } from './data/lessons.js';
import { MapState } from './gameplay/MapState.js';
import { MapView } from './ui/MapView.js';
import { Minimap } from './ui/Minimap.js';
import { bakeGrounds } from './world/MapBaker.js';
import { TIPS, SAVES } from './data/ui.js';
import { INTERIOR } from './data/interior.js';
import { GROUND_TELEPORTS } from './data/grounds.js';
import { SPELLS } from './data/spells.js';
import { COMBAT, BOSS } from './data/combat.js';
import { SPELL_WHEEL, MASTERY } from './data/spells.js';
import { describeCode } from './data/input.js';
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
  // v3 adds story, map and richer save metadata (all optional in the data).
  2: (d) => d,
});
/** Strong spell impacts: brief slow motion; spell messages stay this long (s). */
const SPELL_HIT_STOP = Object.freeze({ duration: 0.06, scale: 0.12 });
const SPELL_TOAST = 2.6;
/** Door transitions: seconds of fade before / after the region swap. */
const TRAVEL_FADE = 0.35;
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
    this.saves = new SaveSystem({ prefix: GAME.storagePrefix, version: GAME.saveVersion, slots: GAME.saveSlots, autos: GAME.autoSaves }, SAVE_MIGRATIONS);
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
    /** Persistent world state shared with regions (secrets, doors …); saved. */
    this.worldState = {};
    this.toggles = { collision: false, noclip: false, god: false, hud: true, skeleton: false, ik: true, cloth: true, focus: false, ai: true };
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
    // Sound: the context opens on the first click / key press.
    this.audio = new AudioEngine(bus, this.settings);
    this.music = new MusicDirector(this.audio);
    this.voice = new Voice(this.audio, this.settings);

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
    this.interactions = new Interaction(bus);
    this.spellTargets = new SpellTargets();
    this.spells = new SpellSystem({ bus, physics: this.physics, lights: this.atmosphere.lights, targets: this.spellTargets, scene: this.scene, shared: this.library.shared, time: this.time });

    const atm = this.atmosphere;
    this.regions = new RegionManager({
      scene: this.scene, physics: this.physics, triggers: this.triggers, bus, preset, library: this.library,
      lights: atm.lights, flames: atm.flames, grading: atm.grading, sky: atm.sky, renderer: this.renderer.renderer,
      interactions: this.interactions,
      spells: this.spells,
      spellTargets: this.spellTargets,
      state: this.worldState,
      ui: {
        say: (name, text) => this.hud?.say(name, text),
        toast: (text, duration) => this.hud?.toast(text, duration),
        choose: (title, text, options) => this._choose(title, text, options),
      },
      onExit: (to) => this._travel(to),
    });
    const [r0, r1] = BOOT_STAGES.region;
    this.room = await this.regions.load(RegionManager.defaultId, (label, t) => this._progress(label, r0 + (r1 - r0) * t));
    this.textureLoadMs = performance.now() - t0;
    this._applyRegionView();
    this.spells.setRegion(this.room);

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
    this.spells.setPlayer(this.player);
    this.caster = new SpellCaster({ bus, player: this.player, system: this.spells, physics: this.physics, lights: this.atmosphere.lights, camera: this.camera, cameraRig: this.cameraRig });
    this.cameraRig.snapTo(this.room.spawn.position, this.room.spawn.yaw);
    this.cinematic = new CinematicCamera(this.camera, bus);
    // Enemies, bosses and the Duelling Club.
    this.combat = new EncounterManager({
      ctx: { scene: this.scene, library: this.library, preset }, physics: this.physics, spells: this.spells, caster: this.caster,
      targets: this.spellTargets, bus, player: this.player, interactions: this.interactions, atmosphere: this.atmosphere,
      settings: this.settings, time: this.time, state: this.worldState,
    });
    // Brooms, races and Quidditch.
    this.inventory = new Inventory(bus);
    const particles = { glow: this.spells.glow, smoke: this.spells.smoke };
    this.flight = new BroomFlight({ bus, player: this.player, inventory: this.inventory, scene: this.scene, cameraRig: this.cameraRig, particles });
    this.races = new RaceManager({ bus, player: this.player, flight: this.flight, inventory: this.inventory, physics: this.physics, scene: this.scene, interactions: this.interactions, particles, cameraRig: this.cameraRig });
    this.shop = null;
    this.match = null;
    // Companions and conversations.
    this.relationships = new Relationships(bus);
    this.dialogueUi = new DialogueUI(document.getElementById('hud'));
    this.friendsPanel = new FriendsPanel(document.getElementById('hud'));
    this.social = new SocialManager({
      bus, clock: this.clock, relationships: this.relationships, inventory: this.inventory, player: this.player, physics: this.physics, scene: this.scene,
      library: this.library, preset, spells: this.spells, combat: this.combat, interactions: this.interactions, dialogue: this.dialogueUi, worldState: this.worldState,
      begin: (c) => this._beginDialogue(c), end: () => this._endDialogue(),
      ui: { say: (n, t) => this.hud?.say(n, t), notice: (t) => this.hud?.notice(t), toast: (t, d) => this.hud?.toast(t, d) },
      playerName: () => this.characterData.firstName, camera: this.camera,
    });
    // Story: quests, lessons, the House Cup and the set pieces.
    const storyUi = { say: (n, t) => this.hud?.say(n, t), notice: (t) => this.hud?.notice(t), toast: (t, d) => this.hud?.toast(t, d) };
    this.storyUi = new StoryUI(document.getElementById('hud'), bus);
    this.housePoints = new HousePoints(bus, () => this.characterData.house);
    this.quests = new QuestSystem({
      bus, game: this, inventory: this.inventory, relationships: this.relationships, housePoints: this.housePoints, worldState: this.worldState,
      scene: this.scene, interactions: this.interactions, particles: { glow: this.spells.glow }, ui: storyUi,
    });
    this.lessons = new LessonManager({
      bus, game: this, physics: this.physics, spells: this.spells, caster: this.caster, player: this.player, races: this.races, flight: this.flight,
      housePoints: this.housePoints, clock: this.clock, scene: this.scene, library: this.library, preset, interactions: this.interactions,
      dialogue: this.dialogueUi, begin: (o) => this._beginDialogue(o), end: () => this._endDialogue(), ui: storyUi,
    });
    this.mapState = new MapState(bus);
    this.story = new StoryDirector({ bus, game: this, quests: this.quests, housePoints: this.housePoints, parchment: this.storyUi, ui: storyUi, voice: this.voice });
    this._enterCombatRegion();

    this._progress('Arayüz yükleniyor…', 0.9);
    await nextFrame();
    this.hud = new HUD(document.getElementById('hud'), bus, this.input);
    // HUD rewrites its root: re-attach the overlays created earlier.
    for (const el of [this.dialogueUi.el.root, this.friendsPanel.el, this.storyUi.el.root]) document.getElementById('hud').appendChild(el);
    this.minimap = new Minimap(document.getElementById('hud'));
    this.mapView = new MapView(document.body, { onTravel: (r, n) => this._fastTravel(r, n), onClose: () => this.fsm.change('play') });
    this._bakeMap();
    this._applyUiSettings();
    bus.on('settings:changed', () => this._applyUiSettings());
    bus.on('map:discovered', ({ name, kind }) => {
      if (kind === 'place') this.hud.place(name, 'Keşfedildi');
      else this.hud.notice(`Haritaya işlendi: ${name}`);
    });
    bus.on('quest:completed', ({ name }) => this._autosave(`Görev: ${name}`));
    this.hud.subtitles = this.settings.get('showSubtitles');
    bus.on('settings:changed', ({ key }) => {
      if (key === 'showSubtitles' || key === '*') this.hud.subtitles = this.settings.get('showSubtitles');
      if (key === 'speech') this.voice.hush();
    });
    this.sound = new SoundDirector({ engine: this.audio, music: this.music, voice: this.voice, bus, player: this.player, game: this });
    FaceAnimator.onSay = (character, text, rate) => {
      if (character === this.player.character) return;
      this.voice.speak(character.root.name, text, { pos: character.root.getWorldPosition(new THREE.Vector3()), rate });
    };
    this.spellHud = new SpellHUD(document.getElementById('hud'), bus);
    this.combatHud = new CombatHUD(document.getElementById('hud'), bus);
    this.flightHud = new FlightHUD(document.getElementById('hud'), bus);
    this.pauseMenu = new PauseMenu(document.getElementById('menu'), {
      settings: this.settings,
      input: this.input,
      saves: this.saves,
      onResume: () => this.fsm.change('play'),
      onSave: (slot) => this.saveGame(slot, `Yuva ${slot}`),
      onLoad: async (slot) => {
        this.pauseMenu.close();
        if (await this.loadGame(slot)) this.fsm.change('play');
      },
      onDelete: (slot) => this.saves.delete(slot),
      onExport: (slot) => this._exportSave(slot),
      onImport: (text) => this._importSave(text),
      onMap: () => this.fsm.change('map'),
      onMainMenu: () => this._toMainMenu(),
      onClose: () => this.pauseMenu.close(),
      getProfile: () => this._profileHtml(),
      getFriends: () => this._friendsHtml(),
      getJournal: () => this._journalHtml(),
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
          g.bootEl.classList.remove('gone');
          g.bootEl.classList.add('ready');
          g.bootEl.querySelector('.boot-tip').textContent = `İpucu: ${TIPS[Math.floor(Math.random() * TIPS.length)]}`;
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
          if (g.pauseMenu.visible && g.input.pressed('pause') && !g.input.isRebinding) g.pauseMenu.close();
          const o = g.room.menuOrbit;
          g._menuAngle += dt * o.speed;
          const a = g._menuAngle;
          g.camera.position.set(o.center[0] + Math.sin(a) * o.radius, o.center[1] + o.height, o.center[2] + Math.cos(a) * o.radius);
          g.camera.lookAt(_v.fromArray(o.look));
        },
      },
      map: {
        enter: (g) => {
          g.input.gameplayEnabled = false;
          g.input.clearAll();
          g.input.exitPointerLock();
          g.hud.prompt('');
          g.mapView.show(g._mapSnapshot());
        },
        exit: (g) => g.mapView.close(),
        update: (g, dt) => {
          g.input.gameplayEnabled = true; // read the map key only
          const close = g.input.pressed('map');
          g.input.gameplayEnabled = false;
          if (close || g.input.pressed('pause')) g.fsm.change('play');
          else g.mapView.update(dt, g._mapSnapshot());
        },
      },
      letter: {
        enter: (g) => {
          g.input.gameplayEnabled = false;
          g.input.clearAll();
          g.input.exitPointerLock();
          g.hud.prompt('');
        },
      },
      dialogue: {
        enter: (g) => {
          g.input.gameplayEnabled = false;
          g.input.clearAll();
          g.input.exitPointerLock();
          g.hud.prompt('');
          g._promptLabel = null;
        },
        update: (g) => {
          // The conversation UI handles its own keys; H still shows help.
          if (!g.dialogueUi.isOpen) g.fsm.change('play');
        },
      },
      choice: {
        enter: (g, _prev, c) => {
          g.input.gameplayEnabled = false;
          g.input.clearAll();
          g.input.exitPointerLock();
          g.hud.prompt('');
          g.hud.showChoice(c.title, c.text, c.options, (id) => g._resolveChoice(id));
        },
        exit: (g) => g.hud.hideChoice(),
        update: (g) => {
          if (g.input.pressed('pause')) g._resolveChoice(null);
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
          g.loadingEl.querySelector('.loading-tip').textContent = `İpucu: ${TIPS[Math.floor(Math.random() * TIPS.length)]}`;
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
          g._promptLabel = null;
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
          g.hud.prompt('');
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
    if (input.pressed('quickSave')) this.saveGame('quick', 'Hızlı kayıt');
    if (input.pressed('map')) {
      this.fsm.change('map');
      return;
    }
    if (input.pressed('quickLoad')) {
      this.loadGame('quick').then((ok) => {
        if (ok && !this.fsm.is('play')) this.fsm.change('play');
      });
    }
    if (input.pressed('shoulderSwap')) this.cameraRig.swapShoulder();
    const lockTargets = this._lockTargets();
    if (input.pressed('lockOn') && !this.player.dead) this.cameraRig.toggleLock(lockTargets, this.player.position);
    if (input.pressed('broom')) this.flight.toggle();
    if (input.pressed('friends')) this.friendsPanel.toggle();
    if (input.pressed('journal')) this.storyUi.toggleJournal();
    if (input.pressed('dodge')) {
      if (this.flight.active) this.flight.roll(Math.sign(this.player.intent.axis.x));
      else this._dodge();
    }

    // "Press E" prompt for the nearest door / portrait / object.
    const p = this.player;
    _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const item = p.dead ? null : this.interactions.update(p.position, _fwd);
    const label = item ? `${describeCode(input.bindings.interact?.[0])}: ${this.interactions.label}` : '';
    if (label !== this._promptLabel) {
      this._promptLabel = label;
      this.hud.prompt(label);
    }
    if (item && input.pressed('interact')) this.interactions.trigger();

    // Magic: the wheel and gesture drawing take over the mouse.
    // No casting while stunned or mid-roll.
    const busy = this.player.stunned > 0 || this.player.dodging > 0 || this.flight.active;
    if (busy) this.caster.cancelShield();
    const mouseTaken = busy ? false : this.caster.handleInput(input, this.time.unscaledDt);
    if (!mouseTaken) this.cameraRig.handleLook(input, this.time.unscaledDt, lockTargets, this.player.position);
    this.player.gatherInput(input, this.cameraRig);
    this.cameraRig.aiming = this.player.intent.aim && !this.player.dead;
    this.cameraRig.sprinting = this.player.intent.sprint;
  }

  /** Lock-on candidates: the region's (dummies) and live enemies. */
  _lockTargets() {
    const list = this.room.lockTargets;
    const foes = this.combat.lockTargets;
    return foes.length ? [...list, ...foes] : list;
  }

  /** Dodge roll toward the stick / keys (backwards when idle); costs focus. */
  _dodge() {
    const p = this.player;
    const D = COMBAT.dodge;
    if (!p.canDodge) return;
    if (!this.caster.unlimited && this.caster.focus < D.focus) {
      this.hud.notice('Kaçınmak için yeterli odak yok');
      return;
    }
    if (p.dodge(p.intent.move)) {
      if (!this.caster.unlimited) this.caster.focus -= D.focus;
      this.caster.cancelShield();
    }
  }

  /** Start a conversation: face each other, frame the shot, pause play. */
  _beginDialogue(c) {
    if (!this.fsm.is('play') || this.flight.active || this.player.dead) return false;
    const p = this.player;
    _to.subVectors(c.position, p.position);
    const yaw = Math.atan2(-_to.x, -_to.z);
    p.yaw = yaw;
    c.yaw = yaw + Math.PI;
    this.cameraRig.releaseLock();
    this.cameraRig.yaw = yaw + 0.42;
    this.cameraRig.pitch = -0.08;
    this.fsm.change('dialogue');
    return true;
  }

  _endDialogue() {
    if (this.fsm.is('dialogue')) this.fsm.change('play');
  }

  /** Hook the combat systems to the freshly loaded region. */
  _enterCombatRegion() {
    const room = this.room;
    this.combat.setRegion(room);
    this.duel = room.id === 'castle'
      ? new DuelClub({ mgr: this.combat, room, player: this.player, caster: this.caster, bus, interactions: this.interactions, state: this.worldState, ui: { say: (n, t) => this.hud?.say(n, t) }, cameraRig: this.cameraRig })
      : null;
    // Flight: allowed outdoors; the shop and the pitch live on the grounds.
    this.flight.allowed = !!room.allowFlight;
    this.races.setRegion(room);
    this.social.setRegion(room);
    this.lessons.setRegion(room);
    if (room.id === 'grounds') {
      const heightAt = (x, z) => room.heightAt(x, z);
      this.shop = new BroomShop({
        scene: this.scene, physics: this.physics, library: this.library, preset: this.renderer.preset, bus, interactions: this.interactions, inventory: this.inventory, heightAt,
        choose: (t, x, o) => this._choose(t, x, o), say: (n, t) => this.hud?.say(n, t), notice: (t) => this.hud?.notice(t),
      });
      this.match = new QuidditchMatch({
        bus, player: this.player, flight: this.flight, inventory: this.inventory, scene: this.scene, particles: { glow: this.spells.glow }, cameraRig: this.cameraRig,
        settings: this.settings, heightAt, house: () => this.characterData.house, interactions: this.interactions, busy: () => !!this.races.race,
      });
    }
  }

  _leaveCombatRegion() {
    this.duel?.dispose();
    this.duel = null;
    this.flight.reset();
    this.dialogueUi.close();
    this.social.clear();
    this.lessons.clear();
    this.quests.clearWorld();
    this.races.clear();
    this.shop?.dispose();
    this.shop = null;
    this.match?.dispose();
    this.match = null;
    this.combat.clear();
    this.player.clearCombat();
    this.player.nonLethal = false;
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
    bus.on('spell:impact', ({ strength, hitStop }) => {
      this.cameraRig.addTrauma(strength);
      if (hitStop) this.time.hitStop(SPELL_HIT_STOP.duration, SPELL_HIT_STOP.scale);
    });
    bus.on('spell:message', ({ text }) => this.hud.toast(text, SPELL_TOAST));
    bus.on('spell:damage', ({ pos, amount, color }) => {
      _v.copy(pos).project(this.camera);
      if (_v.z < 1) this.spellHud.number(((_v.x + 1) / 2) * this.renderer.width, ((1 - _v.y) / 2) * this.renderer.height, String(amount), color);
    });
    bus.on('player:damaged', ({ amount }) => {
      this.cameraRig.addTrauma(Math.min(0.6, amount / 60));
      if (amount >= 20) this.time.hitStop(0.06, 0.1);
    });
    bus.on('player:died', () => this.cameraRig.releaseLock());
    bus.on('combat:bossDefeated', ({ enemy }) => {
      const id = Object.keys(BOSS).find((k) => BOSS[k].name === enemy.def.name);
      if (id) (this.worldState.bosses ??= {})[id] = true;
      this.hud.notice(`${enemy.name} yenildi! Orman biraz daha sessiz…`);
    });
    bus.on('combat:killed', ({ enemy }) => {
      if (this.cameraRig.lockTarget === enemy) this.cameraRig.releaseLock();
    });
    bus.on('player:stunned', () => this.cameraRig.addTrauma(0.35));
    // Money and flight feedback.
    bus.on('inventory:galleons', ({ amount, total, reason }) => this.hud.notice(`${amount > 0 ? '+' : ''}${amount} Galleon${reason ? ` · ${reason}` : ''} (kese: ${total})`));
    bus.on('combat:killed', ({ enemy }) => {
      const b = ECONOMY.bounty[enemy.type];
      if (b) this.inventory.earn(b);
    });
    bus.on('duel:result', ({ won }) => won && this.inventory.earn(ECONOMY.duelWin, 'Düello galibiyeti'));
    bus.on('flight:denied', ({ reason }) => this.hud.toast(reason, SPELL_TOAST));
    bus.on('flight:crash', ({ speed }) => this.cameraRig.addTrauma(Math.min(0.9, speed / 30)));
    bus.on('flight:dismounted', ({ reason }) => {
      if (reason === 'crash') this.hud.toast('Süpürgeden düştün!', SPELL_TOAST);
    });
    bus.on('flight:mounted', () => this.cameraRig.releaseLock());
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
        if (btn.dataset.boot === 'load' || btn.dataset.boot === 'settings') {
          this.pauseMenu.open('boot', btn.dataset.boot === 'load' ? 'saves' : 'gameplay');
          return;
        }
        if (btn.dataset.boot === 'continue') await this.loadGame(this.saves.latestSlot());
        this.fsm.change('play');
      });
    }
  }

  // ------------------------------------------------------------- regions

  /**
   * Ask the player to pick an option (Room of Requirement …).
   * @returns {Promise<string|null>}
   */
  _choose(title, text, options) {
    if (!this.fsm.is('play')) return Promise.resolve(null);
    return new Promise((resolve) => {
      this._choiceResolve = resolve;
      this._choiceKeys = (e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= options.length) this._resolveChoice(options[n - 1].id);
      };
      window.addEventListener('keydown', this._choiceKeys);
      this.fsm.change('choice', { title, text, options });
    });
  }

  _resolveChoice(id) {
    const r = this._choiceResolve;
    if (!r) return;
    this._choiceResolve = null;
    window.removeEventListener('keydown', this._choiceKeys);
    this.fsm.change('play');
    r(id);
  }

  /**
   * Walk through a door into another region with a short fade.
   * @param {{region:string, position?:number[], yaw?:number}} to
   */
  async _travel(to) {
    if (this.regions.loading || !this.fsm.is('play')) return;
    this._promptLabel = null;
    this.hud.fadeTo(1);
    await new Promise((r) => setTimeout(r, TRAVEL_FADE * 1000));
    const at = to.position ? { position: new THREE.Vector3().fromArray(to.position), yaw: to.yaw ?? 0 } : undefined;
    if (await this.switchRegion(to.region, at)) this.fsm.change('play');
    this.hud.fadeTo(0);
  }

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
    // Spell effects and enemies hold region bodies and lights: drop them first.
    this._leaveCombatRegion();
    this.spells.clear();
    this.caster.reset();
    this.room = await this.regions.load(id, (label, t) => this._loadingProgress(label, t));
    this.spells.setRegion(this.room);
    this._enterCombatRegion();
    this._bakeMap();
    this._applyRegionView();
    this.player.setSpawn(this.room.spawn.position, this.room.spawn.yaw);
    const pos = at?.position ?? this.room.spawn.position;
    const yaw = at?.yaw ?? this.room.spawn.yaw;
    this.player.teleport(pos, yaw);
    this.cameraRig.snapTo(pos, yaw);
    this.room.onTeleport(pos);
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
      this.inventory.reset();
      this.relationships.reset();
      // A fresh world: forget the previous game's secrets, bosses and duels.
      for (const k of Object.keys(this.worldState)) delete this.worldState[k];
      this.mapState.reset();
      this.caster.xp = {};
      this.player.heal(this.player.maxHealth);
      this.social.setRegion(this.room);
      this.housePoints.reset();
      this.quests.reset();
      this.lessons.deserialize(null);
      // The story takes over: letter → opening flyover → chapter 1.
      this.fsm.change('letter');
      this.story.newGame();
      return;
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
    if (p.intent.aim || this.caster.facing) {
      const hit = this.physics.raycast(cam.position, _dir, VIEW_TARGET.aim, {}, _hit);
      p.aimTarget = hit ? _aim.copy(hit.point) : _aim.copy(cam.position).addScaledVector(_dir, VIEW_TARGET.aim);
      p.lookTarget = p.aimTarget;
    } else p.aimTarget = null;
  }

  // ----------------------------------------------------------- save/load

  serialize() {
    return {
      region: this.room.id,
      world: this.worldState,
      clock: this.clock.serialize(),
      weather: this.atmosphere.weather.serialize(),
      playtime: this.playtime,
      character: this.characterData,
      player: this.player.serialize(),
      spells: this.caster.serialize(),
      inventory: this.inventory.serialize(),
      social: this.relationships.serialize(),
      map: this.mapState.serialize(),
      story: { quests: this.quests.serialize(), house: this.housePoints.serialize(), lessons: this.lessons.serialize(), locked: [...this.caster.locked] },
      camera: { yaw: this.cameraRig.yaw, pitch: this.cameraRig.pitch },
    };
  }

  /**
   * Save to a slot with a thumbnail of the next rendered frame.
   * @returns {Promise<boolean>}
   */
  saveGame(slot, label) {
    return this._withThumb((thumb) => {
      const ok = this.saves.save(slot, this.serialize(), label, this._saveMeta(thumb));
      this.hud.notice(ok ? `Kaydedildi: ${slot === 'quick' ? 'hızlı kayıt' : `yuva ${slot}`}` : 'Kayıt başarısız — depolama dolu ya da kapalı.');
      return ok;
    });
  }

  /** Rotating autosave (timer, quests, region changes). */
  _autosave(label = 'Otomatik') {
    if (this.player.dead || !this.fsm.is('play')) return;
    this._withThumb((thumb) => this.saves.autosave(this.serialize(), label, this._saveMeta(thumb)));
  }

  /** Run `fn(thumb)` once the next frame has rendered (or without a thumbnail after a timeout). */
  _withThumb(fn) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (thumb) => {
        if (done) return;
        done = true;
        this._thumbReqs = this._thumbReqs.filter((f) => f !== finish);
        resolve(fn(thumb));
      };
      (this._thumbReqs ??= []).push(finish);
      setTimeout(() => finish(null), 1500);
    });
  }

  /** Draw the just-rendered frame into a small JPEG. */
  _captureThumb() {
    const [w, h] = SAVES.thumb;
    const c = (this._thumbCanvas ??= Object.assign(document.createElement('canvas'), { width: w, height: h }));
    let url = null;
    try {
      c.getContext('2d').drawImage(this.renderer.renderer.domElement, 0, 0, w, h);
      url = c.toDataURL('image/jpeg', SAVES.thumbQuality);
    } catch {
      url = null;
    }
    for (const f of [...(this._thumbReqs ?? [])]) f(url);
  }

  /** Where the player is, for save cards. */
  _placeName() {
    const room = this.room;
    if (room.id === 'castle') {
      const c = INTERIOR.cells.find((x) => x.id === room.streamer?.playerCell);
      return c ? `Şato · ${c.name}` : 'Şato';
    }
    if (room.id === 'grounds') {
      const p = this.player.position;
      let best = null;
      let bd = 140;
      for (const t of GROUND_TELEPORTS) {
        const d = Math.hypot(p.x - t.pos[0], p.z - t.pos[2]);
        if (d < bd) {
          bd = d;
          best = t.name;
        }
      }
      return best ? `Arazi · ${best}` : 'Hogwarts arazisi';
    }
    return room.name;
  }

  _saveMeta(thumb) {
    const d = this.characterData;
    return {
      place: this._placeName(),
      chapter: this.quests.tracker?.name ?? (this.quests.flags.finished ? 'Hikâye tamamlandı' : ''),
      playtime: this.playtime,
      name: `${d.firstName} ${d.lastName}`,
      house: HOUSES[d.house]?.label ?? '',
      galleons: this.inventory.galleons,
      thumb,
    };
  }

  _exportSave(slot) {
    const text = this.saves.exportSlot(slot);
    if (!text) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `hogwarts-muhurlu-kule-${slot}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  _importSave(text) {
    const ids = this.saves.slotIds.filter((s) => typeof s === 'number');
    const free = this.saves.list().find((m) => m.empty && typeof m.slot === 'number')?.slot ?? ids[0];
    const ok = this.saves.importSlot(free, text);
    this.pauseMenu.status(ok ? `İçe aktarıldı: yuva ${free}` : 'Dosya geçerli bir kayıt değil.');
  }

  /** Back to the title screen (after an autosave). */
  _toMainMenu() {
    this.pauseMenu.close();
    this.fsm.change('play');
    this._autosave('Ana menüye dönüş');
    setTimeout(() => {
      this.flight.reset();
      this.fsm.change('boot');
    }, 60);
  }

  // ----------------------------------------------------------- map & UI

  _bakeMap() {
    if (this._groundsMap || this.room.id !== 'grounds') return;
    this._groundsMap = bakeGrounds(this.room);
    this.mapView.setGrounds(this._groundsMap);
    this.minimap.setGrounds(this._groundsMap);
  }

  _applyUiSettings() {
    const s = this.settings;
    document.documentElement.style.setProperty('--ui-scale', String(s.get('uiScale')));
    this.minimap?.setVisible(s.get('showMinimap'));
  }

  _friendsNearby() {
    const list = [];
    for (const c of this.social.companions.values()) {
      if (c.mode === 'away') continue;
      list.push({ name: c.spec.first, x: c.position.x, y: c.position.y, z: c.position.z, region: this.room.id, color: HOUSES[c.spec.house].secondary });
    }
    return list;
  }

  _mapSnapshot() {
    const p = this.player.position;
    return {
      region: this.room.id,
      player: { x: p.x, y: p.y, z: p.z, yaw: this.player.yaw },
      quest: this.quests.tracker,
      friends: this._friendsNearby(),
      points: { grounds: this.mapState.points('grounds'), castle: this.mapState.points('castle') },
      dangers: { grounds: this.mapState.dangers('grounds'), castle: this.mapState.dangers('castle') },
      block: this.mapState.travelBlock(this),
    };
  }

  /** Fast travel to a discovered place (any region). */
  async _fastTravel(region, name) {
    if (this.mapState.travelBlock(this) || !this.mapState.isKnown(region, name)) return;
    this.fsm.change('play');
    this.hud.fadeTo(1);
    await new Promise((r) => setTimeout(r, 350));
    if (region !== this.room.id && !(await this.switchRegion(region))) {
      this.hud.fadeTo(0);
      return;
    }
    const t = this.room.teleports.find((x) => x.name === name);
    if (t) {
      this.player.teleport(t.position, t.yaw);
      this.cameraRig.snapTo(t.position, t.yaw);
      this.room.onTeleport(t.position);
    }
    if (!this.fsm.is('play')) this.fsm.change('play');
    this.hud.fadeTo(0);
    this.hud.place(name, 'Hızlı yolculuk');
  }

  _profileHtml() {
    const d = this.characterData;
    const inv = this.inventory;
    const ws = wandStats(d.wand);
    const pct = (x) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
    const st = this.housePoints.standings;
    const rank = st.findIndex((h) => h.mine) + 1;
    const spells = SPELL_WHEEL.map((id) => {
      const locked = this.caster.locked.has(id);
      const lvl = locked ? 0 : this.caster.level(id);
      const pips = MASTERY.levels.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      return `<tr><td>${SPELLS[id].name}</td><td>${locked ? '<em>öğrenilmedi</em>' : pips}</td></tr>`;
    }).join('');
    return `
      <dl class="profile">
        <div><dt>Ad</dt><dd>${d.firstName} ${d.lastName}</dd></div>
        <div><dt>Bina</dt><dd>${HOUSES[d.house].label} · Kupada ${rank}. (${this.housePoints.points[this.housePoints.house]} puan)</dd></div>
        <div><dt>Asa</dt><dd>${describeWand(d.wand)}</dd></div>
        <div><dt>Asa etkisi</dt><dd>güç ${pct(ws.power)} · kontrol ${pct(ws.control)} · hız ${pct(ws.speed)} · odak ${pct(ws.focus)}</dd></div>
        <div><dt>Kese</dt><dd>${inv.galleons} Galleon</dd></div>
        <div><dt>Süpürge</dt><dd>${inv.broomSpec.name} (${inv.brooms.length} süpürge)</dd></div>
        <div><dt>Oyun süresi</dt><dd>${Math.floor(this.playtime / 3600)} sa ${String(Math.floor(this.playtime / 60) % 60).padStart(2, '0')} dk</dd></div>
        <div><dt>Hikâye</dt><dd>${this.quests.tracker?.name ?? (this.quests.flags.finished ? 'Tamamlandı' : '—')}</dd></div>
      </dl>
      <h3>Büyü ustalığı</h3><table class="mastery">${spells}</table>`;
  }

  _friendsHtml() {
    return this.social.summary.map((f) => `
      <div class="fr-card" style="--house:${f.color}">
        <div class="fr-top"><b>${f.met ? f.name : '???'}</b><span>${f.house}</span></div>
        <div class="fr-traits">${f.met ? f.traits : 'Henüz tanışmadınız.'}</div>
        <div class="fr-level">${f.level} · ${f.affinity}/100<div class="fr-bar"><i style="transform:scaleX(${f.progress})"></i></div></div>
        <div class="fr-where">${f.where}</div>${f.favour ? `<div class="fr-favour">${f.favour}</div>` : ''}
      </div>`).join('');
  }

  _journalHtml() {
    this.storyUi._renderJournal(this.quests.journal, this.housePoints.standings);
    return this.storyUi.el.cup.outerHTML + this.storyUi.el.quests.outerHTML;
  }

  /** Room / region name banner when the player moves into a new one. */
  _placeBanner() {
    const room = this.room;
    const key = room.id === 'castle' ? room.streamer?.playerCell : room.id;
    if (!key || key === this._lastPlace) return;
    const first = this._lastPlace === undefined;
    this._lastPlace = key;
    if (first || this.fsm.is('cinematic')) return;
    if (room.id === 'castle') {
      const c = INTERIOR.cells.find((x) => x.id === key);
      if (c) this.hud.place(c.name);
    } else this.hud.place(room.name);
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
    // Rebuild the region when it or its persistent state differs from the save.
    const world = d.world && typeof d.world === 'object' ? d.world : {};
    const stateChanged = JSON.stringify(world) !== JSON.stringify(this.worldState);
    if (region !== this.room.id || stateChanged) {
      for (const k of Object.keys(this.worldState)) delete this.worldState[k];
      Object.assign(this.worldState, structuredClone(world));
      if (!(await this.switchRegion(region))) return false;
    }
    this.playtime = Number(d.playtime) || 0;
    const character = sanitizeCharacter(d.character);
    if (JSON.stringify(character) !== JSON.stringify(this.characterData)) {
      this.characterData = character;
      this.player.setCharacter(character);
      this.characterData.wand = this.player.character.data.wand;
    }
    this.player.deserialize(d.player);
    this.caster.deserialize(d.spells);
    this.flight.reset();
    this.inventory.deserialize(d.inventory);
    this.relationships.deserialize(d.social);
    this.mapState.deserialize(d.map);
    if (d.story) {
      this.quests.deserialize(d.story.quests);
      this.housePoints.deserialize(d.story.house);
      this.lessons.deserialize(d.story.lessons);
      this.caster.locked = new Set((d.story.locked ?? []).filter((k) => typeof k === 'string'));
    } else {
      // A save from before the story: start the chapters without the opening.
      this.quests.reset();
      this.housePoints.reset();
      this.lessons.deserialize(null);
      this.caster.locked = new Set();
      this.quests.begin();
    }
    this.social.setRegion(this.room);
    this.room.onTeleport(this.player.position);
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
      getEntities: () => [...(this.room.debugEntities ?? []), ...this.combat.debugEntities, ...this.social.debugEntities],
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
          Hikâye: { ...this.story.stats, ...this.lessons.stats, 'Bina puanları': this.housePoints.standings.map((h) => `${h.label} ${h.points}`).join(' · ') },
          Ses: this.sound.stats,
          Dostlar: { ...this.social.stats, Saat: this.clock.format() },
          Uçuş: { ...this.flight.stats, ...this.races.stats, ...(this.match?.stats ?? {}), Kese: `${this.inventory.galleons} Galleon · süpürgeler: ${this.inventory.brooms.map((b) => BROOMS[b].name).join(', ')}` },
          Savaş: { Zorluk: this.settings.get('difficulty'), ...this.combat.stats, ...(this.duel?.stats ?? {}), 'Oyuncu durumu': `sersem ${fmt(this.player.stunned, 1)} · yavaş ${fmt(this.player.slowed, 1)} · kaçınma ${fmt(this.player.dodging, 2)}` },
          Büyüler: { ...this.caster.stats, 'Mermi / kırık / buz': `${this.spells.stats.projectiles} / ${this.spells.stats.broken} / ${this.spells.stats.floes}`, 'Partikül (toplam)': this.spells.stats.emitted },
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
          this.room.onTeleport(t.position);
        },
        region: async (id) => {
          if (id === this.room.id || !(this.fsm.is('play') || this.fsm.is('pause'))) return;
          if (await this.switchRegion(id)) this.fsm.change('play');
        },
        spell: (id) => this.caster.select(id),
        masterAll: () => {
          for (const id of SPELL_WHEEL) this.caster.xp[id] = MASTERY.levels[MASTERY.levels.length - 1];
        },
        clearSpells: () => this.spells.clear(),
        enemy: (type) => {
          const p = this.player.position;
          _fwd.set(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
          const zone = this.combat.ensureDebugZone(p);
          const at = p.clone().addScaledVector(_fwd, 8);
          at.y = this.combat.groundAt(at.x, at.z, p.y) + 0.05;
          this.combat.spawnEnemy(type, at, zone);
        },
        broom: () => this.flight.toggle(),
        summon: (id) => this.social.summon(id),
        opening: () => {
          if (!this.fsm.is('play')) return;
          this.fsm.change('letter');
          this.story.newGame();
        },
        questNext: () => {
          const id = this.quests.tracker?.id;
          if (id) this.quests.advance(id);
        },
        toFinale: () => {
          if (!Object.keys(this.quests.quests).length) this.quests.begin();
          for (let i = 0; i < 40 && this.quests.mainQuest && this.quests.mainQuest !== 'main8'; i++) this.quests.advance(this.quests.mainQuest);
          this.caster.locked.delete('patronus');
        },
        villain: () => this.story._spawnVillain(),
        ending: () => this.story.ending(),
        points: () => this.housePoints.award(50, 'hata ayıklama'),
        lesson: (id) => {
          const prof = this.lessons.profs.find((p) => p.key === LESSONS[id].teacher);
          if (prof && !this.lessons.active) this.lessons._start(id, prof);
          else this.hud.notice('Bu dersin profesörü bu bölgede değil');
        },
        mood: (m) => {
          this.sound.forced = m === 'auto' ? null : m;
        },
        sound: (name) => this.audio.play(name, { pos: this.player.position.clone().add(new THREE.Vector3(3, 1, 0)) }),
        speech: () => this.voice.speak('Deneme Sesi', `Merhaba ${this.characterData.firstName}! Bu ses tamamen sentezleniyor, duyabiliyor musun?`),
        friendship: () => {
          for (const id of Object.keys(COMPANIONS)) this.relationships.add(id, 20);
        },
        stopFollow: () => {
          this.relationships.following = null;
          this.social.setRegion(this.room);
        },
        friends: () => this.friendsPanel.toggle(),
        allBrooms: () => {
          for (const id of Object.keys(BROOMS)) if (!this.inventory.owns(id)) this.inventory.brooms.push(id);
          this.inventory.equip(Object.keys(BROOMS).at(-1));
        },
        nextBroom: () => {
          const list = this.inventory.brooms;
          this.inventory.equip(list[(list.indexOf(this.inventory.broom) + 1) % list.length]);
        },
        galleons: () => this.inventory.earn(100, 'hata ayıklama'),
        race: (id) => {
          if (this.room.id === 'grounds') this.races.start(id);
        },
        quidditch: () => this.match?.start(),
        snitch: () => this.match?.releaseSnitch(),
        endMatch: () => this.match?.abort(),
        killEnemies: () => {
          for (const e of this.combat.enemies) if (!e.dead && e.type !== 'duelist') e.die();
        },
        staggerEnemies: () => {
          for (const e of this.combat.enemies) if (!e.dead && !e.def.immune) e.hurt(1, e.maxPoise);
        },
        bossPhase: () => {
          const b = this.combat.boss;
          if (!b || b.dead) return;
          if (b.hanging) for (const a of b.anchors) a.health = 0;
          else b.hurt(Math.max(1, b.health - b.maxHealth * (b.phase === 1 ? BOSS.spiderQueen.phases[1] - 0.01 : 0.02)), 0);
        },
        toggle: (key) => {
          this.toggles[key] = !this.toggles[key];
          if (key === 'collision') this.debugDraw.visible = this.toggles.collision;
          if (key === 'noclip') this.player.controller.noclip = this.toggles.noclip;
          if (key === 'focus') this.caster.unlimited = this.toggles.focus;
          if (key === 'ai') this.combat.enabled = this.toggles.ai;
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
    this.renderer.beginFrame();
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
      if (this._thumbReqs?.length) this._captureThumb();
    }
    this.sound?.update(time.unscaledDt, this.camera);
    this.debug.update(time.unscaledDt * 1000, time.unscaledDt);
    this.input.endFrame();
  }

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    const player = this.player;
    this.room.fixedUpdate(dt, player.position);

    const lock = this.cameraRig.lockTarget;
    if (player.intent.aim || this.caster.facing) player.faceYaw = this.cameraRig.yaw;
    else if (lock) {
      lock.getLockPoint(_v).sub(player.position);
      player.faceYaw = Math.atan2(-_v.x, -_v.z);
    } else player.faceYaw = null;

    player.fixedUpdate(dt);
    const c = player.controller;
    this.physics.syncPlayerProxy(c.position, c.velocity, c.radius, c.height);
    this.physics.step(dt);
    this.spells.fixedUpdate(dt);
    this.combat.fixedUpdate(dt);
    this.duel?.fixedUpdate(dt);
    this.races.fixedUpdate(dt);
    this.social.fixedUpdate(dt);
    this.lessons.fixedUpdate(dt);
    this.quests.update(dt);
    this._discoverT = (this._discoverT ?? 0) - dt;
    if (this._discoverT <= 0) {
      this._discoverT = 0.5;
      this.mapState.update(this.room, player.position);
    }
    this.story.update(dt);
    this.match?.fixedUpdate(dt);
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
        this._autosave('Otomatik');
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
    const clothWind = this.flight.active ? this.flight.clothWind(_v).add(_wind) : _wind;
    player.render(dt, alpha, this.fsm.is('boot') ? 10 : this.cameraRig.distance, { camera: this.camera, wind: clothWind });
    _head.copy(player.visualPosition).setY(player.visualPosition.y + player.character.height * 0.93);
    this.room.updateCharacters(dt, { camera: this.camera, player: player.visualPosition, playerHead: _head, wind: _wind });
    this.physics.syncVisuals(alpha);
    if (this.skeletonHelper) this.skeletonHelper.visible = this.toggles.skeleton;

    if (this.fsm.is('cinematic')) this.cinematic.update(dt);
    else if (!this.fsm.is('boot')) {
      const fl = this.flight;
      this.cameraRig.update(dt, player.visualPosition, { crouching: player.controller.crouching, speed: fl.active ? fl.velocity.length() : player.speed, flying: fl.active, roll: fl.bank });
    }

    if (this.fsm.is('play') || this.fsm.is('cinematic')) this.caster.update(dt);
    const env = { camera: this.camera, wind: _wind, playerHead: _head };
    this.combat.frame(dt, env);
    this.duel?.render(dt, env);
    this.races.frame(dt);
    this.social.render(dt, env);
    this.lessons.render(dt, env);
    this._placeBanner();
    this.minimap.update({ region: this.room.id, player: { x: player.position.x, y: player.position.y, z: player.position.z, yaw: player.yaw }, quest: this.quests.tracker, friends: this._friendsNearby(), hidden: !this.fsm.is('play') });
    this.storyUi.update(dt, {
      tracker: this.settings.get('showTracker') ? this.quests.tracker : null, lesson: this.lessons.hud, journal: this.quests.journal, standings: this.housePoints.standings,
      camera: this.camera, width: this.renderer.width, height: this.renderer.height, player, region: this.room.id, hidden: !this.fsm.is('play'),
    });
    this.dialogueUi.update(dt);
    this.friendsPanel.update(dt, () => this.social.summary);
    this.match?.frame(dt);
    this.shop?.render(dt, { ...env, player: player.visualPosition });
    this.spells.update(dt, this.camera);
    this.spellHud.update(dt, this.caster);
    this.room.render(this.time.elapsed, this.atmosphere.night, alpha);
    this.room.frame(dt, this.camera, { night: this.atmosphere.night, hour: this.clock.hour, wind: this.atmosphere.weather.wind, player: player.visualPosition, playerHead: _head });
    this.debugDraw.update(player.controller, player.visualPosition);
    this.flightHud.update(dt, { flight: this.flight, race: this.races.hud, match: this.match?.hud ?? null, camera: this.camera, width: this.renderer.width, height: this.renderer.height, player });
    this.combatHud.update(dt, {
      enemies: this.combat.enemies, camera: this.camera, width: this.renderer.width, height: this.renderer.height,
      player, chill: this.combat.chill, focus: this.duel?.focus ?? (this.story.villain && !this.story.villain.dead ? this.story.villain : this.combat.boss?.engaged ? this.combat.boss : null),
    });

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
