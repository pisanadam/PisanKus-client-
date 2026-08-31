import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  CrashReport,
  ContentKind,
  GameLogLine,
  GameState,
  InstalledContent,
  LoaderId,
  Profile,
  ProfileHistoryEntry,
  ProfileHealthFix,
  ProfileHealthReport,
  ProfileSafeModeState,
  ProfileStorageCategory,
  ProfileStorageReport,
  ProjectVersion,
  SavedSkin,
  SearchQuery,
  SearchResult,
  Settings,
  TaskProgress,
  UpdateStatus,
  VersionSummary
} from '../shared/types'
import type { IconRecipe } from '../shared/profileIcon'

type Unsubscribe = () => void

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

export interface PublicAccount {
  id: string
  name: string
  expiresAt: number
  skinUrl?: string
  capeId?: string
  addedAt: number
  expired: boolean
}

export interface Texture {
  dataUrl: string
  width: number
  height: number
}

export interface LocalSkin {
  path: string
  name: string
  texture: Texture
}

export interface SkinInfo {
  skinUrl?: string
  variant: 'classic' | 'slim'
  capes: { id: string; alias: string; url: string; active: boolean }[]
}

export interface SearchPage {
  hits: SearchResult[]
  total: number
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

export interface ServerEntry {
  index: number
  name: string
  address: string
  /** Base64 png Minecraft cached the last time it connected. */
  icon?: string
}

export interface ServerStatus {
  online: boolean
  players?: { online: number; max: number }
  motd?: string
  version?: string
  icon?: string
  error?: string
}

export interface WorldSummary {
  folderName: string
  displayName: string
  lastPlayed?: number
  sizeMb: number
}

/** A `.mrpack` on disk, as it describes itself. */
export interface MrPackFile {
  filePath: string
  name: string
  versionId: string
  gameVersion: string
  loader: LoaderId
  loaderVersion?: string
  fileCount: number
}

export interface ScreenshotSummary {
  fileName: string
  createdAt: number
  sizeMb: number
  thumbnail: string
}

export interface AutoWorldBackupSummary {
  folderName: string
  backupId: string
  createdAt: number
}

export interface JavaInfo {
  path: string
  majorVersion: number
  vendor: string
}

/** The complete surface the renderer is allowed to touch. */
const api = {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:update', patch),
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('settings:pickDirectory')
  },

  auth: {
    list: (): Promise<{ accounts: PublicAccount[]; activeId?: string }> => ipcRenderer.invoke('auth:list'),
    signIn: (): Promise<PublicAccount> => ipcRenderer.invoke('auth:signIn'),
    refresh: (accountId: string): Promise<PublicAccount> => ipcRenderer.invoke('auth:refresh', accountId),
    setActive: (accountId: string): Promise<PublicAccount> => ipcRenderer.invoke('auth:setActive', accountId),
    remove: (accountId: string): Promise<PublicAccount[]> => ipcRenderer.invoke('auth:remove', accountId)
  },

