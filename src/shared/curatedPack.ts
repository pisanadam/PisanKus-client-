import type { LoaderId } from './types'

/**
 * The launcher's own packs.
 *
 * Neither of these is a Modrinth project or a .mrpack. They are lists this
 * launcher curates, resolved against Modrinth at install time, so a pack
 * written today still works on a Minecraft version that did not exist when it
 * was written.
 *
 * That resolution is the whole point. Mods do not move in step: some follow
 * Minecraft within days, others sit on an old version for a year. A frozen list
 * would install a broken profile the day one of them fell behind, so the
 * installer takes whichever entries have a build for the chosen version and
 * reports the rest instead of failing.
 *
 * A pack installs mods and nothing else. It does not write options.txt and does
 * not touch the profile's memory or JVM flags — those stay wherever the player
 * put them.
 */

export interface PackMod {
  /** Modrinth slug — stable, and readable in the code. */
  slug: string
  name: string
  /** Shown while installing, so the player sees what each piece is for. */
  role: string
  /**
   * A pack without this mod is not worth installing. Missing an essential entry
   * aborts; missing an optional one is just reported.
   */
  essential?: boolean
}

export interface CuratedPack {
  id: string
  name: string
  summary: string
  /** Emoji used as the created profile's icon. */
  icon: string
  /** Loader the profile is created with. */
  loader: LoaderId
  /**
   * Modrinth loader facets to try when resolving a version, in order.
   *
   * A list rather than one value because a project may publish under more than
   * one facet; they are tried in order and the first hit wins.
   */
  modrinthLoaders: string[]
  /** Versions worth defaulting to, newest first. Others stay selectable. */
  recommended: { version: string; why: string }[]
  mods: PackMod[]
  /** Extra sentence shown in the dialog, when the pack needs explaining. */
  note?: string
}

const MODERN: CuratedPack = {
  id: 'pisan-optimized',
  name: 'Pisan Optimized',
  summary:
    'PisanKus ekibinin derlediği Fabric paketi: performans modları ve günlük oyunu rahatlatan eklentiler. ' +
    'Tek seferde kurulur, oyun ayarlarınıza dokunmaz.',
  icon: '🚀',
  loader: 'fabric',
  modrinthLoaders: ['fabric'],
  recommended: [
    { version: '26.2', why: 'Güncel sürüm' },
    { version: '1.21.11', why: '1.21 serisinin sonu' },
    { version: '1.21.1', why: 'Sunucuların ve modların çoğu burada' }
  ],
  /**
   * Ordered by what depends on what, then by how much each one matters — which
   * is also the order they install in.
   *
   * Libraries come first on purpose. Every one of them is a required dependency
   * of something further down, and installing them up front means the
   * dependency resolver finds them already present instead of fetching them a
   * second time.
   */
  mods: [
    { slug: 'fabric-api', name: 'Fabric API', role: 'Diğer modların dayandığı temel', essential: true },
    { slug: 'fabric-language-kotlin', name: 'Fabric Language Kotlin', role: 'Kotlin ile yazılmış modların çalışma ortamı' },
    { slug: 'cloth-config', name: 'Cloth Config', role: 'Ayar ekranı kütüphanesi' },
    { slug: 'yacl', name: 'YetAnotherConfigLib', role: 'Ayar ekranı kütüphanesi' },
    { slug: 'placeholder-api', name: 'Placeholder API', role: 'Metin yer tutucu kütüphanesi' },

    { slug: 'sodium', name: 'Sodium', role: 'Render motorunu baştan yazar — en büyük FPS kazancı', essential: true },
    { slug: 'lithium', name: 'Lithium', role: 'Oyun mantığını hızlandırır, davranışı değiştirmeden' },
    { slug: 'ferrite-core', name: 'FerriteCore', role: 'Bellek kullanımını ciddi ölçüde düşürür' },
    { slug: 'immediatelyfast', name: 'ImmediatelyFast', role: 'Arayüz ve HUD çizimini toplu hale getirir' },
    { slug: 'entityculling', name: 'Entity Culling', role: 'Görünmeyen varlıkları hiç çizmez' },
    { slug: 'moreculling', name: 'More Culling', role: 'Görünmeyen blok yüzeylerini eler' },
    { slug: 'sodium-extra', name: 'Sodium Extra', role: 'Sodium’a ek görsel/performans ayarları' },
    { slug: 'krypton', name: 'Krypton', role: 'Ağ katmanını hafifletir — sunucularda gecikme' },
    { slug: 'c2me-fabric', name: 'C2ME', role: 'Chunk yüklemeyi çok çekirdeğe yayar' },
    { slug: 'vmp-fabric', name: 'Very Many Players', role: 'Kalabalık sunucularda kare hızını korur' },
    { slug: 'scalablelux', name: 'ScalableLux', role: 'Işık hesabını ayrı çekirdeklere taşır' },
    { slug: 'threadtweak', name: 'ThreadTweak', role: 'İş parçacığı önceliklerini düzenler' },
    { slug: 'dynamic-fps', name: 'Dynamic FPS', role: 'Pencere arkadayken güç harcamaz' },
    { slug: 'fastquit', name: 'FastQuit', role: 'Dünyadan çıkışı bekletmez' },
    { slug: 'modernfix', name: 'ModernFix', role: 'Açılışı kısaltır, bellek sızıntılarını kapatır' },
    { slug: 'noisium', name: 'Noisium', role: 'Dünya üretimini hızlandırır' },
    { slug: 'bobby', name: 'Bobby', role: 'Sunucunun izin verdiğinden uzağı görmenizi sağlar' },

    { slug: 'modmenu', name: 'Mod Menu', role: 'Kurulu modları ve ayarlarını oyun içinden yönetir' },
    { slug: 'reeses-sodium-options', name: 'Reese’s Sodium Options', role: 'Sodium ayar ekranını kullanışlı hale getirir' },
    { slug: 'zoomify', name: 'Zoomify', role: 'Yakınlaştırma tuşu' },
    { slug: 'appleskin', name: 'AppleSkin', role: 'Açlık ve doygunluk bilgisini gösterir' },
    { slug: 'mouse-tweaks', name: 'Mouse Tweaks', role: 'Envanterde fare ile hızlı taşıma' },
    { slug: '3dskinlayers', name: '3D Skin Layers', role: 'Skin’in üst katmanını üç boyutlu gösterir' },
    { slug: 'no-chat-reports', name: 'No Chat Reports', role: 'Sohbet mesajlarının imzalanmasını kapatır' },
    { slug: 'simple-voice-chat', name: 'Simple Voice Chat', role: 'Destekleyen sunucularda sesli konuşma' },
    { slug: 'controlify', name: 'Controlify', role: 'Oyun kolu desteği' }
  ]
}

