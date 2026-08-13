import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ContentKind,
  GameLogLine,
  GameState,
  InstalledContent,
  LoaderId,
  Profile,
  ProjectVersion,
  SavedSkin,
  SearchQuery,
  SearchResult,
  Settings,
  TaskProgress,
  UpdateStatus,
  VersionSummary
} from '../shared/types'

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

export interface WorldSummary {
  folderName: string
  displayName: string
  lastPlayed?: number
  sizeMb: number
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
    remove: (id: string, deleteFiles: boolean): Promise<Profile[]> =>
      ipcRenderer.invoke('profiles:delete', id, deleteFiles),
    openFolder: (id: string): Promise<void> => ipcRenderer.invoke('profiles:openFolder', id)
  },

  versions: {
    list: (): Promise<VersionSummary[]> => ipcRenderer.invoke('versions:list'),
    loaders: (loader: LoaderId, gameVersion: string): Promise<{ version: string; stable: boolean }[]> =>
      ipcRenderer.invoke('versions:loaders', loader, gameVersion),
    java: (): Promise<JavaInfo[]> => ipcRenderer.invoke('java:discover')
  },

  game: {
    launch: (profileId: string): Promise<{ pid?: number }> => ipcRenderer.invoke('game:launch', profileId),
    kill: (profileId: string): Promise<boolean> => ipcRenderer.invoke('game:kill', profileId),
    prepare: (profileId: string): Promise<boolean> => ipcRenderer.invoke('game:prepare', profileId),
    running: (): Promise<string[]> => ipcRenderer.invoke('game:running'),
    onLog: (listener: (line: GameLogLine) => void): Unsubscribe => subscribe('game:log', listener),
    onState: (listener: (state: GameState) => void): Unsubscribe => subscribe('game:state', listener)
  },

  content: {
    search: (query: SearchQuery): Promise<SearchPage> => ipcRenderer.invoke('content:search', query),
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
    update: (profileId: string, contentId: string): Promise<InstalledContent[]> =>
      ipcRenderer.invoke('content:update', profileId, contentId),
    checkUpdates: (profileId: string): Promise<InstalledContent[]> =>
      ipcRenderer.invoke('content:checkUpdates', profileId),
    importLocal: (profileId: string, kind: ContentKind): Promise<InstalledContent[]> =>
      ipcRenderer.invoke('content:import', profileId, kind),
    /** Creates a profile from a modpack, using the version and loader it declares. */
    installModpackAsProfile: (request: {
      projectId: string
      versionId?: string
      name: string
      iconUrl?: string
    }): Promise<Profile> => ipcRenderer.invoke('content:installModpackAsProfile', request)
  },

  worlds: {
    list: (profileId: string): Promise<WorldSummary[]> => ipcRenderer.invoke('worlds:list', profileId),
    remove: (profileId: string, folderName: string): Promise<WorldSummary[]> =>
      ipcRenderer.invoke('worlds:delete', profileId, folderName)
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
    applyToProfiles: (profileIds: string[]): Promise<number> =>
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
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
    platform: process.platform,
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close')
  }
}

export type OpbayApi = typeof api

contextBridge.exposeInMainWorld('opbay', api)
