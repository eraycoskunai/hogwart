/**
 * @file Hogwarts grounds: terrain shape (heightfield features), paths,
 * forest mask, vegetation, lake, props, students, triggers and teleports.
 * Coordinates: metres, +X east, -Z north (the lake lies south of the
 * castle), castle plateau centred on the origin.
 */

export const GROUNDS = Object.freeze({
  id: 'grounds',
  name: 'Hogwarts arazisi',
  /** Clear-weather fog multiplier (long views over the valley). */
  fogScale: 0.42,
  spawn: { position: [104, 42, -8], yaw: Math.PI / 2 },
  /** Title-screen camera orbit around the castle. */
  menuOrbit: { center: [0, 0, 0], radius: 330, height: 120, speed: 0.02, look: [0, 48, 0] },
  /** The Entrance Hall's great doors (north face): enter the castle interior. */
  castleEntrance: { pos: [-15, 42, -65.6], radius: 4.2, region: 'castle' },
});

export const TERRAIN = Object.freeze({
  size: 1600,
  cell: 2,
  seed: 1991,
  /** Cells per render chunk and chunk levels of detail (vertex step). */
  chunkCells: 100,
  lod: [{ dist: 280, step: 1 }, { dist: 640, step: 2 }, { dist: Infinity, step: 4 }],
  skirt: 5,
  baseHeight: 11,
  hills: { amp: 8, freq: 5, octaves: 5 },
  detail: { amp: 0.7, freq: 60, octaves: 3 },
  mountains: { start: 540, full: 770, height: 240, freq: 9, octaves: 5 },
  /** shelf: bed depth at the rim; bedPower > 1 widens the shallow wading zone. */
  lake: { center: [-30, 330], radii: [310, 205], depth: 26, shelf: 1, bedPower: 2, shore: 48, wobble: 0.09, level: 0 },
  plateau: { center: [0, 0], radii: [192, 162], height: 42, cliff: 16, wobble: 0.05 },
  bumps: [
    { center: [318, -12], radius: 85, height: 27 },
    { center: [-430, -330], radius: 150, height: 34 },
    { center: [250, 330], radius: 120, height: 14 },
  ],
  flats: [
    { name: 'pitch', center: [480, -70], radii: [100, 62], height: 16, blend: 50 },
    { name: 'hut', center: [-252, 62], radii: [28, 24], height: null, blend: 22 },
  ],
  path: { width: 3.4, blend: 7, cobbleNearCastle: 0 },
  /** [x, z, y|null] control points; null keeps the natural height. */
  paths: [
    { name: 'north', points: [[0, -118, 42], [4, -168, 40], [10, -215, 31], [-8, -265, 22], [6, -330, null], [34, -450, null], [70, -620, null]] },
    { name: 'west', points: [[-150, 28, 42], [-186, 40, 33], [-218, 52, 22], [-252, 62, null], [-300, 64, null], [-345, 70, null]] },
    { name: 'shore', points: [[-252, 62, null], [-236, 110, null], [-212, 142, null], [-192, 162, null]] },
    { name: 'east', points: [[300, -12, null], [352, -30, null], [410, -52, null], [470, -70, null]] },
  ],
  forest: { center: [-640, -140], radii: [380, 600], wobble: 0.22 },
  /** Heights (relative to the water) that turn into shore mud / sand. */
  shore: [-0.8, 2.2],
  /** Splat texture channels: R dirt path, G forest floor, B paving, A shore. */
  rockSlope: [0.62, 0.78],
  layers: ['grass', 'dirt', 'rock', 'mud', 'cobblestone'],
  /** Metres per texture repeat for each layer. */
  layerTile: [4, 5, 9, 5, 3.5],
});

export const LAKE = Object.freeze({
  level: 0,
  shallowColor: '#2f6a6c',
  deepColor: '#07212b',
  depthFalloff: 9,
  foamDepth: 0.6,
  opacityShore: 0.55,
  tile: 7,
  /** Water deeper than this (m) is out of the player's depth. */
  swimDepth: 1.25,
  deepWarning: 7,
});

export const VEGETATION = Object.freeze({
  grid: 7.5,
  forestDensity: 0.92,
  meadowDensity: 0.018,
  /** Minimum normal.y for a tree. */
  minNormalY: 0.84,
  minAboveWater: 1,
  pathClearance: 5,
  clearings: [
    { center: [0, 0], radius: 205 },
    { center: [480, -70], radius: 120 },
    { center: [-252, 62], radius: 24 },
    { center: [318, -12], radius: 30 },
  ],
  forestMix: { oak: 0.34, pine: 0.4, dead: 0.26 },
  meadowMix: { oak: 0.7, pine: 0.3 },
  /** Distance (m) at which trees switch to impostors (scaled by quality). */
  nearDistance: 85,
  refresh: 0.4,
  variantsPerSpecies: 3,
  impostorSize: 256,
  trunkCollider: { segments: 8, height: 4 },
  rocks: { cliffCount: 420, shoreCount: 160, forestCount: 380, meadowCount: 90 },
});

