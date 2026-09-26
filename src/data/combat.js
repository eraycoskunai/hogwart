/**
 * @file Combat data: player duelling moves (dodge, stun, finisher), AI
 * difficulty, every enemy type's stats and attacks, where encounters live
 * (per region, with time-of-day conditions), the Spider Queen boss and the
 * Duelling Club ladder. Damage values are for the Normal difficulty;
 * `DIFFICULTIES.damageTaken` in settings scales what the player receives.
 */

export const COMBAT = Object.freeze({
  dodge: { speed: 8.5, duration: 0.42, iframes: 0.34, cooldown: 0.75, focus: 6 },
  /** Player stagger when hit hard (seconds of lost control). */
  playerStun: { light: 0.6, heavy: 1.2 },
  /** Enemy stagger (stun bar full): seconds, extra damage taken, finisher range. */
  stagger: { duration: 3.2, vulnerability: 1.5, finisherRange: 14 },
  /** Stun bar decay per second after this idle time. */
  poiseDecay: { delay: 2.5, rate: 18 },
  /** Finisher: share of max health dealt, slow-motion. */
  finisher: { damage: 0.55, bossDamage: 0.12, timeScale: 0.25, duration: 0.9 },
  /** Poise damage per point of spell damage, plus per-spell bonuses. */
  poisePerDamage: 1.1,
  poiseBonus: { stupefy: 25, descendo: 30, depulso: 20, confringo: 40, petrificus: 50, expelliarmus: 15 },
  /** Shield-breaking multipliers when a spell hits a raised enemy shield. */
  shieldBreak: { confringo: 3, descendo: 2.5, expelliarmus: 2.5, depulso: 1.8 },
  /** Enemies fade and are removed this long after death. */
  corpseTime: 5,
  /** Respawn enemies of an encounter after this many seconds away. */
  respawnAfter: 240,
});

/** AI tuning per difficulty (keys match settings DIFFICULTIES). */
export const AI_DIFFICULTY = Object.freeze({
  story: { health: 0.7, reaction: 0.6, accuracy: 0.55, attackers: 1, parry: 0, aggression: 0.7 },
  normal: { health: 1, reaction: 0.35, accuracy: 0.8, attackers: 2, parry: 0.15, aggression: 1 },
  hard: { health: 1.35, reaction: 0.18, accuracy: 0.95, attackers: 3, parry: 0.35, aggression: 1.3 },
});

export const PERCEPTION = Object.freeze({
  tick: 0.15,
  /** Awareness gain per second at close range (falls off with distance). */
  gain: 2.2,
  decay: 0.35,
  suspicious: 0.3,
  /** Always noticed within this range. */
  closeRange: 2.5,
  forget: 7,
  searchTime: 6,
  /** Allies within this radius are alerted when one spots the player. */
  helpRadius: 45,
  /** Noises (impacts, casts) heard within hearing range × loudness. */
  castLoudness: 0.6,
  impactLoudness: 1,
});

export const NAV = Object.freeze({
  cell: 1,
  interiorCell: 0.6,
  maxSlope: 0.72,
  stepHeight: 0.55,
  clearanceRadius: 0.32,
  clearanceHeight: 1.5,
  cellsPerFrame: 700,
  repath: 0.6,
  maxIterations: 6000,
});

/** Enemy spells (thrown with the spell system; owner = the enemy). */
export const ENEMY_SPELLS = Object.freeze({
  darkCurse: { name: 'Karanlık lanet', kind: 'bolt', color: '#5aff6a', trail: '#1ad040', speed: 30, gravity: 0, radius: 0.14, life: 2.4, bounces: 0, damage: 12, impulse: 3, effect: 'stun', light: { color: 0x40ff60, intensity: 7, distance: 7 } },
  darkStun: { name: 'Sersemletme', kind: 'bolt', color: '#ff2a2a', trail: '#ff6a4a', speed: 36, gravity: 0, radius: 0.13, life: 2.2, bounces: 0, damage: 9, impulse: 2, effect: 'stun', playerStun: 'light', light: { color: 0xff3020, intensity: 6, distance: 6 } },
  darkFire: { name: 'Lanetli ateş', kind: 'bolt', color: '#ff7a1a', trail: '#ffb040', element: 'fire', speed: 22, gravity: 3, radius: 0.22, life: 2, bounces: 0, damage: 16, impulse: 2, effect: 'ignite', light: { color: 0xff7020, intensity: 9, distance: 8 } },
  web: { name: 'Ağ', kind: 'bolt', color: '#e8e8e0', trail: '#ffffff', speed: 20, gravity: 4, radius: 0.2, life: 2.2, bounces: 0, damage: 4, impulse: 0, effect: 'web', slow: 3 },
  venom: { name: 'Zehir', kind: 'bolt', color: '#9aff3a', trail: '#c8ff6a', speed: 18, gravity: 6, radius: 0.25, life: 3, bounces: 0, damage: 10, impulse: 0, effect: 'venom', light: { color: 0x9aff3a, intensity: 5, distance: 6 } },
  duel: { name: 'Düello büyüsü', kind: 'bolt', color: '#ff5a9a', trail: '#ffa0c8', speed: 30, gravity: 0, radius: 0.13, life: 2.2, bounces: 0, damage: 10, impulse: 2, effect: 'stun', light: { color: 0xff5a9a, intensity: 6, distance: 6 } },
});

