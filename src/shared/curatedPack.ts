/**
 * "Oppie Optimized" — the launcher's own Fabric pack.
 *
 * Not a Modrinth project and not a .mrpack. It is a list this launcher curates,
 * resolved against Modrinth at install time, so a pack written today still
 * works on a Minecraft version that did not exist when it was written.
 *
 * That resolution is the whole point. Mods do not move in step: some follow
 * Minecraft within days, others sit on an old version for a year. A frozen list
 * would install a broken profile the day one of them fell behind, so the
 * installer takes whichever entries have a build for the chosen version and
 * reports the rest instead of failing.
 *
 * The pack installs mods and nothing else. It does not write options.txt and
 * does not touch the profile's memory or JVM flags — those stay wherever the
 * player put them.
 */

/**
 * The three versions the pack is meant for, newest first.
 *
 * Every other version Modrinth offers still works — these are the ones worth
 * defaulting to: the current release, the last release of the previous line,
 * and the version most servers and mods still sit on.
 */
export const RECOMMENDED_VERSIONS: { version: string; why: string }[] = [
  { version: '26.2', why: 'Güncel sürüm' },
  { version: '1.21.11', why: '1.21 serisinin sonu' },
  { version: '1.21.1', why: 'Sunucuların ve modların çoğu burada' }
]

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

export const PACK_ID = 'oppie-optimized'
export const PACK_NAME = 'Oppie Optimized'
export const PACK_SUMMARY =
  'Opbay ekibinin derlediği Fabric paketi: performans modları ve günlük oyunu rahatlatan eklentiler. ' +
  'Tek seferde kurulur, oyun ayarlarınıza dokunmaz.'

/**
 * Ordered by what depends on what, then by how much each one matters — which is
 * also the order they install in, and therefore the order the player watches
 * them appear.
 *
 * Libraries come first on purpose. Every one of them is a required dependency
 * of something further down, and installing them up front means the dependency
 * resolver finds them already present instead of fetching them a second time.
 */
export const PACK_MODS: PackMod[] = [
  // --- foundation ---------------------------------------------------------
  { slug: 'fabric-api', name: 'Fabric API', role: 'Diğer modların dayandığı temel', essential: true },
  { slug: 'fabric-language-kotlin', name: 'Fabric Language Kotlin', role: 'Kotlin ile yazılmış modların çalışma ortamı' },
  { slug: 'cloth-config', name: 'Cloth Config', role: 'Ayar ekranı kütüphanesi' },
  { slug: 'yacl', name: 'YetAnotherConfigLib', role: 'Ayar ekranı kütüphanesi' },
  { slug: 'placeholder-api', name: 'Placeholder API', role: 'Metin yer tutucu kütüphanesi' },

  // --- performance --------------------------------------------------------
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

  // --- everyday quality of life -------------------------------------------
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
