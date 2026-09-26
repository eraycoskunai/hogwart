/**
 * @file Story data: the acceptance letter, the opening cinematic with its
 * narration, the main quest line "Mühürlü Kule" (eight chapters built on
 * the world's places and fights), side quests, the villain, the story
 * items to find, house-point rules and the ending. Everything original;
 * canon names appear only in passing.
 *
 * Objective kinds (see QuestSystem): reach, cell, talk, lesson, kill,
 * boss, item, friend, medal, duel, quidditch, broom, requirement, villain, flag.
 */

export const LETTER = Object.freeze({
  title: 'HOGWARTS CADILIK VE BÜYÜCÜLÜK OKULU',
  lines: [
    'Sevgili {ad} {soyad},',
    'Hogwarts Cadılık ve Büyücülük Okulu\'na nakil başvurunuzun kabul edildiğini bildirmekten memnuniyet duyarız. {bina} binasında yerinizi alacaksınız.',
    'Okulumuzda son aylarda tuhaf olaylar yaşanıyor: Mühürlü Kule\'nin taşları geceleri ışıldıyor, ormandan uğultular geliyor. Endişe etmeyin; yalnızca gözünüzü açık tutun.',
    'Tren bu akşam varacak. Göl kıyısında sizi bekliyoruz.',
  ],
  signature: 'Profesör Aurelia Karanfil — Müdür Yardımcısı',
  button: 'Mektubu katla ve yola çık',
});

/** Opening flyover (lake at dusk → castle → the great doors) with narration. */
export const OPENING = Object.freeze({
  hour: 19.2,
  shot: {
    id: 'opening',
    duration: 34,
    fovStart: 48,
    fovEnd: 60,
    points: [[-60, 16, 360], [-30, 20, 260], [0, 32, 180], [20, 70, 110], [-10, 125, 20], [-40, 95, -80], [-20, 58, -110], [-15, 47, -84]],
    look: [[-10, 60, 60], [-10, 70, 40], [-10, 80, 20], [-15, 85, 0], [-15, 70, -40], [-15, 55, -60], [-15, 46, -66], [-15, 44, -66]],
  },
  narration: [
    [1, 'Göl, akşamın son ışığını yutarken tekneler karanlık suyun üstünde süzüldü.'],
    [8, 'Ve orada, kayalıkların üstünde, yüzlerce pencereyle yanan şato belirdi.'],
    [15, 'Kulelerin arasında biri vardı ki hiç ışık yanmazdı: Mühürlü Kule. Kimse içine girmemişti. Kimse girmemeliydi.'],
    [23, 'Ama bu yıl, kulenin taşları geceleri soluk bir mavilikle ışımaya başladı.'],
    [29, 'Hoş geldin, {ad}. Hikâyen burada başlıyor.'],
  ],
  /** Where the player stands when it ends (grounds, before the great doors). */
  spawn: { region: 'grounds', pos: [-15, 42, -70], yaw: Math.PI },
});

export const VILLAIN = Object.freeze({
  name: 'Morvek Kalgan', title: 'Mühür Kırıcı', seed: 66601,
  health: 260, poise: 160, accuracy: 0.8, castEvery: [1.8, 2.6], shield: 0.25, dodge: 0.5,
  spells: [['darkCurse', 0.4], ['darkStun', 0.3], ['darkFire', 0.3]],
  /** Arena: the Room of Requirement in its sealed form. */
  arena: { minX: 22.6, maxX: 35.4, minZ: -31, maxZ: -23, y: 21 },
  spawn: [33, 21, -27, Math.PI / 2],
  lines: {
    intro: 'Demek mühür parçalarını toplayan sendin. Teşekkür ederim, çocuk — işimi kolaylaştırdın. Şimdi onları bana ver.',
    half: 'Güçlüsün… ama kule bana ait!',
    defeat: 'Bu… bitmedi. Kule bir gün yine uyanacak…',
  },
});