/**
 * Enemy types. Common fields: name, health, poise, speed (walk/run), radius,
 * height, sight, fov (deg), hearing, faction.
 */
export const ENEMIES = Object.freeze({
  darkWizard: {
    name: 'Karanlık büyücü', health: 130, poise: 100, speed: [2, 4.4], radius: 0.32, height: 1.7, sight: 28, fov: 120, hearing: 20,
    range: [7, 22], spells: [['darkCurse', 0.45], ['darkStun', 0.35], ['darkFire', 0.2]], castEvery: [1.4, 2.6],
    shield: { health: 45, duration: 2.2, cooldown: 7, react: 0.55 }, dodge: { chance: 0.25, cooldown: 3 }, cover: true, lowHealthRetreat: 0.3,
    robe: '#15121a', eyes: '#ff3030',
  },
  spider: {
    name: 'Dev örümcek', health: 95, poise: 110, speed: [3.5, 7.5], radius: 0.75, height: 0.9, sight: 22, fov: 200, hearing: 16,
    bite: { range: 2.4, lunge: 6, windup: 0.5, damage: 11, cooldown: 1.6 }, spit: { range: 14, windup: 0.7, cooldown: 5 },
    scale: 1, color: '#1a1512', eyes: '#ff2010',
  },
  spiderling: {
    name: 'Yavru örümcek', health: 22, poise: 20, speed: [4, 8.5], radius: 0.4, height: 0.45, sight: 30, fov: 360, hearing: 30,
    bite: { range: 1.4, lunge: 4, windup: 0.35, damage: 5, cooldown: 1.2 }, scale: 0.45, color: '#2a221a', eyes: '#ff6010',
  },
  troll: {
    name: 'Dağ trolü', health: 420, poise: 260, speed: [1.8, 3.2], radius: 1.05, height: 3.4, sight: 20, fov: 140, hearing: 14,
    slam: { radius: 3.6, reach: 2.6, windup: 1.25, damage: 30, stun: 'heavy', cooldown: 3.5 },
    sweep: { range: 4.4, angle: 120, windup: 0.9, damage: 20, cooldown: 2.6 },
    skin: '#6f7a5a', cloth: '#4a3a28',
  },
  werewolf: {
    name: 'Kurt adam', health: 190, poise: 120, speed: [3, 8.8], radius: 0.45, height: 1.95, sight: 30, fov: 160, hearing: 26,
    leap: { range: [5, 11], windup: 0.45, damage: 18, cooldown: 4 }, claw: { range: 2.4, windup: 0.35, damage: 9, hits: 2, cooldown: 1.4 },
    nightOnly: true, fur: '#3a3228', eyes: '#ffc020',
  },
  wraith: {
    name: 'Solgun', health: 1, poise: 1, speed: [1.6, 3], radius: 0.5, height: 2.2, sight: 26, fov: 360, hearing: 30,
    aura: { radius: 9, damage: 3, focusDrain: 9 }, float: 1.2, immune: true, patronusOnly: true,
  },
  armor: {
    name: 'Büyülü zırh', health: 220, poise: 400, speed: [1.4, 2.6], radius: 0.4, height: 2, sight: 16, fov: 110, hearing: 12,
    slash: { range: 2.5, angle: 100, windup: 0.8, damage: 16, cooldown: 1.8 },
    resist: { stupefy: 0.3, expelliarmus: 0.3, petrificus: 0, incendio: 0.5 }, weak: { confringo: 2, descendo: 2, depulso: 1.5 },
  },
  pixie: {
    name: 'Cin peri', health: 8, poise: 1, speed: [5, 9], radius: 0.2, height: 0.3, sight: 20, fov: 360, hearing: 20,
    pinch: { range: 0.9, damage: 2, cooldown: 1.2 }, flock: 8, float: 1.6,
  },
});

/**
 * Encounters per region. `zone` = nav-grid bounds (centre + half size),
 * `activate` = player distance that spawns it; conditions: night / cell.
 */
