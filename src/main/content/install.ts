import extract from 'extract-zip'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CONTENT_DIRS, type ContentKind, type InstalledContent, type LoaderId, type Profile, type ProjectVersion, type TaskProgress } from '../../shared/types'
import { downloadAll, downloadFile, fileSha1 } from '../minecraft/downloader'
import { store } from '../store'
import * as modrinth from './modrinth'

export type ProgressReporter = (task: TaskProgress) => void

function contentDir(profile: Profile, kind: ContentKind): string {
  return path.join(profile.directory, CONTENT_DIRS[kind])
}

/** Disabled files keep a `.disabled` suffix, matching the convention every loader understands. */
function disabledName(fileName: string): string {
  return `${fileName}.disabled`
}

async function resolveVersion(
  projectId: string,
  versionId: string | undefined,
  /** Undefined means "do not narrow" — see `InstallRequest.anyVersion`. */
  gameVersion: string | undefined,
  loader: LoaderId | undefined
): Promise<ProjectVersion> {
  const version = versionId
    ? await modrinth.getVersion(versionId)
    : await modrinth.bestVersion(projectId, gameVersion, loader)
  if (!version) throw new Error('Bu profil için uyumlu bir sürüm bulunamadı.')
  return version
}

export interface InstallRequest {
  profileId: string
  projectId: string
  versionId?: string
  kind: ContentKind
  name: string
  iconUrl?: string
  /** Install required dependencies too. Defaults to true. */
  withDependencies?: boolean
  /**
   * Modrinth project ids never to pull in as a dependency.
   *
   * Used where the caller has already installed a better build of that project
   * from somewhere else. Legacy Fabric API is the case in point: the profile
   * gets the per-version artifact from Legacy Fabric's own maven, and letting a
   * dependency drag in Modrinth's all-versions bundle alongside it puts the
   * game back in the state that would not start.
   */
  skipDependencies?: string[]
  /**
   * Ignore the profile's game version and loader when picking a version.
   *
   * Used when a modpack is installed into a profile made for it: the profile has
   * no version yet — the pack decides it — so filtering by the placeholder would
   * match nothing.
   */
  anyVersion?: boolean
}

/**
 * Installs a project into a profile, pulling in required dependencies. Modpacks
 * take a separate path because they rewrite the whole profile.
 */
export async function installContent(
  request: InstallRequest,
  onProgress: ProgressReporter
): Promise<InstalledContent[]> {
  const profile = store.profile(request.profileId)
  if (!profile) throw new Error('Profil bulunamadı.')

  const taskId = `install-${request.projectId}`
  onProgress({ id: taskId, label: `${request.name} kuruluyor`, progress: -1, state: 'running' })

  try {
    const version = await resolveVersion(
      request.projectId,
      request.versionId,
      request.anyVersion ? undefined : profile.gameVersion,
      request.anyVersion ? undefined : profile.loader
    )

    if (request.kind === 'modpack') {
      const installed = await installModpack(profile, version, request, onProgress)
      onProgress({ id: taskId, label: `${request.name} kuruldu`, progress: 1, state: 'done' })
      return installed
    }

    const queue: { projectId: string; version: ProjectVersion; name: string; required: boolean }[] = [
      { projectId: request.projectId, version, name: request.name, required: true }
    ]

    if (request.withDependencies !== false && request.kind === 'mod') {
      for (const dependency of version.dependencies.filter((entry) => entry.required && entry.projectId)) {
        if (request.skipDependencies?.includes(dependency.projectId!)) continue
        // A dependency already present in the profile does not need reinstalling.
        const already = profile.content.some((entry) => entry.projectId === dependency.projectId)
        if (already) continue

        try {
          const dependencyVersion = await resolveVersion(
            dependency.projectId!,
            dependency.versionId,
            profile.gameVersion,
            profile.loader
          )
          queue.push({
            projectId: dependency.projectId!,
            version: dependencyVersion,
            name: dependencyVersion.name,
            required: false
          })
        } catch {
          // A missing optional-in-practice dependency should not block the main install.
        }
      }
    }

    const targetDir = contentDir(profile, request.kind)
    await fsp.mkdir(targetDir, { recursive: true })

    await downloadAll(
      queue.map((entry) => ({
        url: entry.version.fileUrl,
        destination: path.join(targetDir, entry.version.fileName),
        sha1: entry.version.sha1,
        size: entry.version.fileSize
      })),
      {
        concurrency: store.settings.concurrentDownloads,
        onProgress: (completed, total, current) =>
          onProgress({
            id: taskId,
            label: `${request.name} kuruluyor`,
            progress: completed / total,
            detail: `${completed}/${total} · ${current}`,
            state: 'running'
          })
      }
    )

    const installed: InstalledContent[] = queue.map((entry) => ({
      id: `modrinth:${entry.projectId}`,
      source: 'modrinth',
      projectId: entry.projectId,
      versionId: entry.version.id,
      kind: request.kind,
      name: entry.name,
      fileName: entry.version.fileName,
      iconUrl: entry.required ? request.iconUrl : undefined,
      enabled: true,
      installedAt: Date.now()
    }))

    const merged = [...profile.content.filter((entry) => !installed.some((item) => item.id === entry.id)), ...installed]
    store.updateProfile(profile.id, { content: merged })

    onProgress({ id: taskId, label: `${request.name} kuruldu`, progress: 1, state: 'done' })
    return installed
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    onProgress({ id: taskId, label: `${request.name} kurulamadı`, progress: 0, state: 'error', error: message })
    throw error
  }
}

