import { app, dialog, type BrowserWindow } from 'electron'
import fsp from 'node:fs/promises'
import path from 'node:path'
import * as tar from 'tar'
import type { ContentKind, InstalledContent, LoaderId, Profile } from '../shared/types'
import { requireLeafName, resolveInside } from './pathSafety'
import { store } from './store'

const ARCHIVE_SCHEMA = 1
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 200_000
const LOADERS = new Set<LoaderId>(['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'])
const CONTENT_KINDS = new Set<ContentKind>(['mod', 'resourcepack', 'shader', 'datapack', 'world', 'modpack'])

interface PortableProfile {
  name: string
  gameVersion: string
  loader: LoaderId
  loaderVersion?: string
  icon?: string
  iconImage?: string
  memoryMb: number
  javaPath?: string
  jvmArgs?: string
  resolution?: { width: number; height: number }
  content: InstalledContent[]
  lastPlayed?: number
  totalPlaytimeMs: number
}

interface ProfileManifest {
  schemaVersion: 1
  kind: 'opbay-profile'
  exportedAt: number
  profile: PortableProfile
}

interface WorldManifest {
  schemaVersion: 1
  kind: 'opbay-world'
  exportedAt: number
  folderName: string
  displayName: string
  gameVersion: string
}

interface TarEntryLike {
  path: string
  size: number
  type: string
}

function safeFileStem(value: string): string {
  return value.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim().replace(/\s+/g, '-') || 'opbay-yedek'
}

async function exists(file: string): Promise<boolean> {
  return fsp.access(file).then(() => true, () => false)
}

async function uniqueDirectory(parent: string, requested: string): Promise<string> {
  const stem = safeFileStem(requested)
  let candidate = path.join(parent, stem)
  let suffix = 2
  while (await exists(candidate)) candidate = path.join(parent, `${stem}-${suffix++}`)
  return candidate
}

async function temporaryDirectory(prefix: string): Promise<string> {
  return fsp.mkdtemp(path.join(app.getPath('temp'), prefix))
}

async function createArchive(staging: string, destination: string, entries: string[]): Promise<void> {
  await tar.c(
    {
      cwd: staging,
      file: destination,
      gzip: true,
      portable: true,
      // Never let a user-created link pull files from outside the profile into
      // an export. Links are also rejected on import.
      filter: (_entryPath, entry) =>
        'isSymbolicLink' in entry
          ? !entry.isSymbolicLink()
          : entry.type !== 'SymbolicLink' && entry.type !== 'Link'
    },
    entries
  )
}

async function validateArchive(file: string, expectedRoot: 'profile' | 'world'): Promise<void> {
  const validationRoot = path.join(app.getPath('temp'), 'opbay-archive-validation')
  let expanded = 0
  let entries = 0
  let invalid: Error | null = null
  let hasManifest = false
  let hasPayload = false

  await tar.t({
    file,
    strict: true,
    onentry: (entry: TarEntryLike) => {
      if (invalid) return
      try {
        entries++
        expanded += entry.size
        if (entries > MAX_ARCHIVE_ENTRIES) throw new Error('Arşiv çok fazla dosya içeriyor.')
        if (expanded > MAX_ARCHIVE_BYTES) throw new Error('Arşiv açıldığında 20 GB sınırını aşıyor.')
        if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
          throw new Error('Yedek arşivi bağlantı içeremez.')
        }
        const portable = entry.path.replace(/\\/g, '/')
        resolveInside(validationRoot, portable, 'Yedek girdisi')
        const normalized = portable
          .split('/')
          .filter((segment) => segment && segment !== '.')
          .join('/')
        if (normalized === 'manifest.json') hasManifest = true
        if (normalized === expectedRoot || normalized.startsWith(`${expectedRoot}/`)) hasPayload = true
        if (
          normalized !== 'manifest.json' &&
          normalized !== expectedRoot &&
          !normalized.startsWith(`${expectedRoot}/`)
        ) {
          throw new Error(`Yedek beklenmeyen bir girdi içeriyor: ${normalized}`)
        }
      } catch (error) {
        invalid = error instanceof Error ? error : new Error(String(error))
      }
    }
  })

  if (invalid) throw invalid
  if (!hasManifest || !hasPayload) throw new Error('Bu dosya geçerli bir Opbay yedeği değil.')
}

async function extractArchive(file: string, expectedRoot: 'profile' | 'world'): Promise<string> {
  await validateArchive(file, expectedRoot)
  const staging = await temporaryDirectory('opbay-import-')
  try {
    await tar.x({ file, cwd: staging, strict: true, preservePaths: false })
    return staging
  } catch (error) {
    await fsp.rm(staging, { recursive: true, force: true })
    throw error
  }
}

