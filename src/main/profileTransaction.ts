import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Profile, TaskProgress } from '../shared/types'
import { requireProfileDirectory } from './pathSafety'
import { store } from './store'

interface TransactionManifest {
  schemaVersion: 1
  state: 'ready' | 'committed'
  profile: Profile
  hadFiles: boolean
}

const activeProfiles = new Set<string>()

function transactionsRoot(): string {
  return path.join(store.settings.dataDir, '.pisankus-transactions')
}

async function exists(file: string): Promise<boolean> {
  return fsp.access(file).then(() => true, () => false)
}

async function writeManifest(root: string, manifest: TransactionManifest): Promise<void> {
  const file = path.join(root, 'manifest.json')
  const temp = `${file}.tmp`
  await fsp.writeFile(temp, JSON.stringify(manifest, null, 2), { mode: 0o600 })
  await fsp.rename(temp, file)
}

async function restore(root: string, manifest: TransactionManifest): Promise<void> {
  const directory = requireProfileDirectory(manifest.profile.directory)
  const profilesRoot = path.resolve(store.settings.dataDir, 'profiles')
  const relative = path.relative(profilesRoot, directory)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Geri alma kaydı bu veri klasörüne ait değil.')
  }
  await fsp.rm(directory, { recursive: true, force: true })

  if (manifest.hadFiles) {
    const snapshot = path.join(root, 'profile')
    if (!(await exists(snapshot))) throw new Error('Geri alma kopyası eksik.')
    await fsp.mkdir(path.dirname(directory), { recursive: true })
    await fsp.rename(snapshot, directory)
  } else {
    await fsp.mkdir(directory, { recursive: true })
  }
  store.restoreProfile(manifest.profile)
}

/**
 * Runs a profile mutation behind a durable snapshot. A power loss leaves a
 * `ready` journal which is restored on the next launcher start; a committed
 * journal is only leftover cleanup and is discarded.
 */
export async function withProfileRollback<T>(
  profileId: string,
  label: string,
  operation: () => Promise<T>,
  onProgress?: (task: TaskProgress) => void
): Promise<T> {
  if (activeProfiles.has(profileId)) {
    throw new Error('Bu profilde başka bir kurulum işlemi hâlâ devam ediyor.')
  }

  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')
  activeProfiles.add(profileId)

  const taskId = `rollback-${profileId}`
  let root: string | undefined
  let manifest: TransactionManifest | undefined
  let rolledBack = false
  let cleanupRoot = true

  try {
    const base = transactionsRoot()
    await fsp.mkdir(base, { recursive: true })
    root = await fsp.mkdtemp(path.join(base, `${profileId}-`))
    const snapshot = path.join(root, 'profile')
    const hadFiles = await exists(profile.directory)
    manifest = {
      schemaVersion: 1,
      state: 'ready',
      profile: structuredClone(profile),
      hadFiles
    }

    onProgress?.({ id: taskId, label: 'Geri alma noktası oluşturuluyor', progress: -1, detail: label, state: 'running' })
    if (hadFiles) await fsp.cp(profile.directory, snapshot, { recursive: true, preserveTimestamps: true })
    await writeManifest(root, manifest)

    const result = await operation()
    manifest.state = 'committed'
    await writeManifest(root, manifest)
    onProgress?.({ id: taskId, label: 'Geri alma noktası tamamlandı', progress: 1, detail: label, state: 'done' })
    return result
  } catch (error) {
    try {
      if (root && manifest && await exists(path.join(root, 'manifest.json'))) {
        await restore(root, manifest)
        rolledBack = true
      }
    } catch (rollbackError) {
      cleanupRoot = false
      const original = error instanceof Error ? error.message : String(error)
      const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      onProgress?.({
        id: taskId,
        label: 'Otomatik geri alma başarısız',
        progress: 0,
        detail: label,
        state: 'error',
        error: rollback
      })
      throw new Error(
        `${original} Ayrıca geri alma başarısız oldu: ${rollback}. ` +
          `Kurtarma kopyası korundu: ${root ?? 'bilinmeyen konum'}`
      )
    }
    const message = error instanceof Error ? error.message : String(error)
    onProgress?.(
      rolledBack
        ? { id: taskId, label: 'Değişiklikler geri alındı', progress: 1, detail: label, state: 'done' }
        : { id: taskId, label: 'Geri alma noktası oluşturulamadı', progress: 0, detail: label, state: 'error', error: message }
    )
    throw new Error(rolledBack ? `${message} Profil işlem öncesi hâline geri alındı.` : message)
  } finally {
    activeProfiles.delete(profileId)
    if (root && cleanupRoot) await fsp.rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Restores transactions interrupted after the snapshot but before commit. */
export async function recoverInterruptedTransactions(): Promise<number> {
  const root = transactionsRoot()
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
  let restored = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const transaction = path.join(root, entry.name)
    let manifest: TransactionManifest
    try {
      manifest = JSON.parse(
        await fsp.readFile(path.join(transaction, 'manifest.json'), 'utf8')
      ) as TransactionManifest
    } catch {
      // No complete manifest means the snapshot itself never finished and no
      // profile mutation was allowed to begin.
      await fsp.rm(transaction, { recursive: true, force: true }).catch(() => undefined)
      continue
    }

    if (manifest.schemaVersion === 1 && manifest.state === 'ready') {
      try {
        await restore(transaction, manifest)
        restored++
      } catch {
        // Keep the only known-good copy for manual recovery instead of deleting
        // it after a failed automatic restore.
        continue
      }
    }
    await fsp.rm(transaction, { recursive: true, force: true }).catch(() => undefined)
  }
  return restored
}
