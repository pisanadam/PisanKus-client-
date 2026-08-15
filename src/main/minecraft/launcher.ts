import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Account, GameLogLine, GameState, Profile, Settings, TaskProgress } from '../../shared/types'
import { assetsRoot, materialiseVirtualAssets, resolveAssets } from './assets'
import { assertLocalFiles, downloadAll, type DownloadItem } from './downloader'
import { ensureJava, requireInstalledJava } from './java'
import { currentOs, extractNatives, resolveLibraries, rulesAllow } from './libraries'
import { installLoader } from './loaders'
import { clientDataVersion, seedProfileOptions } from './options'
import { resolveVersion, type Rule, type VersionJson } from './versions'

const LAUNCHER_NAME = 'PisanKusClient'
const LAUNCHER_VERSION = '1.0.0'

type ArgumentEntry = string | { rules: Rule[]; value: string | string[] }

/** Expands `${placeholder}` tokens Mojang uses throughout the argument templates. */
function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\$\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

function flattenArguments(
  entries: ArgumentEntry[] | undefined,
  values: Record<string, string>,
  features: Record<string, boolean>
): string[] {
  const output: string[] = []
  for (const entry of entries ?? []) {
    if (typeof entry === 'string') {
      output.push(substitute(entry, values))
      continue
    }
    if (!rulesAllow(entry.rules, features)) continue
    const value = Array.isArray(entry.value) ? entry.value : [entry.value]
    output.push(...value.map((item) => substitute(item, values)))
  }
  return output
}

export interface LaunchContext {
  profile: Profile
  account: Account
  settings: Settings
  onProgress: (task: TaskProgress) => void
  onLog: (line: GameLogLine) => void
  onState: (state: GameState) => void
  /** Never refreshes auth or downloads; suitable for cached single-player use. */
  offline?: boolean
  signal?: AbortSignal
}

export class GameSession extends EventEmitter {
  constructor(readonly profileId: string, private readonly child: ChildProcess) {
    super()
  }

  get pid(): number | undefined {
    return this.child.pid
  }

  kill(): void {
    this.child.kill('SIGTERM')
    // Minecraft occasionally ignores SIGTERM while shutting down a world.
    setTimeout(() => {
      // `child.killed` only means a signal was sent; it does not mean the
      // process exited. The exit fields stay null while it is actually alive.
      if (this.child.exitCode === null && this.child.signalCode === null) {
        this.child.kill('SIGKILL')
      }
    }, 5000)
  }
}

/**
 * Prepares everything a profile needs (loader, version json, libraries, assets,
 * natives, Java) and then starts the game.
 */
