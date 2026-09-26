/**
 * @file Interface data: loading-screen tips, map baking and markers,
 * minimap, discovery, fast travel rules, save slots and thumbnails, UI
 * scale steps and notification timing.
 */

export const TIPS = Object.freeze([
  'Protego\'yu büyü çarpmadan hemen önce kaldırırsan büyü geri yansır.',
  'Sersemletme çubuğu dolan düşmana E ile bitirici büyü yapabilirsin.',
  'Süpürgede dalış hız kazandırır; F ile takla atıp Bludger\'lardan kaçabilirsin.',
  'Glacius suyu dondurur — Kara Göl\'ün üzerinde yürümeyi dene.',
  'Dostların seninle konuştukça yakınlaşır; sevdikleri hediyeyi bulmaya çalış.',
  'Ders saatleri 09:00–18:00. Geçilen her ders binana puan kazandırır.',
  'Gece yarısına doğru koridorlarda dolaşırsan bir sınıf başkanına yakalanabilirsin.',
  'Solgunlara karşı tek çare Patronus. KSKS profesörü sana öğretebilir.',
  'Haritada (M) keşfettiğin yerlere hızlı yolculuk yapabilirsin.',
  'Incendio ahşabı tutuşturur, Glacius ateşi söndürür, Confringo donmuş şeyleri parçalar.',
  'Wingardium Leviosa ile kaldırdığın bir sandığı Depulso ile fırlatabilirsin.',
  'Jest modunda (G) temiz çizilen büyüler daha güçlü ve daha ucuzdur.',
  'Kütüphanenin Yasak Bölüm\'ü kilitli — ama Alohomora diye bir büyü var.',
  'Günlük (L) görevlerini ve Bina Kupası sıralamasını gösterir.',
]);

export const MAP = Object.freeze({
  /** Grounds bake: texture size and world extent (square, centred). */
  size: 512,
  extent: [-800, -800, 800, 800],
  /** Hypsometric colours by height above the lake. */
  heights: [[-5, '#2f5a3a'], [10, '#4f7a3c'], [40, '#6f8a48'], [80, '#8a8a5a'], [140, '#8a7a62'], [220, '#9a948a'], [320, '#e8ecf0']],
  water: ['#2c6a8a', '#0e2a44'],
  castle: '#3a3530',
  /** Hill shading strength and light direction. */
  shade: 0.55,
  light: [-0.6, 0.75],
  /** Castle floor plans: floors by height range [minY, maxY). */
  floors: [
    { id: -6, name: 'Zindanlar', range: [-7, -1] },
    { id: 0, name: 'Zemin kat', range: [-1, 6] },
    { id: 7, name: '1. kat', range: [6, 13] },
    { id: 14, name: '2. kat', range: [13, 20] },
    { id: 21, name: '3. kat', range: [20, 30] },
  ],
  castleExtent: [-55, -80, 65, 40],
  /** Marker colours. */
  colors: { player: '#ffe08a', quest: '#ffd35a', travel: '#9ad8ff', travelLocked: '#6a7480', shop: '#ffb070', race: '#ffd35a', danger: '#ff6a5a', friend: '#ffffff' },
});

export const MINIMAP = Object.freeze({ size: 150, range: 110, castleRange: 22 });

/** Places get "discovered" within this distance (m); fast travel needs no fight nearby. */
export const TRAVEL = Object.freeze({ discover: 30, dangerRange: 35, fade: 0.35 });

export const SAVES = Object.freeze({
  /** Manual slots, rotating autosaves, the quick-save slot. */
  manual: 6,
  autos: 3,
  thumb: [256, 144],
  thumbQuality: 0.72,
});

/** UI scale choices. */
export const UI_SCALES = Object.freeze([0.85, 1, 1.15, 1.3]);

export const NOTICES = Object.freeze({ max: 4, duration: 3.2 });

/** "Emeği geçenler": shown from the title screen and after the ending. */
export const CREDITS = Object.freeze({
  title: 'Emeği geçenler',
  lines: [
    'Hogwarts: Mühürlü Kule — kişisel kullanım için yapılmış, ticari olmayan bir hayran oyunu.',
    'Harry Potter evreni, adları ve mekânları J.K. Rowling ile hak sahiplerine aittir; bu oyun onlarla bağlantılı değildir.',
    'Her şey tarayıcıda, çalışırken üretilir: dokular, modeller, karakterler, animasyonlar, müzik, sesler ve konuşmalar. Dışarıdan tek bir görsel ya da ses dosyası yoktur.',
    'Motor: Three.js (3B çizim) ve cannon-es (fizik). Ses: Web Audio API.',
    'Oynadığın için teşekkürler!',
  ],
  signature: 'Sürüm {version}',
});
