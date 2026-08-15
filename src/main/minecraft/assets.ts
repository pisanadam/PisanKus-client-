import fsp from 'node:fs/promises'
import path from 'node:path'
import type { DownloadItem } from './downloader'
import { fetchJson } from './downloader'
import type { VersionJson } from './versions'

const RESOURCES = 'https://resources.download.minecraft.net'

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
  /** Pre-1.6 versions copy assets into the game directory instead of using the object store. */
  virtual?: boolean
  map_to_resources?: boolean
}

export interface ResolvedAssets {
  indexId: string
  downloads: DownloadItem[]
  index: AssetIndex
}

export async function resolveAssets(
  version: VersionJson,
  dataDir: string,
  offline = false
): Promise<ResolvedAssets> {
  const assetsDir = path.join(dataDir, 'assets')
  const indexId = version.assetIndex?.id ?? version.assets ?? 'legacy'
  const downloads: DownloadItem[] = []

  if (!version.assetIndex) {
    return { indexId, downloads, index: { objects: {} } }
  }

  const indexFile = path.join(assetsDir, 'indexes', `${indexId}.json`)
  let index: AssetIndex
  try {
    index = JSON.parse(await fsp.readFile(indexFile, 'utf8')) as AssetIndex
  } catch {
    if (offline) {
      throw new Error(
        `Varlık listesi ${indexId} bu bilgisayarda hazır değil. ` +
          'İnternete bağlanıp “Dosyaları önceden indir” işlemini çalıştırın.'
      )
    }
    index = await fetchJson<AssetIndex>(version.assetIndex.url)
    await fsp.mkdir(path.dirname(indexFile), { recursive: true })
    await fsp.writeFile(indexFile, JSON.stringify(index))
  }

  for (const object of Object.values(index.objects)) {
    const prefix = object.hash.slice(0, 2)
    downloads.push({
      url: `${RESOURCES}/${prefix}/${object.hash}`,
      destination: path.join(assetsDir, 'objects', prefix, object.hash),
      sha1: object.hash,
      size: object.size
    })
  }

  return { indexId, downloads, index }
}

/**
 * Older versions expect real files rather than the hashed object store, so the
 * objects are copied into `assets/virtual/<index>` (or the profile's `resources`).
 */
export async function materialiseVirtualAssets(
  assets: ResolvedAssets,
  dataDir: string,
  gameDir: string
): Promise<void> {
  if (!assets.index.virtual && !assets.index.map_to_resources) return

  const target = assets.index.map_to_resources
    ? path.join(gameDir, 'resources')
    : path.join(dataDir, 'assets', 'virtual', assets.indexId)

  for (const [name, object] of Object.entries(assets.index.objects)) {
    const source = path.join(dataDir, 'assets', 'objects', object.hash.slice(0, 2), object.hash)
    const destination = path.join(target, name)
    try {
      const existing = await fsp.stat(destination)
      if (existing.size === object.size) continue
    } catch {
      // Missing — copy it below.
    }
    await fsp.mkdir(path.dirname(destination), { recursive: true })
    await fsp.copyFile(source, destination)
  }
}

/** The `--assetsDir` value the game should receive for this version. */
export function assetsRoot(assets: ResolvedAssets, dataDir: string): string {
  if (assets.index.virtual) return path.join(dataDir, 'assets', 'virtual', assets.indexId)
  return path.join(dataDir, 'assets')
}
