/**
 * @file Spell data: every spell's cost, cooldown, cast animation, projectile
 * physics, effect strengths, colours and gesture; focus (mana) pool,
 * mastery curve, combos and element rules.
 *
 * Kinds:
 *   bolt     projectile (speed, gravity, bounces) that applies `effect` on hit
 *   self     applied to the caster immediately (heal, light toggle)
 *   shield   held: a bubble that absorbs / reflects (parry window)
 *   levitate toggle: grabs the aimed body and carries it in front of the wand
 *   patronus charged: a glowing guardian animal runs forward
 */

export const FOCUS = Object.freeze({
  max: 100,
  regen: 14,
  /** Seconds after spending before regeneration starts. */
  regenDelay: 0.9,
});

export const MASTERY = Object.freeze({
  /** XP needed for levels 2…5 (level 1 at 0). */
  levels: [0, 12, 35, 80, 160],
  xpCast: 1,
  xpHit: 2,
  xpCombo: 5,
  /** Per level above 1. */
  powerPerLevel: 0.1,
  costPerLevel: 0.05,
  cooldownPerLevel: 0.06,
});

export const CASTING = Object.freeze({
  /** Metres the aim ray reaches. */
  aimRange: 60,
  /** Degrees of random spread at control 0 (wand control narrows it). */
  spread: 1.6,
  /** Cast animation speed multiplier per unit of wand `speed` stat. */
  speedFactor: 2,
  /** Gesture drawing: pixels of mouse travel per virtual canvas pixel, min points, accept score. */
  gesture: { scale: 1, minPoints: 12, accept: 0.78, bonusPower: 0.25, bonusCost: 0.3, resample: 64, size: 250, angleRange: 15, anglePrecision: 2 },
  /** Levitation: hold distance, max carried mass, follow stiffness, focus per second. */
  levitate: { distance: 3.2, minDistance: 1.8, maxMass: 120, stiffness: 7, maxSpeed: 14, drain: 6, height: 1.4 },
  shield: { radius: 1.25, drain: 18, parry: 0.3, reflectBoost: 1.35 },
});

/** Elements and how they interact. */
export const ELEMENTS = Object.freeze({
  /** Seconds a burning object burns, damage per second to living targets. */
  burn: { duration: 8, dps: 6, charTime: 6 },
  /** Frozen targets stay frozen this long; ice floes last this long on water. */
  freeze: { duration: 7, floeRadius: 3.2, floeThickness: 0.35, floeLife: 28, floeFade: 3 },
  petrify: { duration: 6 },
  stun: { duration: 2.5 },
  /** Broken objects: pieces per axis, Reparo pull-back time. */
  shatter: { pieces: 2, repairTime: 1.1, maxMass: 100 },
});

/** Two-spell combos (first effect active on the target, second spell lands). */
export const COMBOS = Object.freeze([
  { first: 'levitate', then: 'depulso', name: 'Fırlatma', bonus: 2.2 },
  { first: 'levitate', then: 'descendo', name: 'Çarpma', bonus: 2.5 },
  { first: 'frozen', then: 'confringo', name: 'Buz Parçalama', bonus: 2.5 },
  { first: 'petrified', then: 'depulso', name: 'Heykel Devirme', bonus: 1.8 },
  { first: 'stunned', then: 'stupefy', name: 'Çifte Sersemletme', bonus: 1.6 },
]);

/**
 * Gesture templates in a unit box (x right, y down), drawn from the first point.
 * Direction matters (rotation-sensitive $1 variant).
 */
export const GESTURES = Object.freeze({
  line_up: [[0.5, 1], [0.5, 0]],
  line_down: [[0.5, 0], [0.5, 1]],
  line_right: [[0, 0.5], [1, 0.5]],
  line_left: [[1, 0.5], [0, 0.5]],
  swish_flick: [[0, 0.35], [0.15, 0.6], [0.35, 0.72], [0.55, 0.6], [0.7, 0.35], [0.8, 0.1], [0.86, 0.35], [0.92, 1]],
  zigzag: [[0, 0], [1, 0], [0, 1], [1, 1]],
  mzig: [[0, 1], [0.25, 0], [0.5, 0.7], [0.75, 0], [1, 1]],
  s_curve: [[1, 0.05], [0.4, 0], [0.05, 0.22], [0.4, 0.5], [0.9, 0.72], [0.6, 1], [0, 0.95]],
  triangle: [[0.5, 0], [1, 1], [0, 1], [0.5, 0]],
  spiral: 'spiral',
  circle_cw: 'circleCW',
  circle_ccw: 'circleCCW',
  ell: [[0, 0], [0, 1], [1, 1]],
  chevron_left: [[1, 0], [0, 0.5], [1, 1]],
  check: [[0, 0.55], [0.3, 1], [1, 0]],
  u_shape: [[0, 0], [0.05, 0.8], [0.5, 1], [0.95, 0.8], [1, 0]],
  hook: [[0, 0], [1, 0], [1, 0.7], [0.6, 1]],
  infinity: 'infinity',
});

