/**
 * "Oppie Optimized" — the launcher's own performance pack.
 *
 * Not a Modrinth project and not a .mrpack. It is a list this launcher curates,
 * resolved against Modrinth at install time, so a pack built today still works
 * on a Minecraft version that did not exist when it was written.
 *
 * That resolution is the whole point. Performance mods do not move in step:
 * some follow Minecraft within days, others sit on an old version for a year.
 * A frozen list would install a broken profile the day one of them fell behind,
 * so the installer takes whichever entries have a build for the chosen version
 * and reports the rest instead of failing.
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

export const PACK_ID = 'oppie-optimized'
export const PACK_NAME = 'Oppie Optimized'
export const PACK_SUMMARY =
  'Opbay ekibinin derlediği Fabric performans paketi. Kurunca profil, modlar, oyun ayarları ve JVM ' +
  'argümanları tek seferde hazır gelir.'

/**
 * Ordered by how much each one matters, because that is also the order they are
 * installed in and therefore the order the player watches them appear.
 */
export const PACK_MODS: PackMod[] = [
  { slug: 'fabric-api', name: 'Fabric API', role: 'Diğer modların dayandığı temel', essential: true },
  { slug: 'sodium', name: 'Sodium', role: 'Render motorunu baştan yazar — en büyük FPS kazancı', essential: true },
  { slug: 'lithium', name: 'Lithium', role: 'Oyun mantığını hızlandırır, davranışı değiştirmeden' },
  { slug: 'ferrite-core', name: 'FerriteCore', role: 'Bellek kullanımını ciddi ölçüde düşürür' },
  { slug: 'immediatelyfast', name: 'ImmediatelyFast', role: 'Arayüz ve HUD çizimini toplu hale getirir' },
  { slug: 'entityculling', name: 'Entity Culling', role: 'Görünmeyen varlıkları hiç çizmez' },
  { slug: 'moreculling', name: 'More Culling', role: 'Görünmeyen blok yüzeylerini eler' },
  { slug: 'sodium-extra', name: 'Sodium Extra', role: 'Sodium’a ek görsel/performans ayarları' },
  { slug: 'krypton', name: 'Krypton', role: 'Ağ katmanını hafifletir — sunucularda gecikme' },
  { slug: 'c2me-fabric', name: 'C2ME', role: 'Chunk yüklemeyi çok çekirdeğe yayar' },
  { slug: 'scalablelux', name: 'ScalableLux', role: 'Işık hesabını ayrı çekirdeklere taşır' },
  { slug: 'threadtweak', name: 'ThreadTweak', role: 'İş parçacığı önceliklerini düzenler' },
  { slug: 'dynamic-fps', name: 'Dynamic FPS', role: 'Pencere arkadayken güç harcamaz' },
  { slug: 'fastquit', name: 'FastQuit', role: 'Dünyadan çıkışı bekletmez' },
  { slug: 'modernfix', name: 'ModernFix', role: 'Açılışı kısaltır, bellek sızıntılarını kapatır' },
  { slug: 'noisium', name: 'Noisium', role: 'Dünya üretimini hızlandırır' }
]

/**
 * options.txt keys the pack sets. Deliberately short: these are the settings
 * that cost real frames and that players rarely find. Everything else is left
 * at whatever the launcher's own template says, so the pack does not quietly
 * undo choices made in Ayarlar.
 */
export const PACK_OPTIONS: Record<string, string> = {
  // Sodium renders far chunks cheaply, so this is a comfortable default rather
  // than the minimum — dropping it further is the first thing to try on weak
  // hardware, and the in-game menu is right there.
  renderDistance: '12',
  simulationDistance: '8',
  // Uncapped frames on a machine that cannot hold them only produces stutter;
  // the player raises this once they know what their hardware does.
  maxFps: '144',
  enableVsync: 'false',
  graphicsMode: '0',
  ao: 'true',
  entityShadows: 'false',
  particles: '1',
  // Clouds are pure fill rate for no gameplay value.
  renderClouds: '"false"',
  biomeBlendRadius: '2',
  mipmapLevels: '4',
  bobView: 'false',
  screenEffectScale: '0.5'
}

/**
 * JVM flags tuned for the game rather than for a server.
 *
 * G1 with a large young generation and a short pause target is what the
 * long-standing Minecraft flag sets converge on: the game allocates heavily and
 * briefly, so collecting young objects often and quickly beats collecting
 * rarely and slowly. `AlwaysPreTouch` pays the page-fault cost at startup
 * instead of during play, which is where stutter is actually noticed.
 */
export const PACK_JVM_ARGS =
  '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 ' +
  '-XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 ' +
  '-XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 ' +
  '-XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem ' +
  '-XX:MaxTenuringThreshold=1 -XX:MaxGCPauseMillis=37 -XX:+AlwaysPreTouch -XX:+ParallelRefProcEnabled'

/**
 * More heap is not better: the garbage collector has to walk it, and Minecraft
 * on a normal world does not need much. These are the sizes the flag sets above
 * were measured against.
 */
export function packMemoryMb(totalSystemMb: number): number {
  if (totalSystemMb >= 16_000) return 6144
  if (totalSystemMb >= 8_000) return 4096
  return 2048
}