/**
 * 1.8.9 was tried and dropped, loader and all.
 *
 * Legacy Fabric API is distributed two ways and neither works unattended: the
 * Modrinth file is one jar carrying modules for 1.3.2 through 1.12.2, which
 * Fabric rejects because most declare the wrong Minecraft version, while the
 * maven artifact for 1.8.9 is an empty 5 KB marker with no modules at all, so
 * mods needing them refuse to load. Two attempts reached the player and neither
 * started the game, so the whole thing came out rather than shipping a third
 * guess.
 */

/**
 * A big, curated adventure pack rather than a performance one: new biomes,
 * animals, food, dungeons and furniture, held together by the libraries they
 * all need.
 *
 * Forge and 1.20.1 on purpose. Nearly every mod in it is published for Forge,
 * and 1.20.1 is the version 86 of the 90 have a build for — on 1.21.1 only 30
 * do, which would leave the pack a shadow of itself.
 *
 * The poster this list comes from names a few pieces that are not on Modrinth
 * at all (the original Twilight Forest, MrCrayfish's Furniture Mod and its
 * Framework, Hamsters Plus Lite, Gale's Bugcatching, Spice of Life: Classic
 * Edition, GolleoLib, Xaero's Naturalist Icons). The launcher installs from
 * Modrinth, so those are simply not here — better an honest 90 than a list
 * that reports failures every time it runs.
 */
