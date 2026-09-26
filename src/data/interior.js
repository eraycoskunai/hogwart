/**
 * @file Hogwarts castle interior (Phase 6). Its own region with its own
 * coordinates (metres, +X east, -Z north, floor 0 = the Entrance Hall).
 *
 * The interior is a graph of cells (rooms) joined by links (doorways):
 *   cell.min / cell.max  inner air box (walls are built outward, `wall` thick)
 *   link                 opening cut through both cells' walls: side on `a`,
 *                        `at` = world coordinate along that wall (x for n/s,
 *                        z for e/w), `y` = sill height, optional door
 * Cells are streamed (built / freed by graph distance from the player) and
 * rendered with portal culling through the links.
 *
 * Canon characters are only ever named in lines, never shown.
 */

const LEVEL = 7;
/** Floor heights of the Staircase Tower levels. */
export const LEVELS = Object.freeze([0, LEVEL, LEVEL * 2, LEVEL * 3]);

export const INTERIOR_KIT = Object.freeze({
  wall: 0.8,
  floorThickness: 0.5,
  /** Door leaves. */
  door: { thickness: 0.12, openAngle: 1.75, speed: 1.6, strap: 0.09, handleRadius: 0.07 },
  column: { base: 0.5, capital: 0.45, segments: 16 },
  torch: { height: 2.2, color: 0xff9a48, intensity: 9, distance: 11 },
  window: { frame: 0.22, depth: 0.3 },
  railing: { height: 1.05, thickness: 0.14, post: 0.16, postSpacing: 1.6 },
  bookshelf: { depth: 0.5, shelfGap: 0.52, board: 0.05, side: 0.08, inset: 0.06 },
  desk: { width: 1.4, depth: 0.6, height: 0.76, top: 0.05 },
  chair: { seat: 0.46, size: 0.44, back: 0.95 },
  armor: { height: 1.95, collider: 0.4 },
  /** greetGap: seconds between greetings from any portrait (no chorus in corridors). */
  portrait: { frame: 0.09, depth: 0.06, canvas: [160, 200], animFps: 12, animCount: 4, animRange: 14, talkRange: 3.2, talkCooldown: 9, greetGap: 7 },
  cauldron: { radius: 0.38, height: 0.5, stand: 0.28 },
  jar: { radius: 0.07, height: 0.2, spacing: 0.22 },
  crate: { size: 0.9 },
  chest: { size: [1.1, 0.6, 0.62] },
});

/** Surface materials: name → library key + overrides (tile = metres per repeat). */
export const INTERIOR_MATERIALS = Object.freeze({
  stone: { key: 'hogwartsStone', tile: 3, surface: { dampHeight: 1.2 } },
  trim: { key: 'hogwartsStone', tile: 1.4 },
  marble: { key: 'marble', tile: 2.5, color: 0xb4aca2 },
  flag: { key: 'flagstone', tile: 3 },
  parquet: { key: 'woodParquet', tile: 3 },
  wood: { key: 'woodPlanks:walnut', tile: 2 },
  woodLight: { key: 'woodPlanks', tile: 2 },
  iron: { key: 'wroughtIron', tile: 1 },
  brass: { key: 'brass', tile: 1 },
  carpet: { key: 'carpet', tile: 2.5, triplanar: false },
  books: { key: 'books', tile: 1, triplanar: false },
  leather: { key: 'leather:red', tile: 1, triplanar: false },
  cloth: { key: 'robeFabric:burlap', tile: 1.5 },
  dungeonWall: { key: 'hogwartsStone', tile: 2.5, surface: { moss: 0.8, damp: 1, dampHeight: 1.6, dirt: 0.7, variation: 0.7 } },
  dungeonFloor: { key: 'cobblestone', tile: 2.5, surface: { moss: 0.3, dirt: 0.6 } },
  // Moving parts use object-space UVs (world-space mapping would swim).
  stoneMoving: { key: 'hogwartsStone', tile: 2, triplanar: false },
  woodMoving: { key: 'woodPlanks:walnut', tile: 1.2, triplanar: false },
  ironMoving: { key: 'wroughtIron', tile: 1, triplanar: false },
});

/** Library keys used besides the surface materials. */
export const INTERIOR_EXTRA_KEYS = Object.freeze(['candleFlame', 'ghost', 'tapestry:lion', 'tapestry:badger', 'tapestry:eagle', 'tapestry:snake']);

/** Warm interior ambient fills (light probe stand-ins). */
const AMB = Object.freeze({
  warm: { sky: 0xffd6a0, ground: 0x4a3420, intensity: 0.7 },
  hall: { sky: 0xffcf96, ground: 0x4a2c16, intensity: 0.8 },
  cool: { sky: 0xb8c4d8, ground: 0x2c2a2a, intensity: 0.6 },
  dungeon: { sky: 0x5a7a5e, ground: 0x1a1c14, intensity: 0.5 },
  library: { sky: 0xe8c890, ground: 0x3a2818, intensity: 0.62 },
});

const TORCH = 'torch';
const CANDLE = 'candle';

