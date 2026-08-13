import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type {
  Account,
  ContentKind,
  GameLogLine,
  GameState,
  LoaderId,
  Profile,
  ProjectVersion,
  SearchQuery,
  Settings,
  TaskProgress
} from '../shared/types'
import * as auth from './auth/microsoft'
import * as install from './content/install'
import * as modrinth from './content/modrinth'
import { discoverJava } from './minecraft/java'
import { launch, prepareOnly, type GameSession } from './minecraft/launcher'
import { listLoaderVersions } from './minecraft/loaders'
import { listVersions as listGameVersions } from './minecraft/versions'
import * as skins from './skins'
import { store } from './store'
import * as updater from './updater'
import { writeProfileOptions } from './minecraft/options'

/** Account shape safe to hand to the renderer — tokens stay in the main process. */
export type PublicAccount = Omit<Account, 'accessToken' | 'refreshToken'> & { expired: boolean }

function toPublic(account: Account): PublicAccount {
  const { accessToken: _accessToken, refreshToken: _refreshToken, ...rest } = account
  return {
    ...rest,
    // Accounts stored before the https fix still hold an http texture url, and
    // upgrading only at sign-in would leave them broken until the next login.
    skinUrl: skins.httpsTexture(rest.skinUrl),
    expired: account.expiresAt <= Date.now()
  }
}