  profiles: {
    list: (): Promise<Profile[]> => ipcRenderer.invoke('profiles:list'),
    create: (input: {
      name: string
      gameVersion: string
      loader: LoaderId
      loaderVersion?: string
      icon?: string
    }): Promise<Profile> => ipcRenderer.invoke('profiles:create', input),
    update: (id: string, patch: Partial<Profile>): Promise<Profile> =>
      ipcRenderer.invoke('profiles:update', id, patch),
    duplicate: (id: string): Promise<Profile> => ipcRenderer.invoke('profiles:duplicate', id),
    health: (id: string): Promise<ProfileHealthReport> => ipcRenderer.invoke('profiles:health', id),
    fixHealth: (id: string, fix: ProfileHealthFix): Promise<ProfileHealthReport> =>
      ipcRenderer.invoke('profiles:healthFix', id, fix),
    /** Opens a picker and stores the chosen png/jpg as the profile's icon. */
    pickIcon: (id: string): Promise<Profile | null> => ipcRenderer.invoke('profiles:pickIcon', id),
    setDrawnIcon: (id: string, dataUrl: string, recipe: IconRecipe): Promise<Profile> =>
      ipcRenderer.invoke('profiles:setDrawnIcon', id, dataUrl, recipe),
    clearIcon: (id: string): Promise<Profile> => ipcRenderer.invoke('profiles:clearIcon', id),
    /** That profile's options.txt, and whether it already exists on disk. */
    readOptions: (id: string): Promise<{ text: string; onDisk: boolean }> =>
      ipcRenderer.invoke('profiles:readOptions', id),
    /**
     * Saves that profile's options.txt.
     *
     * `deferred` means the game is running and holds the file: the text is
     * written once it exits, because Minecraft overwrites the file on quit.
     */
    writeOptions: (id: string, text: string): Promise<{ deferred: boolean }> =>
      ipcRenderer.invoke('profiles:writeOptions', id, text),
    /** Stops re-applying the launcher's game settings before each launch. */
    clearManagedOptions: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('profiles:clearManagedOptions', id),
    remove: (id: string, deleteFiles: boolean): Promise<Profile[]> =>
      ipcRenderer.invoke('profiles:delete', id, deleteFiles),
    openFolder: (id: string): Promise<void> => ipcRenderer.invoke('profiles:openFolder', id),
    /** Saves the complete profile as a portable, compressed PisanKus backup. */
    exportBackup: (id: string): Promise<string | null> => ipcRenderer.invoke('profiles:export', id),
    /** Opens a portable PisanKus profile backup and creates a new isolated profile. */
    importBackup: (): Promise<Profile | null> => ipcRenderer.invoke('profiles:import'),
    safeMode: (id: string, enabled?: boolean): Promise<ProfileSafeModeState> =>
      ipcRenderer.invoke('profiles:safeMode', id, enabled),
    history: (id: string): Promise<ProfileHistoryEntry[]> => ipcRenderer.invoke('profiles:history', id),
    storage: (id: string): Promise<ProfileStorageReport> => ipcRenderer.invoke('profiles:storage', id),
    cleanStorage: (id: string, categories: ProfileStorageCategory[]): Promise<ProfileStorageReport> =>
      ipcRenderer.invoke('profiles:cleanStorage', id, categories),
    /** Fires whenever the main process changes the profile list on its own. */
    onChanged: (listener: () => void): Unsubscribe => subscribe('profiles:changed', listener)
  },

  versions: {
    list: (): Promise<VersionSummary[]> => ipcRenderer.invoke('versions:list'),
    loaders: (loader: LoaderId, gameVersion: string): Promise<{ version: string; stable: boolean }[]> =>
      ipcRenderer.invoke('versions:loaders', loader, gameVersion),
    java: (): Promise<JavaInfo[]> => ipcRenderer.invoke('java:discover')
  },

  game: {
    launch: (profileId: string, options?: { offline?: boolean; serverAddress?: string }): Promise<{ pid?: number }> =>
      ipcRenderer.invoke('game:launch', profileId, options),
    kill: (profileId: string): Promise<boolean> => ipcRenderer.invoke('game:kill', profileId),
    prepare: (profileId: string): Promise<boolean> => ipcRenderer.invoke('game:prepare', profileId),
    running: (): Promise<string[]> => ipcRenderer.invoke('game:running'),
    onLog: (listener: (line: GameLogLine) => void): Unsubscribe => subscribe('game:log', listener),
    onState: (listener: (state: GameState) => void): Unsubscribe => subscribe('game:state', listener)
  },