/** Portraits along a wall every `step` metres between a and b (skipping `skip` ranges). */
function row(side, a, b, step, y, size, skip = []) {
  const out = [];
  for (let at = a; at <= b + 1e-6; at += step) {
    if (skip.some(([s0, s1]) => at > s0 && at < s1)) continue;
    out.push({ side, at: Math.round(at * 100) / 100, y, size });
  }
  return out;
}

/** Staircase Tower portraits: every level, all four walls, clear of doorways and torches. */
function towerPortraits() {
  const list = [];
  const size = [1.1, 1.4];
  for (const ly of LEVELS) {
    const y = ly + 2.6;
    for (const x of [33, 36, 44, 47]) list.push({ side: 'n', at: x, y, size }, { side: 's', at: x, y, size });
    for (const z of [-7, -4, 4, 7]) list.push({ side: 'e', at: z, y, size }, { side: 'w', at: z, y, size });
  }
  return list;
}

export const INTERIOR = Object.freeze({
  id: 'castle',
  name: 'Hogwarts — şato içi',
  fogScale: 1,
  spawn: { position: [0, 0, 11.5], yaw: 0 },
  menuOrbit: { center: [0, 0, 2], radius: 9, height: 5, speed: 0.05, look: [0, 4, -4] },
  /** Where the great doors lead (grounds coordinates). */
  exit: { region: 'grounds', position: [-15, 42, -69], yaw: 0 },

  /** Streaming: build within `keep` links, prefetch within `prefetch`, free beyond `drop` after `dropDelay` s. */
  streaming: { keep: 1, prefetch: 2, drop: 4, dropDelay: 6, maxPortalDepth: 8 },

  cells: [
    {
      id: 'entrance',
      name: 'Giriş Holü',
      min: [-14, 0, -10], max: [14, 14, 14],
      floor: 'marble', walls: 'stone', ceiling: 'wood',
      grade: 'corridor', ambient: AMB.warm,
      windows: [
        { side: 's', at: -8, y: 8, width: 2.2, height: 4.5 },
        { side: 's', at: 8, y: 8, width: 2.2, height: 4.5 },
        { side: 'e', at: -6, y: 7, width: 2, height: 4.5 },
        { side: 'w', at: -6, y: 7, width: 2, height: 4.5 },
      ],
      features: [
        { type: 'columns', mat: 'trim', radius: 0.65, positions: [[-9, -5], [9, -5], [-9, 3], [9, 3], [-9, 10], [9, 10]] },
        { type: 'carpet', from: [0, 13.5], to: [0, -9.5], width: 3.2 },
        { type: 'tapestries', list: [
          { key: 'tapestry:lion', side: 'n', at: -10.5, y: 5.2, size: [2.4, 3.6] },
          { key: 'tapestry:badger', side: 'n', at: -5.5, y: 5.2, size: [2.4, 3.6] },
          { key: 'tapestry:eagle', side: 'n', at: 5.5, y: 5.2, size: [2.4, 3.6] },
          { key: 'tapestry:snake', side: 'n', at: 10.5, y: 5.2, size: [2.4, 3.6] },
        ] },
        { type: 'torches', list: [['e', 10], ['e', -3], ['w', 1], ['w', 9.5], ['s', -4], ['s', 4]] },
        { type: 'armor', list: [{ pos: [12.9, -7.5], face: 'w' }, { pos: [-12.9, 12.6], face: 'e' }, { pos: [12.9, 6.6], face: 'w' }] },
        { type: 'chandelier', pos: [0, 10.5, 2], radius: 2.2, candles: 16, light: { color: 0xffc27a, intensity: 18, distance: 26 } },
        { type: 'portraits', list: [...row('w', -8, -3, 2.5, 3, [1, 1.3]), ...row('e', 5, 8, 3, 3, [1, 1.3])] },
      ],
    },
    {
      id: 'greatHall',
      name: 'Büyük Salon',
      min: [-12, 0, -61.6], max: [12, 16, -11.6],
      floor: 'flag', walls: 'stone', ceiling: 'enchanted',
      grade: 'greatHall', ambient: AMB.hall,
      windows: [-55, -47, -39, -31, -23].flatMap((z) => [
        { side: 'e', at: z, y: 5, width: 2.8, height: 8.5 },
        { side: 'w', at: z, y: 5, width: 2.8, height: 8.5 },
      ]),
      features: [
        { type: 'dais', min: [-11.9, -61.5], max: [11.9, -53], height: 0.6, steps: 3, mat: 'marble' },
        { type: 'tables', mat: 'wood', list: [-7.5, -2.5, 2.5, 7.5].map((x) => ({ pos: [x, -33], length: 30, axis: 'z' })) },
        { type: 'staffTable', pos: [0, -57.5], length: 16, y: 0.6, chairs: 9, mat: 'wood' },
        { type: 'lectern', pos: [0, -51.6], face: 's', owl: true },
        { type: 'tapestries', list: [
          { key: 'tapestry:lion', side: 'n', at: -9, y: 8.5, size: [3, 5.5] },
          { key: 'tapestry:badger', side: 'n', at: -3, y: 8.5, size: [3, 5.5] },
          { key: 'tapestry:eagle', side: 'n', at: 3, y: 8.5, size: [3, 5.5] },
          { key: 'tapestry:snake', side: 'n', at: 9, y: 8.5, size: [3, 5.5] },
        ] },
        { type: 'candles', count: 180, height: [8.5, 12.5] },
        { type: 'lights', list: [-52, -42, -32, -22].flatMap((z) => [
          { pos: [-5, 9, z], color: 0xffc27a, intensity: 16, distance: 20, flicker: CANDLE },
          { pos: [5, 9, z], color: 0xffc27a, intensity: 16, distance: 20, flicker: CANDLE },
        ]) },
        { type: 'torches', list: [['s', -8], ['s', 8], ['e', -51], ['w', -51], ['e', -43], ['w', -43], ['e', -35], ['w', -35], ['e', -27], ['w', -27], ['e', -19], ['w', -19]] },
      ],
    },
    {
      id: 'eastPassage',
      name: 'Doğu geçidi',
      min: [15.6, 0, 0.5], max: [28.9, 4.5, 3.5],
      floor: 'flag', walls: 'stone', ceiling: 'stone',
      grade: 'corridor', ambient: AMB.warm,
      features: [
        { type: 'portraits', list: [...row('n', 17.8, 26.8, 3, 2.2, [0.8, 1]), ...row('s', 19.3, 25.3, 3, 2.2, [0.8, 1])] },
        { type: 'torches', list: [['n', 25.3], ['s', 17.8]] },
        { type: 'carpet', from: [16, 2], to: [28.5, 2], width: 1.6 },
      ],
    },
    {
      id: 'duelClub',
      name: 'Düello Kulübü',
      min: [15.6, 0, 5.1], max: [28.9, 9, 22],
      floor: 'flag', walls: 'stone', ceiling: 'wood',
      grade: 'corridor', ambient: AMB.warm,
      windows: [{ side: 'e', at: 10, y: 3.5, width: 1.6, height: 3.4 }, { side: 'e', at: 17, y: 3.5, width: 1.6, height: 3.4 }],
      features: [
        /** The duelling stage (see DUEL.bounds). */
        { type: 'dais', min: [19.2, 7.5], max: [25.3, 20], height: 0.9, steps: 3, mat: 'wood' },
        { type: 'carpet', from: [22.25, 8.2], to: [22.25, 19.3], width: 1.2, y: 0.9 },
        { type: 'benches', mat: 'wood', list: [{ pos: [17, 10], length: 5, axis: 'z' }, { pos: [17, 16.5], length: 5, axis: 'z' }, { pos: [27.4, 10], length: 5, axis: 'z' }, { pos: [27.4, 16.5], length: 5, axis: 'z' }] },
        { type: 'tapestries', list: [{ key: 'tapestry:lion', side: 'n', at: 19.5, y: 4.5, size: [2, 3] }, { key: 'tapestry:snake', side: 'n', at: 25, y: 4.5, size: [2, 3] }] },
        { type: 'chandelier', pos: [22.25, 7.6, 13.5], radius: 1.8, candles: 14, light: { color: 0xffc27a, intensity: 16, distance: 20 } },
        { type: 'torches', list: [['w', 8], ['w', 18], ['s', 18], ['s', 26.5], ['e', 13.5]] },
        { type: 'armor', list: [{ pos: [16.3, 21.3], face: 'e' }, { pos: [28.2, 5.8], face: 'w' }] },
      ],
    },
    {
      id: 'tower',
      name: 'Merdiven Kulesi',
      min: [30.5, 0, -9.5], max: [49.5, 28, 9.5],
      floor: 'marble', walls: 'stone', ceiling: 'wood',
      grade: 'corridor', ambient: AMB.cool,
      windows: LEVELS.flatMap((ly) => [
        { side: 'e', at: 0, y: ly + 2.2, width: 1.4, height: 3.2 },
        { side: 's', at: 40, y: ly + 2.2, width: 1.4, height: 3.2 },
      ]),
      features: [
        {
          type: 'balconies',
          center: [40, 0],
          shaft: 5.7,
          thickness: 0.5,
          mat: 'marble',
          levels: [
            { y: LEVELS[1], sides: ['n', 'e'] },
            { y: LEVELS[2], sides: ['n', 's'] },
            { y: LEVELS[3], sides: ['n', 'w'] },
          ],
          gap: 3.4,
        },
        { type: 'portraits', list: towerPortraits() },
        { type: 'torches', list: LEVELS.flatMap((ly) => [['n', 37.6, ly], ['n', 42.4, ly], ['s', 37.6, ly], ['s', 42.4, ly], ['e', -1.8, ly], ['e', 1.8, ly], ['w', -1.8, ly]]) },
        { type: 'lights', list: [
          { pos: [40, 5, 0], color: 0xffd09a, intensity: 14, distance: 16, flicker: CANDLE },
          { pos: [40, 17, 0], color: 0xffd09a, intensity: 14, distance: 16, flicker: CANDLE },
          { pos: [40, 26, 0], color: 0xffd09a, intensity: 12, distance: 14, flicker: CANDLE },
        ] },
      ],
      /** Moving staircases: rotate 90° together; see README for the connection cycle. */
      staircases: {
        center: [40, 0],
        run: 11.4,
        rise: LEVEL,
        width: 2.6,
        steps: 30,
        thickness: 0.45,
        rail: 1.0,
        pause: 16,
        rotateTime: 5,
        /** Heading index 0 n, 1 e, 2 s, 3 w (the rising direction) at phase 0. */
        flights: [{ level: 0, heading: 0 }, { level: 1, heading: 1 }, { level: 2, heading: 2 }],
      },
    },
    {
      id: 'corridor1',
      name: '1. kat koridoru',
      min: [38, 7, -40], max: [42, 12, -11.1],
      floor: 'flag', walls: 'stone', ceiling: 'stone',
      grade: 'corridor', ambient: AMB.warm,
      windows: [-36, -28, -20].map((z) => ({ side: 'e', at: z, y: 8.4, width: 1.5, height: 2.8 })),
      features: [
        { type: 'portraits', list: [...row('w', -26, -14, 4, 9.2, [0.9, 1.15]), ...row('e', -32, -16, 8, 9.2, [0.9, 1.15]), { side: 'n', at: 40, y: 9.4, size: [1.3, 1.6] }] },
        { type: 'armor', list: [{ pos: [38.7, -37], face: 'e' }, { pos: [41.3, -24], face: 'w' }] },
        { type: 'lights', list: [-34, -24, -15].map((z) => ({ pos: [40, 11.2, z], color: 0xffc98a, intensity: 8, distance: 10, flicker: CANDLE })) },
        { type: 'carpet', from: [40, -11.5], to: [40, -39.5], width: 1.8 },
      ],
    },
    {
      id: 'library',
      name: 'Kütüphane',
      min: [16, 7, -44], max: [36.4, 13.2, -22],
      floor: 'parquet', walls: 'stone', ceiling: 'wood',
      grade: 'library', ambient: AMB.library,
      windows: [-26, -31].map((z) => ({ side: 'w', at: z, y: 8.2, width: 1.6, height: 3.2 })),
      features: [
        { type: 'bookshelves', mat: 'wood', height: 3.4, list: [
          { from: [17.6, -25.5], to: [27, -25.5], double: true },
          { from: [17.6, -29], to: [27, -29], double: true },
          { from: [17.6, -32.5], to: [27, -32.5], double: true },
          { from: [16.3, -35.8], to: [36.1, -35.8], double: false, face: 'n', gaps: [[25, 27.4]] },
          { from: [17.6, -40.3], to: [34.8, -40.3], double: true },
          { from: [16.3, -43.7], to: [36.1, -43.7], double: false, face: 's' },
        ] },
        { type: 'grille', axis: 'x', z: -36.8, from: 16, to: 36.4, height: 3.2, gate: { at: 26.2, width: 2.2 } },
        { type: 'tables', mat: 'wood', list: [{ pos: [31.5, -26], length: 5, axis: 'z' }, { pos: [31.5, -32], length: 4, axis: 'z' }] },
        { type: 'lamps', list: [[31.5, -24.5], [31.5, -27.5], [31.5, -32]] },
        { type: 'lights', list: [
          { pos: [22, 12, -27], color: 0xffc98a, intensity: 9, distance: 12, flicker: CANDLE },
          { pos: [31, 12, -29], color: 0xffc98a, intensity: 9, distance: 12, flicker: CANDLE },
          { pos: [26, 11.5, -41], color: 0xc9a0ff, intensity: 5, distance: 9, flicker: CANDLE },
        ] },
      ],
    },
    {
      id: 'corridor2',
      name: '2. kat koridoru',
      min: [38, 14, -40], max: [42, 19, -11.1],
      floor: 'flag', walls: 'stone', ceiling: 'stone',
      grade: 'corridor', ambient: AMB.warm,
      features: [
        { type: 'portraits', list: [...row('w', -27, -15, 4, 16.2, [0.9, 1.15]), ...row('e', -37, -16, 7, 16.2, [0.9, 1.15], [[-32, -28]]), { side: 'n', at: 40, y: 16.4, size: [1.3, 1.6] }] },
        { type: 'armor', list: [{ pos: [41.3, -35.5], face: 'w' }, { pos: [38.7, -20], face: 'e' }] },
        { type: 'lights', list: [-34, -24, -15].map((z) => ({ pos: [40, 18.2, z], color: 0xffc98a, intensity: 8, distance: 10, flicker: CANDLE })) },
        { type: 'carpet', from: [40, -11.5], to: [40, -39.5], width: 1.8 },
      ],
    },
    {
      id: 'dada',
      name: 'Karanlık Sanatlara Karşı Savunma sınıfı',
      min: [16, 14, -44], max: [36.4, 20, -22],
      floor: 'parquet', walls: 'stone', ceiling: 'wood',
      grade: 'corridor', ambient: AMB.cool,
      windows: [22, 28, 33].map((x) => ({ side: 'n', at: x, y: 15.4, width: 1.6, height: 3.2 })),
      features: [
        { type: 'dais', min: [16.1, -43.9], max: [19.5, -22.1], height: 0.4, steps: 2, mat: 'wood', stepSide: 'e' },
        { type: 'desks', face: 'w', list: [22, 25.5, 29, 32.5].flatMap((x) => [-39, -34.5, -30, -25.5].map((z) => [x, z])) },
        { type: 'teacherDesk', pos: [18, -33], face: 'e', y: 0.4 },
        { type: 'blackboard', side: 'w', at: -33, y: 16.2, width: 5, height: 2.2, title: 'Kalkan Büyüsü', lines: ['Protego — asayı göğüs hizasında tut', 'Bilek sabit, dirsek serbest', 'Ödev: 30 cm parşömen, Cuma'] },
        { type: 'chandelier', pos: [26, 18.8, -33], radius: 1.6, candles: 12, light: { color: 0xffc27a, intensity: 12, distance: 16 } },
        { type: 'armor', list: [{ pos: [35.6, -43.2], face: 'w' }] },
        { type: 'skeleton', pos: [26, 18.2, -38] },
      ],
    },
    {
      id: 'charms',
      name: 'Tılsım sınıfı',
      min: [43.6, 14, -40], max: [60, 20, -20],
      floor: 'parquet', walls: 'stone', ceiling: 'wood',
      grade: 'corridor', ambient: AMB.warm,
      windows: [-36, -30, -24].map((z) => ({ side: 'e', at: z, y: 15.3, width: 1.8, height: 3.4 })),
      features: [
        { type: 'desks', face: 'n', list: [46.5, 50, 53.5, 57].flatMap((x) => [-31, -27, -23].map((z) => [x, z])) },
        { type: 'teacherDesk', pos: [52, -37.2], face: 's', books: 7 },
        { type: 'blackboard', side: 'n', at: 52, y: 16.2, width: 5, height: 2.2, title: 'Havalandırma Büyüsü', lines: ['Wingardium Leviosa — "le-VİY-o-sa"', 'Savur ve fiske at!', 'Önce tüy, sonra ananas'] },
        { type: 'cushions', area: [[44.5, -39], [48, -35]], count: 14 },
        { type: 'chandelier', pos: [51.8, 18.8, -30], radius: 1.6, candles: 12, light: { color: 0xffc27a, intensity: 12, distance: 16 } },
      ],
    },
    {
      id: 'corridor3',
      name: '3. kat koridoru',
      min: [38, 21, -34], max: [42, 26, -11.1],
      floor: 'flag', walls: 'stone', ceiling: 'stone',
      grade: 'corridor', ambient: AMB.cool,
      features: [
        { type: 'portraits', list: [...row('w', -18, -14, 4, 23.2, [0.9, 1.15]), ...row('e', -30, -24, 6, 23.2, [0.9, 1.15]), ...row('e', -15, -15, 1, 23.2, [0.9, 1.15])] },
        { type: 'guardian', side: 'n', at: 40, y: 21.2, size: [1.9, 2.9] },
        { type: 'torches', list: [['w', -31], ['e', -13], ['w', -22]] },
        { type: 'armor', list: [{ pos: [38.7, -32.8], face: 'e' }] },
        { type: 'carpet', from: [40, -11.5], to: [40, -33.5], width: 1.8 },
      ],
    },
    {
      id: 'secretPassage',
      name: 'Gizli geçit',
      min: [43.6, 21, -21.5], max: [54, 24, -18.5],
      floor: 'dungeonFloor', walls: 'dungeonWall', ceiling: 'dungeonWall',
      grade: 'dungeon', ambient: AMB.dungeon,
      features: [{ type: 'torches', list: [['n', 49]] }],
    },
    {
      id: 'secretRoom',
      name: 'Gizli oda',
      min: [55.6, 21, -26], max: [62, 24.5, -16],
      floor: 'dungeonFloor', walls: 'dungeonWall', ceiling: 'dungeonWall',
      grade: 'dungeon', ambient: AMB.dungeon,
      features: [
        { type: 'chest', pos: [60.6, -24.8], face: 'n', note: 'Sandığın dibinde soluk bir not: "Haritayı çalan, yakalanmadıkça sahibidir. — M.M.P.&A." Yazının altında ayak izleri çizilmiş.' },
        { type: 'crates', list: [[56.6, -17, 2], [57.6, -17, 1], [61.2, -17.2, 3]] },
        { type: 'lights', list: [{ pos: [59, 23.6, -21], color: 0xffa860, intensity: 6, distance: 9, flicker: TORCH }] },
        { type: 'candleCluster', list: [[60.4, -24.9, 0.62]] },
      ],
    },
    {
      id: 'requirement',
      name: 'İhtiyaç Odası',
      min: [21.6, 21, -32], max: [36.4, 27, -22],
      floor: 'parquet', walls: 'stone', ceiling: 'wood',
      grade: 'corridor', ambient: AMB.warm,
      /** The room reshapes itself; `variant` features are added to the base set. */
      variants: {
        training: {
          label: 'Antrenman salonu',
          line: 'Duvarda büyük bir kapı beliriyor… İçeride minderler ve antrenman mankenleri var.',
          features: [
            { type: 'mats', list: [[26, -27, 5, 6], [32, -27, 4, 6]] },
            { type: 'dummies', list: [[24, -24.2, 0], [28, -24.2, 0], [33, -24.2, 0]] },
            { type: 'bookshelves', mat: 'wood', height: 2.4, list: [{ from: [22.2, -31.4], to: [30, -31.4], double: false, face: 's' }] },
            { type: 'lights', list: [{ pos: [29, 26, -27], color: 0xffe0b0, intensity: 14, distance: 18, flicker: CANDLE }] },
          ],
        },
        sealed: {
          label: 'Mühürlü Kule',
          /** Offered only once the three seal pieces are found (worldState.story flag). */
          requires: 'sealsReady',
          line: 'Duvarda soğuk, mavi bir ışıkla parlayan demir bir kapı beliriyor. Mühür parçaları cebinde titriyor…',
          features: [
            { type: 'dais', min: [26, -29.5], max: [32, -24.5], height: 0.25, steps: 1, mat: 'marble' },
            { type: 'candleCluster', list: [[23, -23, 1.1], [23, -31, 1.1], [35.4, -23, 1.1], [35.4, -31, 1.1]] },
            { type: 'lights', list: [
              { pos: [29, 26, -27], color: 0x6a8cff, intensity: 16, distance: 18, flicker: CANDLE },
              { pos: [24, 23, -27], color: 0x9a6aff, intensity: 6, distance: 9, flicker: TORCH },
            ] },
          ],
        },
        hiding: {
          label: 'Saklanma yeri',
          line: 'Duvarda küçük bir kapı beliriyor… İçerisi sıcak bir şömine ve yumuşak koltuklarla dolu.',
          features: [
            { type: 'fireplace', side: 'w', at: -27 },
            { type: 'armchairs', list: [[25, -25.5, 'w'], [25, -28.5, 'w'], [28.2, -27, 'w']] },
            { type: 'rug', pos: [26, -27], size: [5, 4] },
            { type: 'bookshelves', mat: 'wood', height: 3, list: [{ from: [30, -31.4], to: [36, -31.4], double: false, face: 's' }, { from: [30, -22.6], to: [36, -22.6], double: false, face: 'n' }] },
          ],
        },
        storage: {
          label: 'Eşya deposu',
          line: 'Duvarda eski bir kapı beliriyor… İçeride yüzyılların eşyaları tavana kadar yığılmış.',
          features: [
            { type: 'crates', list: [[23, -24, 3], [23, -30, 2], [25.4, -31, 4], [28, -23.2, 2], [30.5, -30.8, 3], [33.4, -24, 4], [35, -30.5, 2], [27, -30.7, 1]] },
            { type: 'junk', area: [[24, -29], [34, -25]], count: 22 },
            { type: 'lights', list: [{ pos: [29, 26, -27], color: 0xffb070, intensity: 8, distance: 16, flicker: TORCH }] },
          ],
        },
      },
      features: [{ type: 'lights', list: [{ pos: [29, 25.5, -25], color: 0xffc98a, intensity: 8, distance: 14, flicker: CANDLE }] }],
    },
    {
      id: 'dungeonStairs',
      name: 'Zindan merdiveni',
      min: [-30, -6, 4.6], max: [-15.6, 4.5, 7.4],
      floor: 'dungeonFloor', walls: 'dungeonWall', ceiling: 'dungeonWall',
      grade: 'dungeon', ambient: AMB.dungeon,
      features: [
        { type: 'stairs', mat: 'dungeonFloor', top: [-16.6, 0, 6], dir: 'w', width: 2.8, rise: 6, run: 10.4, steps: 30, landing: 1 },
        { type: 'torches', list: [['n', -19, -1], ['s', -23, -3], ['n', -27, -6]] },
      ],
    },
    {
      id: 'potions',
      name: 'İksir zindanı',
      min: [-50, -6, -4], max: [-31.6, -1, 16],
      floor: 'dungeonFloor', walls: 'dungeonWall', ceiling: 'dungeonWall',
      grade: 'dungeon', ambient: AMB.dungeon,
      features: [
        { type: 'desks', face: 'e', cauldron: true, list: [-46, -42.5, -39].flatMap((x) => [-1, 3.5, 8.5, 13].map((z) => [x, z])) },
        { type: 'teacherDesk', pos: [-34.5, 11.5], face: 'w' },
        { type: 'jarShelves', list: [{ side: 'n', at: -44, y: -4.8, length: 8 }, { side: 's', at: -44, y: -4.8, length: 8 }, { side: 'w', at: 0, y: -4.8, length: 6 }, { side: 'w', at: 12, y: -4.8, length: 6 }] },
        { type: 'torches', list: [['n', -37.5, -6], ['s', -37.5, -6], ['w', 6, -6], ['e', 0, -6], ['e', 12, -6]] },
        { type: 'lights', list: [{ pos: [-41, -2.2, 6], color: 0x8fdc8a, intensity: 6, distance: 16, flicker: CANDLE }] },
      ],
    },
  ],

  links: [
    { a: 'entrance', side: 's', at: 0, y: 0, width: 5, height: 8, door: { leaves: 2, exit: true } },
    { a: 'entrance', b: 'greatHall', side: 'n', at: 0, y: 0, width: 5.2, height: 7.5, door: { leaves: 2, open: true } },
    { a: 'entrance', b: 'eastPassage', side: 'e', at: 2, y: 0, width: 2.8, height: 4.2, door: { leaves: 1 } },
    { a: 'entrance', b: 'duelClub', side: 'e', at: 12.5, y: 0, width: 2.6, height: 3.8, door: { leaves: 2 } },
    { a: 'entrance', b: 'dungeonStairs', side: 'w', at: 6, y: 0, width: 2.6, height: 3.8, door: { leaves: 1 } },
    { a: 'eastPassage', b: 'tower', side: 'e', at: 2, y: 0, width: 2.6, height: 3.8 },
    { a: 'tower', b: 'corridor1', side: 'n', at: 40, y: LEVELS[1], width: 2.8, height: 4 },
    { a: 'tower', b: 'corridor2', side: 'n', at: 40, y: LEVELS[2], width: 2.8, height: 4 },
    { a: 'tower', b: 'corridor3', side: 'n', at: 40, y: LEVELS[3], width: 2.8, height: 4 },
    { a: 'corridor1', b: 'library', side: 'w', at: -33, y: 7, width: 2.6, height: 3.8, door: { leaves: 2 } },
    { a: 'corridor2', b: 'dada', side: 'w', at: -33, y: 14, width: 2.4, height: 3.6, door: { leaves: 1 } },
    { a: 'corridor2', b: 'charms', side: 'e', at: -30, y: 14, width: 2.4, height: 3.6, door: { leaves: 1 } },
    { a: 'corridor3', b: 'secretPassage', side: 'e', at: -20, y: 21, width: 2, height: 2.6, secret: 'brick' },
    { a: 'secretPassage', b: 'secretRoom', side: 'e', at: -20, y: 21, width: 2, height: 2.6 },
    { a: 'corridor3', b: 'requirement', side: 'w', at: -27, y: 21, width: 2.2, height: 3.4, secret: 'requirement', door: { leaves: 1 } },
    { a: 'dungeonStairs', b: 'potions', side: 'w', at: 6, y: -6, width: 2.6, height: 3.6, door: { leaves: 1 } },
  ],

  /** Doors with locks (by link index a→b ids). */
  locks: [
    { cell: 'library', grille: true, spell: 'alohomora', message: 'Yasak Bölüm kilitli. Bir Alohomora büyüsü işe yarayabilir…', unlocked: 'Klik! Yasak Bölüm\'ün kilidi açıldı.' },
  ],

  /** The common-room guardian portrait on the 3rd floor. */
  guardian: {
    name: 'Leydi Morwenna Gülkurusu',
    seed: 90210,
    ask: 'Parola?',
    refuse: 'Hangi bina olduğun Seçmen Şapka töreninde belli olacak tatlım. O zamana dek bu kapı sana kapalı.',
  },

  /** Where the hidden brick is on the 3rd-floor corridor (east wall). */
  secretBrick: { cell: 'corridor3', side: 'e', at: -21.8, y: 22.4, hint: 'Duvardaki bir tuğla diğerlerinden daha aşınmış görünüyor.', opened: 'Tuğlalar birer birer kayarak geri çekiliyor… Gizli bir geçit açıldı!' },

  /** Room of Requirement wall (3rd floor, west wall). */
  requirementWall: { cell: 'corridor3', hint: 'Boş bir duvar… İhtiyacını düşünerek önünden geç.' },

  students: [
    { seed: 8101, behavior: 'sit', pos: [-6.45, 0, -30], yaw: Math.PI / 2 },
    { seed: 8203, behavior: 'sit', pos: [-8.55, 0, -36], yaw: -Math.PI / 2 },
    { seed: 8307, behavior: 'sit', pos: [3.55, 0, -27], yaw: Math.PI / 2 },
    { seed: 8411, behavior: 'sit', pos: [1.45, 0, -40], yaw: -Math.PI / 2 },
    { seed: 8513, behavior: 'walk', pos: [-4, 0, 6], to: [-4, 0, -6], yaw: 0 },
    { seed: 8617, behavior: 'idle', pos: [33.8, 7, -30], yaw: 1.2 },
    { seed: 8719, behavior: 'walk', pos: [40, 7, -14], to: [40, 7, -36], yaw: 0 },
    { seed: 8821, behavior: 'cast', pos: [-36, -6, 6], target: [-41, -5, 6], yaw: Math.PI / 2 },
    { seed: 8923, behavior: 'idle', pos: [51, 14, -24], yaw: 2.6 },
  ],

  ghosts: [
    {
      id: 'bertrand',
      name: 'Sör Bertrand Pasmahmuz',
      seed: 6660,
      color: 0xcfe0ff,
      speed: 1.1,
      height: 0.35,
      path: [[0, 0, -44], [6, 0, -24], [7, 0, -3], [-6, 0, 5], [-10, 0, -14], [-4, 0, -30]],
      lines: [
        'Selam sana, genç büyücü! Kılıcım yok ama onurum yerinde.',
        'Bu salonda dört yüz yıldır ziyafet izlerim; tek bir lokma tadamadım.',
        'Sör Nicholas yine başını düşürmüş, Peeves de onu top diye yuvarlıyormuş. Yakışık almaz!',
        'Dumbledore bu akşam ziyafette yine şarkı söyletecekmiş. Hazırlıklı ol.',
      ],
    },
    {
      id: 'eulalia',
      name: 'Rahibe Eulalia Solukses',
      seed: 7771,
      color: 0xe6dcff,
      speed: 0.8,
      height: 0.25,
      path: [[20, 7, -27], [30, 7, -34], [40, 7, -26], [40, 7, -15], [33, 7, -24]],
      lines: [
        'Şşşt… Kütüphanede konuşulmaz. Madam Pince duyarsa ikimizi de kovar.',
        'Yasak Bölüm\'deki kitaplar geceleri fısıldaşır. Sakın dinleme.',
        'Aradığın kitap her zaman en üst rafta olur. Kütüphanenin laneti budur.',
      ],
    },
    {
      id: 'odo',
      name: 'Keşiş Odo Nemlitaş',
      seed: 5553,
      color: 0xd8ffe0,
      speed: 0.7,
      height: 0.3,
      path: [[-40, -6, 0], [-36, -6, 12], [-26, -4, 6], [-44, -6, 10], [-47, -6, 1]],
      lines: [
        'Kazanlar kaynarken aklını kaçırma evladım… ya da kaçır, ben de burada öyle kaldım.',
        'Snape\'in sınıfında bir damla fazla dökülse, iksir değil felaket olur.',
        'Zindanların taşları nemlidir ama hikâyeleri daha da nemli.',
      ],
    },
  ],

  /** Portrait names and lines (picked by seed). Canon names are only mentioned. */
  portraitNames: [
    'Sör Cadwyn Karakuzgun', 'Madam Ottilie Serinsu', 'Büyücü Aurelius Kemerkaş', 'Leydi Isolde Mürekkepli',
    'Baron Gideon Paslıçan', 'Ebe Hilde Kaynarkazan', 'Usta Tobias Mumdiken', 'Genç Ambrose Yıldızsayan',
    'Kontes Beatrix Tüylüşapka', 'Profesör Silas Tozlukitap', 'Kaptan Hector Süpürgesiz', 'Rahibe Agnes Sessizadım',
    'Simyacı Rowena Bakırtaş', 'Şövalye Percival Kırıkmızrak', 'Madam Clementine Pastabörek', 'Yaşlı Fergus Sisligöz',
  ],
  portraitLines: [
    'Dumbledore\'un bu hafta yine limonlu şeker sipariş ettiğini duydum.',
    'McGonagall Hanım koridorda koşanlara hiç acımaz, bilesin.',
    'Zindanlardan yine tuhaf kokular yükseliyor. Snape bir şey kaynatıyor olmalı.',
    'Hagrid dün gece ormandan çamur içinde döndü. Ne aradığını sorma.',
    'Peeves yine zırhların kasklarını değiştirmiş. Gördün mü?',
    'Merdivenler bugün çok huysuz. Beklemeyi öğren, genç öğrenci.',
    'Portremin tozunu alan olmadı yüz yıldır. Ah, şu cilalı çerçeveler…',
    'Üçüncü kattaki duvarların kulakları vardır. Bazılarının kapıları da.',
    'Filch\'in kedisi az önce buradan geçti. Kuralları çiğniyorsan acele et!',
    'Ben senin yaşındayken bu merdivenler daha yavaş dönerdi.',
    'Kütüphanede Madam Pince\'e sakın kitap geciktirdiğini söyleme.',
    'Quidditch maçı ne zaman? Tablomdan sahayı göremiyorum da.',
    'Şşt! Yan tablodaki leydi bütün gün şarkı söylüyor, başım çatladı.',
    'Hogwarts\'ın gizli geçitleri sayılamayacak kadar çok. Tuğlalara dikkat et.',
  ],
  portraitGreetings: ['Merhaba!', 'Hoş geldin.', 'Oh, bir öğrenci!', 'İyi günler.'],
});

