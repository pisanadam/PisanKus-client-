import fsp from 'node:fs/promises'
import path from 'node:path'
import type { LoaderId } from '../../../shared/types'
import { downloadFile, fetchJson } from '../downloader'
import type { VersionJson } from '../versions'
import { extractZip } from '../../archive'

/** Meta endpoints for the loaders sharing Fabric's API shape. */
const FABRIC_LIKE: Partial<Record<LoaderId, string>> = {
  fabric: 'https://meta.fabricmc.net/v2',
  quilt: 'https://meta.quiltmc.org/v3'
}

const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'
const FORGE_META = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'

export interface LoaderVersion {
  version: string
  stable: boolean
}

async function fabricLikeVersions(meta: string, gameVersion: string): Promise<LoaderVersion[]> {
  const entries = await fetchJson<{ loader: { version: string; stable: boolean } }[]>(
    `${meta}/versions/loader/${encodeURIComponent(gameVersion)}`
  )
  return entries.map((entry) => ({ version: entry.loader.version, stable: entry.loader.stable }))
}

async function neoForgeVersions(gameVersion: string): Promise<LoaderVersion[]> {
  const meta = await fetchJson<{ versions: string[] }>(
    'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'
  )
  // NeoForge versions are `<minor>.<patch>.<build>` derived from `1.<minor>.<patch>`.
  const [, minor, patch = '0'] = gameVersion.split('.')
  const prefix = `${minor}.${patch === '0' ? '0' : patch}.`
  return meta.versions
    .filter((version) => version.startsWith(prefix))
    .reverse()
    .map((version) => ({ version, stable: !version.includes('beta') }))
}

async function forgeVersions(gameVersion: string): Promise<LoaderVersion[]> {
  const promos = await fetchJson<{ promos: Record<string, string> }>(FORGE_META)
  const versions: LoaderVersion[] = []
  const recommended = promos.promos[`${gameVersion}-recommended`]
  const latest = promos.promos[`${gameVersion}-latest`]
  if (recommended) versions.push({ version: `${gameVersion}-${recommended}`, stable: true })
  if (latest && latest !== recommended) versions.push({ version: `${gameVersion}-${latest}`, stable: false })
  return versions
}

export async function listLoaderVersions(loader: LoaderId, gameVersion: string): Promise<LoaderVersion[]> {
  switch (loader) {
    case 'vanilla':
      return []
    case 'fabric':
    case 'quilt':
      return fabricLikeVersions(FABRIC_LIKE[loader]!, gameVersion)
    case 'neoforge':
      return neoForgeVersions(gameVersion)
    case 'forge':
      return forgeVersions(gameVersion)
  }
}

/** The version id a profile launches, e.g. `fabric-loader-0.16.9-1.21.4`. */
export function loaderVersionId(loader: LoaderId, gameVersion: string, loaderVersion: string): string {
  switch (loader) {
    case 'vanilla':
      return gameVersion
    case 'fabric':
      return `fabric-loader-${loaderVersion}-${gameVersion}`
    case 'quilt':
      return `quilt-loader-${loaderVersion}-${gameVersion}`
    case 'neoforge':
      return `neoforge-${loaderVersion}`
    case 'forge':
      return `${loaderVersion}-forge`
  }
}

/**
 * Writes the loader's version json into `versions/`, so the normal resolve →
 * download → launch path can treat it like any other version.
 *
 * Returns the version id to launch.
 */
export async function installLoader(
  dataDir: string,
  loader: LoaderId,
  gameVersion: string,
  loaderVersion: string | undefined,
  onProgress?: (detail: string) => void
): Promise<string> {
  if (loader === 'vanilla') return gameVersion

  let resolved = loaderVersion
  if (!resolved) {
    const available = await listLoaderVersions(loader, gameVersion)
    resolved = (available.find((entry) => entry.stable) ?? available[0])?.version
    if (!resolved) throw new Error(`${loader} için ${gameVersion} sürümünde yükleyici bulunamadı.`)
  }

  const versionId = loaderVersionId(loader, gameVersion, resolved)
  const file = path.join(dataDir, 'versions', versionId, `${versionId}.json`)
  try {
    await fsp.access(file)
    return versionId
  } catch {
    // Not installed yet.
  }

  onProgress?.(`${loader} ${resolved} kuruluyor…`)

  let json: VersionJson
  if (loader === 'fabric' || loader === 'quilt') {
    json = await fetchJson<VersionJson>(
      `${FABRIC_LIKE[loader]}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(resolved)}/profile/json`
    )
  } else if (loader === 'neoforge') {
    json = await installFromInstaller(
      dataDir,
      `${NEOFORGE_MAVEN}/${resolved}/neoforge-${resolved}-installer.jar`,
      versionId
    )
  } else {
    json = await installFromInstaller(
      dataDir,
      `https://maven.minecraftforge.net/net/minecraftforge/forge/${resolved}/forge-${resolved}-installer.jar`,
      versionId
    )
  }

  json.id = versionId
  json.inheritsFrom ??= gameVersion
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, JSON.stringify(json, null, 2))
  return versionId
}

/**
 * Forge and NeoForge ship their version json inside the installer jar. Only the
 * `version.json` entry is needed — the client jar is patched at runtime by their
 * bootstrap library, which the version json already lists as a dependency.
 */
async function installFromInstaller(dataDir: string, url: string, versionId: string): Promise<VersionJson> {
  const installerJar = path.join(dataDir, 'installers', `${versionId}-installer.jar`)
  await downloadFile({ url, destination: installerJar })

  const unpacked = path.join(dataDir, 'installers', versionId)
  await fsp.rm(unpacked, { recursive: true, force: true })
  await extractZip(installerJar, { dir: unpacked })

  const versionJsonPath = path.join(unpacked, 'version.json')
  try {
    const json = JSON.parse(await fsp.readFile(versionJsonPath, 'utf8')) as VersionJson

    // The installer also carries the loader's own maven artifacts; copy them into
    // the shared libraries tree so the downloader does not have to fetch them.
    const bundled = path.join(unpacked, 'maven')
    await fsp.cp(bundled, path.join(dataDir, 'libraries'), { recursive: true, force: false }).catch(() => {
      // Some installers ship no bundled maven tree — the downloader will fetch them.
    })
    return json
  } catch (error) {
    throw new Error(
      `Yükleyici paketi okunamadı (${versionId}). Bu sürüm için kurulum desteklenmiyor olabilir. ` +
        `Ayrıntı: ${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    await fsp.rm(installerJar, { force: true })
  }
}