  crashes: {
    list: (profileId: string): Promise<CrashReport[]> => ipcRenderer.invoke('crashes:list', profileId),
    detectPending: (): Promise<CrashReport[]> => ipcRenderer.invoke('crashes:detectPending'),
    /** Returns a clipboard-safe representation with credentials/private paths removed. */
    share: (profileId: string, reportId: string): Promise<string> =>
      ipcRenderer.invoke('crashes:share', profileId, reportId),
    openFolder: (profileId: string): Promise<void> => ipcRenderer.invoke('crashes:openFolder', profileId),
    onCreated: (listener: (report: CrashReport) => void): Unsubscribe => subscribe('crash:created', listener)
  },

  content: {
    /**
     * Installs the libraries this profile's mods need and do not have.
     *
     * `unavailable` are the ones something here asks for but that have no build
     * for this profile's version or loader.
     */
    installMissingDependencies: (
      profileId: string
    ): Promise<{
      installed: { name: string; requiredBy: string }[]
      unavailable: { name: string; requiredBy: string }[]
    }> => ipcRenderer.invoke('content:installMissingDependencies', profileId),
    search: (query: SearchQuery): Promise<SearchPage> => ipcRenderer.invoke('content:search', query),
    /** Every project published by one Modrinth author. */
    userProjects: (username: string): Promise<SearchResult[]> =>
      ipcRenderer.invoke('content:userProjects', username),
    versions: (
      projectId: string,
      gameVersion?: string,
      loader?: LoaderId
    ): Promise<ProjectVersion[]> =>
      ipcRenderer.invoke('content:versions', projectId, gameVersion, loader),
    project: (projectId: string): Promise<ProjectDetail> =>
      ipcRenderer.invoke('content:project', projectId),
    install: (request: {
      profileId: string
      projectId: string
      versionId?: string
      kind: ContentKind
      name: string
      iconUrl?: string
      withDependencies?: boolean
    }): Promise<InstalledContent[]> => ipcRenderer.invoke('content:install', request),
    remove: (profileId: string, contentId: string): Promise<void> =>
      ipcRenderer.invoke('content:remove', profileId, contentId),
    toggle: (profileId: string, contentId: string, enabled: boolean): Promise<InstalledContent> =>
      ipcRenderer.invoke('content:toggle', profileId, contentId, enabled),
    toggleMany: (profileId: string, contentIds: string[], enabled: boolean): Promise<InstalledContent[]> =>
      ipcRenderer.invoke('content:toggleMany', profileId, contentIds, enabled),
    pin: (profileId: string, contentId: string, pinned: boolean): Promise<InstalledContent> =>
      ipcRenderer.invoke('content:pin', profileId, contentId, pinned),
    update: (profileId: string, contentId: string): Promise<InstalledContent[]> =>
      ipcRenderer.invoke('content:update', profileId, contentId),
    checkUpdates: (profileId: string): Promise<InstalledContent[]> =>
      ipcRenderer.invoke('content:checkUpdates', profileId),
    importLocal: (profileId: string, kind: ContentKind): Promise<InstalledContent[]> =>
      ipcRenderer.invoke('content:import', profileId, kind),
    /** Rebuilds the content list from what is actually in the profile folders. */
    sync: (profileId: string): Promise<InstalledContent[]> =>
      ipcRenderer.invoke('content:sync', profileId),
    /** Installs dropped files, deciding what each one is from the file itself. */
    importPaths: (profileId: string, filePaths: string[]): Promise<InstalledContent[]> =>
      ipcRenderer.invoke('content:importPaths', profileId, filePaths),
    /** Minecraft versions one of the launcher's own packs supports. */
    packVersions: (packId: string): Promise<string[]> =>
      ipcRenderer.invoke('content:packVersions', packId),
    /** Builds a whole profile from one of the launcher's packs. */
    installPack: (request: {
      packId: string
      gameVersion: string
      name: string
      /** Answers as soon as the profile exists; the mods download in the background. */
    }): Promise<Profile> => ipcRenderer.invoke('content:installPack', request),
    /** Adds a pack's mods to a profile that already exists, keeping everything in it. */
    installPackInto: (packId: string, profileId: string): Promise<Profile> =>
      ipcRenderer.invoke('content:installPackInto', packId, profileId),
    /** Opens a .mrpack from disk and reads what is in it, without installing. */
    pickMrPack: (): Promise<MrPackFile | null> => ipcRenderer.invoke('content:pickMrPack'),
    /** Builds a profile from a .mrpack file, using what the pack itself declares. */
    installMrPackFile: (request: { filePath: string; name?: string }): Promise<Profile> =>
      ipcRenderer.invoke('content:installMrPackFile', request),
    /** Creates a profile from a modpack, using the version and loader it declares. */
    installModpackAsProfile: (request: {
      projectId: string
      versionId?: string
      name: string
      iconUrl?: string
    }): Promise<Profile> => ipcRenderer.invoke('content:installModpackAsProfile', request)
  },

