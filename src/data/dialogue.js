/**
 * @file Dialogue lines for the companions. `{ad}` is replaced by the
 * player's first name. Each companion has greetings per friendship level,
 * place-specific openers, four personal topics (unlocked by level, each
 * with replies they like or dislike), gift reactions, follow / part lines,
 * their favour, level-up lines and a few combat barks. School rumours
 * (hints about the world) are shared.
 *
 * Reply `tone` is compared to the companion's `values`: a match earns
 * `good` affinity, a clash `bad`, anything else a small bonus.
 */

export const TONE = Object.freeze({
  good: 4, bad: -3, other: 1,
  /** The reply style each personality dislikes. */
  clash: { bold: 'careful', curious: 'bold', kind: 'bold', clever: 'careful' },
});

export const RUMOURS = Object.freeze([
  'Üçüncü kat koridorunda bir tuğla varmış; doğru sırayla dokunursan duvar açılıyormuş. Kimse sırayı bilmiyor ama.',
  'Yedinci kattaki boş duvarın önünden üç kez, bir şeye gerçekten ihtiyaç duyarak geçersen kapı beliriyormuş. Uydurma derler, ben inanıyorum.',
  'Kütüphanedeki Yasak Bölüm\'ün parmaklığı kilitli. Alohomora bilen biri için sorun değil, ama içerideki zırhlar… onlar başka mesele.',
  'Yasak Orman\'ın derinlerinde koca bir örümcek yuvası varmış. Oraya giden geri dönmemiş diyorlar; ben dönenleri de duydum ama pek konuşmuyorlar.',
  'Gece göl kıyısında Solgunlar dolaşıyormuş. Tek çare Patronus. Mutlu bir anı düşün, derin nefes al… sonra kaç.',
  'Kuzey yolundaki kampta karanlık büyücüler görülmüş. Öğretmenler "kapıdan dışarı çıkmayın" diyor; kimse dinlemiyor tabii.',
  'Quidditch sahasının yanındaki dükkân yeni bir süpürge getirmiş, adı Gece Şahini. Fiyatını sorma, ağlarsın.',
  'Düello Kulübü\'nün şampiyonu Dorian Vale hiç yenilmemiş. Kalkanını erken kaldırırsan belki bir şansın olur.',
  'Dolunay gecelerinde ormanın kenarındaki açıklıktan uluma sesleri geliyor. Ben o tarafa gitmem, sen de gitme.',
  'Göl yeterince donarsa üzerinde yürünebiliyormuş. Glacius\'u biraz çalış, kim bilir.',
]);

/** Shared fallback lines. */
export const COMMON = Object.freeze({
  asleep: '{name} yatakhanede uyuyor. Yarın sabah Büyük Salon\'da kahvaltıda bulabilirsin.',
  giftToday: 'Bugün zaten bir hediye verdin. Çok şımartma, alışırım!',
  giftPoor: 'Kesende yeterince Galleon yok.',
  followFull: 'Zaten biriyle birliktesin. Aynı anda yalnızca bir dost yanında gelebilir.',
  favourReminder: 'Hatırlatayım: {favour}.',
});