interface MrPackIndex {
  formatVersion: number
  name: string
  versionId: string
  dependencies: Record<string, string>
  files: {
    path: string
    hashes: { sha1: string }
    downloads: string[]
    fileSize: number
    env?: { client: string; server: string }
  }[]
}

/**
 * Installs a Modrinth `.mrpack` into the profile, switching the profile to the
 * loader and game version the pack requires.
 */
async function installModpack(
  profile: Profile,
  version: ProjectVersion,
  request: InstallRequest,
  onProgress: ProgressReporter
): Promise<InstalledContent[]> {
  const taskId = `install-${request.projectId}`
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'opbay-pack-'))
  const archive = path.join(workDir, version.fileName)

  try {
    onProgress({ id: taskId, label: `${request.name} indiriliyor`, progress: -1, state: 'running' })
    await downloadFile({ url: version.fileUrl, destination: archive, sha1: version.sha1, size: version.fileSize })

    const unpacked = path.join(workDir, 'unpacked')
    await extract(archive, { dir: unpacked })

    const mrpackIndex = path.join(unpacked, 'modrinth.index.json')
    if (!(await exists(mrpackIndex))) {
      throw new Error('Tanınmayan modpack biçimi: arşivde modrinth.index.json yok.')
    }
    return await applyMrPack(profile, unpacked, mrpackIndex, request, onProgress)
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true })
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file)
    return true
  } catch {
    return false
  }
}

/** Maps a pack's dependency block onto our loader ids. */
function loaderFromDependencies(dependencies: Record<string, string>): { loader: LoaderId; loaderVersion?: string } {
  if (dependencies['fabric-loader']) return { loader: 'fabric', loaderVersion: dependencies['fabric-loader'] }
  if (dependencies['quilt-loader']) return { loader: 'quilt', loaderVersion: dependencies['quilt-loader'] }
  if (dependencies.neoforge) return { loader: 'neoforge', loaderVersion: dependencies.neoforge }
  if (dependencies.forge) return { loader: 'forge', loaderVersion: dependencies.forge }
  return { loader: 'vanilla' }
}

