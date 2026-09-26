# Hogwarts: Mühürlü Kule

Tarayıcıda çalışan, üçüncü şahıs kameralı, 3D bir Harry Potter hayran RPG'si (kişisel kullanım).
Hiçbir harici asset yok: dokular, modeller, animasyonlar, efektler, müzik ve sesler tamamen kodla üretilir.

> **Durum: Sürüm 1.0 — 14 fazın tamamı bitti**

## Çalıştırma

Build aracı yok. Proje kökünde yerel bir sunucu başlat:

```bash
npx serve .
# veya
python3 -m http.server 8000
```

Sonra tarayıcıda `http://localhost:3000` (veya 8000) adresini aç. Three.js `0.160.0` ve cannon-es `0.20.0`
import map ile jsDelivr CDN'den yüklenir, bu yüzden ilk açılışta internet bağlantısı gerekir.

**Yayınlama (hosting):** geliştirmede build yok; ama internette ~200 ayrı modülü tek tek yüklemek yavaş olduğu için
`npm i -D esbuild && npm run build` oyunu `dist/` klasörüne tek bir küçültülmüş pakete toplar (`dist/index.html`,
`main.js`, `texture.worker.js`, `styles.css`). Herhangi bir statik sunucuya yalnızca `dist/` klasörünü koymak yeterli.

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
| Etkileşim (kapı, portre, sandık, tuğla …) | E | X |
| Büyü yap (Protego: basılı tut) | Sol tık | RT |
| Büyü tekerleği (basılı tut, fareyle seç) | Q | LB |
| Büyü değiştir | Fare tekerleği | — |
| Jestle büyü çiz (basılı tut, fareyle çiz) | G / Fare 5 | RB |
| Kaçın (yuvarlan, kısa dokunulmazlık) / süpürgede takla | F / Sol Alt | D-pad aşağı |
| Süpürgeye bin / in (havadayken atlarsın!) | B | D-pad yukarı |
| Dostlar listesi | J | — |
| Günlük (görevler, Bina Kupası) | L | — |
| Harita (hızlı yolculuk) | M | — |
| Hızlı kayıt / yükleme (hızlı kayıt yuvası) | F5 / F9 | — |
| Kontrol listesi | H | Back |
| Menü | Esc / P | Start |
| Hata ayıklama paneli | F3 | Guide |

