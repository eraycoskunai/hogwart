# Hogwarts: Mühürlü Kule

Tarayıcıda çalışan, üçüncü şahıs kameralı, 3D bir Harry Potter hayran RPG'si (kişisel kullanım).
Hiçbir harici asset yok: dokular, modeller, animasyonlar, efektler ve (ileride) sesler tamamen kodla üretilir.

> **Durum: Faz 2 — Prosedürel doku sistemi ve malzemeler** (Faz 1 motor iskeleti tamam)

## Çalıştırma

Build aracı yok. Proje kökünde yerel bir sunucu başlat:

```bash
npx serve .
# veya
python3 -m http.server 8000
```

Sonra tarayıcıda `http://localhost:3000` (veya 8000) adresini aç. Three.js `0.160.0` ve cannon-es `0.20.0`
import map ile jsDelivr CDN'den yüklenir, bu yüzden ilk açılışta internet bağlantısı gerekir.

## Kontroller

| Eylem | Klavye / Fare | Gamepad |
|---|---|---|
| Hareket | WASD / ok tuşları | Sol çubuk |
| Kamera | Fare (tıklayınca imleç kilitlenir) | Sağ çubuk |
| Zıpla | Boşluk | A |
| Depar | Shift | L3 |
| Yürü | Z | Çubuğu az it |
| Çömel | C / Sol Ctrl | B |
| Nişan al | Sağ tık | LT |
| Hedefe kilitlen / bırak | Tab / orta tık (kilitliyken fareyi savurup hedef değiştir) | R3 |
| Omuz değiştir | X | Y |
| Hızlı kayıt / yükleme | F5 / F9 | — |
| Kontrol listesi | H | Back |
| Menü | Esc / P | Start |
| Hata ayıklama paneli | F3 | Guide |