async function applyMrPack(
  profile: Profile,
  unpacked: string,
  indexFile: string,
  request: InstallRequest,
  onProgress: ProgressReporter
): Promise<InstalledContent[]> {
  const taskId = `install-${request.projectId}`
  const index = JSON.parse(await fsp.readFile(indexFile, 'utf8')) as MrPackIndex

  const gameVersion = index.dependencies.minecraft
  const { loader, loaderVersion } = loaderFromDependencies(index.dependencies)

  const downloads = index.files
    .filter((file) => file.env?.client !== 'unsupported')
    .map((file) => ({
      // `path` is pack-relative and already includes mods/, resourcepacks/ etc.
      destination: path.join(profile.directory, ...file.path.split('/')),
      url: file.downloads[0],
      sha1: file.hashes.sha1,
      size: file.fileSize
    }))

  await downloadAll(downloads, {
    concurrency: store.settings.concurrentDownloads,
    onProgress: (completed, total, current) =>
      onProgress({
        id: taskId,
        label: `${index.name} kuruluyor`,
        progress: completed / total,
        detail: `${completed}/${total} · ${current}`,
        state: 'running'
      })
  })

  // `overrides/` carries configs, keybinds and sometimes worlds shipped with the pack.
  for (const overrideDir of ['overrides', 'client-overrides']) {
    const source = path.join(unpacked, overrideDir)
    if (await exists(source)) {
      await fsp.cp(source, profile.directory, { recursive: true, force: true })
    }
  }

  const installed: InstalledContent = {
    id: `modrinth:${request.projectId}`,
    source: 'modrinth',
    projectId: request.projectId,
    versionId: index.versionId,
    kind: 'modpack',
    name: index.name,
    fileName: `${index.name}-${index.versionId}`,
    iconUrl: request.iconUrl,
    enabled: true,
    installedAt: Date.now()
  }

  store.updateProfile(profile.id, {
    gameVersion,
    loader,
    loaderVersion,
    content: [...profile.content.filter((entry) => entry.id !== installed.id), installed]
  })
  return [installed]
}

export async function setContentEnabled(
  profileId: string,
  contentId: string,
  enabled: boolean
): Promise<InstalledContent> {
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')
  const entry = profile.content.find((item) => item.id === contentId)
  if (!entry) throw new Error('İçerik bulunamadı.')
  if (entry.enabled === enabled) return entry

  const dir = contentDir(profile, entry.kind)
  const from = path.join(dir, entry.enabled ? entry.fileName : disabledName(entry.fileName))
  const to = path.join(dir, enabled ? entry.fileName : disabledName(entry.fileName))
  await fsp.rename(from, to)

  entry.enabled = enabled
  store.updateProfile(profileId, { content: profile.content })
  return entry
}

export async function removeContent(profileId: string, contentId: string): Promise<void> {
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')
  const entry = profile.content.find((item) => item.id === contentId)
  if (!entry) return

  const dir = contentDir(profile, entry.kind)
  if (entry.kind === 'world') {
    await fsp.rm(path.join(dir, entry.fileName), { recursive: true, force: true })
  } else if (entry.kind !== 'modpack') {
    await fsp.rm(path.join(dir, entry.fileName), { force: true })
    await fsp.rm(path.join(dir, disabledName(entry.fileName)), { force: true })
  }

  store.updateProfile(profileId, { content: profile.content.filter((item) => item.id !== contentId) })
}

/** Flags every installed item that has a newer version for the profile's game/loader. */
export async function checkForUpdates(profileId: string): Promise<InstalledContent[]> {
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')

  await Promise.all(
    profile.content.map(async (entry) => {
      if (entry.source === 'local' || !entry.projectId) return
      try {
        const latest = await modrinth.bestVersion(entry.projectId, profile.gameVersion, profile.loader)
        entry.updateAvailable = latest && latest.id !== entry.versionId ? latest.id : undefined
      } catch {
        // Network hiccups should not clear a previously found update.
      }
    })
  )

  store.updateProfile(profileId, { content: profile.content })
  return profile.content
}

export async function updateContent(
  profileId: string,
  contentId: string,
  onProgress: ProgressReporter
): Promise<InstalledContent[]> {
  const profile = store.profile(profileId)
  const entry = profile?.content.find((item) => item.id === contentId)
  if (!profile || !entry || !entry.projectId || entry.source === 'local') {
    throw new Error('Bu içerik güncellenemiyor.')
  }

  await removeContent(profileId, contentId)
  return installContent(
    {
      profileId,
      projectId: entry.projectId,
      versionId: entry.updateAvailable,
      kind: entry.kind,
      name: entry.name,
      iconUrl: entry.iconUrl
    },
    onProgress
  )
}

/**
 * Imports a file the user picked from disk. Worlds arrive as zips and are
 * unpacked into `saves/`; everything else is copied as-is.
 */
