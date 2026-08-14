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
  /**
   * Fetch this one from a maven repository instead of Modrinth.
   *
   * Needed where a project's Modrinth release is a single jar covering every
   * Minecraft version it ever supported. Legacy Fabric API is exactly that: its
   * Modrinth file bundles the modules for 1.3.2 through 1.12.2 in one 2 MB jar,
   * and Fabric refuses to start because most of those modules declare a
   * Minecraft version that is not the one running. The project's own maven
   * publishes a per-version artifact — 5 KB instead of 2 MB — which is what
   * actually belongs in a profile.
   */
  maven?: { base: string; group: string; artifact: string }
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
   * Old-version mods are inconsistent about which facet they publish under —
   * the same 1.8.9 mod may be tagged `legacy-fabric`, `fabric`, or both. Trying
   * them in turn is what makes the list resolve completely instead of dropping
   * half of it over a tagging detail.
   */
  modrinthLoaders: string[]
  /** Versions worth defaulting to, newest first. Others stay selectable. */
  recommended: { version: string; why: string }[]
  mods: PackMod[]
  /** Extra sentence shown in the dialog, when the pack needs explaining. */
  note?: string
}

const MODERN: CuratedPack = {
  id: 'oppie-optimized',
  name: 'Oppie Optimized',
  summary:
    'Opbay ekibinin derlediği Fabric paketi: performans modları ve günlük oyunu rahatlatan eklentiler. ' +
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
 * There is no 1.8.9 pack, and it is not an oversight.
 *
 * Legacy Fabric carries the loader back to 1.8.9 and the launcher supports it —
 * a 1.8.9 Legacy Fabric profile can be made by hand and filled from Keşfet. But
 * a *curated* 1.8.9 pack could not be made to start. Legacy Fabric API is
 * distributed two ways and neither one works unattended: the Modrinth file is a
 * single jar carrying modules for 1.3.2 through 1.12.2, which Fabric rejects
 * because most of them declare the wrong Minecraft version, while the maven
 * artifact for 1.8.9 turned out to be an empty 5 KB marker with no modules at
 * all, so mods that need them refuse to load.
 *
 * Shipping a third guess was not worth the player's time. A 1.8.9 pack belongs
 * here only once someone has watched it reach the main menu.
 */

export const PACKS: CuratedPack[] = [MODERN]

export function packById(id: string): CuratedPack | undefined {
  return PACKS.find((pack) => pack.id === id)
}
