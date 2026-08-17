import fsp from 'node:fs/promises'
import path from 'node:path'
import type { VersionSummary } from '../../shared/types'
import { fetchJson } from './downloader'

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

export interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; version?: string; arch?: string }
  features?: Record<string, boolean>
}

export interface Artifact {
  path?: string
  sha1: string
  size: number
  url: string
}

export interface Library {
  name: string
  downloads?: { artifact?: Artifact; classifiers?: Record<string, Artifact> }
  url?: string
  /**
   * Marks a jar the launcher produced on this machine rather than fetched.
   *
   * OptiFine's library is patched out of the vanilla client jar at install time
   * and exists on no maven repository, so it has to stay on the classpath while
   * never being queued for download.
   */
  local?: boolean
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
  rules?: Rule[]
}

export interface VersionJson {
  id: string
  inheritsFrom?: string
  type: string
  mainClass: string
  minecraftArguments?: string
  arguments?: { game?: (string | { rules: Rule[]; value: string | string[] })[]; jvm?: (string | { rules: Rule[]; value: string | string[] })[] }
  assetIndex?: { id: string; sha1: string; size: number; totalSize: number; url: string }
  assets?: string
  downloads?: Record<string, Artifact>
  libraries: Library[]
  javaVersion?: { component: string; majorVersion: number }
  logging?: { client?: { argument: string; file: { id: string; sha1: string; size: number; url: string }; type: string } }
}

interface ManifestEntry {
  id: string
  type: VersionSummary['type']
  url: string
  time: string
  releaseTime: string
  sha1: string
}

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: ManifestEntry[]
}

let manifestCache: { fetchedAt: number; data: Manifest } | null = null

async function getManifest(): Promise<Manifest> {
  if (manifestCache && Date.now() - manifestCache.fetchedAt < 10 * 60_000) return manifestCache.data
  const data = await fetchJson<Manifest>(MANIFEST_URL)
  manifestCache = { fetchedAt: Date.now(), data }
  return data
}

export async function listVersions(): Promise<VersionSummary[]> {
  const manifest = await getManifest()
  return manifest.versions.map((entry) => ({
    id: entry.id,
    type: entry.type,
    releaseTime: entry.releaseTime
  }))
}

export async function latestRelease(): Promise<string> {
  return (await getManifest()).latest.release
}

/** Reads a version json from disk, downloading it from Mojang on first use. */
export async function loadVersionJson(
  dataDir: string,
  versionId: string,
  offline = false
): Promise<VersionJson> {
  const file = path.join(dataDir, 'versions', versionId, `${versionId}.json`)
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8')) as VersionJson
  } catch {
    // Not cached yet — fall through to the manifest lookup below.
  }

  if (offline) {
    throw new Error(
      `Minecraft ${versionId} sürüm bilgisi bu bilgisayarda hazır değil. ` +
        'İnternete bağlanıp “Dosyaları önceden indir” işlemini çalıştırın.'
    )
  }

  const manifest = await getManifest()
  const entry = manifest.versions.find((candidate) => candidate.id === versionId)
  if (!entry) throw new Error(`Minecraft sürümü bulunamadı: ${versionId}`)

  const json = await fetchJson<VersionJson>(entry.url)
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, JSON.stringify(json, null, 2))
  return json
}

/**
 * Flattens a version and every parent it inherits from (mod loaders publish
 * partial version files that build on the vanilla one).
 */
export async function resolveVersion(
  dataDir: string,
  versionId: string,
  offline = false
): Promise<VersionJson> {
  const chain: VersionJson[] = []
  const seen = new Set<string>()
  let current: string | undefined = versionId

  while (current && !seen.has(current)) {
    seen.add(current)
    const json: VersionJson = await loadVersionJson(dataDir, current, offline)
    chain.push(json)
    current = json.inheritsFrom
  }

  // Walk parents first so children override them. Libraries are the exception:
  // the loader's entries go in front, because resolution keeps the first match
  // for a coordinate and a loader that replaces a vanilla library must win.
  return chain.reverse().reduce((merged, json) => ({
    ...merged,
    ...json,
    libraries: [...(json.libraries ?? []), ...(merged.libraries ?? [])],
    arguments: {
      game: [...(merged.arguments?.game ?? []), ...(json.arguments?.game ?? [])],
      jvm: [...(merged.arguments?.jvm ?? []), ...(json.arguments?.jvm ?? [])]
    },
    // A child that omits these must keep the parent's values.
    assetIndex: json.assetIndex ?? merged.assetIndex,
    assets: json.assets ?? merged.assets,
    downloads: json.downloads ?? merged.downloads,
    javaVersion: json.javaVersion ?? merged.javaVersion,
    minecraftArguments: json.minecraftArguments ?? merged.minecraftArguments
  })) as VersionJson
}

/** Compares two Minecraft versions well enough to sort a version list. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] => value.split(/[.\-+_]/).map((part) => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (right[i] ?? 0) - (left[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