export async function launch(context: LaunchContext): Promise<GameSession> {
  const { profile, account, settings, onProgress, onLog, onState, offline = false, signal } = context
  const dataDir = settings.dataDir
  const taskId = `launch-${profile.id}`

  const report = (label: string, progress: number, detail?: string): void =>
    onProgress({ id: taskId, label, progress, detail, state: 'running' })

  const log = (line: string): void =>
    onLog({ profileId: profile.id, stream: 'launcher', line, at: Date.now() })

  onState({ profileId: profile.id, status: 'preparing' })

  try {
    report('Yükleyici hazırlanıyor', -1)
    const versionId = await installLoader(
      dataDir,
      profile.loader,
      profile.gameVersion,
      profile.loaderVersion,
      (detail) => report('Yükleyici hazırlanıyor', -1, detail),
      offline
    )
    log(`Sürüm: ${versionId}`)
    if (offline) log('Çevrimdışı mod: ağ indirmeleri ve oturum yenileme kapalı.')

    report('Sürüm bilgisi çözümleniyor', -1)
    const version = await resolveVersion(dataDir, versionId, offline)

    const clientJar = path.join(dataDir, 'versions', profile.gameVersion, `${profile.gameVersion}.jar`)
    const downloads: DownloadItem[] = []

    if (version.downloads?.client) {
      downloads.push({
        url: version.downloads.client.url,
        destination: clientJar,
        sha1: version.downloads.client.sha1,
        size: version.downloads.client.size
      })
    }

    const libraries = resolveLibraries(version, dataDir)
    downloads.push(...libraries.downloads)

    report('Varlık listesi alınıyor', -1)
    const assets = await resolveAssets(version, dataDir, offline)
    downloads.push(...assets.downloads)

    if (version.logging?.client) {
      downloads.push({
        url: version.logging.client.file.url,
        destination: path.join(dataDir, 'assets', 'log_configs', version.logging.client.file.id),
        sha1: version.logging.client.file.sha1,
        size: version.logging.client.file.size
      })
    }

    if (offline) {
      report('Yerel dosyalar denetleniyor', 0, `${downloads.length} dosya`)
      await assertLocalFiles(downloads, (completed, total, current) =>
        report('Yerel dosyalar denetleniyor', total === 0 ? 1 : completed / total, `${completed}/${total} · ${current}`)
      )
    } else {
      report('Dosyalar indiriliyor', 0, `${downloads.length} dosya`)
      await downloadAll(downloads, {
        concurrency: settings.concurrentDownloads,
        signal,
        onProgress: (completed, total, current) =>
          report('Dosyalar indiriliyor', completed / total, `${completed}/${total} · ${current}`)
      })
    }

    report('Yerel kütüphaneler açılıyor', -1)
    const nativesDir = path.join(dataDir, 'versions', versionId, 'natives')
    await extractNatives(libraries.natives, nativesDir)
    await materialiseVirtualAssets(assets, dataDir, profile.directory)

    report('Java hazırlanıyor', -1)
    const javaPath =
      profile.javaPath ??
      settings.javaPath ??
      (offline
        ? await requireInstalledJava(dataDir, version.javaVersion?.majorVersion ?? 21)
        : await ensureJava(dataDir, version.javaVersion?.majorVersion ?? 21, (detail) =>
            report('Java hazırlanıyor', -1, detail)
          ))
    log(`Java: ${javaPath}`)

    await fsp.mkdir(profile.directory, { recursive: true })

    // Seeds the configured template the first time a profile is launched, and
    // never again. It cannot be done when the profile is created because the
    // file is worthless without the game's data version, and that number only
    // exists inside the client jar — which is on disk by now.
    await seedProfileOptions(
      profile.directory,
      settings.minecraftOptions,
      await clientDataVersion(clientJar)
    )

    const classpath = [...libraries.classpath, clientJar]
    const values: Record<string, string> = {
      auth_player_name: account.name,
      auth_uuid: account.id,
      auth_access_token: offline ? '0' : account.accessToken,
      auth_xuid: account.id,
      auth_session: `token:${offline ? '0' : account.accessToken}:${account.id}`,
      user_type: 'msa',
      user_properties: '{}',
      clientid: settings.msClientId,
      version_name: versionId,
      version_type: version.type,
      game_directory: profile.directory,
      assets_root: assetsRoot(assets, dataDir),
      game_assets: assetsRoot(assets, dataDir),
      assets_index_name: assets.indexId,
      natives_directory: nativesDir,
      launcher_name: LAUNCHER_NAME,
      launcher_version: LAUNCHER_VERSION,
      classpath: classpath.join(path.delimiter),
      classpath_separator: path.delimiter,
      library_directory: path.join(dataDir, 'libraries'),
      resolution_width: String(profile.resolution?.width ?? 1280),
      resolution_height: String(profile.resolution?.height ?? 720)
    }

    const features = {
      is_demo_user: false,
      has_custom_resolution: profile.resolution != null,
      has_quick_plays_support: false,
      is_quick_play_singleplayer: false,
      is_quick_play_multiplayer: false,
      is_quick_play_realms: false
    }

    const memory = profile.memoryMb || settings.defaultMemoryMb
    const extraJvmArgs = (profile.jvmArgs ?? settings.jvmArgs).split(/\s+/).filter(Boolean)

    const jvmArgs = [
      `-Xmx${memory}M`,
      `-Xms${Math.min(512, memory)}M`,
      ...extraJvmArgs,
      ...flattenArguments(version.arguments?.jvm as ArgumentEntry[], values, features)
    ]

    // Pre-1.13 versions have no `arguments.jvm` block at all.
    if (!version.arguments?.jvm?.length) {
      jvmArgs.push(`-Djava.library.path=${nativesDir}`, '-cp', values.classpath)
    }
    if (currentOs() === 'osx') jvmArgs.push('-XstartOnFirstThread')

    // From 26.3 the jvm template points each consumer at its own subfolder of the
    // natives directory (`${natives_directory}/java`, `/lwjgl`, `/jna`, `/netty`)
    // instead of the directory itself. None of them create the folder, so LWJGL
    // reported `java.library.path : <not a directory>` and failed to load
    // lwjgl.dll. Create whatever the template actually asked for.
    for (const arg of jvmArgs) {
      const value = /^-D[\w.]+=(.+)$/.exec(arg)?.[1]
      if (!value) continue
      // The template joins with `/` even on Windows, so compare through `path`
      // rather than by prefix.
      const relative = path.relative(nativesDir, value)
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
        await fsp.mkdir(value, { recursive: true })
      }
    }

    const gameArgs = version.minecraftArguments
      ? version.minecraftArguments.split(' ').map((arg) => substitute(arg, values))
      : flattenArguments(version.arguments?.game as ArgumentEntry[], values, features)

    const args = [...jvmArgs, version.mainClass, ...gameArgs]

    log(`Başlatılıyor: ${path.basename(javaPath)} ${version.mainClass}`)
    onProgress({ id: taskId, label: 'Oyun başlatıldı', progress: 1, state: 'done' })

    // Detached, so the game keeps running when the launcher is closed. Without
    // its own process group the JVM would be torn down with the parent, and
    // quitting the launcher mid-session would kill the game.
    const child = spawn(javaPath, args, {
      cwd: profile.directory,
      windowsHide: true,
      detached: true
    })
    // The launcher no longer waits on it; the pipes below are read while the
    // launcher is alive and simply end when it goes away.
    child.unref()

    const emit = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) onLog({ profileId: profile.id, stream, line, at: Date.now() })
      }
    }
    child.stdout.on('data', (chunk: Buffer) => emit('stdout', chunk))
    child.stderr.on('data', (chunk: Buffer) => emit('stderr', chunk))

    child.on('error', (error) => {
      onLog({ profileId: profile.id, stream: 'launcher', line: `Hata: ${error.message}`, at: Date.now() })
      onState({ profileId: profile.id, status: 'crashed' })
    })

    child.on('close', (code) => {
      onState({
        profileId: profile.id,
        status: code === 0 ? 'exited' : 'crashed',
        exitCode: code ?? undefined
      })
    })

    onState({ profileId: profile.id, status: 'running', pid: child.pid })
    return new GameSession(profile.id, child)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`Başlatma başarısız: ${message}`)
    onProgress({ id: taskId, label: 'Başlatma başarısız', progress: 0, state: 'error', error: message })
    onState({ profileId: profile.id, status: 'crashed' })
    throw error
  }
}