/** Castle fast-travel / debug teleport points (x, y, z, yaw). */
export const CASTLE_TELEPORTS = Object.freeze([
  { name: 'Giriş Holü', pos: [0, 0, 11.5], yaw: 0 },
  { name: 'Büyük Salon', pos: [0, 0, -15], yaw: 0 },
  { name: 'Merdiven Kulesi (zemin)', pos: [36, 0, 6], yaw: Math.PI / 4 },
  { name: 'Kule 1. kat balkonu', pos: [40, LEVELS[1], -7.8], yaw: Math.PI },
  { name: 'Kule 2. kat balkonu', pos: [40, LEVELS[2], -7.8], yaw: Math.PI },
  { name: 'Kule 3. kat balkonu', pos: [40, LEVELS[3], -7.8], yaw: Math.PI },
  { name: 'Kütüphane', pos: [34, 7, -33], yaw: Math.PI / 2 },
  { name: 'KSKS sınıfı', pos: [34.5, 14, -33], yaw: Math.PI / 2 },
  { name: 'Tılsım sınıfı', pos: [45.5, 14, -30], yaw: -Math.PI / 2 },
  { name: '3. kat koridoru', pos: [40, 21, -18], yaw: 0 },
  { name: 'İksir zindanı', pos: [-33, -6, 6], yaw: Math.PI / 2 },
  { name: 'Zindan merdiveni', pos: [-17, 0, 6], yaw: Math.PI / 2 },
  { name: 'Düello Kulübü', pos: [17.4, 0, 12.5], yaw: -Math.PI / 2 },
  { name: 'Yasak Bölüm kapısı (zırhlar)', pos: [26.2, 7, -34], yaw: 0 },
]);