Tuşlar menüdeki **Kontroller** sekmesinden yeniden atanabilir (localStorage'a kaydedilir).

## Test salonu

| Alan | Neyi test eder |
|---|---|
| Rampalar (15°, 30°, 45°, 55°) | Eğim sınırı (48°): 55° rampa çıkılamaz, kaydırır |
| Merdivenler (0.15 / 0.25 / 0.40 / 0.60 m) | Basamak çıkma (0.45 m'ye kadar otomatik), iniş sırasında zemine yapışma |
| Asansör + kuleler (3 / 10 / 20 m) | Hareketli platform taşıma, yüksekten düşme hasarı (4.5 m güvenli, 18 m ölümcül) |
| Kayan platform | Platformla taşınma, zıplarken platform hızını koruma |
| Dönen köprü | Döndürerek taşıma (hareketli merdivenlerin prototipi) |
| Fizik alanı | İtilebilir sandıklar (kütleye göre), toplar, yıkılabilir piramit |
| Alçak tünel | Çömelme, tavan altında ayağa kalkamama |
| Sütun ormanı + dar koridor | Kamera çarpışması (kamera duvara girmez) |
| Atlama parkuru (1.5–4 m) | Coyote time, zıplama tamponu, depar ile uzun atlama |
| Antrenman mankenleri | Hedefe kilitlenme, yapay zekâ durum makinesi (boşta → uyanık → hedeflenmiş) |
| Parlayan rün dairesi | Spline sinematik kamera turu (Boşluk/Esc ile atla) |

Her alanın girişinde bilgi tetikleyicisi, oyuncuya neyin test edildiğini gösterir.

## Prosedürel dokular (Faz 2)

- `src/procgen/textures/noise.js`: döşenebilir Perlin/fBm/ridged/türbülans, Worley/Voronoi (F1, F2, hücre kimliği, kesin kenar mesafesi),
  4D torus üzerinde Simplex fBm, domain warp. Tüm karo dokular bit bit periyodiktir (dikişsiz).
- `src/procgen/textures/materials/`: 30 malzeme üreticisi, her biri ayrı dosyada — Hogwarts taşı, kaldırım, döşeme taşı, mermer,
  kaya, ahşap tahta, parke, ağaç kabuğu, kitap sırtları, deri, cübbe kumaşı, bina goblenleri (aslan/porsuk/kartal/yılan), halı,
  pirinç, dövme demir, pas, vitray, çim, toprak, çamur, yaprak, su, cilt, saç, parşömen, mühür mumu, mum alevi, büyü izi,
  sihirli mürekkep, hayalet sisi (bir kısmı varyantlı).
- Her malzeme için albedo, yükseklikten Sobel ile normal, AO (yükseklikten + açık), pürüzlülük, metallik ve gerekirse
  emissive haritası üretilir; AO/pürüz/metal tek ORM dokusunda paketlenir.
- Üretim Web Worker havuzunda yapılır (OffscreenCanvas ile çizim), sonuç bellekte ve IndexedDB'de önbelleğe alınır; ikinci
  açılış anlıktır. İlk açılışta 256 px önizleme ile hızlı başlar, tam çözünürlük arka planda gelir ve yerinde değişir.
- `src/render/SurfaceShader.js`: triplanar eşleme (whiteout normal karışımı) + dünya uzayında ikinci düşük frekanslı
  varyasyon/kir maskesi, yukarı bakan yüzeylerde yosun, duvar diplerinde nem lekesi, yağmurda ıslaklık (koyulaşma + parlama).
- Su (kayan iki normal katmanı, köpük, Fresnel/yansıma), alev, büyü izi, mürekkep ve hayalet için animasyonlu shader'lar.
- **Malzeme galerisi**: açılış ekranından veya F3 panelinden; her malzeme kaide üzerinde, harita önizlemeleri, canlı
  ıslaklık/yosun/kir ayarları, vitrayın renkli ışık düşürmesi.

Doku çözünürlüğü kalite ayarına bağlıdır (Düşük 512, Orta/Yüksek 1024, Ultra 2048); değişiklik sayfa yenilenince uygulanır.

## Hata ayıklama (F3)

FPS ve kare süresi grafiği, çizim çağrıları, üçgen/geometri/doku sayıları, bellek, fizik istatistikleri,
oyuncu durumu (zemin açısı, hız, kilit), yapay zekâ ve platform durumları, çarpışma şekilleri görünümü,
noclip, ölümsüzlük, zaman ölçeği, ışınlanma menüsü, sinematik/hasar/hit-stop/sarsıntı testleri.

## Mimari

```
index.html            import map + arayüz kökleri
src/main.js           başlatma, oyun durum makinesi, sabit adımlı döngü (1/60 fizik, değişken render + interpolasyon)
src/core/             EventBus, StateMachine, Input (klavye/fare/gamepad + tuş atama), Time (hit-stop),
                      SaveSystem (3 yuva + otomatik, sürümlü), Settings, AssetCache (referans sayımı), Debug (F3)
src/render/           Renderer (kalite ön ayarları), Sky, SceneLighting (gölge takibi), ThirdPersonCamera,
                      CinematicCamera (Catmull-Rom spline), DebugDraw
src/physics/          Geometry (kapsül/üçgen/ışın testleri), Collider, CollisionWorld (3B uzamsal hash + DDA ışın),
                      PhysicsWorld (cannon-es rijit cisimler + kinematik platformlar), CharacterController, TriggerSystem
src/gameplay/         Player (can, düşme hasarı, yeniden doğma), TargetDummy
src/animation/        ProceduralAnimator (adım, kol salınımı, eğilme, çömelme, iniş sıkışması, nişan pozu)
src/procgen/          DevTextures (prototip dokular), StaticBatcher (dünya uzayı UV + çizim birleştirme), Mannequin
src/world/            TestRoom, Movers (yol ve adımlı dönüş hareketleri)
src/ui/               HUD, PauseMenu, styles.css
src/data/             tüm ayar sabitleri: oyun, fizik, kamera, girdi, kalite, ayarlar, test salonu yerleşimi
```

Modüller birbirini doğrudan bilgilendirmez; olaylar `EventBus` üzerinden akar
(`player:landed`, `trigger:enter`, `camera:lock`, `render:quality`, `settings:changed` …).

## Yol haritası

1. ✅ Motor iskeleti, girdi, kamera, kapsül kontrolcü, fizik, debug paneli, test odası
2. ✅ Prosedürel doku sistemi ve tüm malzemeler (Worker + önbellek), malzeme galerisi
3. Işık, gökyüzü, gün-gece, hava durumu, post-fx, kalite ayarları
4. Karakter üretici, iskelet, animasyonlar, IK, cübbe simülasyonu, karakter yaratma
5. Şato modül kiti, Hogwarts dış mekânı, arazi, göl, orman
6. İç mekânlar, kapılar, hareketli merdivenler, portreler, hayaletler, streaming
7. Büyü sistemi, efektler, jest tanıma
8. Savaş, düşmanlar, yapay zekâ, düello, boss
9. Süpürge dükkânı, uçuş, yarışlar, Quidditch
10. Dostlar, diyalog, yakınlık, NPC rutinleri
11. Ses motoru, SFX, adaptif müzik, konuşma
12. Hikâye, görevler, dersler, bina puanları, açılış sekansı
13. Arayüz cilası, menüler, harita, kayıt sistemi
14. Optimizasyon, denge, son cila