export async function importLocalFile(
  profileId: string,
  filePath: string,
  kind: ContentKind
): Promise<InstalledContent> {
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')

  const targetDir = contentDir(profile, kind)
  await fsp.mkdir(targetDir, { recursive: true })

  const baseName = path.basename(filePath)
  let fileName = baseName

  if (kind === 'world') {
    fileName = await importWorld(filePath, targetDir)
  } else {
    await fsp.copyFile(filePath, path.join(targetDir, baseName))
  }

  const entry: InstalledContent = {
    id: `local:${await hashOf(filePath)}`,
    source: 'local',
    kind,
    name: fileName.replace(/\.(jar|zip)$/i, ''),
    fileName,
    enabled: true,
    installedAt: Date.now()
  }

  store.updateProfile(profileId, {
    content: [...profile.content.filter((item) => item.id !== entry.id), entry]
  })
  return entry
}

/** Content kinds that live as single files and can therefore be scanned for. */
const SCANNED: ContentKind[] = ['mod', 'resourcepack', 'shader', 'datapack']

/**
 * Makes the profile's content list match what is actually in its folders.
 *
 * Until now the list only knew about things installed one at a time. A modpack
 * wrote thirty jars into `mods/` and recorded a single "modpack" entry, so the
 * Modlar tab said 0 while the game happily loaded them — and files dropped into
 * the folder outside the launcher were invisible in the same way.
 *
 * Unknown files are identified by their SHA-1 against Modrinth, which gives
 * back the real project name and version rather than a file name, and makes
 * them eligible for update checks like anything else.
 */
export async function syncProfileContent(profileId: string): Promise<InstalledContent[]> {
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')

  const known = new Map(profile.content.map((entry) => [entry.fileName, entry]))
  const seen = new Set<string>()
  const unknown: { file: string; fileName: string; kind: ContentKind; enabled: boolean }[] = []

  for (const kind of SCANNED) {
    const directory = contentDir(profile, kind)
    const names = await fsp.readdir(directory).catch(() => [] as string[])

    for (const fileName of names) {
      if (!/\.(jar|zip)(\.disabled)?$/i.test(fileName)) continue
      seen.add(fileName)
      if (known.has(fileName)) continue
      unknown.push({
        file: path.join(directory, fileName),
        fileName,
        kind,
        enabled: !fileName.endsWith('.disabled')
      })
    }
  }

  const added: InstalledContent[] = []
  if (unknown.length > 0) {
    const hashes = await Promise.all(unknown.map((entry) => fileSha1(entry.file).catch(() => '')))
    const matches = await modrinth.versionsByHash(hashes.filter(Boolean))
    const projects = await modrinth
      .getProjects([...new Set([...matches.values()].map((match) => match.projectId))])
      .catch(() => [])
    const titles = new Map(projects.map((project) => [project.id, project.title]))

    for (const [index, entry] of unknown.entries()) {
      const match = hashes[index] ? matches.get(hashes[index]) : undefined
      added.push({
        // Falling back to the hash keeps the id stable across renames; falling
        // back to the file name keeps it unique when even hashing failed.
        id: match ? `modrinth:${match.projectId}` : `local:${hashes[index] || entry.fileName}`,
        source: match ? 'modrinth' : 'local',
        projectId: match?.projectId,
        versionId: match?.versionId,
        kind: entry.kind,
        name: (match && titles.get(match.projectId)) ?? entry.fileName.replace(/\.(jar|zip)(\.disabled)?$/i, ''),
        fileName: entry.fileName,
        enabled: entry.enabled,
        installedAt: Date.now()
      })
    }
  }

  // A modpack entry stands for the pack as a whole and has no file of its own,
  // so it is never dropped for being missing from disk.
  const surviving = profile.content.filter(
    (entry) => entry.kind === 'modpack' || entry.kind === 'world' || seen.has(entry.fileName)
  )

  const merged = [...surviving.filter((entry) => !added.some((item) => item.id === entry.id)), ...added]
  if (merged.length !== profile.content.length || added.length > 0) {
    store.updateProfile(profileId, { content: merged })
  }
  return merged
}