/** Glowing story pickups (appear while their objective is active). */
export const STORY_ITEMS = Object.freeze({
  sealBook: { name: 'Mühürler Kitabı', region: 'castle', pos: [30, 7, -38.6], color: '#b8a0ff', text: 'Sararmış sayfalarda üç mühürden söz ediliyor: "Biri gölgelerin kampında, biri ağların kalbinde, biri de soğuğun kıyısında." Kenarda bir imza: M. Kalgan.' },
  seal1: { name: 'Mühür parçası (gölge)', region: 'grounds', pos: [40, null, -500], color: '#7a8cff', text: 'Kalgan\'ın adamlarından birinin cübbesinden düşen mavi taş, avucunda nabız gibi atıyor.' },
  seal2: { name: 'Mühür parçası (ağ)', region: 'grounds', pos: [-620, null, -226], color: '#9aff7a', text: 'Nyxara\'nın yuvasının dibinde, ağlara sarılı ikinci parça.' },
  seal3: { name: 'Mühür parçası (soğuk)', region: 'grounds', pos: [4, null, 192], color: '#9ae0ff', text: 'Solgunların bıraktığı buz gibi sisin içinde üçüncü parça parlıyor.' },
});

/**
 * Quests. `chapter` orders the main line; steps run in order. Rewards:
 * points (house), galleons, affinity {id: n}, unlock (spell id), flag.
 */
export const QUESTS = Object.freeze([
  {
    id: 'main1', main: true, chapter: 1, name: 'Hoş geldin',
    desc: 'Şatoya ilk adım. Büyük Salon\'u bul ve sınıf arkadaşlarınla tanış.',
    steps: [
      { kind: 'cell', cell: 'greatHall', text: 'Büyük Salon\'a git' },
      { kind: 'talk', text: 'Bir sınıf arkadaşınla konuş' },
    ],
    reward: { points: 10, galleons: 20 },
  },
  {
    id: 'main2', main: true, chapter: 2, name: 'İlk dersler',
    desc: 'Profesörler seni bekliyor. Ders saatleri 09:00–18:00.',
    steps: [
      { kind: 'lesson', lesson: 'charms', text: 'Tılsım dersine katıl (2. kat, doğu)' },
      { kind: 'lesson', lesson: 'dada', text: 'Karanlık Sanatlara Karşı Savunma dersine katıl (2. kat, batı)' },
    ],
    reward: { points: 20, galleons: 30 },
  },
  {
    id: 'main3', main: true, chapter: 3, name: 'Duvardaki fısıltı',
    desc: 'Üçüncü kattaki portreler bir gizli odadan fısıldaşıyor. Bir tuğla, doğru dokunuşu bekliyor olabilir.',
    steps: [
      { kind: 'reach', region: 'castle', pos: [40, 21, -20], radius: 5, text: '3. kat koridoruna çık' },
      { kind: 'cell', cell: 'secretRoom', text: 'Gizli odayı bul (tuğlaları dene)' },
    ],
    reward: { points: 15, galleons: 25 },
  },
  {
    id: 'main4', main: true, chapter: 4, name: 'Yasak Bölüm',
    desc: 'Gizli odadaki not, kütüphanenin kilitli bölümündeki bir kitaba işaret ediyor.',
    steps: [
      { kind: 'kill', enemy: 'armor', count: 2, text: 'Yasak Bölüm\'ün bekçisi zırhları alt et (Alohomora ile gir)' },
      { kind: 'item', item: 'sealBook', text: 'Mühürler Kitabı\'nı bul' },
    ],
    reward: { points: 25, galleons: 40 },
  },
  {
    id: 'main5', main: true, chapter: 5, name: 'Kuzeydeki gölgeler',
    desc: 'Kitaba göre ilk mühür parçası, kuzey yolundaki karanlık büyücülerin kampında.',
    steps: [
      { kind: 'kill', enemy: 'darkWizard', count: 3, text: 'Kuzey yolundaki karanlık büyücüleri yen' },
      { kind: 'item', item: 'seal1', text: 'Kamptaki mühür parçasını al' },
    ],
    reward: { points: 30, galleons: 60 },
  },
  {
    id: 'main6', main: true, chapter: 6, name: 'Ağların kalbi',
    desc: 'İkinci parça Yasak Orman\'ın derinliğindeki örümcek yuvasında. Oranın bir kraliçesi var.',
    steps: [
      { kind: 'boss', boss: 'spiderQueen', text: 'Örümcek yuvasında Nyxara\'yı yen' },
      { kind: 'item', item: 'seal2', text: 'Yuvadaki mühür parçasını al' },
    ],
    reward: { points: 40, galleons: 100 },
  },
  {
    id: 'main7', main: true, chapter: 7, name: 'Soğuğun kıyısı',
    desc: 'Son parçayı gece göl kıyısında dolaşan Solgunlar koruyor. Onları yalnızca bir Patronus kovar.',
    steps: [
      { kind: 'lesson', lesson: 'patronus', text: 'KSKS profesöründen Patronus büyüsünü öğren' },
      { kind: 'kill', enemy: 'wraith', count: 2, text: 'Gece göl kıyısındaki Solgunları kov' },
      { kind: 'item', item: 'seal3', text: 'Göl kıyısındaki mühür parçasını al' },
    ],
    reward: { points: 40, galleons: 80, flag: 'sealsReady' },
  },
  {
    id: 'main8', main: true, chapter: 8, name: 'Mühürlü Kule',
    desc: 'Üç parça tamam. Kitaba göre kuleye giden yol, "ihtiyacı olana kendini gösteren odada".',
    steps: [
      { kind: 'requirement', variant: 'sealed', text: '7. kattaki boş duvarda İhtiyaç Odası\'nı "Mühürlü Kule" için çağır' },
      { kind: 'villain', text: 'Morvek Kalgan\'ı durdur' },
    ],
    reward: { points: 100, galleons: 250, flag: 'finished' },
  },
  // Side quests.
  { id: 'side-friends', name: 'Yeni arkadaşlar', desc: 'Sınıf arkadaşlarınla yakınlaş.', steps: [{ kind: 'friend', level: 2, count: 2, text: 'İki kişiyle "Arkadaş" ol' }], reward: { points: 15, galleons: 30 } },
  { id: 'side-broom', name: 'Kendi süpürgen', desc: 'Okul süpürgesi bir yere kadar.', steps: [{ kind: 'broom', text: 'Süpürge dükkânından yeni bir süpürge al' }, { kind: 'medal', text: 'Bir yarışta madalya kazan' }], reward: { points: 10, galleons: 40 } },
  { id: 'side-duel', name: 'Düello çırağı', desc: 'Düello Kulübü sıralamasında yüksel.', steps: [{ kind: 'duel', rank: 3, text: 'Düello Kulübü\'nde dördüncü rakibe ulaş' }], reward: { points: 25, galleons: 50 } },
  { id: 'side-cup', name: 'Kupa ateşi', desc: 'Binan için bir Quidditch maçı kazan.', steps: [{ kind: 'quidditch', text: 'Bir Quidditch maçı kazan' }], reward: { points: 30, galleons: 40 } },
  { id: 'side-potions', name: 'Kazan başında', desc: 'İksir profesörü titizdir.', steps: [{ kind: 'lesson', lesson: 'potions', text: 'İksir dersine katıl (zindan)' }, { kind: 'lesson', lesson: 'flight', text: 'Uçuş dersine katıl (Quidditch sahası)' }], reward: { points: 15, galleons: 20 } },
]);

