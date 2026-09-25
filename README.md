# Hogwarts: Mühürlü Kule

Tarayıcıda çalışan, üçüncü şahıs kameralı, 3D bir Harry Potter hayran RPG'si (kişisel kullanım).
Hiçbir harici asset yok: dokular, modeller, animasyonlar, efektler ve (ileride) sesler tamamen kodla üretilir.

> **Durum: Faz 4 — Karakter üretici, iskelet, animasyonlar, IK, cübbe simülasyonu, karakter yaratma** (Faz 1–3 tamam)

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
| Parlayan rün dairesi | Spline sinematik kamera turu (Boşluk/Esc ile atla), alan derinliği |
| Büyük Salon | Büyülü tavan (gerçek gökyüzü), yüzen mumlar, sıcak altın renk düzeltmesi |
| Zindan | Titreyen meşaleler, yeşil renk düzeltmesi, iç mekân ortam ışığı |
| Öğrenciler | Rastgele üretilmiş özgün öğrenciler: duran (yaklaşınca bakar, el sallar), volta atan, hedeflere büyü çalışan, Büyük Salon'da oturan, Quidditch formalı |

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

## Işık, gökyüzü ve hava (Faz 3)

- **Oyun saati** (`src/world/GameClock.js`): 1 oyun günü = 24 gerçek dakika; okul yılı 1 Eylül 1991'de başlar,
  mevsimler Eylül → Haziran ilerler. Güneş ve ay İskoçya enleminde (56.8°) astronomik olarak hesaplanır; ayın evreleri vardır.
  Saat HUD'un sağ üstünde görünür, kayıt dosyasına yazılır.
- **Gökyüzü** (`SkyShader.js`, `Sky.js`): Preetham atmosfer saçılımı, gün batımı renkleri, dönen yıldızlar, evreli ay,
  fBm bulutlar (hava durumuna göre yoğunluk), şimşek aydınlatması. Ortam yansıması (PMREM) gökyüzünden periyodik yakalanır.
- **Işık** (`SceneLighting.js`): güneş/ay geçişli yönlü ışık, kademeli yumuşak gölgeler (CSM, kaliteye göre 1–4 kademe),
  güneş yüksekliğine göre anahtar kareli renk/şiddet, yarımküre ortam ışığı, sis rengi.
- **Nokta ışık havuzu** (`LightManager.js`): sahnede yüzlerce meşale/mum/lamba kaynağı olabilir; yalnızca kameraya en yakın N
  tanesi (kaliteye göre) gerçek ışık alır, geçişler yumuşak solar. Titreme profilleri: mum, meşale, lamba.
  Alevler tek çizimde örneklenmiş billboard'dur (`FlameSprites.js`).