function portableProfile(profile: Profile): PortableProfile {
  return {
    name: profile.name,
    gameVersion: profile.gameVersion,
    loader: profile.loader,
    loaderVersion: profile.loaderVersion,
    icon: profile.icon,
    iconImage: profile.iconImage,
    memoryMb: profile.memoryMb,
    javaPath: profile.javaPath,
    jvmArgs: profile.jvmArgs,
    resolution: profile.resolution,
    content: structuredClone(profile.content),
    lastPlayed: profile.lastPlayed,
    totalPlaytimeMs: profile.totalPlaytimeMs
  }
}

function optionalString(value: unknown, max = 4_096): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseContent(value: unknown): InstalledContent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): InstalledContent[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const item = candidate as Partial<InstalledContent>
    if (
      typeof item.id !== 'string' ||
      (item.source !== 'modrinth' && item.source !== 'local') ||
      !item.kind ||
      !CONTENT_KINDS.has(item.kind) ||
      typeof item.name !== 'string' ||
      typeof item.fileName !== 'string'
    ) return []
    return [{
      id: item.id.slice(0, 300),
      source: item.source,
      projectId: optionalString(item.projectId, 300),
      versionId: optionalString(item.versionId, 300),
      kind: item.kind,
      name: item.name.slice(0, 300),
      fileName: path.basename(item.fileName).slice(0, 300),
      iconUrl: optionalString(item.iconUrl, 2_048),
      updateAvailable: optionalString(item.updateAvailable, 300),
      enabled: item.enabled !== false,
      installedAt: finiteNumber(item.installedAt, Date.now())
    }]
  })
}

function parseProfileManifest(value: unknown): PortableProfile {
  if (!value || typeof value !== 'object') throw new Error('Profil yedeğinin manifest dosyası geçersiz.')
  const manifest = value as Partial<ProfileManifest>
  if (manifest.schemaVersion !== ARCHIVE_SCHEMA || manifest.kind !== 'opbay-profile') {
    throw new Error('Bu dosya desteklenen bir Opbay profil yedeği değil.')
  }
  const input = manifest.profile as Partial<PortableProfile> | undefined
  if (!input || typeof input.name !== 'string' || typeof input.gameVersion !== 'string' || !input.loader || !LOADERS.has(input.loader)) {
    throw new Error('Profil yedeğinde gerekli bilgiler eksik.')
  }
  const resolution = input.resolution
  return {
    name: input.name.trim().slice(0, 120) || 'İçe aktarılan profil',
    gameVersion: input.gameVersion.trim().slice(0, 80),
    loader: input.loader,
    loaderVersion: optionalString(input.loaderVersion, 120),
    icon: optionalString(input.icon, 16),
    iconImage: typeof input.iconImage === 'string' && input.iconImage.startsWith('data:image/') && input.iconImage.length <= 2_000_000
      ? input.iconImage
      : undefined,
    memoryMb: Math.max(512, Math.min(65_536, Math.round(finiteNumber(input.memoryMb, store.settings.defaultMemoryMb)))),
    javaPath: optionalString(input.javaPath),
    jvmArgs: optionalString(input.jvmArgs, 16_384),
    resolution: resolution && Number.isFinite(resolution.width) && Number.isFinite(resolution.height)
      ? {
          width: Math.max(320, Math.min(16_384, Math.round(resolution.width))),
          height: Math.max(240, Math.min(8_640, Math.round(resolution.height)))
        }
      : undefined,
    content: parseContent(input.content),
    lastPlayed: typeof input.lastPlayed === 'number' ? input.lastPlayed : undefined,
    totalPlaytimeMs: Math.max(0, finiteNumber(input.totalPlaytimeMs, 0))
  }
}

export async function exportProfile(window: BrowserWindow, profile: Profile): Promise<string | null> {
  const result = await dialog.showSaveDialog(window, {
    title: 'Profil yedeğini dışa aktar',
    defaultPath: `${safeFileStem(profile.name)}.opbay-profile.tgz`,
    filters: [{ name: 'Opbay profil yedeği', extensions: ['tgz'] }]
  })
  if (result.canceled || !result.filePath) return null

  const staging = await temporaryDirectory('opbay-profile-export-')
  try {
    await fsp.cp(profile.directory, path.join(staging, 'profile'), { recursive: true, preserveTimestamps: true })
    const manifest: ProfileManifest = {
      schemaVersion: ARCHIVE_SCHEMA,
      kind: 'opbay-profile',
      exportedAt: Date.now(),
      profile: portableProfile(profile)
    }
    await fsp.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2))
    await createArchive(staging, result.filePath, ['manifest.json', 'profile'])
    return result.filePath
  } finally {
    await fsp.rm(staging, { recursive: true, force: true })
  }
}