const sessions = new Map<string, GameSession>()
const launchAborts = new Map<string, AbortController>()

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }

  const onProgress = (task: TaskProgress): void => send('task:progress', task)
  const onLog = (line: GameLogLine): void => send('game:log', line)
  const onState = (state: GameState): void => send('game:state', state)

  // The renderer draws the update button straight from these.
  updater.initUpdater((status) => send('updates:status', status))

  /** Wraps a handler so thrown errors reach the renderer as readable messages. */
  const handle = <T extends unknown[], R>(
    channel: string,
    handler: (...args: T) => Promise<R> | R
  ): void => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await handler(...(args as T))
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : String(error))
      }
    })
  }

  // ---------------------------------------------------------------- settings

  handle('settings:get', () => store.settings)
  handle('settings:update', (patch: Partial<Settings>) => store.updateSettings(patch))
  handle('settings:pickDirectory', async () => {
    const window = getWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // ------------------------------------------------------------------ accounts

  handle('auth:list', () => ({
    accounts: store.accounts.map(toPublic),
    activeId: store.activeAccount?.id
  }))

  handle('auth:signIn', async () => {
    const account = await auth.signIn(store.settings.msClientId, store.settings.authMode)
    store.upsertAccount(account)
    return toPublic(account)
  })

  handle('auth:refresh', async (accountId: string) => {
    const account = store.accounts.find((candidate) => candidate.id === accountId)
    if (!account) throw new Error('Hesap bulunamadı.')
    const renewed = await auth.refresh(account, store.settings.msClientId)
    store.upsertAccount(renewed)
    return toPublic(renewed)
  })

  handle('auth:setActive', (accountId: string) => {
    store.setActiveAccount(accountId)
    return toPublic(store.activeAccount!)
  })

  handle('auth:remove', (accountId: string) => {
    store.removeAccount(accountId)
    return store.accounts.map(toPublic)
  })

  // ------------------------------------------------------------------ profiles

  handle('profiles:list', () => store.profiles)

  handle('profiles:create', async (input: { name: string; gameVersion: string; loader: LoaderId; loaderVersion?: string; icon?: string }) => {
    const slug = input.name.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'profil'

    // Two profiles may share a name, but never a directory — otherwise they would
    // share mods and worlds.
    const taken = new Set(store.profiles.map((profile) => path.basename(profile.directory)))
    let folder = slug
    let suffix = 2
    while (taken.has(folder)) folder = `${slug}-${suffix++}`

    const profile = store.addProfile({
      name: input.name,
      gameVersion: input.gameVersion,
      loader: input.loader,
      loaderVersion: input.loaderVersion,
      icon: input.icon,
      directory: path.join(store.settings.dataDir, 'profiles', folder),
      memoryMb: store.settings.defaultMemoryMb
    })

    // Seed the configured game options. Only for brand new profiles — the
    // directory is fresh here, so there is nothing to overwrite.
    await writeProfileOptions(profile.directory, store.settings.minecraftOptions)
    return profile
  })

  handle('profiles:update', (id: string, patch: Partial<Profile>) => store.updateProfile(id, patch))

  handle('profiles:duplicate', async (id: string) => {
    const source = store.profile(id)
    if (!source) throw new Error('Profil bulunamadı.')

    const copy = store.addProfile({
      ...source,
      name: `${source.name} (kopya)`,
      directory: path.join(store.settings.dataDir, 'profiles', `${path.basename(source.directory)}-kopya-${Date.now()}`)
    })
    await fsp.cp(source.directory, copy.directory, { recursive: true })
    return store.updateProfile(copy.id, { content: structuredClone(source.content) })
  })

  handle('profiles:delete', async (id: string, deleteFiles: boolean) => {
    const profile = store.profile(id)
    if (profile && deleteFiles) {
      await fsp.rm(profile.directory, { recursive: true, force: true })
    }
    store.removeProfile(id)
    return store.profiles
  })

  handle('profiles:openFolder', async (id: string) => {
    const profile = store.profile(id)
    if (!profile) throw new Error('Profil bulunamadı.')
    await fsp.mkdir(profile.directory, { recursive: true })
    await shell.openPath(profile.directory)
  })

  // ------------------------------------------------------------------ versions

  handle('versions:list', () => listGameVersions())
  handle('versions:loaders', (loader: LoaderId, gameVersion: string) => listLoaderVersions(loader, gameVersion))
  handle('java:discover', () => discoverJava(store.settings.dataDir))

  // ---------------------------------------------------------------------- game

  handle('game:launch', async (profileId: string) => {
    if (sessions.has(profileId)) throw new Error('Bu profil zaten çalışıyor.')

    const profile = store.profile(profileId)
    if (!profile) throw new Error('Profil bulunamadı.')

    const account = store.activeAccount
    if (!account) {
      throw new Error('Oyunu başlatmak için Microsoft hesabınızla oturum açmanız gerekiyor.')
    }

    const valid = await auth.ensureValid(account, store.settings.msClientId)
    if (valid !== account) store.upsertAccount(valid)

    const controller = new AbortController()
    launchAborts.set(profileId, controller)
    const startedAt = Date.now()

    try {
      const session = await launch({
        profile,
        account: valid,
        settings: store.settings,
        onProgress,
        onLog,
        onState: (state) => {
          if (state.status === 'exited' || state.status === 'crashed') {
            sessions.delete(profileId)
            launchAborts.delete(profileId)
            const current = store.profile(profileId)
            if (current) {
              store.updateProfile(profileId, {
                totalPlaytimeMs: current.totalPlaytimeMs + (Date.now() - startedAt)
              })
            }
          }
          onState(state)
        },
        signal: controller.signal
      })

      sessions.set(profileId, session)
      store.updateProfile(profileId, { lastPlayed: Date.now() })
      return { pid: session.pid }
    } catch (error) {
      launchAborts.delete(profileId)
      throw error
    }
  })

  handle('game:kill', (profileId: string) => {
    sessions.get(profileId)?.kill()
    launchAborts.get(profileId)?.abort()
    return true
  })

  handle('game:running', () => [...sessions.keys()])

  handle('game:prepare', async (profileId: string) => {
    const profile = store.profile(profileId)
    if (!profile) throw new Error('Profil bulunamadı.')
    const controller = new AbortController()
    launchAborts.set(`prepare-${profileId}`, controller)
    try {
      await prepareOnly(profile, store.settings, onProgress, controller.signal)
      return true
    } finally {
      launchAborts.delete(`prepare-${profileId}`)
    }
  })

  // ------------------------------------------------------------------- content

  handle('content:search', (query: SearchQuery) => modrinth.search(query))

  handle(
    'content:versions',
    (projectId: string, gameVersion?: string, loader?: LoaderId): Promise<ProjectVersion[]> =>
      modrinth.listVersions(projectId, gameVersion, loader)
  )

  handle('content:project', (projectId: string) => modrinth.getProject(projectId))

  handle('content:install', (request: install.InstallRequest) => install.installContent(request, onProgress))
  handle('content:remove', (profileId: string, contentId: string) => install.removeContent(profileId, contentId))
  handle('content:toggle', (profileId: string, contentId: string, enabled: boolean) =>
    install.setContentEnabled(profileId, contentId, enabled)
  )
  handle('content:update', (profileId: string, contentId: string) =>
    install.updateContent(profileId, contentId, onProgress)
  )
  handle('content:checkUpdates', (profileId: string) => install.checkForUpdates(profileId))

  handle('content:import', async (profileId: string, kind: ContentKind) => {
    const window = getWindow()
    if (!window) return []

    const filters =
      kind === 'world'
        ? [{ name: 'Dünya arşivi', extensions: ['zip'] }]
        : kind === 'mod'
          ? [{ name: 'Mod', extensions: ['jar'] }]
          : [{ name: 'Paket', extensions: ['zip'] }]

    const result = await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'], filters })
    if (result.canceled) return []

    const imported = []
    for (const filePath of result.filePaths) {
      imported.push(await install.importLocalFile(profileId, filePath, kind))
    }
    return imported
  })

  handle('worlds:list', (profileId: string) => install.listWorlds(profileId))

  handle('worlds:delete', async (profileId: string, folderName: string) => {
    const profile = store.profile(profileId)
    if (!profile) throw new Error('Profil bulunamadı.')
    await fsp.rm(path.join(profile.directory, 'saves', folderName), { recursive: true, force: true })
    return install.listWorlds(profileId)
  })

  // --------------------------------------------------------------------- skins

  /** Skin calls always run against a freshly refreshed token. */
  const withAccount = async <R>(accountId: string, action: (account: Account) => Promise<R>): Promise<R> => {
    const account = store.accounts.find((candidate) => candidate.id === accountId)
    if (!account) throw new Error('Hesap bulunamadı.')
    const valid = await auth.ensureValid(account, store.settings.msClientId)
    if (valid !== account) store.upsertAccount(valid)
    return action(valid)
  }

  handle('skins:get', (accountId: string) => withAccount(accountId, skins.getSkinInfo))

  // Picking and applying are separate steps so the chosen file can be previewed
  // on the model first — uploading straight from the file dialog gave no way to
  // see what you were about to put on your account.
  handle('skins:pickFile', async () => {
    const window = getWindow()
    if (!window) throw new Error('Pencere bulunamadı.')
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Skin (PNG)', extensions: ['png'] }]
    })
    if (result.canceled) return null
    return skins.readLocalSkin(result.filePaths[0])
  })

  handle('skins:upload', async (accountId: string, filePath: string, variant: skins.SkinVariant) =>
    withAccount(accountId, async (account) => {
      const info = await skins.uploadSkin(account, filePath, variant)
      store.upsertAccount({ ...account, skinUrl: info.skinUrl })
      return info
    })
  )

  handle('skins:setUrl', (accountId: string, url: string, variant: skins.SkinVariant) =>
    withAccount(accountId, async (account) => {
      const info = await skins.setSkinFromUrl(account, url, variant)
      store.upsertAccount({ ...account, skinUrl: info.skinUrl })
      return info
    })
  )

  handle('skins:reset', (accountId: string) =>
    withAccount(accountId, async (account) => {
      const info = await skins.resetSkin(account)
      store.upsertAccount({ ...account, skinUrl: info.skinUrl })
      return info
    })
  )

  handle('skins:setCape', (accountId: string, capeId: string | null) =>
    withAccount(accountId, async (account) => {
      const info = await skins.setCape(account, capeId)
      store.upsertAccount({ ...account, capeId: capeId ?? undefined })
      return info
    })
  )

  // ----------------------------------------------------------------------- app

  handle('skins:texture', (url: string) => skins.textureDataUrl(url))

  // ------------------------------------------------------------ skin library

  handle('skins:saved', () => skins.savedSkins())
  handle('skins:savedTexture', (id: string) => skins.savedSkinTexture(id))
  handle('skins:removeSaved', (id: string) => skins.removeSavedSkin(id))
  handle('skins:renameSaved', (id: string, name: string) => store.renameSavedSkin(id, name))

  /** Adds a picked file to the library without touching the account. */
  handle('skins:saveFile', async (filePath: string, name: string, variant: skins.SkinVariant) =>
    skins.saveSkinBuffer(await fsp.readFile(filePath), name, variant)
  )

  /** Adds whatever the account is wearing right now. */
  handle('skins:saveCurrent', (accountId: string, name: string) =>
    withAccount(accountId, async (account) => {
      const info = await skins.getSkinInfo(account)
      if (!info.skinUrl) throw new Error('Bu hesapta kaydedilecek özel bir skin yok.')
      return skins.saveSkinFromUrl(info.skinUrl, name, info.variant)
    })
  )

  handle('skins:applySaved', (accountId: string, id: string) =>
    withAccount(accountId, async (account) => {
      const info = await skins.applySavedSkin(account, id)
      store.upsertAccount({ ...account, skinUrl: info.skinUrl })
      return info
    })
  )

  // ------------------------------------------------------------ game options

  handle('options:importFile', async () => {
    const window = getWindow()
    if (!window) throw new Error('Pencere bulunamadı.')
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Minecraft ayarları', extensions: ['txt'] }]
    })
    if (result.canceled) return null
    return fsp.readFile(result.filePaths[0], 'utf8')
  })

  // Applying to existing profiles is a separate, explicit action: it replaces a
  // file the player may have spent time tuning in-game.
  handle('options:applyToProfiles', async (profileIds: string[]) => {
    for (const id of profileIds) {
      const profile = store.profile(id)
      if (profile) await writeProfileOptions(profile.directory, store.settings.minecraftOptions, true)
    }
    return profileIds.length
  })

  handle('app:version', () => app.getVersion())

  // -------------------------------------------------------------- updates

  handle('updates:status', () => updater.currentStatus())
  handle('updates:check', () => updater.checkForUpdates())
  handle('updates:download', () => updater.downloadUpdate())
  handle('updates:install', () => updater.installUpdate())

  handle('app:openExternal', (url: string) => {
    // Only ever hand http(s) links to the OS.
    if (!/^https?:\/\//i.test(url)) throw new Error('Yalnızca http(s) bağlantıları açılabilir.')
    return shell.openExternal(url)
  })

  handle('window:minimize', () => getWindow()?.minimize())
  handle('window:maximize', () => {
    const window = getWindow()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  handle('window:close', () => getWindow()?.close())
}

/** Stops every running game — used when the launcher itself is quitting. */
export function killAllSessions(): void {
  for (const session of sessions.values()) session.kill()
  sessions.clear()
}