- **Hava durumu** (`Weather.js`, `WeatherParticles.js`): açık, bulutlu, kapalı, yağmur, fırtına, sis, kar. Mevsime göre rastgele
  değişir, geçişler ~25 sn sürer. Yağmur damlaları + zeminde sıçramalar + ıslak yüzeyler; kar kışın yukarı bakan yüzeylerde
  birikir; fırtınada şimşek ve mesafeye göre gecikmeli gök gürültüsü olayı (`weather:thunder`, ses Faz 11'de).
  Tepeden derinlik haritası (`PrecipitationOccluder.js`) sayesinde çatı altına yağmur/kar düşmez, iç mekânlar kuru kalır.
- **Post-fx** (`PostFX.js`): GTAO (ortam kapatma), güneş ışınları, bloom, ACES ton eşleme, bölgeye göre renk düzeltme
  (`ColorGrading.js`: dış mekân, gece, kapalı hava, Büyük Salon altın, zindan yeşil, orman mavi-yeşil) + vinyet, FXAA,
  yalnızca sinematiklerde alan derinliği. Güneşli iç mekânlarda toz zerrecikleri (`DustMotes.js`).
- **Kalite ön ayarları**: Düşük / Orta / Yüksek / Ultra — gölge kademeleri ve çözünürlüğü, nokta ışık sayısı, MSAA, efektler,
  parçacık sayıları. Menü → Grafik sekmesinden bloom, AO, güneş ışınları ve toz tek tek kapatılabilir.
  Parçacık sayıları ve doku çözünürlüğü sayfa yenilenince uygulanır.

## Karakterler (Faz 4)

- **Karakter yaratma ekranı**: *Yeni Oyun* ile açılır (ya da F3 → *Karakter yaratma ekranı*). Sekmeler: Kimlik (ad, soyad, ses tonu),
  Beden (boy, yapı, omuz, pantolon/etek), Yüz (yüz genişliği/uzunluğu, çene hattı, çene ucu, elmacık, burun uzunluğu/genişliği/kemeri/ucu,
  göz boyutu/aralığı/eğimi, dudak, ağız, kulaklar), Renkler (8 cilt tonu, 7 göz rengi, çil), Saç (9 stil, 9 renk, kaşlar), Aksesuar
  (3 gözlük, atkı). Önizleme: üniforma / Quidditch forması, bina renkleri (yalnızca önizleme — bina Seçmen Şapka töreninde belirlenir),
  pozlar (duruş, yürü, koş, büyü, selam, kalkan, yuvarlanma, uçuş) ve ifadeler. Sürükle: döndür, tekerlek: yakınlaş.
- **İnsansı üretici** (`src/procgen/characters/`): kafa işaretli mesafe alanlarından (kafatası, yüz, çene, elmacık, kaş kemeri, burun,
  dudaklar, göz çukurları) yontulur ve yüze doğru sıklaşan bir ızgara ışın yürütmeyle yüzeye oturtulur. Kulaklar, göz kapakları, kirpikler,
  dişler; iris dokusu ve boyanmış yüz dokusu (cilt tonu, kızarıklık, dudaklar, kaşlar, göz kapağı gölgesi, çiller, saç çizgisi).
  Beden kesit taramalarıyla (gövde, bacaklar, kollar, eller ve parmaklar, ayakkabılar) üretilir; tüm kıyafet tek bir atlas dokusu
  (gömlek, bina renkli süveter yelek, kravat, pantolon/etek, ayakkabı; Quidditch: numaralı forma, çizme, dizlik, kolluk, eldiven).
- **Yüz ifadeleri** (blend shape / morph): çene açma, gülümseme, kaş çatma, kaş kaldırma, büzme, geniş ağız, iki göz için ayrı kırpma.
  Otomatik göz kırpma, göz seğirmeleri ve metinden hece hece dudak senkronu (Türkçe ünlüler çeneyi açar, m/b/p dudakları kapatır).
- **İskelet**: 24 kemik (22 deforme eden + 2 göz), deri ağırlıklı SkinnedMesh.
- **Animasyon** (`src/animation/`): veriden anahtar kareler (`data/animations.js`, yarı döngüler aynalanarak üretilir) + katmanlar:
  hız karışım alanı (duruş/yürüme/koşu/depar, adım fazı mesafeye göre eşitlenir), çömelme, merdiven, zıplama/düşme, kayma, iniş;
  tüm beden eylemleri (yuvarlanma, oturma, sersemleme, yere yığılma, süpürgeye binme/inme, uçuş pozları), üst beden eylemleri
  (8 farklı büyü savurma hareketi — `release` olayıyla, kalkan, selam, boşta kıpırdanmalar) ve eklemeli darbe tepkisi. Nefes,
  ivmeye göre öne eğilme, dönüşe göre yatma prosedüreldir.
- **IK**: ayaklar zemine ve basamaklara oturur (kalça iner, ayak zemin eğimine döner), baş/boyun/göğüs ve gözler ilgi noktasına bakar
  (kilitli hedef, yakındaki öğrenci ya da kameranın baktığı yer), nişan alırken asa kolu hedefe uzanır ve asa hedefi gösterir.
- **Cübbe simülasyonu**: Verlet kumaş. Cübbenin üst gövdesi ve kolları iskelete iğnelenir; etek ve kol ağızları serbestçe sallanır,
  bacak/kalça/kol kapsüllerine çarpar, rüzgârdan (hava durumu) etkilenir. Astar bina renginde. Quidditch pelerini ve atkı uçları da
  simüle edilir. Uzaktaki karakterlerde kumaş iskeleti rijit izler.
- **Asa**: ahşap türü (12), çekirdek (3), uzunluk (9–14½ inç), esneklik (5) ve sap stili (5) ile prosedürel model; büyü
  istatistiklerine küçük etkiler (F3 panelinde görünür). Asa dükkânı sahnesi Faz 12'de gelecek.
- Kayıtlar artık karakteri de saklar (kayıt sürümü 2; eski kayıtlar otomatik yükseltilir).

## Hata ayıklama (F3)

FPS ve kare süresi grafiği, çizim çağrıları, üçgen/geometri/doku sayıları, bellek, fizik istatistikleri,
oyuncu durumu (zemin açısı, hız, kilit), yapay zekâ ve platform durumları, çarpışma şekilleri görünümü,
noclip, ölümsüzlük, zaman ölçeği, ışınlanma menüsü, sinematik/hasar/hit-stop/sarsıntı testleri.
**Zaman ve hava** bölümü: saat kaydırıcısı, zaman hızı (×1 / ×10 / ×60 / ×300), hava durumu düğmeleri,
otomatik hava, şimşek çaktırma; ışık havuzu, gölge ve hava istatistikleri.
**Karakter** bölümü: tüm animasyonları oynatma (döngüsel olanlar ikinci tıkta durur), ifadeler, konuşma, bina renkleri, kıyafet
değiştirme, rastgele karakter, karakter yaratma ekranı; iskelet görünümü, IK ve kumaş simülasyonu anahtarları; kemik/üçgen/parçacık
sayıları, üretim süresi, animasyon katmanları ve IK durumu, asa bilgisi.

## Mimari

```
index.html            import map + arayüz kökleri
src/main.js           başlatma, oyun durum makinesi, sabit adımlı döngü (1/60 fizik, değişken render + interpolasyon)
src/core/             EventBus, StateMachine, Input (klavye/fare/gamepad + tuş atama), Time (hit-stop),
                      SaveSystem (3 yuva + otomatik, sürümlü), Settings, AssetCache (referans sayımı), Debug (F3)
src/render/           Renderer (kalite ön ayarları), Atmosphere (orkestra), Sky/SkyShader, Environment, SceneLighting (CSM),
                      LightManager, FlameSprites, Weather + WeatherParticles + PrecipitationOccluder, PostFX,
                      ColorGrading, DustMotes, SurfaceShader, MaterialLibrary, ThirdPersonCamera, CinematicCamera, DebugDraw
src/physics/          Geometry (kapsül/üçgen/ışın testleri), Collider, CollisionWorld (3B uzamsal hash + DDA ışın),
                      PhysicsWorld (cannon-es rijit cisimler + kinematik platformlar), CharacterController, TriggerSystem
src/gameplay/         Player (can, düşme hasarı, yeniden doğma, avatar), Student (arka plan öğrencileri), TargetDummy
src/animation/        Clips (anahtar kare derleme, poz karıştırma), Animator (katmanlar), IK, FaceAnimator, ClothSim, GroundProbe
src/procgen/          DevTextures (prototip dokular), StaticBatcher (dünya uzayı UV + çizim birleştirme)
src/procgen/characters/ Character (montaj), Skeleton, HeadGenerator, HairGenerator, BodyGenerator, Garments + ClothGarment,
                      WandGenerator, CharacterTextures, Appearance, Hairline, MeshKit
src/world/            GameClock, TestRoom, RoomBuilder (veriden iç mekân), Movers, MaterialGallery, CreatorStage
src/ui/               HUD, PauseMenu, GalleryPanel, CharacterCreator, styles.css
src/data/             tüm ayar sabitleri: oyun, fizik, kamera, girdi, kalite, ayarlar, atmosfer, karakter, animasyon, asa, test salonu
```

Modüller birbirini doğrudan bilgilendirmez; olaylar `EventBus` üzerinden akar
(`player:landed`, `trigger:enter`, `camera:lock`, `render:quality`, `settings:changed` …).

## Yol haritası

1. ✅ Motor iskeleti, girdi, kamera, kapsül kontrolcü, fizik, debug paneli, test odası
2. ✅ Prosedürel doku sistemi ve tüm malzemeler (Worker + önbellek), malzeme galerisi
3. ✅ Işık, gökyüzü, gün-gece, hava durumu, post-fx, kalite ayarları
4. ✅ Karakter üretici, iskelet, animasyonlar, IK, cübbe simülasyonu, karakter yaratma
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
