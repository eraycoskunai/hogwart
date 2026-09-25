/**
 * @file Character generator data: skeleton layout and proportions, the
 * appearance sliders shown in the creator, colour palettes, houses and
 * outfits, head sculpt primitives, hair styles, facial expressions,
 * cloth and IK tuning. Every length is in metres for a reference student
 * of REF_HEIGHT; the generator scales them by the chosen height and build.
 */

/** Reference body height every table below is authored for (m). */
export const REF_HEIGHT = 1.5;

/**
 * Bones: [name, parent]. 24 bones: 22 deforming + 2 eye pivots.
 * Rest orientation is identity for all bones; arms hang straight down,
 * the character faces -Z and its right side is +X.
 */
export const BONES = Object.freeze([
  ['root', null], ['hips', 'root'], ['spine', 'hips'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'],
  ['eyeL', 'head'], ['eyeR', 'head'],
  ['clavicleL', 'chest'], ['upperArmL', 'clavicleL'], ['foreArmL', 'upperArmL'], ['handL', 'foreArmL'],
  ['clavicleR', 'chest'], ['upperArmR', 'clavicleR'], ['foreArmR', 'upperArmR'], ['handR', 'foreArmR'],
  ['thighL', 'hips'], ['shinL', 'thighL'], ['footL', 'shinL'], ['toeL', 'footL'],
  ['thighR', 'hips'], ['shinR', 'thighR'], ['footR', 'shinR'], ['toeR', 'footR'],
]);

/** Joint layout at REF_HEIGHT (metres, feet at y = 0). */
export const SKELETON = Object.freeze({
  hipsY: 0.79,
  hipJoint: { x: 0.083, drop: 0.055 },
  kneeY: 0.41,
  ankleY: 0.068,
  /** Ankle → ball of the foot. */
  ball: { y: -0.05, z: -0.13 },
  spineUp: 0.098,
  chestUp: 0.185,
  neckUp: 0.168,
  headUp: 0.068,
  clavicle: { x: 0.022, up: 0.148, z: 0.004 },
  shoulderX: 0.172,
  upperArm: 0.258,
  foreArm: 0.222,
  /** Eye pivots relative to the head centre (see HEAD). */
  headCenter: [0, 0.075, -0.01],
});

/** Appearance sliders (value 0..1 in saves; mapped to [min, max]). */
export const SLIDERS = Object.freeze([
  { key: 'height', label: 'Boy', group: 'body', min: 1.38, max: 1.62 },
  { key: 'build', label: 'Yapı', group: 'body', min: 0.86, max: 1.2 },
  { key: 'shoulders', label: 'Omuz genişliği', group: 'body', min: 0.9, max: 1.12 },
  { key: 'faceWidth', label: 'Yüz genişliği', group: 'face', min: 0.92, max: 1.08 },
  { key: 'faceLength', label: 'Yüz uzunluğu', group: 'face', min: 0.93, max: 1.07 },
  { key: 'jaw', label: 'Çene hattı', group: 'face', min: 0.8, max: 1.14 },
  { key: 'chin', label: 'Çene ucu', group: 'face', min: -0.006, max: 0.008 },
  { key: 'cheekbones', label: 'Elmacık kemikleri', group: 'face', min: 0.6, max: 1.35 },
  { key: 'noseLength', label: 'Burun uzunluğu', group: 'face', min: 0.84, max: 1.18 },
  { key: 'noseWidth', label: 'Burun genişliği', group: 'face', min: 0.8, max: 1.28 },
  { key: 'noseBridge', label: 'Burun kemeri', group: 'face', min: -0.003, max: 0.004 },
  { key: 'noseTip', label: 'Burun ucu', group: 'face', min: -0.004, max: 0.004 },
  { key: 'eyeSize', label: 'Göz boyutu', group: 'face', min: 0.9, max: 1.1 },
  { key: 'eyeSpacing', label: 'Göz aralığı', group: 'face', min: 0.0295, max: 0.0345 },
  { key: 'eyeTilt', label: 'Göz eğimi', group: 'face', min: -0.14, max: 0.14 },
  { key: 'lips', label: 'Dudak dolgunluğu', group: 'face', min: 0.75, max: 1.3 },
  { key: 'mouthWidth', label: 'Ağız genişliği', group: 'face', min: 0.86, max: 1.14 },
  { key: 'earSize', label: 'Kulak boyutu', group: 'face', min: 0.86, max: 1.16 },
  { key: 'earOut', label: 'Kulak açıklığı', group: 'face', min: 0.12, max: 0.5 },
  { key: 'browThickness', label: 'Kaş kalınlığı', group: 'hair', min: 0.6, max: 1.45 },
  { key: 'browHeight', label: 'Kaş yüksekliği', group: 'hair', min: -0.003, max: 0.003 },
  { key: 'freckles', label: 'Çiller', group: 'colors', min: 0, max: 1 },
  { key: 'voice', label: 'Ses tonu', group: 'identity', min: 0.75, max: 1.35 },
]);

export const SKIN_TONES = Object.freeze([
  { label: 'Porselen', base: '#f3d6c3', red: '#e2a595' },
  { label: 'Açık', base: '#eac4a8', red: '#dc9a88' },
  { label: 'Buğday', base: '#dcab88', red: '#cf8a72' },
  { label: 'Orta', base: '#c79068', red: '#bc7358' },
  { label: 'Esmer', base: '#a9724e', red: '#9e5c44' },
  { label: 'Kahve', base: '#8a5b3d', red: '#834a36' },
  { label: 'Koyu kahve', base: '#6a4129', red: '#6a3526' },
  { label: 'Koyu', base: '#4b2d1d', red: '#50261b' },
]);

export const HAIR_COLORS = Object.freeze([
  { label: 'Siyah', color: '#151211' },
  { label: 'Koyu kahve', color: '#2f1e15' },
  { label: 'Kahverengi', color: '#583823' },
  { label: 'Açık kahve', color: '#86613f' },
  { label: 'Kestane', color: '#6e2c17' },
  { label: 'Kızıl', color: '#a8491c' },
  { label: 'Çilek sarısı', color: '#c38453' },
  { label: 'Sarı', color: '#d3b273' },
  { label: 'Platin', color: '#e6dabe' },
]);

export const EYE_COLORS = Object.freeze([
  { label: 'Koyu kahve', color: '#321c10' },
  { label: 'Kahverengi', color: '#5c381c' },
  { label: 'Ela', color: '#76652e' },
  { label: 'Yeşil', color: '#4a7a3c' },
  { label: 'Mavi', color: '#4a78b6' },
  { label: 'Gri', color: '#788a98' },
  { label: 'Kehribar', color: '#b07a28' },
]);

/** House colours. 'none' is the unsorted first-year look. */
export const HOUSES = Object.freeze({
  none: { label: 'Seçilmedi', primary: '#232327', secondary: '#6d6d74', lining: '#1c1c20', crest: null },
  gryffindor: { label: 'Gryffindor', primary: '#7c1b1d', secondary: '#d0a13c', lining: '#8a1e20', crest: 'tapestry:lion' },
  hufflepuff: { label: 'Hufflepuff', primary: '#d6a92c', secondary: '#1d1a17', lining: '#caa02e', crest: 'tapestry:badger' },
  ravenclaw: { label: 'Ravenclaw', primary: '#1d3470', secondary: '#a67c45', lining: '#213b7c', crest: 'tapestry:eagle' },
  slytherin: { label: 'Slytherin', primary: '#1b5230', secondary: '#b8bcc2', lining: '#1e5c35', crest: 'tapestry:snake' },
});

export const OUTFITS = Object.freeze({
  uniform: { label: 'Okul üniforması' },
  quidditch: { label: 'Quidditch forması' },
});

export const LOWER_GARMENTS = Object.freeze({ trousers: 'Pantolon', skirt: 'Etek' });

export const GLASSES = Object.freeze({
  none: { label: 'Yok' },
  round: { label: 'Yuvarlak', shape: 'round', rx: 0.0165, ry: 0.0165, wire: 0.0011, color: '#b8924a' },
  square: { label: 'Köşeli', shape: 'square', rx: 0.0185, ry: 0.0135, wire: 0.0014, color: '#2a2320' },
  half: { label: 'Yarım çerçeve', shape: 'half', rx: 0.019, ry: 0.0125, wire: 0.0012, color: '#7d7f86' },
});

/** Clothing colours that do not depend on the house. */
export const CLOTH_COLORS = Object.freeze({
  shirt: '#e8e6df',
  sweater: '#5a5a60',
  trousers: '#34353b',
  skirt: '#3a3b42',
  tights: '#2b2b30',
  shoes: '#17130f',
  robe: '#16161b',
  kitTrousers: '#e4dccb',
  boots: '#5a3a22',
  pads: '#6e4a2c',
  gloves: '#3f2a1b',
});

/** Default look for a new student. */
export const DEFAULT_APPEARANCE = Object.freeze({
  height: 0.5, build: 0.35, shoulders: 0.5,
  faceWidth: 0.5, faceLength: 0.5, jaw: 0.45, chin: 0.45, cheekbones: 0.5,
  noseLength: 0.45, noseWidth: 0.4, noseBridge: 0.45, noseTip: 0.55,
  eyeSize: 0.55, eyeSpacing: 0.5, eyeTilt: 0.5, lips: 0.5, mouthWidth: 0.5,
  earSize: 0.5, earOut: 0.35, browThickness: 0.5, browHeight: 0.5, freckles: 0.1, voice: 0.5,
  skinTone: 2, eyeColor: 3, hairColor: 2, hairStyle: 'messy', glasses: 'none',
  lower: 'trousers', scarf: true,
});

/** Name pools for random students (original characters). */
export const RANDOM_NAMES = Object.freeze({
  first: ['Elif', 'Deniz', 'Rowan', 'Isla', 'Kerem', 'Mira', 'Tobias', 'Ada', 'Emrys', 'Nell', 'Cem', 'Ivy', 'Arlo', 'Zeynep', 'Finn', 'Lior'],
  last: ['Ashdown', 'Brightwater', 'Coleridge', 'Duskwood', 'Fenwick', 'Hollowell', 'Kaya', 'Marlow', 'Pennington', 'Quill', 'Ravensworth', 'Thorne', 'Yıldız', 'Whitlock'],
});

// ------------------------------------------------------------------ body

/**
 * Torso cross-sections from the crotch to the neck. [y, rx, rzFront, rzBack, zOffset].
 * Rings below `waistY` belong to the lower garment, the rest to the top.
 */
export const TORSO = Object.freeze({
  waistY: 0.89,
  exponent: 2.35,
  rings: [
    [0.692, 0.028, 0.02, 0.022, 0.004],
    [0.71, 0.1, 0.066, 0.07, 0.004],
    [0.745, 0.124, 0.074, 0.084, 0.006],
    [0.79, 0.13, 0.077, 0.088, 0.006],
    [0.84, 0.124, 0.074, 0.076, 0.004],
    [0.89, 0.114, 0.07, 0.066, 0.002],
    [0.95, 0.117, 0.074, 0.068, 0],
    [1.02, 0.123, 0.08, 0.072, -0.002],
    [1.09, 0.13, 0.083, 0.075, -0.003],
    [1.15, 0.141, 0.079, 0.074, -0.002],
    [1.2, 0.158, 0.069, 0.071, 0.002],
    [1.232, 0.14, 0.056, 0.06, 0.004],
    [1.255, 0.085, 0.046, 0.05, 0.006],
    [1.27, 0.052, 0.04, 0.044, 0.008],
  ],
  /** Rings at or above this height widen with the shoulders slider. */
  shoulderFrom: 1.1,
});

/** Leg radii along hip joint (t = 0) → ankle (t = 1). [t, rx, rz]. */
export const LEG = Object.freeze({
  rings: [
    [-0.13, 0.066, 0.068], [0, 0.068, 0.07], [0.22, 0.061, 0.063], [0.42, 0.049, 0.051],
    [0.49, 0.045, 0.048], [0.57, 0.046, 0.051], [0.7, 0.043, 0.047], [0.86, 0.033, 0.035],
    [0.97, 0.028, 0.03], [1.0, 0.028, 0.03],
  ],
});

/** Arm radii along shoulder (t = 0) → wrist (t = 1). [t, rx, rz]. */
export const ARM = Object.freeze({
  rings: [
    [-0.09, 0.044, 0.046], [0, 0.043, 0.045], [0.3, 0.037, 0.039], [0.52, 0.032, 0.034],
    [0.62, 0.034, 0.035], [0.85, 0.029, 0.027], [1.0, 0.025, 0.021], [1.04, 0.025, 0.021],
  ],
  cuffT: 0.97,
});

export const NECK = Object.freeze({ bottom: 1.225, top: 1.34, r: [0.04, 0.036, 0.037] });

export const HAND = Object.freeze({
  palm: { w: 0.07, l: 0.074, t: 0.024 },
  finger: { r: 0.0078, lengths: [0.056, 0.064, 0.06, 0.047], spread: 0.017 },
  thumb: { r: 0.0088, length: 0.05, base: [0.012, -0.018, -0.02] },
  /** Relaxed finger curl per joint (rad). */
  curl: [0.35, 0.55, 0.35],
  /** Wand-hand grip curl. */
  grip: [0.95, 1.2, 0.8],
});

export const SHOE = Object.freeze({
  heel: 0.04, toe: 0.19, width: 0.078, height: 0.075, sole: 0.012, segments: 18,
});

export const SKIRT = Object.freeze({ top: 0.89, hem: 0.56, flare: 0.075, pleats: 14, pleatDepth: 0.006 });

export const COLLAR = Object.freeze({ y: 1.255, height: 0.03, r: 0.046 });

export const TIE = Object.freeze({ width: 0.036, tip: 0.05, top: 1.245, bottom: 0.99, knot: 0.012, stripes: 7 });

// ------------------------------------------------------------------ head

/**
 * Head sculpt: signed-distance primitives in head space (origin at the
 * head centre, -Z is the face). Rays from the centre are marched onto the
 * surface to build a star-shaped mesh on a warped latitude/longitude grid.
 */
export const HEAD = Object.freeze({
  segments: [128, 96],
  /** Front / mid-face vertex concentration (0 = uniform, 1 = max). */
  warpU: 0.55,
  warpV: 0.62,
  warpVCenter: 0.56,
  /** UV rows 0..vMax belong to the head; the rest holds flat patches. */
  vMax: 0.88,
  march: { start: 0.22, steps: 80, eps: 0.00012, relax: 0.85 },
  cranium: { c: [0, 0.022, 0.012], r: [0.07, 0.084, 0.09] },
  face: { c: [0, -0.028, -0.018], r: [0.056, 0.063, 0.062], k: 0.03 },
  jaw: { c: [0, -0.056, 0.01], half: [0.043, 0.025, 0.048], round: 0.024, k: 0.028 },
  chin: { c: [0, -0.086, -0.046], r: [0.019, 0.015, 0.014], k: 0.018 },
  cheek: { c: [0.04, -0.004, -0.056], r: [0.019, 0.014, 0.016], k: 0.02 },
  brow: { y: 0.029, z: -0.074, x: 0.034, r: 0.0115, k: 0.02 },
  forehead: { c: [0, 0.045, -0.052], r: [0.05, 0.035, 0.03], k: 0.03 },
  eye: { y: 0.012, z: -0.061, r: 0.0126 },
  socket: { extra: 0.0048, k: 0.005 },
  nose: {
    root: [0, 0.013, -0.078], tip: [0, -0.021, -0.095], bridgeR: 0.0054,
    tipR: [0.0088, 0.0082, 0.0086], ala: [0.0094, -0.0255, -0.0855], alaR: [0.0062, 0.0058, 0.0064], k: 0.0085,
  },
  lips: {
    y: -0.043,
    upper: { c: [0, -0.039, -0.079], r: [0.02, 0.0055, 0.0085] },
    lower: { c: [0, -0.048, -0.077], r: [0.018, 0.0066, 0.0085] },
    seam: { r: [0.0215, 0.0011, 0.007], z: -0.083 },
    corner: 0.0205,
    k: 0.006,
  },
  neck: { a: [0, -0.03, 0.02], b: [0, -0.15, 0.016], r: 0.04, k: 0.022 },
  ear: { y: 0.004, z: 0.012, rx: 0.0168, ry: 0.029, depth: 0.009, tilt: 0.26, rim: 0.0035, segments: [20, 7] },
  /** Scale range applied from the height slider (small kids have big heads). */
  scaleRange: [0.965, 1.03],
  /** Neck weight blend below this head-space height. */
  neckBlend: [-0.07, -0.12],
});

/**
 * Face texture layout: the head occupies v 0..HEAD.vMax; flat colour
 * patches for other skin parts sit in the strip below. [u0, v0, u1, v1].
 */
export const FACE_UV = Object.freeze({
  skin: [0.02, 0.9, 0.2, 0.98],
  ear: [0.24, 0.9, 0.42, 0.98],
  lash: [0.46, 0.9, 0.54, 0.98],
  teeth: [0.58, 0.9, 0.68, 0.98],
  mouth: [0.72, 0.9, 0.8, 0.98],
  lid: [0.84, 0.9, 0.98, 0.98],
});

/** Clothing atlas layout (one texture per character). [u0, v0, u1, v1]. */
export const CLOTH_UV = Object.freeze({
  torso: [0, 0, 0.5, 0.5],
  pelvis: [0, 0.5, 0.5, 0.62],
  skirt: [0, 0.62, 0.5, 0.75],
  arms: [0.5, 0, 0.75, 0.5],
  legs: [0.75, 0, 1, 0.5],
  shoes: [0.5, 0.5, 0.75, 0.75],
  collar: [0.75, 0.5, 1, 0.56],
  tie: [0.75, 0.56, 0.85, 0.75],
  gloves: [0.85, 0.56, 1, 0.75],
  pads: [0.5, 0.75, 0.75, 1],
  crest: [0.75, 0.75, 1, 1],
});

/** Texture detail. */
export const CHARACTER_TEXTURES = Object.freeze({
  iris: 256,
  hair: 256,
  stripes: 256,
  wand: [64, 512],
  /** Vest / sweater knit rib period in atlas pixels (at 1024). */
  knit: 7,
  /** Quidditch number on the back of the sweater. */
  kitNumberFont: 'bold 120px Georgia, serif',
});

/** Eyelids: spherical shells around the eyeball (angles in radians). */
export const EYELID = Object.freeze({
  gap: 0.0011,
  upperOpen: 0.42,
  lowerOpen: -0.25,
  closed: -0.22,
  halfWidth: 1.02,
  segments: [16, 6],
  lash: { length: 0.0042, angle: 0.9 },
});

export const TEETH = Object.freeze({ radius: 0.021, arc: 1.15, height: 0.0052, upperY: -0.0402, lowerY: -0.047, z: -0.0735, segments: 14 });

/** Facial blend shapes (morph targets) built from deformation fields. */
export const MORPHS = Object.freeze({
  jawOpen: { angle: -0.3, hinge: [0, -0.004, 0.012], pocket: 0.022 },
  smile: { corner: [0.0045, 0.0055, 0.0045], cheek: [0, 0.0038, -0.0025], sigma: 0.011 },
  frown: { brow: [0.0028, -0.0042, -0.001], corner: [0, -0.0035, 0], sigma: 0.011 },
  browUp: { lift: 0.0062, sigma: 0.019 },
  pucker: { squeeze: 0.34, forward: 0.0062, sigma: 0.013 },
  wide: { corner: [0.0045, 0.0008, 0.0022], sigma: 0.011 },
});

export const EXPRESSIONS = Object.freeze({
  neutral: { label: 'Nötr', morphs: {} },
  smile: { label: 'Gülümse', morphs: { smile: 1 } },
  frown: { label: 'Kaş çat', morphs: { frown: 1 } },
  surprise: { label: 'Şaşır', morphs: { browUp: 1, jawOpen: 0.35 } },
  pain: { label: 'Acı', morphs: { frown: 0.8, wide: 0.6, jawOpen: 0.15 } },
});

/** Syllable visemes: letter → morph weights (Turkish orthography). */
export const VISEMES = Object.freeze({
  a: { jawOpen: 0.75 }, e: { jawOpen: 0.45, wide: 0.6 }, 'ı': { jawOpen: 0.3, wide: 0.3 }, i: { jawOpen: 0.25, wide: 0.8 },
  o: { jawOpen: 0.55, pucker: 0.6 }, 'ö': { jawOpen: 0.4, pucker: 0.7 }, u: { jawOpen: 0.3, pucker: 0.9 }, 'ü': { jawOpen: 0.25, pucker: 1 },
  m: {}, b: {}, p: {}, f: { jawOpen: 0.12 }, v: { jawOpen: 0.12 },
});

export const FACE_ANIM = Object.freeze({
  blinkInterval: [2.2, 6],
  blinkDuration: 0.13,
  expressionRate: 7,
  visemeRate: 18,
  syllableSeconds: 0.16,
  /** Eye darts while idle. */
  saccadeInterval: [0.8, 3],
  saccadeAngle: 0.08,
});

// ------------------------------------------------------------------ hair

/**
 * Hairline height (head space) by azimuth |θ| (0 = face, π = nape).
 * Styles offset it and add thickness, noise, fringes, curtains and extras.
 */
export const HAIRLINE = Object.freeze([
  [0, 0.052], [0.45, 0.054], [0.78, 0.042], [1.05, 0.024], [1.22, -0.004], [1.38, 0.008],
  [1.62, 0.014], [1.95, 0.004], [2.35, -0.03], [Math.PI, -0.052],
]);

export const HAIR_STYLES = Object.freeze({
  messy: { label: 'Dağınık', thickness: { top: 0.016, side: 0.008, back: 0.011 }, noise: { amp: 0.008, freq: 6, spiky: 1 }, fringe: { depth: 0.024, width: 0.9, jag: 0.006 }, lineOffset: 0 },
  short: { label: 'Kısa', thickness: { top: 0.011, side: 0.005, back: 0.008 }, noise: { amp: 0.0018, freq: 9, spiky: 0 }, fringe: null, lineOffset: 0, part: 0.5 },
  curly: { label: 'Kıvırcık', thickness: { top: 0.028, side: 0.019, back: 0.022 }, noise: { amp: 0.0075, freq: 15, spiky: 0, curls: 1 }, fringe: { depth: 0.012, width: 1, jag: 0.004 }, lineOffset: 0.002 },
  long: { label: 'Uzun düz', thickness: { top: 0.01, side: 0.008, back: 0.01 }, noise: { amp: 0.0012, freq: 10, spiky: 0 }, fringe: null, part: 0, lineOffset: 0, curtain: { length: 0.3, front: 1.12, flare: 0.022, curl: 0 } },
  bob: { label: 'Küt kâküllü', thickness: { top: 0.014, side: 0.011, back: 0.012 }, noise: { amp: 0.0012, freq: 10, spiky: 0 }, fringe: { depth: 0.033, width: 1.05, jag: 0.0015, straight: 1 }, lineOffset: 0, curtain: { length: 0.1, front: 1.18, flare: 0.012, curl: 0.014 } },
  ponytail: { label: 'At kuyruğu', thickness: { top: 0.007, side: 0.005, back: 0.006 }, noise: { amp: 0.0008, freq: 10, spiky: 0 }, fringe: null, lineOffset: 0, extras: [{ type: 'tail', points: [[0, 0.052, 0.086], [0, 0.03, 0.128], [0, -0.07, 0.132], [0, -0.17, 0.112]], radius: [0.016, 0.023, 0.017, 0.006] }] },
  braids: { label: 'Örgülü', thickness: { top: 0.007, side: 0.006, back: 0.007 }, noise: { amp: 0.0008, freq: 10, spiky: 0 }, fringe: null, part: 0, lineOffset: 0, extras: [{ type: 'braid', points: [[0.058, -0.012, 0.035], [0.074, -0.1, 0.02], [0.088, -0.19, -0.012], [0.09, -0.27, -0.03]], radius: [0.014, 0.013, 0.012, 0.007] }, { type: 'braid', mirror: true }] },
  bun: { label: 'Topuz', thickness: { top: 0.007, side: 0.005, back: 0.006 }, noise: { amp: 0.0008, freq: 10, spiky: 0 }, fringe: null, lineOffset: 0, extras: [{ type: 'bun', center: [0, 0.07, 0.075], radius: 0.034 }] },
  buzz: { label: 'Kazıtılmış', thickness: { top: 0.0024, side: 0.0018, back: 0.002 }, noise: { amp: 0.0003, freq: 12, spiky: 0 }, fringe: null, lineOffset: 0.004 },
});

export const HAIR = Object.freeze({
  segments: [72, 44],
  /** Minimum shell offset at the hairline (avoids z-fighting with the scalp). */
  minThickness: 0.0012,
  edgeSoftness: 0.006,
  tube: { segments: 14, rings: 22 },
  curtain: { columns: 44, rows: 12 },
  /** Body silhouette the curtain drapes over (head space). */
  shoulders: { y0: -0.12, y1: -0.18, rx: 0.17, rz: 0.085, z: 0.02 },
});

// ------------------------------------------------------------------ cloth

export const ROBE = Object.freeze({
  offset: 0.017,
  /** Half-angle of the front opening at the collar, waist and hem (rad). */
  open: { top: 0.62, waist: 0.24, hem: 0.2 },
  hemY: 0.11,
  flare: 0.13,
  columns: 40,
  skirtRows: 13,
  /** Top rows follow the body exactly (CPU-skinned pins). */
  upperRows: 9,
  sleeve: { segments: 14, rows: 7, domeRows: 2, wristRadius: 0.085, extend: 0.035 },
  hood: { width: 0.19, height: 0.12, depth: 0.05, y: 1.19 },
  crest: { size: [0.062, 0.072], pos: [-0.075, 1.1] },
});

export const SCARF = Object.freeze({
  wrap: { y: 1.262, height: 0.046, r: [0.06, 0.056], segments: 28 },
  tail: { width: 0.075, length: 0.34, rows: 10, anchor: [0.055, 1.225, -0.055] },
  stripes: 6,
});

export const CAPE = Object.freeze({ width: 0.34, length: 0.62, columns: 12, rows: 12, y: 1.215, z: 0.07 });

/** Verlet cloth solver tuning. */
export const CLOTH = Object.freeze({
  step: 1 / 60,
  maxSubsteps: 3,
  gravity: -9.81,
  damping: 0.035,
  /** Pull toward the skinned rest shape (keeps the robe tidy). */
  shapeStiffness: 0.018,
  windScale: 0.9,
  collisionMargin: 0.012,
  /** Root jump that counts as a teleport (m); resets the cloth. */
  teleportDistance: 1.5,
  /** Beyond this distance from the camera the cloth follows the body rigidly. */
  simDistance: 22,
});

/** Level-of-detail distances for characters (m). */
export const CHARACTER_LOD = Object.freeze({ faceDetail: 9, shadows: 30, hide: 160 });