/**
 * Works out what a dropped file is, so the player does not have to say.
 *
 * Jars are mods. Zips are the ambiguous ones — resource pack, data pack, shader
 * pack and world all share the extension — so the archive itself is asked:
 * `level.dat` means a world, a `shaders/` folder means a shader pack, and
 * `pack.mcmeta` alongside `data/` is a data pack rather than a resource pack.
 */
export async function inferKind(filePath: string): Promise<ContentKind> {
  if (/\.jar$/i.test(filePath)) return 'mod'
  if (!/\.zip$/i.test(filePath)) return 'mod'

  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'opbay-sniff-'))
  try {
    await extract(filePath, { dir: staging })

    const names = await fsp.readdir(staging)
    // A single wrapper folder is common in every one of these formats.
    const root =
      names.length === 1 && (await fsp.stat(path.join(staging, names[0]))).isDirectory()
        ? path.join(staging, names[0])
        : staging

    if (await exists(path.join(root, 'level.dat'))) return 'world'
    if (await exists(path.join(root, 'shaders'))) return 'shader'
    if (await exists(path.join(root, 'data'))) return 'datapack'
    return 'resourcepack'
  } catch {
    // Unreadable archive: let the copy fail later with a clearer message than
    // anything guessed here would produce.
    return 'resourcepack'
  } finally {
    await fsp.rm(staging, { recursive: true, force: true })
  }
}

async function hashOf(filePath: string): Promise<string> {
  try {
    return (await fileSha1(filePath)).slice(0, 16)
  } catch {
    return path.basename(filePath)
  }
}

/**
 * Unpacks a world zip into `saves/`. Archives may or may not contain a top-level
 * folder, so the level.dat location decides where the world root actually is.
 */
async function importWorld(zipPath: string, savesDir: string): Promise<string> {
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'opbay-world-'))
  try {
    await extract(zipPath, { dir: staging })

    let worldRoot = staging
    if (!(await exists(path.join(staging, 'level.dat')))) {
      const entries = await fsp.readdir(staging, { withFileTypes: true })
      const directories = entries.filter((entry) => entry.isDirectory())
      if (directories.length === 0) throw new Error('Arşivde bir dünya klasörü bulunamadı (level.dat yok).')

      let match = directories[0].name
      for (const directory of directories) {
        if (await exists(path.join(staging, directory.name, 'level.dat'))) {
          match = directory.name
          break
        }
      }
      worldRoot = path.join(staging, match)
    }
    if (!(await exists(path.join(worldRoot, 'level.dat')))) {
      throw new Error('Arşiv geçerli bir Minecraft dünyası içermiyor (level.dat yok).')
    }

    let folderName = path.basename(zipPath).replace(/\.zip$/i, '')
    let destination = path.join(savesDir, folderName)
    let suffix = 2
    while (await exists(destination)) {
      folderName = `${path.basename(zipPath).replace(/\.zip$/i, '')} (${suffix++})`
      destination = path.join(savesDir, folderName)
    }

    await fsp.cp(worldRoot, destination, { recursive: true })
    return folderName
  } finally {
    await fsp.rm(staging, { recursive: true, force: true })
  }
}

export interface WorldSummary {
  folderName: string
  displayName: string
  lastPlayed?: number
  sizeMb: number
}

/** Lists the worlds present in a profile's `saves/` directory. */
export async function listWorlds(profileId: string): Promise<WorldSummary[]> {
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')

  const savesDir = path.join(profile.directory, 'saves')
  let entries: string[]
  try {
    entries = await fsp.readdir(savesDir)
  } catch {
    return []
  }

  const worlds: WorldSummary[] = []
  for (const folderName of entries) {
    const levelDat = path.join(savesDir, folderName, 'level.dat')
    if (!(await exists(levelDat))) continue
    const stat = await fsp.stat(levelDat)
    worlds.push({
      folderName,
      displayName: folderName,
      lastPlayed: stat.mtimeMs,
      sizeMb: Math.round((await directorySize(path.join(savesDir, folderName))) / 1e6)
    })
  }
  return worlds.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
}

async function directorySize(dir: string): Promise<number> {
  let total = 0
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += await directorySize(full)
    else total += (await fsp.stat(full)).size
  }
  return total
}