  servers: {
    list: (profileId: string): Promise<ServerEntry[]> => ipcRenderer.invoke('servers:list', profileId),
    add: (profileId: string, input: { name: string; address: string }): Promise<ServerEntry[]> =>
      ipcRenderer.invoke('servers:add', profileId, input),
    update: (
      profileId: string,
      index: number,
      input: { name: string; address: string }
    ): Promise<ServerEntry[]> => ipcRenderer.invoke('servers:update', profileId, index, input),
    remove: (profileId: string, index: number): Promise<ServerEntry[]> =>
      ipcRenderer.invoke('servers:remove', profileId, index),
    move: (profileId: string, from: number, to: number): Promise<ServerEntry[]> =>
      ipcRenderer.invoke('servers:move', profileId, from, to),
    /** Asked only when the player is looking; nothing polls in the background. */
    status: (address: string): Promise<ServerStatus> => ipcRenderer.invoke('servers:status', address),
    /** Adds the default servers to the given profiles; returns how many were added. */
    applyToProfiles: (profileIds: string[]): Promise<number> =>
      ipcRenderer.invoke('servers:applyToProfiles', profileIds)
  },

  worlds: {
    list: (profileId: string): Promise<WorldSummary[]> => ipcRenderer.invoke('worlds:list', profileId),
    remove: (profileId: string, folderName: string): Promise<WorldSummary[]> =>
      ipcRenderer.invoke('worlds:delete', profileId, folderName),
    exportBackup: (profileId: string, folderName: string, displayName: string): Promise<string | null> =>
      ipcRenderer.invoke('worlds:export', profileId, folderName, displayName),
    importBackup: (profileId: string): Promise<string | null> =>
      ipcRenderer.invoke('worlds:importBackup', profileId),
    autoBackups: (profileId: string): Promise<AutoWorldBackupSummary[]> =>
      ipcRenderer.invoke('worlds:autoBackups', profileId),
    restoreAutoBackup: (profileId: string, folderName: string, backupId: string): Promise<WorldSummary[]> =>
      ipcRenderer.invoke('worlds:restoreAutoBackup', profileId, folderName, backupId),
    openAutoBackups: (profileId: string): Promise<void> => ipcRenderer.invoke('worlds:openAutoBackups', profileId)
  },

  screenshots: {
    list: (profileId: string): Promise<ScreenshotSummary[]> => ipcRenderer.invoke('screenshots:list', profileId),
    openFolder: (profileId: string): Promise<void> => ipcRenderer.invoke('screenshots:openFolder', profileId),
    /** The full-size picture as a data url, read only when it is opened. */
    read: (profileId: string, fileName: string): Promise<string> =>
      ipcRenderer.invoke('screenshots:read', profileId, fileName),
    copy: (profileId: string, fileName: string): Promise<void> =>
      ipcRenderer.invoke('screenshots:copy', profileId, fileName),
    /** Opens the folder with this file selected. */
    reveal: (profileId: string, fileName: string): Promise<void> =>
      ipcRenderer.invoke('screenshots:reveal', profileId, fileName),
    remove: (profileId: string, fileName: string): Promise<ScreenshotSummary[]> =>
      ipcRenderer.invoke('screenshots:delete', profileId, fileName)
  },