/** Downloads everything a profile needs without starting the game. */
export async function prepareOnly(
  profile: Profile,
  settings: Settings,
  onProgress: (task: TaskProgress) => void,
  signal?: AbortSignal
): Promise<VersionJson> {
  const taskId = `prepare-${profile.id}`
  const versionId = await installLoader(settings.dataDir, profile.loader, profile.gameVersion, profile.loaderVersion)
  const version = await resolveVersion(settings.dataDir, versionId)
  const libraries = resolveLibraries(version, settings.dataDir)
  const assets = await resolveAssets(version, settings.dataDir)

  const downloads = [...libraries.downloads, ...assets.downloads]
  if (version.downloads?.client) {
    downloads.push({
      url: version.downloads.client.url,
      destination: path.join(settings.dataDir, 'versions', profile.gameVersion, `${profile.gameVersion}.jar`),
      sha1: version.downloads.client.sha1,
      size: version.downloads.client.size
    })
  }
  if (version.logging?.client) {
    downloads.push({
      url: version.logging.client.file.url,
      destination: path.join(settings.dataDir, 'assets', 'log_configs', version.logging.client.file.id),
      sha1: version.logging.client.file.sha1,
      size: version.logging.client.file.size
    })
  }

  await downloadAll(downloads, {
    concurrency: settings.concurrentDownloads,
    signal,
    onProgress: (completed, total, current) =>
      onProgress({
        id: taskId,
        label: `${profile.name} indiriliyor`,
        progress: completed / total,
        detail: `${completed}/${total} · ${current}`,
        state: 'running'
      })
  })

  const nativesDir = path.join(settings.dataDir, 'versions', versionId, 'natives')
  await extractNatives(libraries.natives, nativesDir)
  await materialiseVirtualAssets(assets, settings.dataDir, profile.directory)

  if (!profile.javaPath && !settings.javaPath) {
    await ensureJava(settings.dataDir, version.javaVersion?.majorVersion ?? 21, (detail) =>
      onProgress({
        id: taskId,
        label: `${profile.name} hazırlanıyor`,
        progress: -1,
        detail,
        state: 'running'
      })
    )
  }

  const clientJar = path.join(
    settings.dataDir,
    'versions',
    profile.gameVersion,
    `${profile.gameVersion}.jar`
  )
  await fsp.mkdir(profile.directory, { recursive: true })
  await seedProfileOptions(
    profile.directory,
    settings.minecraftOptions,
    await clientDataVersion(clientJar)
  )

  onProgress({ id: taskId, label: `${profile.name} hazır`, progress: 1, state: 'done' })
  return version
}