const SWEETIE: CuratedPack = {
  id: 'sweetie-pack',
  name: 'Sweetie Pack',
  summary:
    'Maceraya yönelik büyük derleme: yeni biyomlar, hayvanlar, yemekler, zindanlar ve mobilyalar. ' +
    'Forge profili olarak kurulur, oyun ayarlarınıza dokunmaz.',
  icon: '🍬',
  loader: 'forge',
  modrinthLoaders: ['forge'],
  recommended: [{ version: '1.20.1', why: 'Paketin neredeyse tamamı burada' }],
  note:
    'Yüzden fazla parçadan oluşan bir derlemede her modun her sürüme yetişmesi beklenemez; ' +
    'seçtiğiniz sürüme yayınlanmamış olanlar atlanır ve kurulum sonunda listelenir.',
  mods: [
    // Dünya üretimi ve keşif
    { slug: 'tectonic', name: 'Tectonic', role: 'Dağları, vadileri ve nehirleri baştan şekillendirir' },
    { slug: 'biomes-o-plenty', name: 'Biomes O’ Plenty', role: 'Yüzlerce yeni biyom' },
    // Twilight Forest'ın kendisi Modrinth'te yok (aşağıdaki nota bakın) ve bu
    // ona eklenti. Temeli olmadan Forge açılışta durduruyor:
    //   Mod ID: 'twilightforest', Requested by: 'tf_dnv', Actual version: [MISSING]
    // Kurulamayacak bir eklentiyi listede tutmanın anlamı yok.
    { slug: 'when-dungeons-arise', name: 'When Dungeons Arise', role: 'El yapımı büyük zindanlar ve yapılar' },
    { slug: 'lithostitched', name: 'Lithostitched', role: 'Dünya üretimi eklerini birbirine bağlar' },
    { slug: 'terrablender', name: 'TerraBlender', role: 'Biyom modlarının aynı dünyada geçinmesini sağlar' },
    { slug: 'chunky', name: 'Chunky', role: 'Dünyayı önceden üretir; keşifte takılma olmaz' },
    { slug: 'regions-unexplored', name: 'Regions Unexplored', role: 'Yeni biyomlar ve ağaç türleri' },
    { slug: 'aures-farmers-structures', name: 'Farmer’s Structures', role: 'Köylere ve kırlara çiftçilik yapıları' },
    { slug: 'the-graveyard-forge', name: 'The Graveyard', role: 'Mezarlıklar, kriptalar ve yeni yaratıklar' },
    { slug: 'alexs-caves', name: 'Alex’s Caves', role: 'Yeraltına tematik dev mağaralar' },

    // Hayvanlar ve yaratıklar
    { slug: 'alexs-mobs', name: 'Alex’s Mobs', role: 'Onlarca yeni hayvan ve yaratık' },
    { slug: 'alexs-mobs-naturalist-compat', name: 'Alex’s Mobs - Naturalist Compat', role: 'Alex’s Mobs ile Naturalist’i uyumlu kılar' },
    { slug: 'naturalist', name: 'Naturalist', role: 'Gerçekçi vahşi yaşam ve davranışlar' },
    { slug: 'inhabitants', name: 'Inhabitants', role: 'Boş yapıları kendi sakinleriyle doldurur' },
    { slug: 'ecologics', name: 'Ecologics', role: 'Biyomlara özgü hayvan ve bitkiler' },
    { slug: 'ribbits', name: 'Ribbits', role: 'Kurbağa halkı köyleri' },
    { slug: 'guard-ribbits', name: 'Guard Ribbits', role: 'Kurbağa köylerine muhafızlar' },
    { slug: 'useful-ribbits', name: 'Useful Ribbits', role: 'Kurbağa halkıyla ticaret' },
    { slug: 'faunify', name: 'Faunify', role: 'Vanilya hayvanlarına yeni davranışlar' },
    { slug: 'dragns-bettas-aquatics', name: 'Dragn’s Bettas & Aquatics', role: 'Süs balıkları ve akvaryum canlıları' },
    { slug: 'whisperwoods', name: 'Whisperwoods', role: 'Ormanlara ürkütücü yaratıklar' },
    { slug: 'zombie-awareness', name: 'Zombie Awareness', role: 'Yaratıklar sesi ve kokuyu takip eder' },
    { slug: 'doggy-talents-next', name: 'Doggy Talents Next', role: 'Köpekleri eğitin, yetenek kazandırın' },
    { slug: 'callable-horses', name: 'Callable Horses', role: 'Atınızı uzaktan çağırın' },

    // Tarım, yemek ve pişirme
    { slug: 'farmers-delight', name: 'Farmer’s Delight', role: 'Mutfak, tarla ve onlarca yemek', essential: true },
    { slug: 'farmers-respite', name: 'Farmer’s Respite', role: 'Çay, kahve ve demleme' },
    { slug: 'oceans-delight', name: 'Ocean’s Delight', role: 'Deniz ürünleri ve tarifleri' },
    { slug: 'naturalist-delight', name: 'Naturalist Delight', role: 'Naturalist hayvanlarını mutfağa bağlar' },
    { slug: 'aquaculture', name: 'Aquaculture 2', role: 'Balıkçılığı derinleştirir' },
    { slug: 'aquaculture-delight', name: 'Aquaculture Delight', role: 'Aquaculture ile Farmer’s Delight köprüsü' },
    { slug: 'large-meals', name: 'Large Meals', role: 'Kalabalığa yetecek tencere yemekleri' },
    { slug: 'incubation', name: 'Incubation', role: 'Yumurtadan yavru çıkarma' },

    // Dövüş ve ilerleme
    { slug: 'better-combat', name: 'Better Combat', role: 'Dövüşü kombolu ve animasyonlu hâle getirir' },
    { slug: 'apotheosis', name: 'Apotheosis', role: 'Büyüleme, mücevher ve zorluk katmanı' },
    { slug: 'apothic-attributes', name: 'Apothic Attributes', role: 'Yeni karakter özellikleri' },
    { slug: 'age-of-weapons-reforged', name: 'Age of Weapons', role: 'Tarihî silah çeşitleri' },
    { slug: 'darkquesting', name: 'DarkQuesting', role: 'Görev sistemi' },
    { slug: 'luminous-beasts', name: 'LUMINOUS: BEASTS', role: 'Karanlıkta parlayan yeni yaratıklar' },
    { slug: 'yungs-better-dungeons', name: 'YUNG’s Better Dungeons', role: 'Zindanları elden geçirir' },
    { slug: 'yungs-better-jungle-temples', name: 'YUNG’s Better Jungle Temples', role: 'Orman tapınaklarını elden geçirir' },

    // Yapı, mobilya ve dekorasyon
    { slug: 'amendments', name: 'Amendments', role: 'Vanilya bloklarına küçük hayat kalitesi eklemeleri' },
    { slug: 'supplementaries', name: 'Supplementaries', role: 'Yüzlerce dekorasyon bloğu' },
    { slug: 'rustic-engineer', name: 'Rustic Engineer', role: 'Köy dokusunda yapı parçaları' },

    // Harita ve yön bulma
    { slug: 'xaeros-world-map', name: 'Xaero’s World Map', role: 'Tam ekran dünya haritası' },
    { slug: 'xaeros-minimap', name: 'Xaero’s Minimap', role: 'Köşede mini harita' },

    // Envanter, arayüz ve konfor
    { slug: 'travelersbackpack', name: 'Traveler’s Backpack', role: 'Giyilebilir, büyük sırt çantası' },
    { slug: 'jei', name: 'Just Enough Items', role: 'Tarif ve eşya rehberi', essential: true },
    { slug: 'inventory-profiles-next', name: 'Inventory Profiles Next', role: 'Envanteri tek tuşla düzenler' },
    { slug: 'inventory-hud+-by-soulspeed', name: 'Inventory HUD+', role: 'Envanteri ekranda gösterir' },
    { slug: 'mouse-tweaks', name: 'Mouse Tweaks', role: 'Envanterde fare ile hızlı taşıma' },
    { slug: 'jade', name: 'Jade', role: 'Baktığınız blok ve yaratık hakkında bilgi' },
    { slug: 'jade-addons-forge', name: 'Jade Addons', role: 'Jade’e mod desteği ekler' },
    { slug: 'appleskin', name: 'AppleSkin', role: 'Açlık ve doygunluk bilgisi' },
    { slug: 'configured', name: 'Configured', role: 'Mod ayarlarını oyun içinden düzenler' },
    { slug: 'polymorph', name: 'Polymorph', role: 'Çakışan tariflerde seçim sunar' },
    { slug: 'gravestone-mod', name: 'Gravestone Mod', role: 'Ölünce eşyalarınız mezar taşında kalır' },
    { slug: 'gravestone-x-curios-api-compat', name: 'Gravestone x Curios', role: 'Curios eşyalarını da mezara koyar' },
    { slug: 'patchouli', name: 'Patchouli', role: 'Mod kitapçıklarını okunur kılar' },
    { slug: 'tree-harvester', name: 'Tree Harvester', role: 'Ağacı tek vuruşta devirir' },

    // Görsellik ve animasyon
    { slug: 'oculus', name: 'Oculus', role: 'Forge’da shader desteği' },
    { slug: 'playeranimator', name: 'playerAnimator', role: 'Modların oyuncu animasyonlarını çalıştırır' },
    { slug: 'not-enough-animations', name: 'Not Enough Animations', role: 'Vanilya hareketlerine animasyon' },
    { slug: '3dskinlayers', name: '3D Skin Layers', role: 'Skin’in üst katmanını üç boyutlu gösterir' },
    { slug: 'pretty-rain', name: 'Pretty Rain', role: 'Yağmuru daha güzel çizer' },
    { slug: 'vminus', name: 'VMinus', role: 'Vanilyayı sadeleştiren görsel dokunuşlar' },

    // Performans
    //
    // Yüzden fazla mod yükleyen bir paket, hiçbiri olmadan kurulduğunda ağır
    // olur — ve öyle kuruluyordu: listede yalnızca üç tanesi vardı. Forge'un
    // Sodium ve Lithium karşılıkları (Embeddium, Canary) ayrı projeler olduğu
    // için adları da başka; Fabric listesinden kopyalanan bir ad burada hiçbir
    // şeye çözümlenmez.
    { slug: 'embeddium', name: 'Embeddium', role: 'Render motorunu baştan yazar — en büyük FPS kazancı' },
    { slug: 'canary', name: 'Canary', role: 'Oyun mantığını hızlandırır, davranışı değiştirmeden' },
    { slug: 'modernfix', name: 'ModernFix', role: 'Açılışı kısaltır, bellek sızıntılarını kapatır' },
    { slug: 'ferrite-core', name: 'FerriteCore', role: 'Bellek kullanımını düşürür' },
    { slug: 'memoryleakfix', name: 'Memory Leak Fix', role: 'Bilinen bellek sızıntılarını kapatır' },
    { slug: 'saturn', name: 'Saturn', role: 'Bellek ayırmayı azaltır' },
    { slug: 'entityculling', name: 'Entity Culling', role: 'Görünmeyen varlıkları hiç çizmez' },
    // More Culling ve Embeddium++ burada dururdu; ikisi de kaldırıldı.
    // More Culling'in 1.20.1'de Forge yapısı yok, "embeddiumplus" diye bir proje
    // hiç yok ve ona en yakın "embeddium-plus" bir mod değil, bir mod paketi —
    // kurulsaydı profile bütün bir paket açardı.
    { slug: 'clumps', name: 'Clumps', role: 'Tecrübe küreciklerini birleştirir — kalabalık savaşlarda büyük fark' },
    { slug: 'ai-improvements', name: 'AI Improvements', role: 'Yaratık yapay zekâsının yükünü azaltır' },
    { slug: 'libipn', name: 'libIPN', role: 'Arayüz modlarının ortak kütüphanesi' },

    // Kütüphaneler
    { slug: 'blueprint', name: 'Blueprint', role: 'Kütüphane' },
    { slug: 'placebo', name: 'Placebo', role: 'Kütüphane' },
    { slug: 'coroutil', name: 'CoroUtil', role: 'Kütüphane' },
    { slug: 'glitchcore', name: 'GlitchCore', role: 'Kütüphane' },
    { slug: 'cristel-lib', name: 'Cristel Lib', role: 'Kütüphane' },
    { slug: 'collective', name: 'Collective', role: 'Kütüphane' },
    { slug: 'architectury-api', name: 'Architectury API', role: 'Kütüphane' },
    { slug: 'moonlight', name: 'Moonlight Lib', role: 'Kütüphane' },
    { slug: 'caelus', name: 'Caelus API', role: 'Kütüphane' },
    { slug: 'kotlin-for-forge', name: 'Kotlin for Forge', role: 'Kotlin ile yazılmış modların çalışma ortamı' },
    { slug: 'cloth-config', name: 'Cloth Config API', role: 'Ayar ekranı kütüphanesi' },
    { slug: 'citadel', name: 'Citadel', role: 'Kütüphane' },
    { slug: 'curios', name: 'Curios API', role: 'Aksesuar yuvaları kütüphanesi' },
    { slug: 'yungs-api', name: 'YUNG’s API', role: 'Kütüphane' },
    { slug: 'baguettelib', name: 'BaguetteLib', role: 'Kütüphane' },

    // Doku paketleri
    { slug: 'better-dogs-x-doggy-talents-next!', name: 'Better Dogs X Doggy Talents Next', role: 'Köpek dokularını yeniler' },
    { slug: 'realistic-mobs-new', name: 'Realistic Mobs', role: 'Yaratıklara gerçekçi dokular' },
    { slug: 'better-farm-animals', name: 'Better Farm Animals', role: 'Çiftlik hayvanlarına yeni dokular' },
    { slug: 'better-dogs', name: 'Better Dogs', role: 'Köpek dokularını yeniler' }
  ]
}

export const PACKS: CuratedPack[] = [MODERN, SWEETIE]

export function packById(id: string): CuratedPack | undefined {
  return PACKS.find((pack) => pack.id === id)
}

