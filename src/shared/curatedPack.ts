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
  /**
   * The oldest Minecraft version the pack is offered for.
   *
   * Without it a pack is offered for every version its essential mods still
   * publish for, which for Sodium and Fabric API reaches years back. A pack
   * built around what current servers run has no business being installed on
   * 1.20, so it says where it starts and the dialog lists nothing older.
   */
  since?: string
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
    { version: '26.3', why: 'Güncel sürüm' },
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
 * Sweetie Pack was here and was withdrawn.
 *
 * Ninety-odd mods held together by libraries, and the launcher could not keep
 * it standing: an addon whose base mod is not on Modrinth at all, four texture
 * packs that had to be told apart from mods, entries with no build for the one
 * Minecraft version the pack targets. Each was fixed, and the next launch found
 * the next one. A curated pack is a promise that it works; this one could not
 * be made to keep it from a list of Modrinth slugs, so it is gone rather than
 * shipped half-working.
 *
 * The fixes it forced are worth keeping and stay in place — the Forge installer
 * chain, the client jar kept off a patched loader's classpath, entries
 * installed as whatever Modrinth says they are, and the mod jar checks. Those
 * were launcher bugs that this pack merely happened to expose; every Forge
 * profile was hitting them.
 */

/**
 * The PvP pack, built for pisanpvp and the servers like it.
 *
 * Two deliberate decisions sit behind the list.
 *
 * Nothing here removes a vanilla delay or acts for the player. Modrinth is full
 * of PvP mods that shorten the hit cooldown, place crystals with no delay or
 * swap a totem in automatically, and one of the better-known ones advertises
 * "anti-ban delays" outright. They would be the difference between winning and
 * losing, which is exactly why the servers this pack is named after ban them —
 * a launcher that installs them hands the player a ban, not an advantage. What
 * is left is the honest half: frames, latency and legibility.
 *
 * The texture side is deliberately a choice rather than a result. Resource packs
 * all paint the same textures, so enabling the lot of them would leave whichever
 * one happened to sort last on top. They are installed and left switched off,
 * and the player picks one in game — which is also why the kit packs for crystal
 * and mace can sit side by side here without fighting each other.
 */
const PVP: CuratedPack = {
  id: 'pisanpvp-optimized',
  name: 'PisanPvP Optimizet',
  summary:
    'pisanpvp ve diğer PvP sunucuları için Fabric paketi: gecikmeyi ve kare düşmesini azaltan performans ' +
    'modları, bir de crystal ve mace dahil PvP kitlerine hazırlanmış doku paketleri. Doku paketleri kurulur ' +
    'ama açılmaz; hangisini kullanacağınızı oyun içinden siz seçersiniz.',
  icon: '⚔️',
  loader: 'fabric',
  modrinthLoaders: ['fabric'],
  // A PvP pack for versions nobody plays PvP on is a pack for nobody.
  since: '1.21.11',
  recommended: [
    { version: '26.3', why: 'Güncel sürüm' },
    { version: '26.2', why: 'Sunucuların ve modların çoğu burada' },
    { version: '1.21.11', why: '1.21 serisinin sonu' }
  ],
  /**
   * Libraries, then performance, then what the player sees, then the texture
   * packs — which is also the install order, so a dependency is already present
   * by the time something asks for it.
   */
  mods: [
    { slug: 'fabric-api', name: 'Fabric API', role: 'Diğer modların dayandığı temel', essential: true },
    { slug: 'cloth-config', name: 'Cloth Config', role: 'Ayar ekranı kütüphanesi' },
    { slug: 'yacl', name: 'YetAnotherConfigLib', role: 'Ayar ekranı kütüphanesi' },

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
    { slug: 'dynamic-fps', name: 'Dynamic FPS', role: 'Pencere arkadayken güç harcamaz' },
    { slug: 'fastquit', name: 'FastQuit', role: 'Dünyadan çıkışı bekletmez' },

    { slug: 'modmenu', name: 'Mod Menu', role: 'Kurulu modları ve ayarlarını oyun içinden yönetir' },
    { slug: 'reeses-sodium-options', name: 'Reese’s Sodium Options', role: 'Sodium ayar ekranını kullanışlı hale getirir' },
    { slug: 'raised', name: 'Raised', role: 'Arayüzü yukarı alır — can ve sayılar net görünür' },
    { slug: 'appleskin', name: 'AppleSkin', role: 'Açlık ve doygunluk bilgisini gösterir' },
    { slug: 'durability-tooltip', name: 'Durability Tooltip', role: 'Eşyanın kalan dayanıklılığını gösterir' },
    { slug: 'totemcounter', name: 'TotemCounter', role: 'Patlayan totemleri sayar' },
    { slug: 'pvphitsound', name: 'PvP Hit Sound', role: 'Tam vuruşta sesli geri bildirim' },
    { slug: 'pvptweak', name: 'PvP Tweaks', role: 'PvP seslerini ve görsellerini ayarlamanızı sağlar' },
    { slug: 'mace-hitboxes', name: 'Mace Hitboxes', role: 'Mace elinizdeyken çarpışma kutularını açar' },
    { slug: 'mouse-tweaks', name: 'Mouse Tweaks', role: 'Envanterde fare ile hızlı taşıma' },
    { slug: 'zoomify', name: 'Zoomify', role: 'Yakınlaştırma tuşu' },
    { slug: '3dskinlayers', name: '3D Skin Layers', role: 'Skin’in üst katmanını üç boyutlu gösterir' },
    { slug: 'no-chat-reports', name: 'No Chat Reports', role: 'Sohbet mesajlarının imzalanmasını kapatır' },

    { slug: 'spunky-pvp-texture-pack', name: 'Spunky PvP', role: 'PvP için hazırlanmış doku paketi' },
    { slug: 'pvp-essentials', name: 'PvP Essentials', role: 'Görüşü kapatan efektleri kısan doku paketi' },
    { slug: 'pvp-utils', name: 'PvP Utils', role: 'Vanilla görünümü koruyan PvP düzenlemeleri' },
    { slug: 'pvp-crosshair', name: 'PvP Crosshair', role: 'PvP için nişangâh' },
    { slug: 'short-pvp-swords', name: 'PvP Swords', role: 'Kısa kılıç dokusu — ekranı kapatmaz' },
    { slug: 'crystal-pvp-perfect-pack', name: 'Crystal PvP Perfect Pack', role: 'Crystal PvP için doku paketi' },
    { slug: 'mace-fusion', name: 'Mace Fusion', role: 'Mace için üç boyutlu doku' },
    { slug: 'low-mace', name: 'Low Mace', role: 'Mace’i aşağı çeken doku — ekranı kapatmaz' }
  ],
  note:
    'Doku paketleri profilin resourcepacks klasörüne kurulur, kendiliğinden açılmaz: oyun içinde ' +
    'Seçenekler → Kaynak Paketleri’nden birini seçin. Paketteki modlar vuruş gecikmesini kaldıran ya da ' +
    'yerinize oynayan modlar değil; o tür modlar PvP sunucularının çoğunda yasaklıdır.'
}

export const PACKS: CuratedPack[] = [MODERN, PVP]

export function packById(id: string): CuratedPack | undefined {
  return PACKS.find((pack) => pack.id === id)
}

