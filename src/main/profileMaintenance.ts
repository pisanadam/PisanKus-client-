import { randomUUID } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type {
  Profile,
  ProfileHistoryEntry,
  ProfileHistoryKind,
  ProfileSafeModeState,
  ProfileStorageCategory,
  ProfileStorageReport
} from '../shared/types'
import { setContentEnabled } from './content/install'
import { requireProfileDirectory, resolveInside } from './pathSafety'
import { store } from './store'

const MAX_HISTORY = 200
const CLEANABLE = new Set<ProfileStorageCategory>(['logs', 'crashes', 'cache'])

function internalFile(profile: Profile, name: string): string {
  return resolveInside(path.join(requireProfileDirectory(profile.directory), '.pisankus'), name)
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8')
  await fsp.rename(temporary, file)
}

export async function listProfileHistory(profile: Profile): Promise<ProfileHistoryEntry[]> {
  try {
    const value = JSON.parse(await fsp.readFile(internalFile(profile, 'history.json'), 'utf8')) as unknown
    if (!Array.isArray(value)) return []
    return value
      .filter((entry): entry is ProfileHistoryEntry => Boolean(
        entry && typeof entry === 'object' &&
        typeof (entry as ProfileHistoryEntry).id === 'string' &&
        typeof (entry as ProfileHistoryEntry).at === 'number' &&
        typeof (entry as ProfileHistoryEntry).title === 'string'
      ))
      .slice(0, MAX_HISTORY)
  } catch {
    return []
  }
}

export async function recordProfileHistory(
  profile: Profile,
  kind: ProfileHistoryKind,
  title: string,
  detail?: string,
  contentId?: string
): Promise<ProfileHistoryEntry> {
  const entry: ProfileHistoryEntry = {
    id: randomUUID(),
    at: Date.now(),
    kind,
    title: title.slice(0, 300),
    detail: detail?.slice(0, 1_000),
    contentId
  }
  const history = await listProfileHistory(profile)
  await writeJsonAtomic(internalFile(profile, 'history.json'), [entry, ...history].slice(0, MAX_HISTORY))
  return entry
}

async function usage(target: string): Promise<{ bytes: number; fileCount: number }> {
  let bytes = 0
  let fileCount = 0
  const queue = [target]
  while (queue.length > 0) {
    const current = queue.pop()!
    let stat
    try {
      stat = await fsp.lstat(current)
    } catch {
      continue
    }
    if (stat.isSymbolicLink()) continue
    if (stat.isFile()) {
      bytes += stat.size
      fileCount++
      continue
    }
    if (!stat.isDirectory()) continue
    const children = await fsp.readdir(current).catch(() => [] as string[])
    for (const child of children) queue.push(path.join(current, child))
  }
  return { bytes, fileCount }
}

const STORAGE_PATHS: Record<ProfileStorageCategory, string[]> = {
  mods: ['mods'],
  resourcepacks: ['resourcepacks'],
  shaders: ['shaderpacks'],
  worlds: ['saves'],
  screenshots: ['screenshots'],
  logs: ['logs'],
  crashes: ['crash-reports', '.pisankus/crashes'],
  cache: ['.pisankus/transactions', '.pisankus/cache']
}

export async function inspectProfileStorage(profile: Profile): Promise<ProfileStorageReport> {
  const root = requireProfileDirectory(profile.directory)
  const entries = await Promise.all(
    (Object.keys(STORAGE_PATHS) as ProfileStorageCategory[]).map(async (category) => {
      const sizes = await Promise.all(
        STORAGE_PATHS[category].map((relative) => usage(resolveInside(root, relative)))
      )
      // JVM fatal logs live at the profile root instead of in crash-reports.
      if (category === 'crashes') {
        const names = await fsp.readdir(root).catch(() => [] as string[])
        for (const name of names.filter((candidate) => /^hs_err_pid\d+\.log$/i.test(candidate))) {
          sizes.push(await usage(resolveInside(root, name)))
        }
      }
      return {
        category,
        bytes: sizes.reduce((sum, item) => sum + item.bytes, 0),
        fileCount: sizes.reduce((sum, item) => sum + item.fileCount, 0),
        cleanable: CLEANABLE.has(category)
      }
    })
  )
  return {
    checkedAt: Date.now(),
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    entries
  }
}