export const GRASS = Object.freeze({
  radius: 42,
  /** Clumps per quality. */
  counts: { low: 0, medium: 16000, high: 30000, ultra: 52000 },
  height: [0.3, 0.62],
  width: 0.09,
  blades: 4,
  segments: 2,
  clumpRadius: 0.16,
  colorA: '#4f6f2a',
  colorB: '#8a9a45',
  wind: 0.35,
});

export const PITCH = Object.freeze({
  center: [480, -70],
  radii: [78, 44],
  hoopHeights: [14, 17, 14],
  hoopSpacing: 7,
  hoopRadius: 1.6,
  standCount: 10,
  standHeight: 13,
  standSize: [9, 6],
  standRadiusPad: 16,
});

export const HUT = Object.freeze({
  center: [-252, 62],
  radius: 4.4,
  wallHeight: 3.6,
  roofHeight: 4.2,
  door: [1.4, 2.4],
  pumpkins: 9,
  smoke: { rate: 6, rise: 1.2, life: 6 },
  fence: { radius: 11, posts: 22, arc: 2.2 },
});

/** Lamp posts along paths (world XZ; height taken from the terrain). */
export const GROUND_LAMPS = Object.freeze([
  [8, -190], [2, -240], [-4, -300], [20, -400],
  [-176, 38], [-230, 56], [310, -18], [380, -38], [440, -58],
]);

export const GROUND_STUDENTS = Object.freeze([
  { seed: 7101, behavior: 'idle', pos: [70, 42, -60], yaw: 2.2 },
  { seed: 7207, behavior: 'walk', pos: [30, 42, -95], to: [-30, 42, -95], yaw: Math.PI / 2 },
  { seed: 7313, behavior: 'cast', pos: [-204, null, 150], target: [-170, 1, 190], yaw: 0 },
  { seed: 7421, behavior: 'idle', pos: [440, null, -30], yaw: 1.2, outfit: 'quidditch' },
  { seed: 7527, behavior: 'walk', pos: [-236, null, 96], to: [-212, null, 144], yaw: 0 },
]);

export const GROUND_TRIGGERS = Object.freeze([
  { id: 'info:lake', pos: [-194, null, 158], size: [16, 6, 16], message: 'Kara Göl — derin ve soğuk. Derinlerinde bir şeylerin kıpırdadığı söylenir.' },
  { id: 'info:forest', pos: [-320, null, 66], size: [16, 8, 30], message: 'Yasak Orman — öğrencilerin girmesi kesinlikle yasaktır.' },
  { id: 'info:hut', pos: [-238, null, 62], size: [10, 6, 16], message: 'Bekçi kulübesi — kapı kilitli, bacadan duman tütüyor.' },
  { id: 'info:pitch', pos: [405, null, -52], size: [12, 8, 24], message: 'Quidditch sahası — sezon maçları burada oynanır.' },
  { id: 'info:viaduct', pos: [150, 42, -2], size: [10, 6, 12], message: 'Taş köprü — şatoyu doğu tepesine bağlar.' },
  { id: 'info:gate', pos: [0, 42, -126], size: [16, 8, 8], message: 'Şatonun kuzey kapısı — Hogsmeade yolu buradan iner.' },
  { id: 'cinematic:grounds', pos: [96, 42, -8], size: [3, 2, 3], cinematic: 'grounds', message: 'Şato turu (Boşluk/Esc ile atla)' },
]);

export const GROUND_TELEPORTS = Object.freeze([
  { name: 'Doğu avlusu', pos: [104, 42, -8], yaw: Math.PI / 2 },
  { name: 'Kuzey kapısı', pos: [0, 42, -128], yaw: 0 },
  { name: 'Şato kapısı', pos: [-15, 42, -68.5], yaw: Math.PI },
  { name: 'Hogsmeade yolu', pos: [6, null, -330], yaw: 0 },
  { name: 'Taş köprü', pos: [220, 42, -6], yaw: -Math.PI / 2 },
  { name: 'Göl kıyısı', pos: [-194, null, 160], yaw: -2.37 },
  { name: 'Bekçi kulübesi', pos: [-236, null, 62], yaw: Math.PI / 2 },
  { name: 'Yasak Orman kenarı', pos: [-330, null, 70], yaw: Math.PI / 2 },
  { name: 'Yasak Orman derinlikleri', pos: [-560, null, -60], yaw: Math.PI / 2 },
  { name: 'Quidditch sahası', pos: [410, null, -52], yaw: -Math.PI / 2 },
  { name: 'Uçurum altı (göl)', pos: [10, null, 171], yaw: 0 },
  { name: 'Dağ eteği', pos: [420, null, -560], yaw: Math.PI * 0.8 },
]);

export const GROUND_CINEMATICS = Object.freeze({
  grounds: {
    id: 'grounds',
    duration: 26,
    fovStart: 50,
    fovEnd: 58,
    points: [
      [110, 48, -10], [240, 70, -140], [120, 110, -300], [-160, 120, -260], [-330, 90, 40],
      [-220, 60, 330], [60, 45, 360], [250, 70, 220], [200, 60, 40], [115, 47, -8],
    ],
    look: [
      [0, 50, 0], [0, 55, 0], [0, 50, -60], [-40, 50, 0], [-60, 40, 40],
      [-20, 30, 120], [0, 45, 60], [0, 50, 20], [60, 48, 0], [60, 44, -6],
    ],
  },
});