  skins: {
    get: (accountId: string): Promise<SkinInfo> => ipcRenderer.invoke('skins:get', accountId),
    /** Opens the file dialog and returns the picked skin for preview, or null. */
    pickFile: (): Promise<LocalSkin | null> => ipcRenderer.invoke('skins:pickFile'),
    upload: (accountId: string, filePath: string, variant: 'classic' | 'slim'): Promise<SkinInfo> =>
      ipcRenderer.invoke('skins:upload', accountId, filePath, variant),
    setUrl: (accountId: string, url: string, variant: 'classic' | 'slim'): Promise<SkinInfo> =>
      ipcRenderer.invoke('skins:setUrl', accountId, url, variant),
    reset: (accountId: string): Promise<SkinInfo> => ipcRenderer.invoke('skins:reset', accountId),
    setCape: (accountId: string, capeId: string | null): Promise<SkinInfo> =>
      ipcRenderer.invoke('skins:setCape', accountId, capeId),
    /** Mojang texture fetched by the main process, returned as a data url. */
    texture: (url: string): Promise<Texture> => ipcRenderer.invoke('skins:texture', url),

    saved: (): Promise<SavedSkin[]> => ipcRenderer.invoke('skins:saved'),
    savedTexture: (id: string): Promise<Texture> => ipcRenderer.invoke('skins:savedTexture', id),
    saveFile: (filePath: string, name: string, variant: 'classic' | 'slim'): Promise<SavedSkin[]> =>
      ipcRenderer.invoke('skins:saveFile', filePath, name, variant),
    saveFromUrl: (url: string, name: string, variant: 'classic' | 'slim'): Promise<SavedSkin[]> =>
      ipcRenderer.invoke('skins:saveFromUrl', url, name, variant),
    removeSaved: (id: string): Promise<SavedSkin[]> => ipcRenderer.invoke('skins:removeSaved', id),
    renameSaved: (id: string, name: string): Promise<SavedSkin[]> =>
      ipcRenderer.invoke('skins:renameSaved', id, name),
    applySaved: (accountId: string, id: string): Promise<SkinInfo> =>
      ipcRenderer.invoke('skins:applySaved', accountId, id)
  },

  options: {
    /** Opens a file picker and returns the file's text, or null if cancelled. */
    importFile: (): Promise<string | null> => ipcRenderer.invoke('options:importFile'),
    applyToProfiles: (profileIds: string[]): Promise<{ applied: number; deferred: number }> =>
      ipcRenderer.invoke('options:applyToProfiles', profileIds)
  },

  tasks: {
    onProgress: (listener: (task: TaskProgress) => void): Unsubscribe => subscribe('task:progress', listener)
  },

  updates: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:status'),
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:check'),
    download: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:download'),
    install: (): Promise<void> => ipcRenderer.invoke('updates:install'),
    onStatus: (listener: (status: UpdateStatus) => void): Unsubscribe =>
      subscribe('updates:status', listener)
  },

  app: {
    setMark: (dataUrl: string): Promise<void> => ipcRenderer.invoke('app:setMark', dataUrl),
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    totalMemoryMb: (): Promise<number> => ipcRenderer.invoke('app:totalMemoryMb'),
    /** Where the launcher's tokens are encrypted, for the security note. */
    tokenStorage: (): Promise<{ available: boolean; backend: string }> =>
      ipcRenderer.invoke('app:tokenStorage'),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
    /**
     * The path behind a dropped File. Electron stopped exposing `File.path` in
     * 32, and the renderer has no other way to name the file for the main
     * process — which is where every filesystem operation still happens.
     */
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
    platform: process.platform,
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close')
  }
}

export type PisanKusApi = typeof api

contextBridge.exposeInMainWorld('pisankus', api)
