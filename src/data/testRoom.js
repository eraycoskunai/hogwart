/**
 * @file Layout of the engine test room (Phase 1). Units are metres;
 * yaw 0 faces / rises toward -Z. Every area has an info trigger that
 * explains what it tests.
 */

export const TEST_ROOM = {
  id: 'testRoom',
  name: 'Motor Test Salonu',
  spawn: { position: [0, 0, 14], yaw: 0 },
  /** Title-screen camera orbit around the hall. */
  menuOrbit: { center: [0, 0, 0], radius: 46, height: 19, speed: 0.045, look: [0, 3, -6] },

  /**
   * Surface materials: catalogue key (data/materials.js) + world tile size.
   * Names are referenced by the layout below.
   */
  materials: {
    floor: { key: 'flagstone', tile: 4 },
    wall: { key: 'hogwartsStone', tile: 3, surface: { dampHeight: 1.4 } },
    ramp: { key: 'cobblestone', tile: 3 },
    stairs: { key: 'marble', tile: 2 },
    platform: { key: 'woodParquet', tile: 3 },
    tower: { key: 'hogwartsStone', tile: 2.5 },
    // Moving objects must not use world-space (triplanar) mapping or the texture would swim.
    mover: { key: 'brass', tile: 1.5, triplanar: false },
    pillar: { key: 'marble:green', tile: 2 },
    tunnel: { key: 'rock', tile: 4 },
    jump: { key: 'woodPlanks:weathered', tile: 2.5, triplanar: true },
    rim: { key: 'hogwartsStone', tile: 1.5 },
    crate: { key: 'woodPlanks' },
    crateDark: { key: 'woodPlanks:walnut' },
    ball: { key: 'leather:red' },
    iron: { key: 'wroughtIron', tile: 1 },
    wood: { key: 'woodPlanks:walnut' },
    burlap: { key: 'robeFabric:burlap' },
    rod: { key: 'brass', tile: 1 },
    water: { key: 'water', tile: 5 },
    dungeonWall: { key: 'hogwartsStone', tile: 2.5, surface: { moss: 0.85, damp: 1, dampHeight: 1.6, dirt: 0.7, variation: 0.7 } },
    dungeonFloor: { key: 'cobblestone', tile: 2.5, surface: { moss: 0.3, dirt: 0.6 } },
  },

  /** Enclosed demo rooms (Phase 3: interior lighting, grading, enchanted ceiling). */
  rooms: [
    {
      id: 'greatHall',
      name: 'Büyük Salon (örnek)',
      grade: 'greatHall',
      /** Interior fill light standing in for bounced candle light (light probe). */
      ambient: { sky: 0xffcf96, ground: 0x4a2c16, intensity: 0.75 },
      pos: [35, 0, 39.5],
      size: [21, 8, 15],
      wall: 0.6,
      wallMat: 'wall',
      door: { side: 'west', width: 3.4, height: 4.4 },
      ceiling: 'enchanted',
      carpet: { key: 'carpet', size: [2.6, 18], tile: 2.6 },
      tables: [
        { pos: [0, -3.2], length: 15, mat: 'wood' },
        { pos: [0, 3.2], length: 15, mat: 'wood' },
      ],
      tapestries: [
        { key: 'tapestry:lion', wall: 'north', x: -5, y: 4.6, size: [2.2, 2.8] },
        { key: 'tapestry:badger', wall: 'north', x: 5, y: 4.6, size: [2.2, 2.8] },
        { key: 'tapestry:eagle', wall: 'south', x: -5, y: 4.6, size: [2.2, 2.8] },
        { key: 'tapestry:snake', wall: 'south', x: 5, y: 4.6, size: [2.2, 2.8] },
      ],
      candles: { count: 90, height: [4.4, 6.4] },
      lights: [
        { pos: [-6, 5.2, -3], color: 0xffc27a, intensity: 12, distance: 16, flicker: 'candle' },
        { pos: [0, 5.2, -3], color: 0xffc27a, intensity: 12, distance: 16, flicker: 'candle' },
        { pos: [6, 5.2, -3], color: 0xffc27a, intensity: 12, distance: 16, flicker: 'candle' },
        { pos: [-6, 5.2, 3], color: 0xffc27a, intensity: 12, distance: 16, flicker: 'candle' },
        { pos: [0, 5.2, 3], color: 0xffc27a, intensity: 12, distance: 16, flicker: 'candle' },
        { pos: [6, 5.2, 3], color: 0xffc27a, intensity: 12, distance: 16, flicker: 'candle' },
      ],
    },
    {
      id: 'dungeon',
      name: 'Zindan (örnek)',
      grade: 'dungeon',
      ambient: { sky: 0x5a7a5e, ground: 0x1a1c14, intensity: 0.5 },
      pos: [-13, 0, -43.4],
      size: [12, 3.8, 8.6],
      wall: 0.6,
      wallMat: 'dungeonWall',
      floorMat: 'dungeonFloor',
      door: { side: 'south', width: 2.2, height: 2.6 },
      // Torches: [x, z, face] in room space; face +1 = on the west wall facing east.
      torches: [[-5.35, -2, 1], [-5.35, 2.2, 1], [5.35, -2, -1], [5.35, 2.2, -1]],
      torchColor: 0xff8a3a,
      torchIntensity: 9,
      torchDistance: 10,
    },
  ],

  /** Outdoor grading zones. */
  gradeZones: [
    { name: 'Orman kenarı (örnek)', grade: 'forest', min: [-47, -1, 19], max: [-29, 12, 40], indoor: false },
  ],

  /** Decorative set dressing that showcases materials. */
  decorations: {
    tapestries: [
      { key: 'tapestry:lion', pos: [8, 4.6, -47.97], size: [2.4, 3] },
      { key: 'tapestry:badger', pos: [12, 4.6, -47.97], size: [2.4, 3] },
      { key: 'tapestry:eagle', pos: [16, 4.6, -47.97], size: [2.4, 3] },
      { key: 'tapestry:snake', pos: [20, 4.6, -47.97], size: [2.4, 3] },
    ],
    /** Shallow ornamental pool: outer size, rim thickness/height, water level. */
    pool: { pos: [14, 0, 27], size: [6, 4], rim: 0.4, rimHeight: 0.42, waterLevel: 0.3 },
  },

  floor: { size: [96, 1, 96] },
  /** Title banner on the north wall (x, y). */
  title: { x: -26, y: 6.5, width: 20, height: 2.9 },
  walls: { height: 9, thickness: 1 },

  /** Ramps: `pos` is the centre of the low edge; rises `rise` metres. */
  ramps: [
    { pos: [-40, 0, 6], width: 4, angle: 15, rise: 2.5, platformDepth: 3, label: '15°' },
    { pos: [-34, 0, 6], width: 4, angle: 30, rise: 2.5, platformDepth: 3, label: '30°' },
    { pos: [-28, 0, 6], width: 4, angle: 45, rise: 2.5, platformDepth: 3, label: '45°' },
    { pos: [-22, 0, 6], width: 4, angle: 55, rise: 2.5, platformDepth: 3, label: '55° ✕' },
    // Access ramp to the sliding platform's start block.
    { pos: [-40, 0, -26.51], width: 3, angle: 20, rise: 2, platformDepth: 0, label: '' },
    // Access ramp to the rotating bridge's south landing.
    { pos: [30, 0, -19.3], width: 3, angle: 25, rise: 3, platformDepth: 0, label: '' },
  ],

  /** Solid staircases rising toward -Z from `pos` (front edge centre). */
  stairs: [
    { pos: [18, 0, 6], width: 3.5, stepHeight: 0.15, stepDepth: 0.3, steps: 16, landingDepth: 3, label: '0.15 m' },
    { pos: [24, 0, 6], width: 3.5, stepHeight: 0.25, stepDepth: 0.32, steps: 10, landingDepth: 3, label: '0.25 m' },
    { pos: [30, 0, 6], width: 3.5, stepHeight: 0.4, stepDepth: 0.42, steps: 6, landingDepth: 3, label: '0.40 m' },
    { pos: [36, 0, 6], width: 3.5, stepHeight: 0.6, stepDepth: 0.5, steps: 4, landingDepth: 3, label: '0.60 m ✕' },
  ],

  /** Generic static boxes: centre position + full size. */
  blocks: [
    // Elevator towers (fall-damage heights)
    { pos: [-3.12, 1.5, -34], size: [3, 3, 3], material: 'tower', label: '3 m', labelFace: 'south' },
    { pos: [3.12, 5, -34], size: [3, 10, 3], material: 'tower', label: '10 m', labelFace: 'south' },
    { pos: [0, 10, -37.12], size: [3, 20, 3], material: 'tower', label: '20 m', labelFace: 'south', labelY: 4 },
    // Sliding platform end blocks
    { pos: [-40, 1, -34], size: [4, 2, 4], material: 'platform' },
    { pos: [-22, 1, -34], size: [4, 2, 4], material: 'platform' },
    // Rotating bridge landings
    { pos: [23.3, 1.5, -34], size: [3, 3, 3], material: 'platform' },
    { pos: [36.7, 1.5, -34], size: [3, 3, 3], material: 'platform' },
    { pos: [30, 1.5, -40.7], size: [3, 3, 3], material: 'platform' },
    { pos: [30, 1.5, -27.3], size: [3, 3, 3], material: 'platform' },
    // Crouch tunnel (inner height 1.35 m)
    { pos: [38.5, 1.2, 24], size: [0.6, 2.4, 8], material: 'tunnel' },
    { pos: [41.5, 1.2, 24], size: [0.6, 2.4, 8], material: 'tunnel' },
    { pos: [40, 1.875, 24], size: [3.6, 1.05, 8], material: 'tunnel', label: 'Çömel', labelFace: 'south', labelY: 0 },
    // Narrow corridor for camera collision tests
    { pos: [-24.2, 2, 36], size: [0.4, 4, 12], material: 'wall' },
    { pos: [-21.8, 2, 36], size: [0.4, 4, 12], material: 'wall' },
    { pos: [-23, 3.35, 39], size: [2.8, 0.3, 6], material: 'wall' },
    // Jump course (gaps 1.5 / 2 / 2.6 / 3.2 / 4 m) at 1.2 m height
    { pos: [-12, 0.3, 39.9], size: [3, 0.6, 1.2], material: 'jump' },
    { pos: [-12, 0.6, 42], size: [3, 1.2, 3], material: 'jump' },
    { pos: [-7.5, 0.6, 42], size: [3, 1.2, 3], material: 'jump', label: '1.5 m', labelFace: 'south', labelY: -0.2 },
    { pos: [-2.5, 0.6, 42], size: [3, 1.2, 3], material: 'jump', label: '2 m', labelFace: 'south', labelY: -0.2 },
    { pos: [3.1, 0.6, 42], size: [3, 1.2, 3], material: 'jump', label: '2.6 m', labelFace: 'south', labelY: -0.2 },
    { pos: [9.3, 0.6, 42], size: [3, 1.2, 3], material: 'jump', label: '3.2 m', labelFace: 'south', labelY: -0.2 },
    { pos: [16.3, 0.6, 42], size: [3, 1.2, 3], material: 'jump', label: '4 m', labelFace: 'south', labelY: -0.2 },
  ],

  cylinders: [
    // Pillar forest (camera collision)
    { pos: [-42, 0, 24], radius: 0.6, height: 6 },
    { pos: [-38, 0, 23], radius: 0.8, height: 6 },
    { pos: [-35, 0, 27.5], radius: 0.5, height: 6 },
    { pos: [-41, 0, 30], radius: 0.7, height: 6 },
    { pos: [-37, 0, 32.5], radius: 0.9, height: 6 },
    { pos: [-32.5, 0, 33], radius: 0.6, height: 6 },
    { pos: [-44.5, 0, 36], radius: 0.8, height: 6 },
    { pos: [-31, 0, 25], radius: 0.7, height: 6 },
    // Rotating bridge centre pillar
    { pos: [30, 0, -34], radius: 0.7, height: 2.6, material: 'tower' },
  ],

  /** Kinematic platforms. */
  movers: [
    {
      id: 'elevator',
      type: 'path',
      size: [3, 0.4, 3],
      // Centre positions: top surface at 0, 3, 10, 20 m.
      points: [[0, -0.2, -34], [0, 2.8, -34], [0, 9.8, -34], [0, 19.8, -34]],
      speed: 3.2,
      wait: 2.2,
    },
    {
      id: 'slider',
      type: 'path',
      size: [3, 0.4, 3],
      points: [[-36.4, 1.8, -34], [-25.6, 1.8, -34]],
      speed: 2.6,
      wait: 1.6,
    },
    {
      id: 'bridge',
      type: 'rotate',
      size: [10, 0.4, 2.4],
      position: [30, 2.8, -34],
      stepDeg: 90,
      rotateTime: 2.6,
      pause: 3.6,
    },
  ],

  props: {
    crates: [
      { pos: [-16, 0, 22], size: 0.6, mass: 8 },
      { pos: [-14.5, 0, 22.5], size: 0.8, mass: 15 },
      { pos: [-12.5, 0, 22], size: 1.0, mass: 30 },
      { pos: [-10, 0, 22.5], size: 1.4, mass: 90 },
      { pos: [-6.5, 0, 22], size: 2.0, mass: 450 },
      { pos: [-15, 0, 25], size: 0.6, mass: 8 },
      { pos: [-12, 0, 25.5], size: 0.8, mass: 15 },
    ],
    /** Crate pyramids: base-row centre, crate size, rows. */
    pyramids: [{ pos: [-2, 0, 26], size: 0.8, rows: 4, mass: 12 }],
    balls: [
      { pos: [-18, 0, 18.5], radius: 0.3, mass: 3 },
      { pos: [-16.8, 0, 18.5], radius: 0.5, mass: 10 },
      { pos: [-15, 0, 18.5], radius: 0.8, mass: 40 },
    ],
  },

  dummies: [
    { pos: [-7, 0, -14], yaw: 0.35 },
    { pos: [-2.5, 0, -17], yaw: 0.1 },
    { pos: [2.5, 0, -17], yaw: -0.1 },
    { pos: [7, 0, -14], yaw: -0.35 },
  ],

  lamps: [
    { pos: [-12, 0, 8], color: 0xffc27a },
    { pos: [12, 0, 8], color: 0xffc27a },
    { pos: [0, 0, -24], color: 0x9ec8ff },
    { pos: [-8, 0, 32], color: 0xffc27a },
  ],

  triggers: [
    { id: 'info:ramps', pos: [-31, 1.5, 10], size: [22, 3, 2], message: 'Rampa testi — 15°, 30°, 45° yürünebilir; 55° eğim sınırını (48°) aşar, seni aşağı kaydırır.' },
    { id: 'info:stairs', pos: [27, 1.5, 10], size: [22, 3, 2], message: 'Merdiven testi — 0.15 / 0.25 / 0.40 m basamaklar otomatik çıkılır; 0.60 m için zıplamalısın.' },
    { id: 'info:elevator', pos: [0, 1.5, -29], size: [6, 3, 3], message: 'Asansör — 3 m (güvenli), 10 m (hasar), 20 m (ölümcül düşüş). Kulelere asansörden geç.' },
    { id: 'info:props', pos: [-10, 1.5, 17], size: [18, 3, 2], message: 'Fizik — sandıkları ve topları it, piramidi yık; ağır sandıklar yavaş kayar, en büyüğü zar zor kıpırdar.' },
    { id: 'info:tunnel', pos: [40, 1, 18.5], size: [3, 2, 1.5], message: 'Alçak tünel — C ile çömel. Tavanın altındayken ayağa kalkamazsın.' },
    { id: 'info:jumps', pos: [-12, 1.5, 37], size: [4, 3, 2], message: 'Atlama parkuru — coyote time ve zıplama tamponu. 4 m boşluk için Shift ile depar at.' },
    { id: 'info:dummies', pos: [0, 1.5, -10], size: [16, 3, 2], message: 'Hedefler — Tab / orta tık ile kilitlen; kilitliyken fareyi yana savurarak hedef değiştir. Sağ tık: nişan.' },
    { id: 'info:bridge', pos: [30, 1.5, -17.5], size: [4, 3, 2], message: 'Dönen köprü — hareketli merdivenlerin prototipi; üzerindeyken seni taşır ve döndürür.' },
    { id: 'info:slider', pos: [-40, 1.5, -24.5], size: [4, 3, 2], message: 'Kayan platform — seni taşır; üzerinden zıplarken platformun hızını korursun.' },
    { id: 'info:camera', pos: [-35, 1.5, 20], size: [14, 3, 2], message: 'Kamera testi — sütunlar ve dar koridor: kamera duvara girmez, X ile omuz değiştir.' },
    { id: 'info:greatHall', pos: [22.5, 1.5, 39.5], size: [2, 3, 5], message: 'Büyük Salon örneği — büyülü tavan dışarıdaki gökyüzünü gösterir; süzülen mumlar, sıcak altın renk tonu.' },
    { id: 'info:dungeon', pos: [-13, 1.5, -37.6], size: [4, 3, 2], message: 'Zindan örneği — titreyen meşaleler, soğuk yeşil renk tonu, yosunlu nemli taşlar.' },
    { id: 'cinematic:tour', pos: [8, 0.6, 8], size: [2.4, 1.2, 2.4], cinematic: 'tour', message: 'Sinematik kamera turu (Boşluk/Esc ile atla)' },
  ],

  teleports: [
    { name: 'Başlangıç', pos: [0, 0, 14], yaw: 0 },
    { name: 'Rampalar', pos: [-31, 0, 11], yaw: 0 },
    { name: 'Merdivenler', pos: [27, 0, 11], yaw: 0 },
    { name: 'Asansör', pos: [0, 0, -28], yaw: 0 },
    { name: '20 m kule', pos: [0, 20.05, -37.2], yaw: Math.PI },
    { name: 'Kayan platform', pos: [-40, 2.05, -34], yaw: -Math.PI / 2 },
    { name: 'Dönen köprü', pos: [30, 3.05, -27.3], yaw: 0 },
    { name: 'Fizik alanı', pos: [-10, 0, 16], yaw: 0 },
    { name: 'Tünel', pos: [40, 0, 17], yaw: Math.PI },
    { name: 'Sütunlar', pos: [-35, 0, 19], yaw: 0 },
    { name: 'Atlama parkuru', pos: [-12, 1.25, 42], yaw: -Math.PI / 2 },
    { name: 'Hedefler', pos: [0, 0, -9], yaw: 0 },
    { name: 'Büyük Salon', pos: [27.5, 0, 39.5], yaw: -Math.PI / 2 },
    { name: 'Zindan', pos: [-13, 0.05, -40.5], yaw: 0 },
    { name: 'Öğrenciler', pos: [1, 0, 11], yaw: 0.3 },
  ],

  /**
   * Background students (Phase 4 character showcase). Seeds pick their
   * look, name and house; behaviours: idle, walk (to), cast (target), sit.
   */
  students: [
    { seed: 1101, behavior: 'idle', pos: [-3.2, 0, 8.6], yaw: -2.6 },
    { seed: 2207, behavior: 'walk', pos: [4.5, 0, 7], to: [4.5, 0, -3.5], yaw: Math.PI },
    { seed: 3313, behavior: 'cast', pos: [-0.8, 0, -8.8], target: [-2.5, 1.2, -17], yaw: 0 },
    { seed: 4421, behavior: 'sit', pos: [31.5, 0, 35.31], yaw: Math.PI },
    { seed: 5527, behavior: 'idle', pos: [6.4, 0, 12.2], yaw: -2.1, outfit: 'quidditch' },
  ],

  cinematics: {
    tour: {
      id: 'tour',
      duration: 17,
      fovStart: 55,
      fovEnd: 62,
      points: [
        [6, 2.6, 15], [-12, 6, 21], [-44, 9, 14], [-44, 12, -18], [-18, 15, -45],
        [14, 17, -45], [44, 10, -20], [44, 7, 14], [18, 5, 30], [3, 3.2, 20],
      ],
      look: [
        [0, 3, -8], [-30, 1.5, 2], [-30, 2, -2], [-30, 2, -34], [0, 9, -34],
        [0, 14, -34], [30, 3, -34], [27, 1.5, 2], [0, 1.2, 40], [0, 1.5, 12],
      ],
    },
  },
};
