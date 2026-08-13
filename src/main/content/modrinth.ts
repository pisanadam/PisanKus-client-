import type { ContentKind, ProjectVersion, SearchQuery, SearchResult } from '../../shared/types'
import { fetchJson } from '../minecraft/downloader'

const API = 'https://api.modrinth.com/v2'

/**
 * Modrinth project types, keyed by our own content vocabulary.
 *
 * `world` has no entry because Modrinth hosts no worlds — `project_type:world`
 * matches nothing there. It used to fall back to `mod`, which is why picking
 * "Dünyalar" listed mods. Worlds come from a modpack's overrides or a local
 * import, so the search UI skips Modrinth entirely for them.
 */
const PROJECT_TYPE: Partial<Record<ContentKind, string>> = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  modpack: 'modpack'
}

interface ModrinthHit {
  project_id: string
  slug: string
  title: string
  description: string
  author: string
  icon_url: string | null
  downloads: number
  follows: number
  categories: string[]
  project_type: string
  date_modified: string
}

interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  version_type: string
  downloads: number
  date_published: string
  files: { url: string; filename: string; size: number; primary: boolean; hashes: { sha1?: string } }[]
  dependencies: { project_id: string | null; version_id: string | null; dependency_type: string }[]
}

export interface SearchPage {
  hits: SearchResult[]
  /** Everything the facets match, not just this page — drives "load more". */
  total: number
}

export async function search(query: SearchQuery): Promise<SearchPage> {
  const projectType = PROJECT_TYPE[query.kind]
  if (!projectType) throw new Error(`Modrinth bu türü barındırmıyor: ${query.kind}`)

  const facets: string[][] = [[`project_type:${projectType}`]]
  if (query.gameVersion) facets.push([`versions:${query.gameVersion}`])
  // Resource packs and shaders are loader-independent, so only filter mods/modpacks.
  if (query.loader && query.loader !== 'vanilla' && (query.kind === 'mod' || query.kind === 'modpack')) {
    facets.push([`categories:${query.loader}`])
  }

  const index =
    query.sort === 'downloads'
      ? 'downloads'
      : query.sort === 'follows'
        ? 'follows'
        : query.sort === 'updated'
          ? 'updated'
          : query.sort === 'newest'
            ? 'newest'
            : 'relevance'

  const params = new URLSearchParams({
    query: query.query,
    facets: JSON.stringify(facets),
    index,
    offset: String(query.offset ?? 0),
    limit: String(query.limit ?? 30)
  })

  const response = await fetchJson<{ hits: ModrinthHit[]; total_hits: number }>(`${API}/search?${params}`)
  const hits = response.hits.map((hit) => ({
    source: 'modrinth' as const,
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    author: hit.author,
    iconUrl: hit.icon_url ?? undefined,
    downloads: hit.downloads,
    follows: hit.follows,
    categories: hit.categories,
    // The facet already pinned the type, and the hit's own `project_type` is the
    // project's primary one — a datapack search returns hits labelled `mod`,
    // which would have installed them into mods/ instead of datapacks/.
    kind: query.kind,
    updatedAt: hit.date_modified
  }))
  return { hits, total: response.total_hits }
}

/** Our vocabulary for the project types Modrinth reports on a project. */
const KIND_BY_TYPE: Record<string, ContentKind> = {
  mod: 'mod',
  modpack: 'modpack',
  resourcepack: 'resourcepack',
  shader: 'shader'
}

/**
 * Every project published by one author.
 *
 * Modrinth has a dedicated endpoint for this, which is why the launcher does not
 * search for the name instead: a name search returns whatever else happens to
 * mention it, and misses projects whose title does not.
 */
export async function listUserProjects(username: string): Promise<SearchResult[]> {
  const projects = await fetchJson<
    {
      id: string
      slug: string
      title: string
      description: string
      icon_url: string | null
      downloads: number
      followers: number
      categories: string[]
      project_type: string
      updated: string
    }[]
  >(`${API}/user/${encodeURIComponent(username)}/projects`)

  return projects
    .map((project) => ({
      source: 'modrinth' as const,
      projectId: project.id,
      slug: project.slug,
      title: project.title,
      description: project.description,
      author: username,
      iconUrl: project.icon_url ?? undefined,
      downloads: project.downloads,
      follows: project.followers,
      categories: project.categories,
      kind: KIND_BY_TYPE[project.project_type] ?? ('mod' as ContentKind),
      updatedAt: project.updated
    }))
    .sort((a, b) => b.downloads - a.downloads)
}

function toProjectVersion(version: ModrinthVersion): ProjectVersion {
  const file = version.files.find((candidate) => candidate.primary) ?? version.files[0]
  return {
    id: version.id,
    name: version.name,
    versionNumber: version.version_number,
    gameVersions: version.game_versions,
    loaders: version.loaders,
    channel: version.version_type,
    downloads: version.downloads,
    publishedAt: version.date_published,
    fileName: file.filename,
    fileUrl: file.url,
    fileSize: file.size,
    sha1: file.hashes.sha1,
    dependencies: version.dependencies.map((dependency) => ({
      projectId: dependency.project_id ?? undefined,
      versionId: dependency.version_id ?? undefined,
      required: dependency.dependency_type === 'required'
    }))
  }
}

export async function listVersions(
  projectId: string,
  gameVersion?: string,
  loader?: string
): Promise<ProjectVersion[]> {
  const params = new URLSearchParams()
  if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]))
  if (loader && loader !== 'vanilla') params.set('loaders', JSON.stringify([loader]))

  const versions = await fetchJson<ModrinthVersion[]>(
    `${API}/project/${encodeURIComponent(projectId)}/version?${params}`
  )
  return versions.map(toProjectVersion)
}

/** The newest version matching the profile, preferring stable releases. */
export async function bestVersion(
  projectId: string,
  gameVersion?: string,
  loader?: string
): Promise<ProjectVersion | undefined> {
  const versions = await listVersions(projectId, gameVersion, loader)
  return versions.find((version) => version.channel === 'release') ?? versions[0]
}

export async function getVersion(versionId: string): Promise<ProjectVersion> {
  return toProjectVersion(await fetchJson<ModrinthVersion>(`${API}/version/${encodeURIComponent(versionId)}`))
}

export interface ProjectDetail {
  id: string
  slug: string
  title: string
  description: string
  body: string
  iconUrl?: string
  downloads: number
  followers: number
  categories: string[]
  gameVersions: string[]
  loaders: string[]
  gallery: { url: string; title?: string }[]
  sourceUrl?: string
  issuesUrl?: string
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const project = await fetchJson<{
    id: string
    slug: string
    title: string
    description: string
    body: string
    icon_url: string | null
    downloads: number
    followers: number
    categories: string[]
    game_versions: string[]
    loaders: string[]
    gallery: { url: string; title: string | null }[]
    source_url: string | null
    issues_url: string | null
  }>(`${API}/project/${encodeURIComponent(projectId)}`)

  return {
    id: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    body: project.body,
    iconUrl: project.icon_url ?? undefined,
    downloads: project.downloads,
    followers: project.followers,
    categories: project.categories,
    gameVersions: project.game_versions,
    loaders: project.loaders,
    gallery: project.gallery.map((item) => ({ url: item.url, title: item.title ?? undefined })),
    sourceUrl: project.source_url ?? undefined,
    issuesUrl: project.issues_url ?? undefined
  }
}
