import type { ContentKind, LoaderId, ProjectVersion, SearchQuery, SearchResult } from '../../shared/types'

const API = 'https://api.curseforge.com/v1'
const MINECRAFT_GAME_ID = 432

/** CurseForge class ids for the Minecraft game. */
const CLASS_ID: Record<ContentKind, number> = {
  mod: 6,
  resourcepack: 12,
  shader: 6552,
  world: 17,
  datapack: 6945,
  modpack: 4471
}

const KIND_BY_CLASS_ID: Record<number, ContentKind> = Object.fromEntries(
  Object.entries(CLASS_ID).map(([kind, id]) => [id, kind as ContentKind])
) as Record<number, ContentKind>

/** CurseForge `modLoaderType` enum. */
const LOADER_TYPE: Record<LoaderId, number | undefined> = {
  vanilla: undefined,
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6
}

interface CfMod {
  id: number
  name: string
  slug: string
  summary: string
  classId: number
  downloadCount: number
  logo: { thumbnailUrl: string } | null
  authors: { name: string }[]
  categories: { name: string }[]
  dateModified: string
}

interface CfFile {
  id: number
  displayName: string
  fileName: string
  fileDate: string
  fileLength: number
  releaseType: number
  downloadUrl: string | null
  gameVersions: string[]
  downloadCount: number
  hashes: { value: string; algo: number }[]
  dependencies: { modId: number; relationType: number }[]
}

export class CurseForgeUnavailable extends Error {
  constructor() {
    super(
      'CurseForge için API anahtarı gerekiyor. Ayarlar → İçerik bölümünden anahtarınızı girin ' +
        '(console.curseforge.com üzerinden ücretsiz alınabilir).'
    )
  }
}

async function request<T>(apiKey: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  if (!apiKey) throw new CurseForgeUnavailable()

  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'x-api-key': apiKey,
      'User-Agent': 'OpbayClient/1.0.0',
      ...(init.headers ?? {})
    }
  })

  if (response.status === 403) {
    throw new Error('CurseForge API anahtarı reddedildi. Ayarlar bölümünden anahtarı kontrol edin.')
  }
  if (!response.ok) {
    throw new Error(`CurseForge isteği başarısız (${response.status}).`)
  }
  return (await response.json()) as T
}

export async function search(apiKey: string | undefined, query: SearchQuery): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    gameId: String(MINECRAFT_GAME_ID),
    classId: String(CLASS_ID[query.kind]),
    searchFilter: query.query,
    index: String(query.offset ?? 0),
    pageSize: String(query.limit ?? 30),
    sortOrder: 'desc',
    sortField:
      query.sort === 'updated' ? '3' : query.sort === 'newest' ? '11' : query.sort === 'downloads' ? '6' : '2'
  })
  if (query.gameVersion) params.set('gameVersion', query.gameVersion)

  const loaderType = query.loader ? LOADER_TYPE[query.loader] : undefined
  if (loaderType != null && (query.kind === 'mod' || query.kind === 'modpack')) {
    params.set('modLoaderType', String(loaderType))
  }

  const response = await request<{ data: CfMod[] }>(apiKey, `/mods/search?${params}`)
  return response.data.map((mod) => ({
    source: 'curseforge' as const,
    projectId: String(mod.id),
    slug: mod.slug,
    title: mod.name,
    description: mod.summary,
    author: mod.authors[0]?.name,
    iconUrl: mod.logo?.thumbnailUrl,
    downloads: mod.downloadCount,
    categories: mod.categories.map((category) => category.name),
    kind: KIND_BY_CLASS_ID[mod.classId] ?? query.kind,
    updatedAt: mod.dateModified
  }))
}

function toProjectVersion(file: CfFile): ProjectVersion {
  const channel = file.releaseType === 1 ? 'release' : file.releaseType === 2 ? 'beta' : 'alpha'
  // CurseForge exposes loaders inside gameVersions alongside Minecraft versions.
  const loaders = file.gameVersions
    .filter((entry) => /^(forge|fabric|quilt|neoforge)$/i.test(entry))
    .map((entry) => entry.toLowerCase())

  return {
    id: String(file.id),
    name: file.displayName,
    versionNumber: file.displayName,
    gameVersions: file.gameVersions.filter((entry) => /^\d/.test(entry)),
    loaders,
    channel,
    downloads: file.downloadCount,
    publishedAt: file.fileDate,
    fileName: file.fileName,
    // Some authors disable third-party downloads; the CDN path still resolves.
    fileUrl: file.downloadUrl ?? cdnFallback(file),
    fileSize: file.fileLength,
    sha1: file.hashes.find((hash) => hash.algo === 1)?.value,
    dependencies: file.dependencies
      .filter((dependency) => dependency.relationType === 3 || dependency.relationType === 2)
      .map((dependency) => ({
        projectId: String(dependency.modId),
        required: dependency.relationType === 3
      }))
  }
}

/** Rebuilds the media CDN url CurseForge omits when downloads are API-restricted. */
function cdnFallback(file: CfFile): string {
  const id = String(file.id)
  return `https://mediafilez.forgecdn.net/files/${id.slice(0, 4)}/${Number(id.slice(4))}/${encodeURIComponent(file.fileName)}`
}

export async function listVersions(
  apiKey: string | undefined,
  projectId: string,
  gameVersion?: string,
  loader?: LoaderId
): Promise<ProjectVersion[]> {
  const params = new URLSearchParams({ pageSize: '50' })
  if (gameVersion) params.set('gameVersion', gameVersion)
  const loaderType = loader ? LOADER_TYPE[loader] : undefined
  if (loaderType != null) params.set('modLoaderType', String(loaderType))

  const response = await request<{ data: CfFile[] }>(
    apiKey,
    `/mods/${encodeURIComponent(projectId)}/files?${params}`
  )
  return response.data.map(toProjectVersion)
}

export async function bestVersion(
  apiKey: string | undefined,
  projectId: string,
  gameVersion?: string,
  loader?: LoaderId
): Promise<ProjectVersion | undefined> {
  const versions = await listVersions(apiKey, projectId, gameVersion, loader)
  return versions.find((version) => version.channel === 'release') ?? versions[0]
}

export interface CfProjectDetail {
  id: string
  name: string
  summary: string
  description: string
  iconUrl?: string
  downloads: number
  categories: string[]
  websiteUrl?: string
}

export async function getProject(apiKey: string | undefined, projectId: string): Promise<CfProjectDetail> {
  const [mod, description] = await Promise.all([
    request<{ data: CfMod & { links: { websiteUrl: string | null } } }>(apiKey, `/mods/${projectId}`),
    request<{ data: string }>(apiKey, `/mods/${projectId}/description`)
  ])

  return {
    id: String(mod.data.id),
    name: mod.data.name,
    summary: mod.data.summary,
    description: description.data,
    iconUrl: mod.data.logo?.thumbnailUrl,
    downloads: mod.data.downloadCount,
    categories: mod.data.categories.map((category) => category.name),
    websiteUrl: mod.data.links?.websiteUrl ?? undefined
  }
}