export async function cleanProfileStorage(
  profile: Profile,
  categories: ProfileStorageCategory[],
  trashItem: (target: string) => Promise<void>
): Promise<ProfileStorageReport> {
  const root = requireProfileDirectory(profile.directory)
  const requested = [...new Set(categories)]
  if (requested.some((category) => !CLEANABLE.has(category))) {
    throw new Error('Bu depolama kategorisi güvenli temizlik için uygun değil.')
  }

  for (const category of requested) {
    for (const relative of STORAGE_PATHS[category]) {
      const target = resolveInside(root, relative)
      try {
        await fsp.access(target)
        await trashItem(target)
      } catch {
        // Missing paths are already clean. A trash failure is re-thrown only
        // when the path still exists, so permission errors remain visible.
        try {
          await fsp.access(target)
          throw new Error(`${relative} çöp kutusuna taşınamadı.`)
        } catch (error) {
          if (error instanceof Error && error.message.endsWith('taşınamadı.')) throw error
        }
      }
    }
    if (category === 'crashes') {
      const names = await fsp.readdir(root).catch(() => [] as string[])
      for (const name of names.filter((candidate) => /^hs_err_pid\d+\.log$/i.test(candidate))) {
        await trashItem(resolveInside(root, name))
      }
    }
  }

  await recordProfileHistory(
    profile,
    'storage-cleaned',
    'Gereksiz dosyalar temizlendi',
    requested.join(', ')
  )
  return inspectProfileStorage(profile)
}

export async function getSafeModeState(profile: Profile): Promise<ProfileSafeModeState> {
  try {
    const value = JSON.parse(await fsp.readFile(internalFile(profile, 'safe-mode.json'), 'utf8')) as Partial<ProfileSafeModeState>
    return {
      active: value.active === true,
      enabledAt: typeof value.enabledAt === 'number' ? value.enabledAt : undefined,
      disabledContentIds: Array.isArray(value.disabledContentIds)
        ? value.disabledContentIds.filter((id): id is string => typeof id === 'string')
        : []
    }
  } catch {
    return { active: false, disabledContentIds: [] }
  }
}

export async function enableSafeMode(profileId: string): Promise<ProfileSafeModeState> {
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')
  const existing = await getSafeModeState(profile)
  if (existing.active) return existing

  const candidates = profile.content.filter(
    (entry) => entry.enabled && (entry.kind === 'mod' || entry.kind === 'shader' || entry.kind === 'resourcepack')
  )
  const disabled: string[] = []
  try {
    for (const entry of candidates) {
      await setContentEnabled(profileId, entry.id, false)
      disabled.push(entry.id)
    }
  } catch (error) {
    for (const id of disabled.reverse()) await setContentEnabled(profileId, id, true).catch(() => undefined)
    throw error
  }

  const state: ProfileSafeModeState = { active: true, enabledAt: Date.now(), disabledContentIds: disabled }
  await writeJsonAtomic(internalFile(profile, 'safe-mode.json'), state)
  await recordProfileHistory(profile, 'safe-mode-enabled', 'Güvenli mod açıldı', `${disabled.length} içerik geçici olarak kapatıldı`)
  return state
}

export async function restoreSafeMode(profileId: string): Promise<ProfileSafeModeState> {
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')
  const state = await getSafeModeState(profile)
  if (!state.active) return state

  let restored = 0
  for (const id of state.disabledContentIds) {
    const current = store.profile(profileId)?.content.find((entry) => entry.id === id)
    if (!current || current.enabled) continue
    await setContentEnabled(profileId, id, true)
    restored++
  }
  const cleared: ProfileSafeModeState = { active: false, disabledContentIds: [] }
  await writeJsonAtomic(internalFile(profile, 'safe-mode.json'), cleared)
  await recordProfileHistory(profile, 'safe-mode-restored', 'Güvenli mod geri alındı', `${restored} içerik yeniden açıldı`)
  return cleared
}

export async function setManyContentEnabled(
  profileId: string,
  contentIds: string[],
  enabled: boolean
): Promise<void> {
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')
  const ids = [...new Set(contentIds)].filter((id) => profile.content.some((entry) => entry.id === id))
  const changed: string[] = []
  try {
    for (const id of ids) {
      const entry = store.profile(profileId)?.content.find((candidate) => candidate.id === id)
      if (!entry || entry.enabled === enabled) continue
      await setContentEnabled(profileId, id, enabled)
      changed.push(id)
    }
  } catch (error) {
    for (const id of changed.reverse()) await setContentEnabled(profileId, id, !enabled).catch(() => undefined)
    throw error
  }
  if (changed.length > 0) {
    await recordProfileHistory(
      profile,
      enabled ? 'content-enabled' : 'content-disabled',
      enabled ? `${changed.length} içerik etkinleştirildi` : `${changed.length} içerik devre dışı bırakıldı`
    )
  }
}