export async function importProfile(window: BrowserWindow): Promise<Profile | null> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Profil yedeğini içe aktar',
    properties: ['openFile'],
    filters: [{ name: 'Opbay profil yedeği', extensions: ['tgz'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null

  const staging = await extractArchive(result.filePaths[0], 'profile')
  let destination: string | null = null
  let createdId: string | null = null
  try {
    const manifest = parseProfileManifest(
      JSON.parse(await fsp.readFile(path.join(staging, 'manifest.json'), 'utf8')) as unknown
    )
    const profilesDir = path.join(store.settings.dataDir, 'profiles')
    await fsp.mkdir(profilesDir, { recursive: true })
    destination = await uniqueDirectory(profilesDir, manifest.name)
    await fsp.cp(path.join(staging, 'profile'), destination, { recursive: true, preserveTimestamps: true })

    const created = store.addProfile({
      name: manifest.name,
      gameVersion: manifest.gameVersion,
      loader: manifest.loader,
      loaderVersion: manifest.loaderVersion,
      icon: manifest.icon,
      iconImage: manifest.iconImage,
      directory: destination,
      memoryMb: manifest.memoryMb,
      javaPath: manifest.javaPath,
      jvmArgs: manifest.jvmArgs,
      resolution: manifest.resolution,
      lastPlayed: manifest.lastPlayed
    })
    createdId = created.id
    return store.updateProfile(created.id, {
      content: manifest.content,
      totalPlaytimeMs: manifest.totalPlaytimeMs
    })
  } catch (error) {
    if (createdId) store.removeProfile(createdId)
    if (destination) await fsp.rm(destination, { recursive: true, force: true })
    throw error
  } finally {
    await fsp.rm(staging, { recursive: true, force: true })
  }
}

export async function exportWorld(
  window: BrowserWindow,
  profile: Profile,
  folderName: string,
  displayName: string
): Promise<string | null> {
  const leaf = requireLeafName(folderName, 'Dünya klasörü')
  const source = resolveInside(path.join(profile.directory, 'saves'), leaf, 'Dünya klasörü')
  if (!(await exists(source))) throw new Error('Dünya klasörü bulunamadı.')

  const result = await dialog.showSaveDialog(window, {
    title: 'Dünya yedeğini dışa aktar',
    defaultPath: `${safeFileStem(displayName)}.opbay-world.tgz`,
    filters: [{ name: 'Opbay dünya yedeği', extensions: ['tgz'] }]
  })
  if (result.canceled || !result.filePath) return null

  const staging = await temporaryDirectory('opbay-world-export-')
  try {
    await fsp.cp(source, path.join(staging, 'world'), { recursive: true, preserveTimestamps: true })
    const manifest: WorldManifest = {
      schemaVersion: ARCHIVE_SCHEMA,
      kind: 'opbay-world',
      exportedAt: Date.now(),
      folderName: leaf,
      displayName: displayName.slice(0, 300),
      gameVersion: profile.gameVersion
    }
    await fsp.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2))
    await createArchive(staging, result.filePath, ['manifest.json', 'world'])
    return result.filePath
  } finally {
    await fsp.rm(staging, { recursive: true, force: true })
  }
}

export async function importWorld(window: BrowserWindow, profile: Profile): Promise<string | null> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Dünya yedeğini içe aktar',
    properties: ['openFile'],
    filters: [{ name: 'Opbay dünya yedeği', extensions: ['tgz'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null

  const staging = await extractArchive(result.filePaths[0], 'world')
  try {
    const value = JSON.parse(await fsp.readFile(path.join(staging, 'manifest.json'), 'utf8')) as Partial<WorldManifest>
    if (value.schemaVersion !== ARCHIVE_SCHEMA || value.kind !== 'opbay-world' || typeof value.folderName !== 'string') {
      throw new Error('Bu dosya desteklenen bir Opbay dünya yedeği değil.')
    }
    const saves = path.join(profile.directory, 'saves')
    await fsp.mkdir(saves, { recursive: true })
    const destination = await uniqueDirectory(saves, requireLeafName(value.folderName, 'Dünya klasörü'))
    await fsp.cp(path.join(staging, 'world'), destination, { recursive: true, preserveTimestamps: true })
    return path.basename(destination)
  } finally {
    await fsp.rm(staging, { recursive: true, force: true })
  }
}
