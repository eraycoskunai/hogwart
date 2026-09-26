/**
 * @file Lessons: four subjects taught by original professors, each a small
 * game played with the real systems. Lessons run during class hours; a
 * lesson can be taken once per game day for house points (story lessons
 * complete once). Points scale with the score (0…1).
 *
 *   charms    levitate cushions into a glowing circle (Wingardium Leviosa)
 *   dada      parry practice bolts with Protego at the right moment
 *   patronus  story: learn and cast Expecto Patronum (unlocks the spell)
 *   potions   brew by choosing each step of a recipe from memory
 *   flight    fly the pitch ring course on your broom
 */

const PI = Math.PI;

export const CLASS_HOURS = Object.freeze([9, 18]);

export const PROFESSORS = Object.freeze({
  charms: { name: 'Profesör Tilda Çınarlı', first: 'Tilda', last: 'Çınarlı', seed: 71101, house: 'ravenclaw', region: 'castle', pos: [52, 14, -38.7], yaw: PI },
  dada: { name: 'Profesör Baran Demirkalkan', first: 'Baran', last: 'Demirkalkan', seed: 71207, house: 'gryffindor', region: 'castle', pos: [18, 14.4, -30], yaw: -PI / 2 },
  potions: { name: 'Profesör Selvi Ateşoğlu', first: 'Selvi', last: 'Ateşoğlu', seed: 71313, house: 'slytherin', region: 'castle', pos: [-34.5, -6, 9.5], yaw: PI / 2 },
  flight: { name: 'Hoca Rüzgâr Aydemir', first: 'Rüzgâr', last: 'Aydemir', seed: 71419, house: 'hufflepuff', region: 'grounds', pos: [404, null, -36], yaw: -PI / 2 },
});

export const LESSONS = Object.freeze({
  charms: {
    teacher: 'charms', name: 'Tılsım: Wingardium Leviosa', points: 30,
    intro: 'Hoş geldin! Bugün Havalandırma Büyüsü\'nü çalışacağız. Savur ve fiske at — "le-VİY-o-sa". Masaların üstündeki üç minderi havalandır ve öndeki parlayan çemberin içine bırak. İki dakikan var.',
    praise: 'Harika! Minderler kuş tüyü gibi süzüldü.',
    poor: 'Olsun, havalandırmak kolay değildir. Bileğini gevşek tut.',
    /** Cushions (size, mass), spawn spots and the target circle. */
    cushion: { size: [0.55, 0.16, 0.55], mass: 2, color: '#8a3a52', spots: [[46.5, 15.2, -27], [50, 15.2, -23], [53.5, 15.2, -27]] },
    target: { pos: [51.8, 14, -33.2], radius: 1.4 },
    time: 120,
  },
  dada: {
    teacher: 'dada', name: 'KSKS: Savuşturma', points: 30,
    intro: 'Karşımda dur. Sana antrenman büyüleri atacağım; Protego\'yu tam çarpmadan önce kaldırırsan büyü geri yansır. Sekiz atış — kaç tanesini savuşturabileceksin?',
    praise: 'Mükemmel zamanlama! Gerçek bir düellocusun.',
    poor: 'Kalkanı çok erken ya da çok geç kaldırıyorsun. Büyünün ışığına bak, sonra kaldır.',
    shots: 8,
    every: 2.4,
    /** Where the student stands. */
    spot: [23.8, 14, -32.25, PI / 2],
  },
  patronus: {
    teacher: 'dada', name: 'KSKS: Expecto Patronum', points: 40, story: true,
    intro: 'Solgunlara karşı tek bir savunma var: Patronus. En mutlu anını düşün — sadece hatırlama, yeniden yaşa. Sonra asanı kaldır ve söyle: Expecto Patronum! Hadi, dene.',
    praise: 'İşte bu! Işığın koruyucun artık seninle. Solgunlar yaklaşamaz.',
    poor: 'Tekrar dene. Daha mutlu bir anı…',
    unlock: 'patronus',
    time: 90,
  },
  potions: {
    teacher: 'potions', name: 'İksir: Uyanış İksiri', points: 30,
    intro: 'Tarif tahtada. İyi oku, çünkü kazanın başında kitaba bakmak yok. Yanlış malzeme, yanlış karıştırma… sonuç kazanında patlama olur.',
    praise: 'Kusursuz renk. Bu iksiri satsan kese dolardı.',
    poor: 'Kıvamı tutturamadın. Tarifi bir dahaki sefere daha dikkatli oku.',
    /** The nearest desk cauldron (bubbles and the result puff). */
    cauldron: [-39, -5.1, 3.5],
    recipe: [
      { right: '3 dilim gece kökü ekle', wrong: ['2 yılan dişi ekle', 'Bir avuç ısırgan ekle', 'Ateşi sonuna kadar aç'] },
      { right: 'Saat yönünde 4 kez karıştır', wrong: ['Saat yönünün tersine 4 kez karıştır', 'Hiç karıştırmadan bekle', 'Saat yönünde 7 kez karıştır'] },
      { right: 'Ateşi kıs, mor olana dek bekle', wrong: ['Ateşi aç, kaynamasını bekle', 'Hemen şişeye doldur', 'Soğuk su ekle'] },
      { right: '1 kanatlı tohum ekle', wrong: ['3 kanatlı tohum ekle', 'Gece kökü ekle', 'Tuz ekle'] },
      { right: 'Saat yönünün tersine 1 kez karıştır', wrong: ['Saat yönünde 1 kez karıştır', 'Sert sert çırp', 'Asayla kazana vur'] },
    ],
  },
  flight: {
    teacher: 'flight', name: 'Uçuş: Halka parkuru', points: 30,
    intro: 'Süpürgene bin! Saha turu parkurundaki halkalardan geç. Madalya alırsan binana puan yazarım.',
    praise: 'Göklerin çocuğusun!',
    poor: 'Yavaş ama güvenli. Bir dahaki sefere dalışları kullan.',
    race: 'pitch',
  },
});
