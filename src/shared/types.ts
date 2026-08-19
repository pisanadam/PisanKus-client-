/** Types shared between the Electron main process and the React renderer. */

export type LoaderId = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'optifine'

export type ContentKind = 'mod' | 'resourcepack' | 'shader' | 'datapack' | 'world' | 'modpack'

/**
 * Which Microsoft identity platform a client id is registered with. A client id
 * only works against one of them, so this cannot be inferred at runtime.
 */
export type AuthMode = 'legacy' | 'azure'

/**
 * Whether a profile's mod loader is a meaningful filter for this kind.
 *
 * Only mods and modpacks are published against Fabric, Forge and friends. A
 * resource pack lists `minecraft` as its loader, a shader lists `iris` or
 * `canvas`, and a data pack lists `datapack` — so narrowing their versions by
 * the profile's loader matches nothing at all, and a perfectly good pack looks
 * unavailable. That is exactly what happened: a resource pack shown as
 * compatible still failed with "no compatible version found".
 */
export function loaderApplies(kind: ContentKind): boolean {
  return kind === 'mod' || kind === 'modpack'
}

/**
 * Whether a loader is one that mods are published for.
 *
 * OptiFine is a loader here because it is chosen the same way and installs the
 * same way, but it does not load mods — it patches the game itself. Filtering a
 * mod search by it would return an empty list on every search, so it is treated
 * like vanilla wherever mods are looked up.
 */
export function loadsMods(loader: LoaderId): boolean {
  return loader !== 'vanilla' && loader !== 'optifine'
}

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
  /** Platform this account signed in through; renewals must use the same one. */
  authMode: AuthMode
  skinUrl?: string
  capeId?: string
  addedAt: number
}

export interface InstalledContent {
  /** Stable id: `${source}:${projectId}` for remote content, file hash for local. */
  id: string
  source: 'modrinth' | 'local'
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
  /** Emoji shown when no picture is set. */
  icon?: string
  /**
   * A picture the player chose, stored as a small data url.
   *
   * Kept inline rather than as a file path because the renderer cannot read the
   * disk: a path would need an IPC round trip every time a list was drawn. The
   * image is downscaled before it lands here, so the database stays small.
   */
  iconImage?: string
  /** Absolute path to the isolated game directory. */
  directory: string
  memoryMb: number
  javaPath?: string
  jvmArgs?: string
  resolution?: { width: number; height: number }
  content: InstalledContent[]
  /**
   * Set while a pack is still downloading into this profile.
   *
   * The profile row appears the moment the install starts rather than when it
   * finishes, so the player can see what is happening — but it cannot be
   * launched yet, and this is what says so.
   */
  preparing?: boolean
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
  /** Identity platform used for new sign-ins. */
  authMode: AuthMode
  /** Client id presented to that platform. */
  msClientId: string
  concurrentDownloads: number
  /** Results fetched per search page in Keşfet. Modrinth caps this at 100. */
  searchPageSize: number
  keepLauncherOpen: boolean
  theme: 'dark' | 'light' | 'system'
  /** UI language code, or `system` to follow the operating system. */
  language: string
  accentColor: string
  /** Whether the launcher plays its welcome chime. */
  soundEffects: boolean
  /**
   * Raw options.txt written into every new profile. Empty means "don't manage
   * game options"; the file is kept verbatim so keys the launcher does not model
   * survive untouched.
   */
  minecraftOptions: string
  /** Cleared only on a fresh install, so the welcome screen shows exactly once. */
  welcomeSeen: boolean
}

/** A skin the player keeps in the launcher for quick switching. */
export interface SavedSkin {
  id: string
  name: string
  variant: 'classic' | 'slim'
  /** File name inside the launcher's `skins` folder. */
  fileName: string
  addedAt: number
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  /** `canSelfUpdate` is false where the build must be reinstalled by hand. */
  | { state: 'available'; version: string; canSelfUpdate: boolean }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export interface TaskProgress {
  id: string
  label: string
  /** 0..1, or -1 when the total is not yet known. */
  progress: number
  detail?: string
  state: 'running' | 'done' | 'error'
  error?: string
  /** Offers a way out of the failure instead of only naming it. */
  action?: 'signIn'
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

export type CrashCategory =
  | 'memory'
  | 'java'
  | 'dependency'
  | 'mixin'
  | 'graphics'
  | 'authentication'
  | 'native'
  | 'network'
  | 'unknown'

/** A persisted, token-redacted explanation of a failed launch or game crash. */
export interface CrashReport {
  id: string
  profileId: string
  profileName: string
  createdAt: number
  exitCode?: number
  category: CrashCategory
  title: string
  summary: string
  suggestions: string[]
  /** Short relevant excerpts only; the full sanitized output stays in logFile. */
  evidence: string[]
  logFile: string
  reportFile: string
}

export interface SearchResult {
  source: 'modrinth'
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
