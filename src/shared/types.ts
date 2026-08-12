/** Types shared between the Electron main process and the React renderer. */

export type LoaderId = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

export type ContentKind = 'mod' | 'resourcepack' | 'shader' | 'datapack' | 'world' | 'modpack'

/** Where each kind of content is installed, relative to a profile directory. */
export const CONTENT_DIRS: Record<ContentKind, string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
  datapack: 'datapacks',
  world: 'saves',
  modpack: '.'
}

export interface Account {
  /** Minecraft profile UUID (dashless). */
  id: string
  name: string
  /** Minecraft access token — never leaves the main process except for launch. */
  accessToken: string
  /** Unix ms at which `accessToken` stops being valid. */
  expiresAt: number
  /** Microsoft refresh token used to silently renew the session. */
  refreshToken: string
  skinUrl?: string
  capeId?: string
  addedAt: number
}

export interface InstalledContent {
  /** Stable id: `${source}:${projectId}` for remote content, file hash for local. */
  id: string
  source: 'modrinth' | 'curseforge' | 'local'
  projectId?: string
  versionId?: string
  kind: ContentKind
  name: string
  fileName: string
  iconUrl?: string
  /** Set when the source reports a newer version for the profile's game/loader. */
  updateAvailable?: string
  enabled: boolean
  installedAt: number
}

export interface Profile {
  id: string
  name: string
  /** Minecraft version, e.g. "1.21.4". */
  gameVersion: string
  loader: LoaderId
  /** Loader version; omitted means "latest for this game version". */
  loaderVersion?: string
  icon?: string
  /** Absolute path to the isolated game directory. */
  directory: string
  memoryMb: number
  javaPath?: string
  jvmArgs?: string
  resolution?: { width: number; height: number }
  content: InstalledContent[]
  createdAt: number
  lastPlayed?: number
  totalPlaytimeMs: number
}

export interface Settings {
  /** Root directory holding profiles, versions, assets and libraries. */
  dataDir: string
  defaultMemoryMb: number
  javaPath?: string
  jvmArgs: string
  /** Azure application (client) id used for the Microsoft sign-in flow. */
  msClientId: string
  /** Optional CurseForge API key — CurseForge browsing is disabled without it. */
  curseForgeApiKey?: string
  concurrentDownloads: number
  keepLauncherOpen: boolean
  theme: 'dark' | 'light' | 'system'
  accentColor: string
}

export interface TaskProgress {
  id: string
  label: string
  /** 0..1, or -1 when the total is not yet known. */
  progress: number
  detail?: string
  state: 'running' | 'done' | 'error'
  error?: string
}

export interface GameLogLine {
  profileId: string
  stream: 'stdout' | 'stderr' | 'launcher'
  line: string
  at: number
}

export interface GameState {
  profileId: string
  status: 'preparing' | 'running' | 'exited' | 'crashed'
  pid?: number
  exitCode?: number
}

/** Normalised search result covering both Modrinth and CurseForge. */
export interface SearchResult {
  source: 'modrinth' | 'curseforge'
  projectId: string
  slug: string
  title: string
  description: string
  author?: string
  iconUrl?: string
  downloads: number
  follows?: number
  categories: string[]
  kind: ContentKind
  updatedAt?: string
}

export interface SearchQuery {
  source: 'modrinth' | 'curseforge'
  query: string
  kind: ContentKind
  gameVersion?: string
  loader?: LoaderId
  sort?: 'relevance' | 'downloads' | 'follows' | 'updated' | 'newest'
  offset?: number
  limit?: number
}

export interface ProjectVersion {
  id: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  /** `release` | `beta` | `alpha`. */
  channel: string
  downloads: number
  publishedAt: string
  fileName: string
  fileUrl: string
  fileSize: number
  sha1?: string
  /** Required dependency project ids, resolved before install. */
  dependencies: { projectId?: string; versionId?: string; required: boolean }[]
}

export interface VersionSummary {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}
