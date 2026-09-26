/**
 * @file Companions: four original classmates the player can befriend.
 * Who they are (house, look seed, personality), where they spend each part
 * of the day (routines by game hour), what gifts they love or dislike,
 * which spells they use when fighting at your side and the favour each
 * one asks at "Yakın dost" level. Relationship rules (affinity levels,
 * daily chat bonus, gift values) are here too; the lines they speak live
 * in dialogue.js.
 */

const PI = Math.PI;

/** Affinity 0…100 and the named levels (thresholds). */
export const AFFINITY = Object.freeze({
  max: 100,
  levels: [
    { at: 0, name: 'Yabancı' },
    { at: 15, name: 'Tanıdık' },
    { at: 35, name: 'Arkadaş' },
    { at: 60, name: 'Yakın dost' },
    { at: 85, name: 'Can dostu' },
  ],
  /** First chat of each game day. */
  dailyTalk: 3,
  /** Asking about their life (once per topic). */
  topic: 3,
  /** Gift reactions. */
  gift: { loved: 10, liked: 5, neutral: 2, disliked: -4 },
  /** A finished favour. */
  favour: 20,
  /** Level needed to ask them along / to be asked a favour. */
  followLevel: 2,
  favourLevel: 3,
});

/** Gifts bought on the spot during a chat (Galleons). */
export const GIFTS = Object.freeze({
  chocolate: { name: 'Çikolata kurbağası', price: 4 },
  book: { name: 'Eski bir büyü kitabı', price: 12 },
  quill: { name: 'Kartal tüyü kalem', price: 8 },
  plant: { name: 'Saksıda şarkı söyleyen eğrelti', price: 10 },
  polish: { name: 'Süpürge cilası takımı', price: 15 },
  pin: { name: 'Gümüş yılan rozeti', price: 18 },
  sweets: { name: 'Bir kese vızvız şeker', price: 5 },
  dungbomb: { name: 'Pis koku bombası', price: 3 },
});

/**
 * Named spots per region. pos y: null = terrain height. activity:
 * sit | idle | read | cast | watch. yaw: facing (0 = -Z).
 */
export const PLACES = Object.freeze({
  hallA: { region: 'castle', label: 'Büyük Salon', pos: [-6.45, 0, -22], yaw: PI / 2, activity: 'sit' },
  hallB: { region: 'castle', label: 'Büyük Salon', pos: [-1.45, 0, -24], yaw: PI / 2, activity: 'sit' },
  hallC: { region: 'castle', label: 'Büyük Salon', pos: [3.55, 0, -22], yaw: PI / 2, activity: 'sit' },
  hallD: { region: 'castle', label: 'Büyük Salon', pos: [6.45, 0, -24], yaw: -PI / 2, activity: 'sit' },
  library: { region: 'castle', label: 'Kütüphane', pos: [30.45, 7, -25.5], yaw: -PI / 2, activity: 'sit' },
  stacks: { region: 'castle', label: 'Kütüphane rafları', pos: [21.5, 7, -27.2], yaw: 0, activity: 'read' },
  charms: { region: 'castle', label: 'Tılsım sınıfı', pos: [50, 14, -34.5], yaw: 0, activity: 'cast' },
  dada: { region: 'castle', label: 'KSKS sınıfı', pos: [30.8, 14, -28], yaw: PI / 2, activity: 'cast' },
  entranceE: { region: 'castle', label: 'Giriş Holü', pos: [5, 0, 7], yaw: PI * 0.8, activity: 'idle' },
  entranceW: { region: 'castle', label: 'Giriş Holü', pos: [-5, 0, 3], yaw: -PI * 0.3, activity: 'idle' },
  duelBench: { region: 'castle', label: 'Düello Kulübü', pos: [27.4, 0, 16.5], yaw: PI / 2, activity: 'sit' },
  potions: { region: 'castle', label: 'İksir zindanı', pos: [-36, -6, 1.5], yaw: PI / 2, activity: 'cast' },
  pitch: { region: 'grounds', label: 'Quidditch sahası', pos: [432, null, -40], yaw: -PI / 2, activity: 'watch' },
  lake: { region: 'grounds', label: 'Göl kıyısı', pos: [-188, null, 154], yaw: -2.4, activity: 'idle' },
  courtyard: { region: 'grounds', label: 'Doğu avlusu', pos: [100, 42, -12], yaw: PI / 2, activity: 'idle' },
  hut: { region: 'grounds', label: 'Bekçi kulübesinin bahçesi', pos: [-241, null, 72], yaw: PI / 2, activity: 'cast' },
  shopFront: { region: 'grounds', label: 'Süpürge dükkânı', pos: [376, null, -41], yaw: PI / 2, activity: 'idle' },
});

