import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ContentKind,
  GameLogLine,
  GameState,
  InstalledContent,
  LoaderId,
  Profile,
  ProjectVersion,
  SearchQuery,
  SearchResult,
  Settings,
  TaskProgress,
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

export interface SkinInfo {
  skinUrl?: string
  variant: 'classic' | 'slim'
  capes: { id: string; alias: string; url: string; active: boolean }[]
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
    search: (query: SearchQuery): Promise<SearchResult[]> => ipcRenderer.invoke('content:search', query),
    versions: (
      source: 'modrinth' | 'curseforge',
      projectId: string,
      gameVersion?: string,
      loader?: LoaderId
    ): Promise<ProjectVersion[]> =>
      ipcRenderer.invoke('content:versions', source, projectId, gameVersion, loader),
    project: (source: 'modrinth' | 'curseforge', projectId: string): Promise<ProjectDetail> =>
      ipcRenderer.invoke('content:project', source, projectId),
    install: (request: {
      profileId: string
      source: 'modrinth' | 'curseforge'
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
      ipcRenderer.invoke('content:import', profileId, kind)
  },

  worlds: {
    list: (profileId: string): Promise<WorldSummary[]> => ipcRenderer.invoke('worlds:list', profileId),
    remove: (profileId: string, folderName: string): Promise<WorldSummary[]> =>
      ipcRenderer.invoke('worlds:delete', profileId, folderName)
  },

  skins: {
    get: (accountId: string): Promise<SkinInfo> => ipcRenderer.invoke('skins:get', accountId),
    upload: (accountId: string, variant: 'classic' | 'slim'): Promise<SkinInfo | null> =>
      ipcRenderer.invoke('skins:upload', accountId, variant),
    setUrl: (accountId: string, url: string, variant: 'classic' | 'slim'): Promise<SkinInfo> =>
      ipcRenderer.invoke('skins:setUrl', accountId, url, variant),
    reset: (accountId: string): Promise<SkinInfo> => ipcRenderer.invoke('skins:reset', accountId),
    setCape: (accountId: string, capeId: string | null): Promise<SkinInfo> =>
      ipcRenderer.invoke('skins:setCape', accountId, capeId)
  },

  tasks: {
    onProgress: (listener: (task: TaskProgress) => void): Unsubscribe => subscribe('task:progress', listener)
  },

  app: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
    platform: process.platform,
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close')
  }
}

export type OpbayApi = typeof api

contextBridge.exposeInMainWorld('opbay', api)