export const SPELLS = Object.freeze({
  lumos: {
    name: 'Lumos', label: 'Asanın ucunda ışık yakar.', kind: 'self', cost: 4, cooldown: 0.4, clip: 'castUtility',
    color: '#dfefff', light: { color: 0xdcecff, intensity: 16, distance: 13 }, gesture: 'line_up', effect: 'lumos',
  },
  nox: {
    name: 'Nox', label: 'Işığı söndürür.', kind: 'self', cost: 0, cooldown: 0.3, clip: 'castUtility',
    color: '#7a8aa0', gesture: 'line_down', effect: 'nox',
  },
  expelliarmus: {
    name: 'Expelliarmus', label: 'Silahsızlandırır ve geri iter.', kind: 'bolt', cost: 12, cooldown: 1.2, clip: 'castThrust',
    color: '#ff3b2e', trail: '#ff7a5a', speed: 38, gravity: 0, radius: 0.12, life: 2, bounces: 0,
    damage: 8, impulse: 5, effect: 'disarm', gesture: 's_curve', light: { color: 0xff4a3a, intensity: 6, distance: 6 },
  },
  stupefy: {
    name: 'Stupefy', label: 'Sersemletir.', kind: 'bolt', cost: 14, cooldown: 1.1, clip: 'castFlick',
    color: '#ff2222', trail: '#ff6a4a', speed: 42, gravity: 0, radius: 0.13, life: 2, bounces: 0,
    damage: 14, impulse: 3, effect: 'stun', gesture: 'zigzag', light: { color: 0xff3020, intensity: 7, distance: 7 },
  },
  protego: {
    name: 'Protego', label: 'Kalkan. Doğru anda kaldırırsan büyüyü geri yansıtır.', kind: 'shield', cost: 6, cooldown: 0.8, clip: 'shield',
    color: '#8fc8ff', gesture: 'circle_cw', effect: 'shield',
  },
  petrificus: {
    name: 'Petrificus Totalus', label: 'Hedefi taş gibi dondurur.', kind: 'bolt', cost: 18, cooldown: 2, clip: 'castThrust',
    color: '#c8e0ff', trail: '#e8f2ff', speed: 32, gravity: 0, radius: 0.12, life: 2.2, bounces: 0,
    damage: 4, impulse: 0, effect: 'petrify', gesture: 'ell', light: { color: 0xc8e0ff, intensity: 5, distance: 6 },
  },
  incendio: {
    name: 'Incendio', label: 'Ateş. Yanıcı nesneleri tutuşturur, buzu eritir.', kind: 'bolt', cost: 16, cooldown: 1.4, clip: 'castSweep',
    color: '#ff8a1e', trail: '#ffb040', speed: 24, gravity: 3, radius: 0.22, life: 1.6, bounces: 0,
    damage: 12, impulse: 1, effect: 'ignite', element: 'fire', gesture: 'triangle', light: { color: 0xff7a20, intensity: 12, distance: 9 },
  },
  glacius: {
    name: 'Glacius', label: 'Buz. Hedefi dondurur, suyun yüzeyini buz tabakasına çevirir, ateşi söndürür.', kind: 'bolt', cost: 16, cooldown: 1.4, clip: 'castThrust',
    color: '#9fe8ff', trail: '#dff8ff', speed: 30, gravity: 1.5, radius: 0.16, life: 2.2, bounces: 1,
    damage: 8, impulse: 1, effect: 'freeze', element: 'ice', gesture: 'spiral', light: { color: 0x8fe0ff, intensity: 7, distance: 7 },
  },
  leviosa: {
    name: 'Wingardium Leviosa', label: 'Nesneyi havaya kaldırıp taşır. Tekrar yap: bırak.', kind: 'levitate', cost: 10, cooldown: 0.5, clip: 'castLift',
    color: '#ffe08a', trail: '#fff2c0', gesture: 'swish_flick', effect: 'levitate',
  },
  accio: {
    name: 'Accio', label: 'Nesneyi sana doğru çeker.', kind: 'bolt', cost: 10, cooldown: 0.9, clip: 'castPull',
    color: '#c89aff', trail: '#e2c8ff', speed: 36, gravity: 0, radius: 0.12, life: 1.8, bounces: 0,
    damage: 0, impulse: 9, effect: 'pull', gesture: 'chevron_left', light: { color: 0xb080ff, intensity: 5, distance: 6 },
  },
  depulso: {
    name: 'Depulso', label: 'İter. Havadaki nesneyi fırlatır.', kind: 'bolt', cost: 10, cooldown: 0.8, clip: 'castThrust',
    color: '#9ab8ff', trail: '#d0e0ff', speed: 40, gravity: 0, radius: 0.14, life: 1.6, bounces: 2,
    damage: 6, impulse: 14, effect: 'push', gesture: 'line_right', light: { color: 0x9ab8ff, intensity: 6, distance: 6 },
  },
  descendo: {
    name: 'Descendo', label: 'Hedefi yere çarpar.', kind: 'bolt', cost: 12, cooldown: 1.1, clip: 'castSlam',
    color: '#8a5aff', trail: '#b89aff', speed: 34, gravity: 0, radius: 0.14, life: 1.8, bounces: 0,
    damage: 10, impulse: 16, effect: 'slam', gesture: 'hook', light: { color: 0x8a5aff, intensity: 6, distance: 6 },
  },
  confringo: {
    name: 'Confringo', label: 'Patlama. Yakındaki her şeyi savurur, kırılabilenleri parçalar.', kind: 'bolt', cost: 26, cooldown: 2.4, clip: 'castSweep',
    color: '#ff6a10', trail: '#ffc060', speed: 26, gravity: 2, radius: 0.2, life: 2, bounces: 0,
    damage: 28, impulse: 18, effect: 'explode', element: 'fire', blast: 4.2, gesture: 'mzig', light: { color: 0xff6a10, intensity: 10, distance: 8 },
  },
  reparo: {
    name: 'Reparo', label: 'Kırılan nesneyi onarır.', kind: 'bolt', cost: 8, cooldown: 0.8, clip: 'castCircle',
    color: '#ffd27a', trail: '#fff0c8', speed: 28, gravity: 0, radius: 0.14, life: 1.6, bounces: 0,
    damage: 0, impulse: 0, effect: 'repair', blast: 2.5, gesture: 'circle_ccw', light: { color: 0xffd27a, intensity: 5, distance: 6 },
  },
  alohomora: {
    name: 'Alohomora', label: 'Kilitleri açar.', kind: 'bolt', cost: 6, cooldown: 0.8, clip: 'castUtility',
    color: '#ffe9a8', trail: '#fff6d8', speed: 26, gravity: 0, radius: 0.1, life: 1.4, bounces: 0,
    damage: 0, impulse: 0, effect: 'unlock', gesture: 'u_shape', light: { color: 0xffe9a8, intensity: 4, distance: 5 },
  },
  episkey: {
    name: 'Episkey', label: 'Yaralarını iyileştirir.', kind: 'self', cost: 24, cooldown: 8, clip: 'castCircle',
    color: '#7affb0', gesture: 'check', effect: 'heal', heal: 35,
  },
  finite: {
    name: 'Finite Incantatem', label: 'Hedefteki büyüleri bozar.', kind: 'bolt', cost: 8, cooldown: 0.8, clip: 'castFlick',
    color: '#f2f2ff', trail: '#ffffff', speed: 34, gravity: 0, radius: 0.12, life: 1.6, bounces: 0,
    damage: 0, impulse: 0, effect: 'finite', blast: 1.5, gesture: 'line_left', light: { color: 0xf2f2ff, intensity: 5, distance: 6 },
  },
  patronus: {
    name: 'Expecto Patronum', label: 'Işıktan koruyucu bir hayvan çağırır; karanlık yaratıkları kovar.', kind: 'patronus', cost: 60, cooldown: 14, clip: 'castLift',
    color: '#cfe8ff', gesture: 'infinity', effect: 'patronus', charge: 1.1, light: { color: 0xcfe8ff, intensity: 22, distance: 18 },
  },
});