export const ENCOUNTERS = Object.freeze({
  grounds: [
    { id: 'forestEdge', name: 'Yasak Orman kenarı', center: [-420, -10], half: 26, activate: 90, spawns: [['spider', -412, -2], ['spider', -428, -18], ['spider', -420, 12]], patrol: 12 },
    { id: 'forestDeep', name: 'Yasak Orman derinlikleri', center: [-560, -60], half: 28, activate: 90, spawns: [['spider', -552, -52], ['spider', -570, -70]], patrol: 14 },
    { id: 'werewolf', name: 'Dolunay açıklığı', center: [-520, 60], half: 30, activate: 100, night: true, spawns: [['werewolf', -520, 60]], patrol: 20 },
    { id: 'darkCamp', name: 'Kuzey yolu kampı', center: [40, -500], half: 30, activate: 110, spawns: [['darkWizard', 34, -492], ['darkWizard', 50, -506], ['darkWizard', 28, -514]], patrol: 10 },
    { id: 'troll', name: 'Dağ eteği', center: [420, -560], half: 26, activate: 100, spawns: [['troll', 420, -566]], patrol: 10 },
    { id: 'wraiths', name: 'Göl kıyısı (gece)', center: [10, 190], half: 30, activate: 90, night: true, spawns: [['wraith', 0, 200], ['wraith', 26, 196]], patrol: 16, fly: true },
    { id: 'lair', name: 'Örümcek yuvası', center: [-620, -230], half: 30, activate: 80, boss: 'spiderQueen', spawns: [] },
  ],
  castle: [
    { id: 'restricted', name: 'Yasak Bölüm', center: [26, -40.5], half: 10, activate: 30, cell: 'library', y: 7, interior: true, wake: { minZ: -45, maxZ: -36.8 }, spawns: [['armor', 20, -42.2], ['armor', 32, -42.2]], patrol: 4 },
    { id: 'pixies', name: 'Serbest kalmış cin periler', center: [26, -33], half: 11, activate: 30, cell: 'dada', y: 14, interior: true, spawns: [['pixie', 26, -33]], fly: true },
  ],
  testRoom: [],
});

export const BOSS = Object.freeze({
  spiderQueen: {
    name: 'Nyxara, Örümceklerin Anası', health: 1200, poise: 600, radius: 1.8, height: 2.6, scale: 2.6, speed: [3, 6.5],
    color: '#120e0c', eyes: '#ff1a00',
    /** Phase thresholds (share of health). */
    phases: [1, 0.66, 0.33],
    bite: { range: 4.2, angle: 70, windup: 0.85, damage: 22, cooldown: 2.2 },
    sweep: { radius: 5.5, windup: 1.1, damage: 18, cooldown: 4 },
    volley: { count: 3, windup: 0.8, cooldown: 5 },
    summon: { count: 2, cooldown: 14, max: 5 },
    /** Phase 2: hangs in the canopy web; venom pools rain on the player. */
    canopy: { height: 9, rainEvery: 2.2, rainRadius: 2.6, rainWindup: 1.3, rainDamage: 16, anchors: 3, anchorRadius: 14, anchorHealth: 60, fallStun: 6 },
    /** Phase 3: straight charges. */
    charge: { windup: 1.1, speed: 16, length: 22, width: 2.6, damage: 26, cooldown: 4.5 },
    arena: { center: [-620, -230], radius: 24 },
  },
});

/** Duelling Club ladder (castle interior). */
export const DUEL = Object.freeze({
  master: { name: 'Profesör Hester Kılıçgöz', seed: 33331 },
  countdown: 3,
  /** Stage ends: player / opponent (x, y, z, yaw). */
  start: { player: [22.25, 0.9, 18.6, 0], opponent: [22.25, 0.9, 8.6, Math.PI] },
  bounds: { minX: 19.3, maxX: 25.2, minZ: 7.6, maxZ: 19.9, y: 0.9 },
  ladder: [
    { name: 'Rowan Kestrel', title: '1. sınıf', seed: 51001, health: 70, accuracy: 0.5, castEvery: [2.4, 3.6], shield: 0.1, dodge: 0.1, spells: [['duel', 1]] },
    { name: 'Mira Tanselöz', title: '2. sınıf', seed: 51013, health: 90, accuracy: 0.65, castEvery: [2, 3], shield: 0.25, dodge: 0.2, spells: [['duel', 0.7], ['darkStun', 0.3]] },
    { name: 'Ozan Karakum', title: '4. sınıf', seed: 51027, health: 110, accuracy: 0.75, castEvery: [1.7, 2.6], shield: 0.35, dodge: 0.3, spells: [['duel', 0.5], ['darkStun', 0.3], ['darkFire', 0.2]] },
    { name: 'Selin Aydıngöz', title: '6. sınıf', seed: 51039, health: 130, accuracy: 0.85, castEvery: [1.4, 2.2], shield: 0.5, dodge: 0.4, spells: [['duel', 0.4], ['darkStun', 0.4], ['darkFire', 0.2]] },
    { name: 'Dorian Vale', title: 'Düello şampiyonu', seed: 51047, health: 160, accuracy: 0.92, castEvery: [1.1, 1.8], shield: 0.65, dodge: 0.5, spells: [['duel', 0.35], ['darkStun', 0.35], ['darkFire', 0.3]] },
  ],
  lines: {
    bow: 'Önce eğilin! Sonra asalar hazır…',
    win: 'Tebrikler! Bir sonraki rakibin seni bekliyor.',
    lose: 'Bu sefer olmadı. Kalkanını daha erken kaldır.',
    champion: 'Düello Kulübü şampiyonu sensin!',
    out: 'Sahneden düştün — düello kaybedildi.',
  },
});
