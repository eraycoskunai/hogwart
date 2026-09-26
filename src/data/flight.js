/**
 * @file Flight data: broom handling physics, the broom models sold in the
 * shop, the shop itself, ring races on the grounds (medal times, rewards)
 * and the Quidditch match (teams, balls, AI tuning, scoring). The pitch
 * geometry itself lives in grounds.js (PITCH).
 */

const DEG = Math.PI / 180;

export const FLIGHT = Object.freeze({
  /** Seconds of the mount / dismount animations. */
  mountTime: 0.9,
  dismountTime: 0.55,
  /** Lift-off height gained while mounting (m). */
  liftOff: 1.4,
  /** Visual seat: height of the broom handle above the feet, and where the body pivots when leaning. */
  seatHeight: 0.8,
  pivotHeight: 0.95,
  /** Nose pitch limits and how fast the broom follows the view (× handling). */
  pitchLimit: 62 * DEG,
  pitchRate: 2.6,
  /** Vertical speed from climb / descend keys (m/s). */
  climbSpeed: 7,
  /** Throttle change per second (W / S). */
  throttleRate: 1.4,
  /** Hover drift speed when the throttle is closed (strafe keys). */
  strafeSpeed: 4.5,
  /** Velocity follows the heading this fast (× handling): lower = more drift. */
  grip: 2.4,
  /** Diving adds speed, climbing costs it (m/s² per unit of sin(pitch)). */
  diveAccel: 9,
  /** Top speed can exceed the rated speed by this much in a dive. */
  diveBonus: 1.25,
  /** Visual roll per rad/s of turning, and its limit. */
  bankPerTurn: 0.55,
  bankMax: 70 * DEG,
  bankRate: 5,
  /** Barrel roll (dodge key): duration, invulnerability, sideways shove, cooldown. */
  roll: { duration: 0.55, iframes: 0.45, shove: 9, cooldown: 1.1 },
  /** Boost (sprint key): multiplier, stamina drain / regen per second, regen delay. */
  boost: { mult: 1.5, drain: 28, regen: 14, delay: 1.2, max: 100 },
  /** Collisions: harmless below `speed`, damage per m/s above, thrown off above `unseat`. */
  crash: { speed: 11, damagePerSpeed: 2.6, unseat: 26, bounce: 0.35 },
  /** Auto-land when touching the ground slower than this with the descend key held. */
  landSpeed: 5,
  landHold: 0.35,
  /** Soft ceiling (world Y) and how hard it pushes back. */
  ceiling: 300,
  ceilingPush: 12,
  /** Skim above water: minimum clearance, spray rate. */
  waterClearance: 0.35,
  /** Speed lines appear above this speed (m/s). */
  speedLines: 18,
  /** Hover bob amplitude (m) and rate. */
  bob: [0.06, 1.6],
  /** Wind on the robes per m/s of flight speed. */
  clothWind: 0.35,
  camera: { distance: 5.6, pivotHeight: 1.25, verticalFollow: 22, fovPerSpeed: 0.42, maxFovKick: 20, roll: 0.35 },
});

/**
 * Broom models (original designs). speed m/s, accel m/s², handling (turn
 * rate rad/s), boost stamina multiplier, price in Galleons.
 */
export const BROOMS = Object.freeze({
  school: {
    name: 'Okul süpürgesi', maker: 'Hogwarts deposu', price: 0,
    speed: 16, accel: 7, handling: 1.4, boost: 0.8,
    handle: '#6b4a2b', bristles: '#a88a54', binding: '#6d6a64', length: 1.9, curve: 0.04, fan: 0.22, twigs: 90,
    blurb: 'Yıllardır okulda. Biraz sola çekiyor, ama sadık.',
  },
  wren: {
    name: 'Çalıkuşu 3', maker: 'Tarlakuşu Atölyesi', price: 120,
    speed: 22, accel: 10, handling: 2, boost: 1,
    handle: '#8a5a2c', bristles: '#c9a55e', binding: '#b88a3a', length: 1.85, curve: 0.02, fan: 0.2, twigs: 110,
    blurb: 'Hafif ve çevik; ilk süpürgesini alanların gözdesi.',
  },
  gale: {
    name: 'Poyraz 90', maker: 'Kuzey Rüzgârı Süpürgecilik', price: 260,
    speed: 27, accel: 13, handling: 2.2, boost: 1.1,
    handle: '#4a2f1c', bristles: '#8a6a3a', binding: '#c8ccd2', length: 2, curve: 0.01, fan: 0.17, twigs: 130,
    blurb: 'Uzun mesafede dengeli; rüzgâra karşı kararlı.',
  },
  tail: {
    name: 'Yıldırımkuyruk', maker: 'Şimşek & Oğulları', price: 420,
    speed: 32, accel: 16, handling: 2.6, boost: 1.25,
    handle: '#2b1a12', bristles: '#6a4a2a', binding: '#d8b04a', length: 2.05, curve: 0, fan: 0.14, twigs: 150,
    blurb: 'Yarışçıların seçimi: sert hızlanır, keskin döner.',
  },
  hawk: {
    name: 'Gece Şahini Pro', maker: 'Karakanat Uçuş Evi', price: 700,
    speed: 38, accel: 19, handling: 3, boost: 1.4,
    handle: '#181418', bristles: '#3a2e2a', binding: '#9ab8e0', length: 2.1, curve: -0.02, fan: 0.12, twigs: 170,
    blurb: 'El yapımı abanoz sap, ayarlı kuyruk. Profesyonel lig sınıfı.',
  },
});