/** Routine slot: [fromHour, toHour, place | null (asleep in the dormitory)]. */
const day = (morning, afternoon, evening) => [
  [7, 9, morning[0]], [9, 12, morning[1]], [12, 14, morning[2]], [14, 18, afternoon], [18, 20, morning[3]], [20, 22.5, evening], [22.5, 31, null],
];

export const COMPANIONS = Object.freeze({
  elif: {
    name: 'Elif Karayel', first: 'Elif', house: 'gryffindor', seed: 90113, outfit: 'uniform',
    traits: 'Cesur, aceleci, uçmaya bayılır; sözünü esirgemez.',
    likes: { polish: 'loved', chocolate: 'liked', sweets: 'liked' }, dislikes: { book: 'disliked', quill: 'disliked' },
    /** Replies she values in conversation. */
    values: 'bold',
    spells: ['stupefy', 'expelliarmus', 'depulso'],
    schedule: day(['hallA', 'charms', 'hallA', 'hallA'], 'pitch', 'duelBench'),
    favour: { kind: 'raceGold', text: 'Herhangi bir yarışta altın madalya kazan', reward: 80 },
  },
  deniz: {
    name: 'Deniz Aksoylu', first: 'Deniz', house: 'ravenclaw', seed: 90227, outfit: 'uniform',
    traits: 'Meraklı, dalgın, her şeyi okur; bulmacaları sever.',
    likes: { book: 'loved', quill: 'liked', plant: 'liked' }, dislikes: { dungbomb: 'disliked', polish: 'disliked' },
    values: 'curious',
    spells: ['glacius', 'petrificus', 'stupefy'],
    schedule: day(['hallB', 'dada', 'hallB', 'hallB'], 'library', 'stacks'),
    favour: { kind: 'kills', enemy: 'armor', count: 2, text: 'Yasak Bölüm\'ü koruyan iki büyülü zırhı alt et', reward: 90 },
  },
  mert: {
    name: 'Mert Yıldıztepe', first: 'Mert', house: 'hufflepuff', seed: 90331, outfit: 'uniform',
    traits: 'Sıcakkanlı, sakar, bitkilerle konuşur; herkesi kollar.',
    likes: { plant: 'loved', sweets: 'loved', chocolate: 'liked' }, dislikes: { dungbomb: 'disliked', pin: 'disliked' },
    values: 'kind',
    spells: ['depulso', 'stupefy'],
    /** Heals you in fights (share of max health, cooldown s, below this health). */
    healer: { amount: 22, cooldown: 14, below: 0.6 },
    schedule: day(['hallC', 'potions', 'hallC', 'hallC'], 'hut', 'entranceW'),
    favour: { kind: 'duelRank', rank: 2, text: 'Düello Kulübü\'nde üçüncü rakibe kadar yüksel', reward: 70 },
  },
  nehir: {
    name: 'Nehir Ayazoğlu', first: 'Nehir', house: 'slytherin', seed: 90443, outfit: 'uniform',
    traits: 'Hırslı, keskin dilli, sadık; kaybetmekten nefret eder.',
    likes: { pin: 'loved', quill: 'liked', book: 'liked' }, dislikes: { sweets: 'disliked', plant: 'disliked' },
    values: 'clever',
    spells: ['confringo', 'incendio', 'stupefy'],
    schedule: day(['hallD', 'dada', 'hallD', 'hallD'], 'courtyard', 'entranceE'),
    favour: { kind: 'quidditchWin', text: 'Bir Quidditch maçı kazan', reward: 100 },
  },
});

/** Companion behaviour tuning. */
export const COMPANION = Object.freeze({
  /** Follow distance band and speeds (m, m/s). */
  follow: { near: 2.4, far: 4, run: 4.8, walk: 1.6, teleport: 28 },
  /** Walk between routine places if the target is this close, otherwise re-appear there out of sight. */
  walkRange: 45,
  walkSpeed: 1.5,
  /** Give up walking after this long (stuck) and re-appear. */
  walkTimeout: 25,
  /** Fighting beside the player. */
  combat: { range: 22, castEvery: [1.8, 3], lead: 0.5 },
  /** Look at / greet the player. */
  lookRange: 7,
  greetRange: 3,
  talkRange: 2.8,
  headHeight: 1.45,
});