export const LINES = Object.freeze({
  elif: {
    greet: [
      'Hey! Sen yeni misin? Ben Elif. Süpürgen var mı? Yoksa olmalı.',
      '{ad}! Yine sen. Bugün uçtun mu? Uçmadıysan gün boşa gitmiş demektir.',
      'Ooo, en sevdiğim yol arkadaşı! Ne yapıyoruz, bir yarış mı?',
      '{ad}! Seni bekliyordum. Kafamda bir plan var ve içinde sen de varsın.',
      'Sensiz bu okul bir süpürgesiz saha gibi olurdu. Anlat bakalım.',
    ],
    place: {
      sit: 'Ağzım dolu, bir saniye… Tamam, dinliyorum!',
      cast: 'Şu tılsım bir türlü tutmuyor. Belki sen görünce utanır da tutar.',
      watch: 'Şu dalışa bak! Ben olsam yere iki metre kala çekerdim. Belki bir.',
      idle: 'Canım sıkılıyor. Bir şeyler olsun istiyorum!',
    },
    topics: [
      {
        level: 0, label: 'Kendinden bahset',
        text: 'Ailem Karadeniz\'de balıkçı. Deniz fırtınalıyken babam çatıya çıkar, rüzgârı dinler. Ben de öyleyim: fırtına varsa oradayım.',
        replies: [
          { label: 'Fırtınada uçmak mı? Harika, ben de gelirim.', tone: 'bold', answer: 'İşte bu! Seninle anlaşacağız.' },
          { label: 'Biraz tehlikeli değil mi?', tone: 'careful', answer: 'Tehlikeli olmayan hiçbir şey eğlenceli değildir, {ad}.' },
        ],
      },
      {
        level: 1, label: 'Quidditch\'i neden bu kadar seviyorsun?',
        text: 'Çünkü havada kimse sana ne yapacağını söyleyemez. Yerde herkesin bir kuralı var. Yukarıda sadece rüzgâr ve sen.',
        replies: [
          { label: 'Kurallar bazen işe yarar ama.', tone: 'careful', answer: 'Hıh. Belki. Ama yukarıda değil.' },
          { label: 'Yukarıda özgürsün. Anlıyorum.', tone: 'bold', answer: 'Anlıyorsun! Çok az kişi anlıyor.' },
        ],
      },
      {
        level: 2, label: 'Hiç korktuğun bir şey var mı?',
        text: '…Var. Geçen yıl süpürgeden düştüm, sekiz metreden. İyileştim ama o an kolumu hissetmediğim anı unutamıyorum. Kimseye söyleme.',
        replies: [
          { label: 'Sır tutarım. Ve yine de uçuyorsun — bu cesaret.', tone: 'kind', answer: 'Sağ ol, {ad}. Gerçekten.' },
          { label: 'Korkmak için bir sebep yok bence.', tone: 'bold', answer: 'Kolay söylemesi. Ama sağ ol yine de.' },
        ],
      },
      {
        level: 3, label: 'Mezun olunca ne yapacaksın?',
        text: 'Profesyonel ligde oynamak istiyorum. Olmazsa ejderha bakıcısı olurum. İkisi de havada, ikisi de yanar.',
        replies: [
          { label: 'Seni ilk maçında tribünden izleyeceğim.', tone: 'bold', answer: 'Sözünü tutmazsan seni süpürgemle kovalarım!' },
          { label: 'Ejderhalar gerçekten tehlikeli ama.', tone: 'careful', answer: 'Biliyorum. Bu yüzden istiyorum zaten.' },
        ],
      },
    ],
    gift: {
      loved: 'Bu… süpürge cilası mı? En iyisinden! {ad}, sen bir harikasın!',
      liked: 'Ooo, bunu severim! Teşekkürler!',
      neutral: 'Hıh, teşekkürler. Nazik bir düşünce.',
      disliked: 'Bir… kitap. Şey. Sağ ol? Galiba?',
    },
    follow: { yes: 'Hadi gidelim! Önden git, arkanı ben kollarım.', part: 'Tamam, burada ayrılalım. Beni çağırmayı unutma!', no: 'Seni daha iyi tanımam lazım. Önce biraz konuşalım.' },
    favour: {
      offer: 'Bir iddiaya girdim: benim tanıdığım biri bir yarışta altın madalya alabilir mi diye. Sen alabilirsin, değil mi?',
      accept: 'Kabul ediyorum!',
      decline: 'Şimdi olmaz.',
      thanks: 'ALTIN! Biliyordum! İddiayı kazandım, yarısı senin. Sen gerçek bir uçucusun, {ad}.',
    },
    level: ['', 'Sana güvenebilirim gibi.', 'Artık resmen arkadaşız, kaçış yok!', 'Sen benim kanat arkadaşımsın.', 'Can dostum! Bir gün seni ligde takımıma alacağım.'],
    combat: ['Sağdan geliyor!', 'Stupefy! Hah!', 'Arkanı kolluyorum!', 'Bu kadar mı?'],
    bye: 'Görüşürüz! Gökyüzünde!',
  },

  deniz: {
    greet: [
      'Hm? Ah, merhaba. Deniz. Okuduğum yeri kaybettim ama… önemli değil.',
      '{ad}, tam zamanında! Bir bilmecem var, dinler misin?',
      'Seninle konuşmak kitap okumak gibi: her seferinde yeni bir şey çıkıyor.',
      '{ad}! Dün gece bir şey keşfettim. Sana anlatmak için sabırsızlanıyordum.',
      'Eğer bu okulda bir kişiye her şeyi anlatabilirsem, o sensin.',
    ],
    place: {
      sit: 'Şşş, kütüphaneci bakıyor. Fısıltıyla konuşalım.',
      read: 'Bu rafta bir kitap tersten yazılmış. Aynayla okumak gerekiyor — ne kadar zekice!',
      cast: 'Bir kalkan büyüsünü tersine çevirmeye çalışıyorum. Teoride mümkün. Pratikte… saçlarım biraz yandı.',
      idle: 'Merdivenler bugün üç kez yön değiştirdi. Bir örüntü olmalı.',
    },
    topics: [
      {
        level: 0, label: 'Kendinden bahset',
        text: 'Annem bir kütüphaneci, babam saat tamircisi. Evimizde her şey tik tak eder ve fısıldar. Sessizlik bana biraz tuhaf geliyor.',
        replies: [
          { label: 'Saatlerin nasıl çalıştığını anlatır mısın?', tone: 'curious', answer: 'Anlatır mıyım! Otur, bu biraz sürer.' },
          { label: 'Kulağa sıkıcı geliyor.', tone: 'bold', answer: 'Hım. Sana öyle gelebilir.' },
        ],
      },
      {
        level: 1, label: 'Ne okuyorsun?',
        text: 'Kaybolmuş büyüler üzerine bir derleme. Yüzyıllar önce kullanılıp unutulmuş. Birini geri getirebilsem…',
        replies: [
          { label: 'Hangisini geri getirmek isterdin?', tone: 'curious', answer: 'Yağmuru şarkıya çeviren bir büyü var. Faydasız ve mükemmel.' },
          { label: 'Unutulmuşsa bir sebebi vardır.', tone: 'careful', answer: 'Belki. Ama sebebi merak etmek de bir sebep.' },
        ],
      },
      {
        level: 2, label: 'Arkadaşın çok mu?',
        text: 'Açıkçası… pek yok. İnsanlar ben konuşmaya başlayınca gözlerini kaçırıyor. Sen kaçırmıyorsun. Bu yüzden seni seviyorum sanırım.',
        replies: [
          { label: 'Onların kaybı. Seni dinlemek güzel.', tone: 'kind', answer: '…Teşekkür ederim, {ad}. Ciddiyim.' },
          { label: 'Belki biraz daha az konuşmalısın?', tone: 'bold', answer: 'Belki. Denerim. Ama sen yine de dinle, olur mu?' },
        ],
      },
      {
        level: 3, label: 'Bir sırrın var mı?',
        text: 'Geceleri yıldızları sayıyorum. Her gece bir tane eksik çıkıyor. Ya ben yanlış sayıyorum ya da gökyüzü bir şey saklıyor.',
        replies: [
          { label: 'Bir gece birlikte sayalım mı?', tone: 'curious', answer: 'Gerçekten mi? Astronomi kulesinde, gece yarısı. Anlaştık!' },
          { label: 'Muhtemelen yanlış sayıyorsun.', tone: 'bold', answer: 'Muhtemelen. Ama "muhtemelen" bir kanıt değildir.' },
        ],
      },
    ],
    gift: {
      loved: 'Bu baskıyı yıllardır arıyordum! Kenar notları bile var! {ad}, nasıl bildin?',
      liked: 'Ah, ne güzel. Hemen kullanacağım.',
      neutral: 'Teşekkürler, düşünceli bir hediye.',
      disliked: 'Bu… kokuyor. Neden kokuyor? Lütfen geri al.',
    },
    follow: { yes: 'Maceraya mı? Not defterimi alayım. Tamam, hazırım.', part: 'Ben kütüphaneye dönüyorum. Gördüklerimizi not edeceğim.', no: 'Henüz seni yeterince tanımıyorum. Biraz daha konuşalım mı?' },
    favour: {
      offer: 'Yasak Bölüm\'de, zırhların koruduğu rafta aradığım bir kitap var. O iki zırh yerinde durdukça yaklaşamam. Onları alt edebilir misin?',
      accept: 'Hallederim.',
      decline: 'Kulağa tehlikeli geliyor.',
      thanks: 'Başardın! Kitabı aldım — ve bak, içine senin adını not düştüm. Bu keşif ikimizin.',
    },
    level: ['', 'Seninle konuşmak kolay.', 'Sanırım arkadaşız. Bunu bir yere yazacağım.', 'Sana her şeyi anlatabilirim.', 'Yıldızları seninle sayacağım. Hepsini.'],
    combat: ['Petrificus!', 'Soldakinin kalkanı zayıf!', 'Buz tutar mı acaba… tuttu!', 'Dikkat et!'],
    bye: 'Görüşürüz. Bir şey keşfedersen bana anlat!',
  },

  mert: {
    greet: [
      'Selam! Ben Mert. Ay, pardon, ayağına bastım mı? Bastım. Özür dilerim.',
      '{ad}! Karnın aç mı? Cebimde kurabiye var, biraz ezik ama.',
      'Seni görünce içim ısınıyor, tuhaf ama güzel.',
      '{ad}, bugün nasılsın? Gerçekten nasılsın yani?',
      'Sen buradaysan her şey yolunda demektir.',
    ],
    place: {
      sit: 'Kurabiye? Bal kabaklı. Kendim yaptım, bu yüzden biraz yanık.',
      cast: 'Bu iksir mor olmalıydı. Neden turuncu? Neden köpürüyor? Geri çekil!',
      idle: 'Şu saksıdaki fide bugün bana gülümsedi. Yemin ederim.',
    },
    topics: [
      {
        level: 0, label: 'Kendinden bahset',
        text: 'Büyükannemin serası vardı. Her yazı orada geçirdim. Bitkiler insanlardan daha dürüst: susuzsa solar, mutluysa açar.',
        replies: [
          { label: 'Bana da bir şeyler öğretir misin?', tone: 'kind', answer: 'Tabii ki! Önce onlarla konuşmayı öğreneceksin.' },
          { label: 'Bitkiler mi? Hıh.', tone: 'bold', answer: 'Gülme ama, bir gün hayatını bir mandragora kurtarabilir.' },
        ],
      },
      {
        level: 1, label: 'Neden bu kadar sakarsın?',
        text: 'Bilmiyorum! Sanki bacaklarım benden önce karar veriyor. Geçen hafta kendi gölgeme takıldım. Gölgeme!',
        replies: [
          { label: 'Olsun, en azından eğlenceli.', tone: 'kind', answer: 'Değil mi? Kimse de yaralanmadı. Gölgem hariç.' },
          { label: 'Biraz dikkat etsen?', tone: 'careful', answer: 'Ediyorum! Dikkat de takılıyor.' },
        ],
      },
      {
        level: 2, label: 'Seni üzen bir şey var mı?',
        text: 'Büyükannem geçen kış öldü. Serası hâlâ duruyor ama kimse sulamıyor. Mezun olunca oraya döneceğim.',
        replies: [
          { label: 'Çok üzgünüm, Mert. Anlatmak istersen buradayım.', tone: 'kind', answer: 'Biliyorum. Bu yüzden anlattım zaten.' },
          { label: 'Hayat devam ediyor, güçlü ol.', tone: 'bold', answer: 'Evet… devam ediyor. Sağ ol.' },
        ],
      },
      {
        level: 3, label: 'En sevdiğin anı?',
        text: 'İlk yılımda, ormanda kaybolmuştum. Bir tek boynuzlu at yolumu gösterdi. Kimse inanmadı. Sen inanır mısın?',
        replies: [
          { label: 'İnanırım. Burası Hogwarts.', tone: 'kind', answer: 'Biliyordum! Sen başkasın.' },
          { label: 'Belki bir geyikti?', tone: 'curious', answer: 'Geyiklerin boynuzu gökkuşağı gibi parlamaz ama. Parlamaz, değil mi?' },
        ],
      },
    ],
    gift: {
      loved: 'Bu eğreltiotu şarkı söylüyor! Bak, bak, nakarata girdi! {ad}, teşekkür ederim!',
      liked: 'Mmm, bayılırım! Seninle paylaşayım mı?',
      neutral: 'Ay, ne tatlısın. Teşekkürler.',
      disliked: 'Bu… bunu neden bana verdin? Kokusu seraya siner.',
    },
    follow: { yes: 'Seninle gelirim! Yaralanırsan yamarım, merak etme.', part: 'Tamam, ben seraya bakayım. Kendine iyi bak!', no: 'Önce biraz daha tanışalım, olur mu? Sonra seve seve.' },
    favour: {
      offer: 'Düello Kulübü\'nde birinci sınıflara ders vermek istiyorum ama hocamız önce bir öğrencimin sıralamada yükselmesini istiyor. Üçüncü rakibe kadar çıkabilir misin?',
      accept: 'Yaparım.',
      decline: 'Düello pek bana göre değil.',
      thanks: 'Yaptın! Hocamız bana ders vermeyi onayladı. Hepsi senin sayende, {ad}.',
    },
    level: ['', 'Seninle konuşmak iyi geliyor.', 'Artık arkadaşız! Kurabiyelerimin yarısı senin.', 'Sana bir sera fidesi ayırdım.', 'Sen benim ailem gibisin, {ad}.'],
    combat: ['Dayan, iyileştiriyorum!', 'Episkey!', 'Of, bu büyük!', 'Buradayım!'],
    bye: 'Kendine iyi bak! Yemek yemeyi unutma!',
  },

  nehir: {
    greet: [
      'Evet? Bir şey mi istiyorsun? Nehir. Adımı hatırla, lazım olacak.',
      'Ah, {ad}. Bugün az önce birini düelloda yendim. Sormadın ama söyleyeyim dedim.',
      'Sen fena değilsin. Bunu sık söylemem.',
      '{ad}. Gel, sana herkesin bilmediği bir şey anlatacağım.',
      'Bu okulda güvendiğim tek kişi sensin. Bunu da kimseye söyleme.',
    ],
    place: {
      sit: 'Salonun bu tarafı daha sessiz. Tercih meselesi.',
      cast: 'Hocanın gözü üzerimde. Kusursuz yapmam lazım. Yapacağım da.',
      idle: 'Buradan herkesi görebiliyorum. Kim kiminle konuşuyor, kim neyi saklıyor…',
    },
    topics: [
      {
        level: 0, label: 'Kendinden bahset',
        text: 'Ailem eski bir aile, beklentileri de eski. Benden en iyisi olmam bekleniyor. Ben de en iyisiyim.',
        replies: [
          { label: 'Kendi istediğin ne peki?', tone: 'clever', answer: '…İlginç bir soru. Kimse sormamıştı.' },
          { label: 'Biraz kendini beğenmişsin.', tone: 'bold', answer: 'Biraz değil, çok. Ama haklıyım da.' },
        ],
      },
      {
        level: 1, label: 'Slytherin\'de olmak nasıl?',
        text: 'Herkes kötü olduğumuzu sanıyor. Biz sadece kazanmayı seviyoruz. Kazanmayı sevmek suç mu?',
        replies: [
          { label: 'Önemli olan nasıl kazandığın.', tone: 'clever', answer: 'Doğru. Hile kazanmak değildir, sadece kaybetmemektir.' },
          { label: 'Bence herkes öyle.', tone: 'kind', answer: 'Belki. Ama sadece biz itiraf ediyoruz.' },
        ],
      },
      {
        level: 2, label: 'Hiç kaybettin mi?',
        text: 'Bir kere. İkinci sınıfta bir satranç maçı. Rakibim beni üç hamlede bitirdi. O gece uyumadım, sabaha kadar oynadım. Bir daha kaybetmedim.',
        replies: [
          { label: 'Kaybetmek de öğretir.', tone: 'clever', answer: 'Öğretti. Bir daha asla, diye.' },
          { label: 'Biraz takıntılı değil mi?', tone: 'careful', answer: 'Takıntı, başarının yanlış anlaşılmış adıdır.' },
        ],
      },
      {
        level: 3, label: 'Neden bana güveniyorsun?',
        text: 'Çünkü benden bir şey istemedin. Herkes ya ailemi ya notlarımı ya da düello taktiklerimi istiyor. Sen sadece konuştun.',
        replies: [
          { label: 'Senin gibi biri iyi bir müttefik.', tone: 'clever', answer: 'Müttefik. Evet. Hoşuma gitti.' },
          { label: 'Çünkü seni seviyorum, bu kadar.', tone: 'kind', answer: '…Saçmalama. Ama… sağ ol.' },
        ],
      },
    ],
    gift: {
      loved: 'Gümüş bir yılan… Bu işçilik! Taktığım an herkes soracak. Söylemem tabii nereden aldığımı.',
      liked: 'Zevkin fena değilmiş. Kabul ediyorum.',
      neutral: 'Peki. Teşekkürler.',
      disliked: 'Şeker mi? Ben beş yaşında mıyım?',
    },
    follow: { yes: 'Tamam, geliyorum. Ama ben öndeyim. Şaka. Önden buyur.', part: 'Buraya kadar. Yarın yine konuşuruz.', no: 'Seninle yolculuk mu? Önce kendini kanıtla.' },
    favour: {
      offer: 'Bizim evin takımı geçen maçı kaybetti ve herkes bana laf sokuyor. Bir Quidditch maçı kazan ve hepsinin sesini kes.',
      accept: 'Kazanırım.',
      decline: 'Quidditch benim işim değil.',
      thanks: 'Kazandın. Herkesin yüzünü görmeliydin. Bunu unutmayacağım, {ad}. Hiç.',
    },
    level: ['', 'Fena değilsin.', 'Tamam, arkadaşız. Kimseye söyleme.', 'Sana arkamı dönebilirim. Bu nadirdir.', 'Can dostum. Birisi sana dokunursa bana söyle.'],
    combat: ['Confringo!', 'Kolay.', 'Önüme çıkma!', 'Bu mu karanlık büyücü?'],
    bye: 'Görüşürüz. Dikkatli ol, herkes benim kadar iyi niyetli değil.',
  },
});