/** Starting money and rewards (Galleons). */
export const ECONOMY = Object.freeze({
  start: 60,
  /** Per defeated enemy type. */
  bounty: { darkWizard: 12, spider: 5, spiderling: 1, troll: 40, werewolf: 30, wraith: 15, armor: 18, pixie: 1, spiderQueen: 250 },
  duelWin: 25,
});

/** The broom shop by the Quidditch pitch. */
export const SHOP = Object.freeze({
  name: 'Uçan Kuyruk Süpürgecisi',
  keeper: { name: 'Bayan Ferda Rüzgârgülü', seed: 61211 },
  pos: [370, -46],
  yaw: Math.PI / 2,
  size: [6, 3.2, 4],
  greeting: 'Hoş geldin! Rüzgâr kuyruklu, ateş saplı — ne ararsan var.',
});

/**
 * Ring races. Points: [x, z, height above whatever lies below]. The first
 * point is the start gate. Medal times in seconds; rewards per medal.
 */
export const RACES = Object.freeze([
  {
    id: 'pitch', name: 'Saha turu', desc: 'Quidditch sahası çevresinde ısınma turu',
    start: [398, -40], ringRadius: 4.2,
    points: [[420, -30, 8], [470, -20, 14], [530, -30, 10], [565, -70, 18], [530, -110, 10], [480, -122, 14], [420, -110, 8], [395, -70, 22], [450, -70, 30], [510, -70, 16]],
    medals: [34, 42, 55], reward: [60, 35, 15],
  },
  {
    id: 'castle', name: 'Şato çevresi', desc: 'Kuleler ve köprü etrafında hızlı bir tur',
    start: [96, -8], ringRadius: 5,
    points: [[160, -40, 20], [200, -140, 26], [110, -230, 30], [-40, -230, 34], [-150, -120, 30], [-170, 40, 26], [-90, 150, 34], [40, 170, 30], [150, 90, 24], [120, 10, 14]],
    medals: [62, 76, 95], reward: [90, 50, 20],
  },
  {
    id: 'forest', name: 'Göl ve orman', desc: 'Kara Göl üzerinden orman tepelerine ve geri',
    start: [-190, 150], ringRadius: 4.6,
    points: [[-150, 220, 8], [-60, 260, 6], [30, 250, 10], [0, 170, 18], [-120, 110, 22], [-260, 40, 26], [-360, -20, 30], [-440, 40, 28], [-380, 120, 24], [-290, 170, 16], [-215, 160, 8]],
    medals: [70, 86, 108], reward: [110, 60, 25],
  },
]);

export const RACE_RULES = Object.freeze({
  countdown: 3,
  /** Distance (m) from the start post that starts a race. */
  postRadius: 3.5,
  /** Ghost sample interval (s) and stored precision. */
  ghostStep: 0.1,
  /** Give up when this far from the next ring (m). */
  abandonDistance: 450,
  medalNames: ['Altın', 'Gümüş', 'Bronz'],
});

/** Quidditch match (the player is their house's Seeker). */
export const QUIDDITCH = Object.freeze({
  countdown: 3,
  /** Air volume above the pitch: min / max height over the ground. */
  air: [1.5, 34],
  teamSize: { chasers: 3, beaters: 2, keeper: 1, seeker: 1 },
  goal: 10,
  snitchPoints: 150,
  /** Snitch appears after this many seconds (random in range). */
  snitchDelay: [18, 34],
  snitch: { cruise: [5, 11], dart: 23, dartEvery: [3, 7], dartTime: [0.4, 1], catchRadius: 1.5, visibleRange: 70, glint: 0.8, tired: 300, tiredSpeed: 0.6 },
  quaffle: { gravity: 6, throwSpeed: 24, shootRange: 20, tackle: 0.9, tackleRange: 2.4, grab: 2 },
  bludger: { speed: 16, retarget: [3, 6], hitRadius: 1.3, damage: 12, knock: 1.6, beaterHit: 3.2, beaterSpeed: 26 },
  keeper: { save: 0.45, reach: 2.2 },
  /** AI flyer speeds (m/s). */
  speeds: { chaser: 17, beater: 15, keeper: 12, seeker: 16 },
  /** Rival Seeker: speed and reaction by difficulty. */
  rival: { story: { speed: 12, reaction: 3 }, normal: { speed: 15.5, reaction: 1.6 }, hard: { speed: 19, reaction: 0.7 } },
  reward: { win: 80, lose: 20 },
  /** Pitch hoops (mirrors PITCH): distance of the hoop line from the centre. */
  hoopInset: 8,
  /** Where the match is joined (a bench by the pitch entrance). */
  signup: [412, -46],
  maxMatch: 600,
});