/** Portrait whisper that points to chapter 3 (shown when it starts). */
export const WHISPERS = Object.freeze({
  main3: 'Bir portre fısıldıyor: "Üçüncü katta… ikinci pencerenin karşısında… taş kıpırdıyor…"',
  main4: 'Gizli odadaki not: "Kitap Yasak Bölüm\'de, zırhların baktığı rafta. — M.K."',
});

/** House Cup. */
export const HOUSE_CUP = Object.freeze({
  /** Starting points (random in range) and rivals' daily gains. */
  start: [20, 60],
  rivalDaily: [5, 25],
  /** Points taken for being out after curfew in the castle corridors (once per night). */
  curfew: { from: 22.5, to: 6, penalty: 5, cells: ['entrance', 'corridor1', 'corridor2', 'corridor3', 'tower', 'eastPassage'] },
});

export const ENDING = Object.freeze({
  lines: [
    'Kalgan\'ın asası yere düştüğünde, üç mühür parçası kendi kendine birleşti ve odanın duvarlarında mavi bir ışık dolaştı.',
    'Mühürlü Kule yeniden uyudu — bu kez, anahtarını koruyan biri vardı.',
    'Büyük Salon o akşam her zamankinden kalabalıktı. Ve herkes aynı ismi fısıldıyordu: {ad}.',
  ],
  cup: 'Bina Kupası sayımı yapıldı…',
});