Tuşlar menüdeki **Kontroller** sekmesinden yeniden atanabilir (localStorage'a kaydedilir).

## Test salonu

Oyun artık Hogwarts arazisinde başlar; motor test salonuna F3 → **Bölge → Motor Test Salonu** ile geçilir.


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

## Hogwarts arazisi (Faz 5)

Açılış ve *Yeni Oyun*, şatonun doğu avlusunda başlar. Her şey açılışta koddan üretilir (orta kalitede ~10 sn, dokular önbellekteyse daha kısa).

- **Arazi** (`world/grounds/TerrainData.js`): 1.6 × 1.6 km yükseklik alanı (2 m hücre, 801² örnek) — tepeler, dağ halkası,
  şato platosu ve uçurumları, Kara Göl çanağı (kıyıda sığ, ortada 27 m), düzleştirilmiş Quidditch sahası ve kulübe alanı,
  yükseklikleri kontrol noktalarıyla verilen yollar (Hogsmeade yolu, kulübe yolu, göl kıyısı, doğu yolu).
  Çarpışma için özel **yükseklik alanı çarpıştırıcısı**: üçgenler anında üretilir, ışınlar 2B DDA ile yürür.
- **Görüntü**: 64 parça, 3 LOD adımı (etekli, histerezisli), splat dokulu arazi malzemesi (çim, toprak yol, orman zemini,
  kaldırım, kıyı çamuru + eğime göre kaya; yağmurda ıslanır, karda beyazlar). Göl: derinliğe göre renk ve saydamlık, kıyıda köpük.
- **Şato modül kiti** (`procgen/geometry/CastleKit.js`): blok, mazgallı siper, beşik/konik/piramit çatı, sivri kemer, pencere
  (çerçeve + cam), payanda, silme, kule gövdesi, kemer açıklığı, tepelik, flama, kapı, saat kadranı. `data/castle.js` ile
  7 salon (Giriş Holü, Büyük Salon …), 8 yuvarlak kule (Astronomi 70 m, bina flamaları), saat kulesi (gerçek saati gösterir),
  13 sur duvarı, 3 kapı ve taş viyadük kurulur. Parçalar malzemeye göre tek çizim çağrısında birleştirilir; pencereler gece yanar.
- **Bitki örtüsü**: prosedürel ağaçlar (meşe, çam, kurumuş; türe göre 3 varyant) ve kayalar. Yakında tam model, uzakta
  açılışta render hedefine çizilen kameraya dönük **impostor**; gövde çarpıştırıcıları. Rüzgârla sallanan yapraklar.
  Kameranın etrafında kayan **GPU çimen alanı** (düşük kalitede kapalı; orta/yüksek/ultra 16k/30k/52k öbek).
- **Mekânlar**: Yasak Orman (batı, sis ve koyu renk düzeltmesi), Kara Göl (güney), bekçi kulübesi (saman çatı, bacadan duman,
  balkabakları, çit), Quidditch sahası (çizgiler, 3+3 halka, bina renkli tribünler), yol lambaları (akşam yanar), öğrenciler,
  bilgi tetikleyicileri ve şato turu sinematiği (doğu avlusundaki daire).
- **Yüzme**: su göğse gelince yüzmeye geçilir (kaldırma kuvveti, suda sürtünme, yüzme hızı; zıplama ve çömelme yok,
  yüzme ve su çiğneme animasyonları). Sığ suya ayak basınca yürüyerek çıkılır. Derin suda uyarı verilir.
- **Bölgeler** (`world/RegionManager.js`): bölge değişimi yükleme ekranıyla yapılır; eski bölgenin geometri, doku, çarpıştırıcı,
  ışık, alev ve renk düzeltmesi bölgeleri serbest bırakılır, kullanılmayan dokular bellekten atılır. Kayıtlar bölgeyi de saklar.
- **Görüş mesafesi** kaliteye bağlı: 520 / 900 / 1400 / 2000 m (bitki yoğunluğu ve impostor mesafesi de ölçeklenir).

## Şato içi (Faz 6)

Arazideki **Giriş Holü'nün kuzey kapısında** (F3 → Işınlan → *Şato kapısı*) `E: Şatoya gir`; içeride büyük kapılardan
`E: Dışarı çık`. Geçişler kısa bir kararma + yükleme ekranıyla yapılır (şato içi ayrı bir bölgedir).

- **Odalar** (`data/interior.js`, `world/interior/`): Giriş Holü (sütunlar, avize, bina sancakları, zırhlar), Büyük Salon
  (dört uzun masa, kürsüde öğretmen masası, baykuş kürsü, 180 süzülen mum, gerçek gökyüzünü gösteren büyülü tavan, vitraylar),
  doğu geçidi, 4 katlı **Merdiven Kulesi**, 1–3. kat koridorları, **Kütüphane** (raflar, okuma masaları, parmaklıkla ayrılmış
  kilitli **Yasak Bölüm**), **Karanlık Sanatlara Karşı Savunma** sınıfı (tavandan sarkan ejderha iskeleti, kara tahta),
  **Tılsım** sınıfı, zindan merdiveni ve **İksir zindanı** (kazanlar, kavanoz rafları), **gizli geçit** + gizli oda,
  **İhtiyaç Odası**. Duvarlar kapı/pencere açıklıklarıyla birlikte veriden kurulur; her oda malzeme başına tek çizim çağrısına
  birleştirilir.
- **Oda akışı (streaming) ve portal culling** (`CellStreamer`): oyuncunun bulunduğu oda ve komşuları hemen, iki kapı ötesi
  kare başına bir oda olarak önceden kurulur; 4 kapıdan uzaktaki odalar 6 sn sonra geometri, çarpıştırıcı, ışık ve alevleriyle
  birlikte serbest bırakılır. Çizimde kameranın odasından başlayıp yalnızca açık ve görüş alanındaki kapılardan görülen odalar
  gösterilir, diğerlerinin ışıkları kapanır. Kapalı bir kapı arkasındaki oda çizilmez.
- **Kapılar**: menteşeli tek/çift kanat (kinematik gövde — kapı gerçekten iter), veriden kilit (Yasak Bölüm: *Alohomora gerekir*,
  büyüler Faz 7'de), kapı durumu kayıtta saklanır.
- **Hareketli merdivenler**: kule boşluğunda üç kat arasında üç merdiven; 16 sn'de bir birlikte 90° döner. Her merdiven bir
  kattan karşı kenardaki üst kata çıkar; balkonlar kat kat farklı kenarlarda olduğu için bağlantılar sırayla değişir
  (bazen merdiven boşluğa açılır). Üzerindeki oyuncuyu döndürerek taşır.
- **Konuşan portreler** (`PortraitPainter`, `PortraitGallery`): ~110 portre, tohumdan üretilen özgün figürler (şapka, peçe,
  miğfer, yaka, sakal, baykuş/kedi/kitap, manzara/perde arka plan, yağlı boya dokusu ve vernik). Oda başına tek atlas doku;
  oyuncuya en yakın 4 portre canlanır: nefes alır, sallanır, göz kırpar, gözleriyle oyuncuyu izler, konuşurken ağzı oynar.
  Yaklaşınca selam verirler, `E` ile dedikodu anlatırlar (kanon karakterler yalnızca isim olarak geçer). 3. kattaki
  ortak salon bekçisi portre parola sorar (bina Seçmen Şapka töreninde belli olacak).
- **Hayaletler**: yarı saydam, sisli, kenarları parlayan özgün hayaletler (Sör Bertrand, Rahibe Eulalia, Keşiş Odo); yerden
  süzülerek duvarların içinden geçen rotalarda dolaşır, yaklaşınca dönüp konuşur.
- **Gizli şeyler**: 3. kat koridorundaki aşınmış tuğlaya dokununca taşlar kayıp gizli geçit açılır; boş duvarın önünde bir
  ihtiyaç düşününce **İhtiyaç Odası** kapısı belirir: *antrenman salonu* (minderler, mankenler), *saklanma yeri* (şömine,
  koltuklar) ya da *eşya deposu*. Oda her ziyarette istenen şekle girer. Açılan sırlar kayıtta saklanır.
- **Etkileşim sistemi**: en yakın ve önündeki kapı/portre/sandık/tuğla için ekranda `E: …` istemi; konuşmalar altyazı olarak
  görünür; seçimler için panel (1–3 tuşları veya fare).

## Büyüler (Faz 7)

Test salonundaki hedef alanı (F3 → Bölge → Motor Test Salonu), fizik alanı ve süs havuzu büyü denemek için uygundur.
Arkadaki **düello mankeni** sana yavaş antrenman büyüleri atar.

| Büyü | Etki |
|---|---|
| Lumos / Nox | Asanın ucunda ışık (gerçek nokta ışığı) / söndürme |
| Expelliarmus | Silahsızlandırma, geri itme |
| Stupefy | Sersemletme (mankenler döner, yıldızlar çıkar) |
| Protego | Basılı tutulan kalkan balonu; ilk 0,3 sn içinde gelen büyüyü **savuşturup geri yansıtır** |
| Petrificus Totalus | Hedefi taşa çevirir (itilince devrilir) |
| Incendio | Ateş topu; ahşabı tutuşturur (yanan sandık sonunda kömürleşip dağılır), buzu eritir |
| Glacius | Buz; hedefi dondurur, suyun yüzeyinde **üzerinde yürünebilen buz tabakası** oluşturur (Kara Göl'de de), ateşi söndürür |
| Wingardium Leviosa | Nişan alınan nesneyi havaya kaldırıp önünde taşır; tekrar yapınca bırakır |
| Accio / Depulso / Descendo | Çekme / itme / yere çarpma |
| Confringo | Patlama: çevredeki cisimleri savurur, sandıkları parçalar, ekranı sarsar ve anlık yavaşlatır |
| Reparo | Parçalanan nesneyi parçaları uçarak birleşecek şekilde onarır |
| Alohomora | Kilit açar (Yasak Bölüm parmaklığı); Depulso kilitsiz kapıları iter |
| Episkey | İyileştirme |
| Finite Incantatem | Hedefteki büyüleri bozar (buz, taş, ateş, havada tutma) |
| Expecto Patronum | Işıktan koruyucu hayvan (türü karakterine göre: geyik, tavşan, su samuru, tilki, kurt, at, kedi, baykuş) |

- **Odak (mana)**, bekleme süreleri ve **ustalık**: her büyü kullandıkça ve isabet ettikçe 5 seviyeye kadar gelişir (daha güçlü,
  daha ucuz, daha hızlı). Asanın ahşap/çekirdek/esneklik değerleri güç, hız, isabet ve odak maliyetini hafifçe değiştirir.
- **Jest modu**: G'yi basılı tutup fareyle çiz; $1 Unistroke tanıyıcı (yön duyarlı değişken) 17 şekli tanır. Temiz bir çizim
  büyüyü %25 güçlü ve %30 ucuz yapar. Şekiller: Lumos ↑, Nox ↓, Depulso →, Finite ←, Stupefy Z, Confringo M, Protego saat
  yönünde daire, Reparo ters daire, Incendio üçgen, Glacius sarmal, Leviosa "savur ve fiske", Expelliarmus S, Petrificus L,
  Accio <, Episkey ✓, Alohomora U, Descendo kanca, Patronus ∞.
- **Kombolar**: Leviosa + Depulso (fırlatma), Leviosa + Descendo (çarpma), Glacius + Confringo (buz parçalama),
  Petrificus + Depulso (heykel devirme), Stupefy + Stupefy.
- **Element kuralları**: ateş buzu eritir ve ahşabı yakar; buz ve su ateşi söndürür (yanan sandık suya düşerse söner).
- **Mermiler fiziksel**: hız, yerçekimi (Incendio, Glacius, Confringo hafifçe düşer), sekme (Glacius 1, Depulso 2), kalkandan
  yansıma. Oyuncuya gelen düşman büyüleri hasar verir.
- **Efektler**: tek çizim çağrılı GPU partikülleri (parlak + duman katmanı, 7 500 parçacık), iz şeritleri, büyü ışıkları,
  patlama parlaması ve şok dalgası, kalkan balonu (darbe dalgalanması), buz/taş/kömür kabukları, uçan hasar sayıları,
  kombo ve ustalık başlıkları, kamera sarsıntısı ve hit-stop. Büyü sözünü karakter dudaklarıyla söyler.

## Savaş (Faz 8)

**Oyuncunun düello hareketleri**
- **Kaçınma** (F): yönlü yuvarlanma, ilk 0,34 sn dokunulmazlık (büyüler içinden geçer, darbeler ıskalar), odak harcar.
- **Protego / savuşturma**: kalkanı darbeden hemen önce (0,3 sn pencere) kaldırırsan büyüler geri yansır, yakın dövüş
  saldırganı sersemler; geç kaldırırsan darbe odağından yer.
- **Sersemletme çubuğu**: her isabet düşmanın sarı çubuğunu doldurur; dolunca düşman 3,2 sn sersemler, %50 fazla hasar alır ve
  **E: Bitirici büyü** (ağır çekim, azami canın %55'i; boss'ta %12) açılır.
- **Kalkan kırma**: karanlık büyücüler kalkan kaldırır; Confringo, Descendo, Expelliarmus ve Depulso kalkanı hızla kırar,
  kırılan kalkan düşmanı sersemletir. Düşmanlar da (zorluğa göre) büyünü sana geri yansıtabilir.
- Ağır darbeler seni **sersemletir** (kontrol kısa süre gider), örümcek ağı **yavaşlatır**.

**Düşmanlar** (hepsi özgün, prosedürel modeller)

| Düşman | Nerede | Davranış |
|---|---|---|
| Karanlık büyücü | Kuzey yolu kampı (3 kişi) | Mesafe korur, yan adım, 3 büyü, kalkan, kaçınma, canı azalınca siper alır |
| Dev örümcek / yavru | Yasak Orman kenarı ve derinlikleri | Hamle-ısırık (koni uyarısı), ağ tükürme (yavaşlatır), grup halinde kuşatma |
| Dağ trolü | Dağ eteği | Yavaş ama yıkıcı: daire uyarılı yere vurma (ağır sersemletme), koni süpürme |
| Kurt adam | Dolunay açıklığı (yalnız gece) | Uluma, şerit uyarılı sıçrama, iki vuruşluk pençe |
| Solgun | Göl kıyısı (yalnız gece) | Özgün, ruh emici bir hayalet: yakınında can ve odak erir, ekran buzlanır. Tüm büyüler içinden geçer — yalnızca **Patronus** kovar |
| Büyülü zırh | Şato: Yasak Bölüm | Parmaklıktan içeri girince uyanır; sersemletmeye dirençli, patlayıcı büyülere zayıf |
| Cin peri sürüsü | Şato: KSKS sınıfı | 8'li sürü, başının etrafında döner, sırayla çimdikler |

**Yapay zekâ**: davranış ağacı (devriye → şüphelenme → arama → saldırı → geri çekilme), görüş konisi + görüş hattı, ses
(büyü yapmak ve çarpma sesleri duyulur), fark etme çubuğu. Her karşılaşma alanı için fizik ışınlarıyla kareler halinde
(arka planda) örneklenen **gezinme ızgarası** + A* (yol yumuşatma), siper noktası arama, grup koordinasyonu: yardım çağırma,
**saldırı jetonları** (aynı anda en fazla 1/2/3 saldırgan) ve kuşatma yuvaları. Zorluk (Ayarlar → Zorluk: Hikâye / Normal /
Zor) can, tepki süresi, isabet, saldırgan sayısı, savuşturma şansı ve saldırganlığı değiştirir. Temizlenen kamplar 4 dk sonra
yeniden dolar.

**Boss — Nyxara, Örümceklerin Anası** (Örümcek yuvası, Yasak Orman'ın derinliği; F3 → Işınlan):
1. *Yuva*: koni ısırık, daire süpürme, ağ/zehir yaylımı, yavru örümcek çağırma.
2. *Tepedeki ağ* (%66): ağa tırmanır, hasar almaz gibidir; zehir yağmuru yeşil dairelere düşer. Üç parlayan **ağ çapasını**
   Incendio ile yak ya da Confringo ile patlat → yere çakılır ve uzun süre sersemler (bitirici fırsatı).
3. *Öfke*: şerit uyarılı düz hücumlar, her şey daha hızlı.
Tüm büyük saldırılar yerde renkli uyarı (daire / koni / şerit) ile önceden gösterilir; yenilince kayda geçer.

**Düello Kulübü** (şato girişinin doğu kapısı; F3 → Işınlan → Düello Kulübü): Profesör Hester Kılıçgöz ile konuş (E).
Beş rakiplik merdiven (1. sınıftan düello şampiyonuna); eğilme, 3-2-1 geri sayım, sahneden düşmek yenilgidir, canın bitince
teslim olursun (düelloda ölmezsin). İlerleme kayda yazılır.

**Arayüz**: düşmanların üstünde can/sersemletme/kalkan çubukları, boss / düello rakibi için büyük çubuk ve aşama adı, geri
sayım, "Savuşturma!", "Kalkan kırıldı!", bitirici uyarıları, oyuncu durumu (sersem / yavaş), Solgun buzlanması.
Kilitlenme (Tab) artık düşmanları da hedefler.

## Uçuş, yarışlar ve Quidditch (Faz 9)

**Süpürgeyle uçmak** (yalnızca açık havada — arazide; B ile bin/in, düşerken de çağırabilirsin):
- Süpürge **kameranın baktığı yöne** döner; dönüş hızı süpürgenin manevra değeriyle sınırlıdır. **W** gaz, **S** fren,
  **A / D** yana kayma, **Boşluk / C** yüksel / alçal, **Shift** takviye (dayanıklılık çubuğu), **F** takla (kısa dokunulmazlık).
- Fizik: hız yöne gecikmeyle uyar (kayma), dalışta hızlanır, tırmanışta yavaşlarsın; duvar ve zemin katıdır, sert çarpışmalar
  can götürür, çok sert olanlar seni süpürgeden atar (yüksekten düşmek ölümcül olabilir). Suyun üzerinde kayarak su serpersin;
  çok yükseğe çıkınca yumuşak bir tavan geri iter. Yere yavaşça alçalıp C'ye basılı tutunca kendiliğinden inersin.
- Görsel: gövde öne eğilir, dönüşte yatar, havada hafifçe salınır; cübbe rüzgârda dalgalanır, kamera uzaklaşır, hızla birlikte
  görüş açısı genişler ve hız çizgileri çıkar; takviyede süpürge kuyruğundan kıvılcımlar saçılır.

**Süpürge dükkânı** — *Uçan Kuyruk Süpürgecisi*, Quidditch sahasının batısında (F3 → Işınlan → Süpürge dükkânı). Tezgâhın
arkasındaki satıcıyla konuş (E). Beş özgün model (prosedürel sap, bağ halkaları, ayaklık ve tek tek bükülmüş çalı çöpleri):

| Süpürge | Hız | İvme | Manevra | Fiyat |
|---|---|---|---|---|
| Okul süpürgesi | 16 | 7 | 1.4 | başlangıçta var |
| Çalıkuşu 3 | 22 | 10 | 2.0 | 120 G |
| Poyraz 90 | 27 | 13 | 2.2 | 260 G |
| Yıldırımkuyruk | 32 | 16 | 2.6 | 420 G |
| Gece Şahini Pro | 38 | 19 | 3.0 | 700 G |

**Galleon** kazanmak: düşman yenmek (türe göre ödül; boss 250 G), düello kazanmak, yarış madalyaları, Quidditch maçları.
Kese, süpürgeler ve rekorlar kayda yazılır.

**Yarışlar** — üç parkur; başlangıç direğinde E: *Saha turu*, *Şato çevresi*, *Göl ve orman*. Geri sayım, sırayla geçilecek
parlayan halkalar (sıradaki altın renkte nabız atar, ekranda mesafe işaretçisi), süre, altın/gümüş/bronz madalya süreleri.
Daha iyi madalya Galleon kazandırır; en iyi koşu **hayalet** olarak kaydedilir ve sonraki denemede yanında uçar.

**Quidditch** — sahanın girişindeki sarı direkte E: evinin **Arayıcısı** olarak rakip bir eve karşı oynarsın. 13 yapay zekâ
oyuncu: Kovalayıcılar Quaffle'ı taşır, paslaşır, şut atar, rakibi tackle'la düşürür; Kaleciler üç halkayı korur; Vurucular
Bludger'ları rakiplere — ve sana — vurur (F taklasıyla kaçın). Bir süre sonra **Altın Top** çıkar: kanat çırparak dolaşır,
yakınlaşınca kaçar, ani atılışlar yapar; görüş alanındaysa ekranda işaretlenir. Rakip Arayıcı onu fark edince peşine düşer
(hızı ve tepkisi zorluğa bağlı). Altın Top'u yakalayan 150 puan kazanır ve maç biter.

## Dostlar ve diyalog (Faz 10)

Dört özgün sınıf arkadaşı var; her birinin kişiliği, günlük rutini, sevdiği ve sevmediği hediyeler ve bir ricası var:

| Dost | Bina | Kişilik | Savaşta |
|---|---|---|---|
| Elif Karayel | Gryffindor | Cesur, aceleci, uçmaya bayılır | Stupefy, Expelliarmus, Depulso |
| Deniz Aksoylu | Ravenclaw | Meraklı, dalgın, kitap kurdu | Glacius, Petrificus, Stupefy |
| Mert Yıldıztepe | Hufflepuff | Sıcakkanlı, sakar, bitki sever | Seni iyileştirir (Episkey), Depulso |
| Nehir Ayazoğlu | Slytherin | Hırslı, keskin dilli, sadık | Confringo, Incendio, Stupefy |

- **Rutinler** (oyun saatine göre): 07–09 Büyük Salon'da kahvaltı (oturur), 09–12 derste (Tılsım, KSKS, İksir — büyü
  çalışırlar), 12–14 öğle yemeği, 14–18 öğleden sonra kendi yerlerinde (Elif Quidditch sahasında, Deniz kütüphanede, Mert
  kulübenin bahçesinde, Nehir doğu avlusunda), 18–20 akşam yemeği, 20–22.30 akşam (Düello Kulübü, kütüphane rafları, giriş
  holü), gece yatakhanede uyurlar. Yakın yerler arasında yürürler; uzağa ya da başka kata giderken sen bakmıyorken ayrılıp
  yeni yerlerinde belirirler. **J** ile açılan *Dostlar* listesi herkesin şu an nerede olduğunu ve ne zamana kadar kalacağını
  gösterir.
- **Konuşma** (yanlarında E): yakınlık düzeyine göre selamlama, bulunduğu yere göre bir söz, sonra menü — *kendinden bahset*
  (dört kişisel konu, düzey arttıkça açılır; verdiğin cevap kişiliğine uyarsa yakınlık artar, ters düşerse azalır), *okulda
  neler oluyor* (dünyadaki sırlara dair ipuçları), *hediye* (yerinde satın alırsın; günde bir; sevdiği hediye +10, sevmediği
  −4), *benimle gelir misin / burada ayrılalım*, düzey yeterince yüksekse *rica*. Yazı daktilo gibi akar; Boşluk/tık devam,
  1–9 seçim, Esc ayrılır. Konuşurken karakter dudaklarıyla konuşur, kamera ikinizi çerçeveler, oyun duraklar.
- **Yakınlık**: 0–100; Yabancı → Tanıdık (15) → Arkadaş (35) → Yakın dost (60) → Can dostu (85). Günün ilk sohbeti +3.
  Arkadaş olunca yanına alabilirsin, Yakın dost olunca ricasını söyler.
- **Yanında gelen dost** seni yürüyerek/koşarak izler, kapılar ve merdivenlerde geride kalırsa arkanda belirir, bölge
  değiştirince seninle gelir, uçarken yerde bekler, savaşta kendi büyüleriyle yanında dövüşür (büyüleri sana çarpmaz);
  Mert canın azalınca seni iyileştirir. Gece yatma saati gelince yatakhaneye döner.
- **Ricalar**: Elif — bir yarışta altın madalya; Deniz — Yasak Bölüm'ün iki zırhını alt et; Mert — Düello Kulübü'nde
  üçüncü rakibe yüksel; Nehir — bir Quidditch maçı kazan. Tamamlayınca haber ver: +20 yakınlık ve Galleon ödülü.

## Ses ve müzik (Faz 11)

Hiçbir ses dosyası yok: her efekt, ortam sesi, müzik notası ve konuşma Web Audio ile **gerçek zamanlı sentezlenir**.
Tarayıcı kuralları gereği ses motoru ilk tıklamada / tuşa basışta açılır.

- **Motor** (`src/audio/AudioEngine.js`): ses kanalları (müzik, efekt, ortam, konuşma, arayüz) → ana ses → kompresör;
  her ses için HRTF 3B konumlandırma (kamera dinleyicidir), bölgeye göre üretilen yankı (şato içinde uzun taş yankısı,
  arazide kısa ve açık), diyalogda ve menüde müziğin kısılması, ses sınırı (en eskiler kesilir).
- **Sentez tarifleri** (`src/data/sounds.js`): 60'tan fazla efekt katmanlı tariflerden üretilir — osilatör ya da beyaz/
  pembe/kahverengi gürültü, zarf, frekans ve filtre süpürmeleri, vibrato, tremolo, rastgele tekrarlar. Adımlar zemine göre
  (taş, çim, ahşap, metal, su) yürüyüş döngüsüyle eşzamanlı; zıplama, iniş, yuvarlanma, yüzme; her büyü türünün kendi sesi
  (ateş gürlemesi, buz çınlaması, sersemletme vızıltısı, itme gümlemesi, Patronus korosu), kalkan ve savuşturma çınlaması,
  patlama, kırılma, onarım; düşmanlar (trol kükremesi, yere vurma, örümcek cırıltısı, kurt adam uluması, zırh
  şıngırtısı, peri kıkırtısı, Solgun fısıltısı, boss kükremesi), saldırı uyarıları, sersemleme, bitirici; süpürge rüzgârı
  (hızla yükselir), takviye, çarpma, halka, düdük, tezahürat, Bludger, Altın Top kanat çırpışı; kapı gıcırtısı, hareketli
  merdiven, gök gürültüsü, saat kulesi çanı (07, 12, 18, 22), gündüz kuşlar, gece baykuş; Galleon şıngırtısı, rütbe,
  geri sayım, fanfar; canın azalınca kalp atışı.
- **Ortam sesleri**: rüzgâr (hava durumu ve irtifaya göre), yağmur, gece cırcır böcekleri, göl suyu, şato oda sesi,
  Büyük Salon kalabalık uğultusu, Solgun aurası.
- **Uyarlanır müzik** (`src/audio/MusicDirector.js`, `src/data/music.js`): üretken bir besteci ölçü ölçü, ses saatinde
  ileriye doğru nota planlar. Ruh hâlleri: menü (3/4 vals), arazi-gündüz (pastoral), gece, şato (gizemli), sohbet, savaş,
  boss (koro ve pirinç), düello, uçuş, Quidditch (şenlikli). Her biri kendi tempo, dizi ve akor ilerleyişiyle çalar;
  pad, arpej, ostinato, bas, perküsyon ve özgün motiflerden örülen melodi katmanları vardır. Oyun durumuna göre
  (düşman görünce savaş, boss, uçuş, maç, gece…) 3 saniyelik geçişle değişir.
- **Konuşma** (`src/audio/Voice.js`): karakterler konuştuğunda (diyalog, düello hocası, satıcı, savaş sözleri) metindeki
  Türkçe ünlüler (a, e, ı, i, o, ö, u, ü) sırayla formant filtreleriyle seslendirilir — dudak senkronuyla aynı anda;
  her karakterin adından türeyen kendine özgü ses perdesi, cümle sonunda düşen (soruda yükselen) tonlama. Ayarlar →
  Ses → *Karakter konuşması*: Mırıldanma / Tarayıcı sesi (Türkçe TTS) / Kapalı. Altyazılar açılıp kapatılabilir.

## Hikâye, görevler ve dersler (Faz 12)

**Açılış**: yeni oyunda önce kabul mektubu gelir (adın ve binanla), ardından alacakaranlıkta gölün üzerinden şatoya uzanan
34 saniyelik bir sinematik uçuş ve anlatım; hikâye büyük kapıların önünde başlar.

**Ana hikâye — *Mühürlü Kule*** (özgün): şatonun hiç açılmamış kulesinin taşları geceleri ışıldamaya başlamıştır; eski bir
öğrenci olan kara büyücü **Morvek Kalgan** kulenin üç mühür parçasının peşindedir.

| Bölüm | Ad | Ne yapılır |
|---|---|---|
| 1 | Hoş geldin | Büyük Salon'a git, bir sınıf arkadaşınla konuş |
| 2 | İlk dersler | Tılsım ve KSKS derslerine katıl |
| 3 | Duvardaki fısıltı | 3. kattaki gizli odayı bul |
| 4 | Yasak Bölüm | Zırhları alt et, Mühürler Kitabı'nı bul |
| 5 | Kuzeydeki gölgeler | Karanlık büyücü kampını yen, ilk parçayı al |
| 6 | Ağların kalbi | Nyxara'yı yen, ikinci parçayı al |
| 7 | Soğuğun kıyısı | Patronus'u öğren, gece Solgunları kov, üçüncü parçayı al |
| 8 | Mühürlü Kule | İhtiyaç Odası'nı "Mühürlü Kule" olarak çağır, Kalgan'la düello et |

Son bölümde anlatım ve **Bina Kupası** sonuçlarıyla kapanış gelir. Yan görevler: iki arkadaş edinmek, süpürge alıp
madalya kazanmak, Düello Kulübü'nde yükselmek, Quidditch maçı kazanmak, İksir ve Uçuş dersleri.
Görev takipçisi sol üstte hedefi ve uzaklığı gösterir, ekranda bir işaret yön gösterir; **L** ile açılan *Günlük* bütün
görevleri ve adımlarını, Bina Kupası sıralamasını listeler. Hikâye eşyaları dünyada parlar, E ile alınır.

**Dersler** (ders saatleri 09:00–18:00, profesörle konuş):

| Ders | Profesör | Oyun |
|---|---|---|
| Tılsım: Wingardium Leviosa | Tilda Çınarlı (Tılsım sınıfı) | Üç minderi havalandırıp parlayan çembere bırak (2 dk) |
| KSKS: Savuşturma | Baran Demirkalkan (KSKS sınıfı) | Sekiz antrenman büyüsünü Protego ile tam zamanında savuştur |
| KSKS: Expecto Patronum | aynı | Patronus'u öğren (o zamana dek kilitli) ve bir kez başarıyla yap |
| İksir: Uyanış İksiri | Selvi Ateşoğlu (zindan) | Tarifi oku, sonra kazan başında her adımı dört seçenekten hatırla |
| Uçuş: Halka parkuru | Rüzgâr Aydemir (Quidditch sahası) | Saha turu parkurunu uç, madalya notu belirler |

Geçilen ders binana puan kazandırır (her ders günde bir kez). **Bina puanları** dersler, görevler, düellolar ve maçlarla
artar; diğer binalar her gün biraz puan toplar. Gece yarısına doğru (22:30'dan sonra) şato koridorlarında dolaşırken bir
sınıf başkanına yakalanırsan binan puan kaybeder.

## Arayüz, harita ve kayıtlar (Faz 13)

- **Harita (M)**: arazi haritası yükseklik verisinden üretilir (yükseklik renkleri, göl derinliği, tepe gölgelemesi, şatonun
  salon ve kuleleri); şato için her katın (zindanlar, zemin, 1.–3. kat) kat planı odaları ve kapılarıyla çizilir.
  İşaretler: oyuncu (bakış yönü oku), güncel görev hedefi, dostlar, süpürge dükkânı, yarış başlangıçları, Quidditch sahası,
  keşfedilen tehlikeli bölgeler ve hızlı yolculuk noktaları. Tekerlekle yakınlaş, sürükleyerek kaydır.
- **Keşif ve hızlı yolculuk**: adlandırılmış yerlere 30 m yaklaşınca "Keşfedildi" başlığıyla haritaya işlenir; haritanın
  yan listesinden keşfedilmiş yerlere (başka bölgeye de) hızlı yolculuk yapılır. Süpürgedeyken, yarış/maç/düello/ders
  sırasında ya da yakında düşman varken yapılamaz.
- **Mini harita** (sağ üst): kuzey yukarıda; arazide çevrenin haritası, şato içinde bulunduğun katın planı; oyuncu oku,
  dostlar ve görev hedefi (uzaktaysa kenara sabitlenir).
- **Kayıt sistemi**: 6 elle kayıt yuvası, 3 dönen otomatik kayıt (süreyle, görev bitince, ana menüye dönerken) ve bir
  hızlı kayıt yuvası (F5/F9). Her kayıt kartında o anın **küçük ekran görüntüsü**, yer (ör. "Şato · Kütüphane"), hikâye
  bölümü, karakter adı ve binası, oyun süresi, Galleon ve tarih vardır. Kaydet / üzerine kaydet / yükle / sil (onay ister),
  **dosyaya dışa aktar** ve **dosyadan içe aktar** (JSON). Kayıt biçimi sürümlüdür (v3), eski kayıtlar otomatik yükseltilir;
  depolama dolarsa küçük resimsiz yeniden denenir.
- **Menü**: Kayıtlar, Karakter (ad, bina ve kupa sırası, asa ve etkisi, kese, süpürge, oyun süresi, büyü ustalığı),
  Dostlar, Günlük, Oynanış (zorluk, altyazılar, mini harita, görev takipçisi, **arayüz ölçeği** %85–130), Grafik,
  Kontroller, Ses; alt kısımda Devam, Harita, **Ana menüye dön**. Açılış ekranında **Kayıt Yükle** ve **Ayarlar** da var.
  Menülerde ok tuşlarıyla gezinilir.
- **Cila**: üst üste gelen bildirimler yığın olarak gösterilir, yeni bir odaya/bölgeye girince yer adı başlığı çıkar,
  yükleme ekranında ve açılışta rastgele ipuçları.

## Performans ve denge (Faz 14)

**Performans**
- **Kare bütçesi**: `core/Profiler` her sistemin CPU süresini (fizik, yapay zekâ, karakter animasyonu ve kumaş, bölge akışı, arayüz, atmosfer, çizim, ses) ölçer; F3 panelindeki *Kare bütçesi* bölümü en pahalı olanları sıralar.
- **Dinamik çözünürlük** (Ayarlar → Grafik, varsayılan açık): kare süresi uzun süre ~48 FPS'nin altında kalırsa çözünürlük %10'luk adımlarla %60'a kadar iner, ekran tazeleme hızına dönünce geri çıkar. Yükleme ve durum değişimlerinden sonraki ilk saniyeler sayılmaz. Eşikler `data/perf.js` içinde.
- **FPS göstergesi** (Ayarlar → Grafik): saatin yanında kare hızı.
- Mini harita saniyede 20 kez çizilir (her kare değil).
- **Bellek**: iki sızıntı giderildi. (1) İskeletli karakterlerin kemik dokuları bölge değişiminde serbest bırakılmıyordu (her arazi ziyaretinde 9 GPU dokusu). (2) Gölge sistemi (CSM) kurduğu her malzemeyi kendi haritasında tutuyordu; atılan bölgelerin malzemeleri, dokuları ve tuvalleri bellekte kalıyordu (her arazi ↔ şato turunda ~57 MB). Artık 4 turda JS belleği ~307 MB'ta, doku/geometri sayısı sabit kalıyor.
- Sekme arka plana alınınca oyun kendiliğinden duraklar. WebGL bağlamı kaybolursa (sürücü sıfırlanması, GPU değişimi) oyun duraklar ve bağlam geri gelince devam eder. Beklenmeyen bir çalışma zamanı hatası oyuncuya bir kez bildirilir.

**Denge** — `node tools/balance.mjs` (veya `npm run balance`)
- Oyunun veri dosyalarını okuyup her zorlukta her düşman için şunları hesaplar: ustalık 1/3/5'te öldürme süresi (odak, bekleme süreleri, büyü yapma animasyonu, sersemletme çubuğu ve bitirici hareket dâhil), oyuncuya gelen hasar/sn, dayanma süresi ve *dövüş payı* (Episkey iyileştirmeleri dâhil harcanabilir can ÷ tüm grubu yenerken alınan hasar). Ayrıca Düello Kulübü sıralaması ve ekonomi (hangi görevden sonra hangi süpürge alınabiliyor).
- Varsayımlar ve hedef aralıklar `data/balance.js` içinde; bir değer aralık dışındaysa araç 1 koduyla çıkar.
- Bu faz ayarlananlar: **Morvek Kalgan** hem boss bitirici (%12) hem kalkanla ~225 sn süren, oyuncuyu ~18 sn'de deviren bir dövüştü → can 260, sersemletme 160, isabet 0,8, büyü aralığı 1,8–2,6 sn, kalkan olasılığı 0,25; canı artık zorluğa göre ölçekleniyor (Normal'de ~60 sn). **Nyxara** canı 1500 → 1200 (Normal'de ~160 sn). **Dev örümcek** 70 → 95 can, sersemletme 60 → 110 (ilk iki büyüde bitirici yemiyor).

**Son cila**: sürüm 1.0, açılış ekranında *Hakkında* (emeği geçenler), hikâyenin sonunda jenerik.

## Hata ayıklama (F3)

FPS ve kare süresi grafiği, çizim çağrıları, üçgen/geometri/doku sayıları, bellek, fizik istatistikleri,
oyuncu durumu (zemin açısı, hız, kilit), yapay zekâ ve platform durumları, çarpışma şekilleri görünümü,
noclip, ölümsüzlük, zaman ölçeği, bölge değiştirme (arazi / şato içi / test salonu), bölgeye göre ışınlanma menüsü (arazide 17,
şato içinde 14 nokta), arazi LOD / ağaç / kaya / çimen istatistikleri; şato içinde yüklü/görünür oda, geçilen portal, akış kuyruğu,
oyuncu ve kamera odası, portre ve kapı sayıları, merdiven zaman çizelgesi; sinematik/hasar/hit-stop/sarsıntı testleri.
Çizim çağrıları ve üçgenler artık tüm kare boyunca (gölge ve efekt geçişleri dahil) sayılır.
**Zaman ve hava** bölümü: saat kaydırıcısı, zaman hızı (×1 / ×10 / ×60 / ×300), hava durumu düğmeleri,
otomatik hava, şimşek çaktırma; ışık havuzu, gölge ve hava istatistikleri.
**Büyüler** bölümü: büyüyü seçme düğmeleri, sınırsız odak anahtarı, tüm büyülerde usta olma, efektleri temizleme; odak,
mermi, kırık nesne, buz tabakası ve partikül istatistikleri.
**Hikâye** bölümü: açılışı oynatma, görevde sonraki adım, finale atlama, Kalgan'ı çağırma, kapanış, +50 bina puanı,
her dersi saatten bağımsız başlatma; hikâye ve ders durumu, bina puanları.
**Ses ve müzik** bölümü: müzik ruh hâlini zorlama (veya otomatik), örnek efektler, konuşma testi; ses motoru durumu,
anlık/döngü/toplam ses sayısı, yankı, çalan ruh hâli, ölçü ve nota sayısı, konuşma kipi.
**Dostlar** bölümü: her dostu önüne çağırma, herkese +20 yakınlık, takibi bitirme, dostlar listesi; dostların durumu
(yerde/yürüyor/takipte), yakınlık değerleri, saat; varlıklar listesinde her dostun rutin yeri.
**Uçuş** bölümü: süpürgeye bin/in, tüm süpürgeler, sonraki süpürge, +100 Galleon, her yarışı başlatma, Quidditch maçı, Altın
Top'u hemen salma, maçı bitirme; uçuş durumu (hız, yönelim, takviye, irtifa, çarpma), yarış ve maç durumu, kese.
**Savaş** bölümü: her düşman türünü önüne çağırma, hepsini yok etme / sersemletme, boss'u sonraki aşamaya geçirme, düşman
yapay zekâsı anahtarı; zorluk, karşılaşma alanlarının durumu, gezinme ızgarası boyutu, düello sırası ve oyuncu savaş durumu;
varlıklar listesinde her düşmanın davranış ağacı durumu, canı, sersemletme ve farkındalık değeri.
**Karakter** bölümü: tüm animasyonları oynatma (döngüsel olanlar ikinci tıkta durur), ifadeler, konuşma, bina renkleri, kıyafet
değiştirme, rastgele karakter, karakter yaratma ekranı; iskelet görünümü, IK ve kumaş simülasyonu anahtarları; kemik/üçgen/parçacık
sayıları, üretim süresi, animasyon katmanları ve IK durumu, asa bilgisi.

## Mimari

```
index.html            import map + arayüz kökleri
src/main.js           başlatma, oyun durum makinesi, sabit adımlı döngü (1/60 fizik, değişken render + interpolasyon)
src/core/             EventBus, StateMachine, Input (klavye/fare/gamepad + tuş atama), Time (hit-stop),
                      SaveSystem (6 yuva + 3 dönen otomatik + hızlı, küçük resim, dışa/içe aktarma, sürümlü), Settings, AssetCache (referans sayımı), Debug (F3), Profiler (kare bütçesi)
src/render/           Renderer (kalite ön ayarları), DynamicResolution, Atmosphere (orkestra), Sky/SkyShader, Environment, SceneLighting (CSM),
                      LightManager, FlameSprites, Weather + WeatherParticles + PrecipitationOccluder, PostFX,
                      ColorGrading, DustMotes, SurfaceShader, TerrainMaterial, LakeMaterial, WindowMaterial,
                      GrassField, ParticleSystem, TrailRibbons, SpellVisuals, Telegraphs, MaterialLibrary, ThirdPersonCamera, CinematicCamera, DebugDraw
src/physics/          Geometry (kapsül/üçgen/ışın testleri), Collider, CollisionWorld (3B uzamsal hash + DDA ışın),
                      PhysicsWorld (cannon-es rijit cisimler + kinematik platformlar), CharacterController, TriggerSystem
src/gameplay/         Player (can, düşme hasarı, yeniden doğma, avatar), Student (arka plan öğrencileri), Ghost, Interaction,
                      spells/ (SpellCaster, SpellSystem, SpellTargets, Unistroke),
                      ai/ (BehaviorTree, NavGrid + A*, Squad), combat/ (EncounterManager, Enemy, EnemyTypes, SpiderQueen, DuelClub),
                      flight/ (BroomFlight, BroomShop, RaceManager, QuidditchMatch), Inventory (Galleon, süpürgeler, rekorlar),
                      social/ (Companion, SocialManager, Relationships),
                      story/ (QuestSystem, LessonManager, StoryDirector, HousePoints), MapState (keşif, hızlı yolculuk),
                      TargetDummy
src/animation/        Clips (anahtar kare derleme, poz karıştırma), Animator (katmanlar), IK, FaceAnimator, ClothSim, GroundProbe
src/procgen/          DevTextures (prototip dokular), StaticBatcher (dünya uzayı UV + çizim birleştirme),
                      geometry/CastleKit (şato modülleri), geometry/InteriorKit (iç mekân ve mobilya),
                      geometry/TreeGenerator (ağaç, kaya), textures/PortraitPainter (portreler), creatures/EnemyModels,
                      geometry/BroomKit (süpürgeler, uçan oyuncular, toplar)
src/procgen/characters/ Character (montaj), Skeleton, HeadGenerator, HairGenerator, BodyGenerator, Garments + ClothGarment,
                      WandGenerator, CharacterTextures, Appearance, Hairline, MeshKit
src/world/            GameClock, MapBaker (harita çizimi), RegionManager, TestRoom, RoomBuilder (veriden iç mekân), Movers, MaterialGallery, CreatorStage
src/world/grounds/    HogwartsGrounds (bölge), TerrainData, TerrainMesh, Castle, Vegetation, Props
src/world/interior/   CastleInterior (bölge), CellBuilder, CellStreamer, Door, MovingStaircases, PortraitGallery
src/ui/               HUD, SpellHUD, CombatHUD, FlightHUD, DialogueUI, FriendsPanel, StoryUI, MapView, Minimap, PauseMenu, GalleryPanel, CharacterCreator, styles.css
src/audio/            AudioEngine (kanallar, yankı, 3B), Synth (tarif → Web Audio), SoundDirector (olay → ses, ortam, adımlar),
                      MusicDirector (üretken, uyarlanır müzik), Voice (sentez konuşma / TTS)
src/data/             tüm ayar sabitleri: oyun, fizik, kamera, girdi, kalite, ayarlar, atmosfer, karakter, animasyon, asa, büyüler, savaş, uçuş, dostlar, diyaloglar, sesler, müzik, hikâye, dersler, arayüz, performans, denge modeli, test salonu, arazi, şato, şato içi, bitki örtüsü
tools/balance.mjs     denge raporu (node ile çalışır; oyunun veri dosyalarını okur)
```

Modüller birbirini doğrudan bilgilendirmez; olaylar `EventBus` üzerinden akar
(`player:landed`, `trigger:enter`, `camera:lock`, `render:quality`, `settings:changed` …).

## Yol haritası

1. ✅ Motor iskeleti, girdi, kamera, kapsül kontrolcü, fizik, debug paneli, test odası
2. ✅ Prosedürel doku sistemi ve tüm malzemeler (Worker + önbellek), malzeme galerisi
3. ✅ Işık, gökyüzü, gün-gece, hava durumu, post-fx, kalite ayarları
4. ✅ Karakter üretici, iskelet, animasyonlar, IK, cübbe simülasyonu, karakter yaratma
5. ✅ Şato modül kiti, Hogwarts dış mekânı, arazi, göl, orman
6. ✅ İç mekânlar, kapılar, hareketli merdivenler, portreler, hayaletler, streaming
7. ✅ Büyü sistemi, efektler, jest tanıma
8. ✅ Savaş, düşmanlar, yapay zekâ, düello, boss
9. ✅ Süpürge dükkânı, uçuş, yarışlar, Quidditch
10. ✅ Dostlar, diyalog, yakınlık, NPC rutinleri
11. ✅ Ses motoru, SFX, adaptif müzik, konuşma
12. ✅ Hikâye, görevler, dersler, bina puanları, açılış sekansı
13. ✅ Arayüz cilası, menüler, harita, kayıt sistemi
14. ✅ Optimizasyon, denge, son cila