/** Order on the spell wheel (clockwise from the top). */
export const SPELL_WHEEL = Object.freeze([
  'lumos', 'stupefy', 'expelliarmus', 'protego', 'petrificus', 'incendio', 'glacius', 'leviosa', 'accio',
  'depulso', 'descendo', 'confringo', 'reparo', 'alohomora', 'episkey', 'finite', 'patronus', 'nox',
]);

/** Patronus forms: picked from the player's name (seeded). */
export const PATRONUS_FORMS = Object.freeze(['stag', 'hare', 'otter', 'fox', 'wolf', 'horse', 'cat', 'owl']);
export const PATRONUS_LABELS = Object.freeze({ stag: 'geyik', hare: 'tavşan', otter: 'su samuru', fox: 'tilki', wolf: 'kurt', horse: 'at', cat: 'kedi', owl: 'baykuş' });
export const PATRONUS = Object.freeze({ speed: 7, life: 5, fade: 1.2, scale: 1.2, repel: 12 });

/** Practice bolts thrown by the duelling dummy (tests Protego). */
export const PRACTICE_BOLT = Object.freeze({
  name: 'Antrenman büyüsü', kind: 'bolt', color: '#ff9adf', trail: '#ffc8ee', speed: 16, gravity: 0, radius: 0.14, life: 3, bounces: 0,
  damage: 6, impulse: 2, effect: 'stun', light: { color: 0xff8ad0, intensity: 5, distance: 5 },
});
