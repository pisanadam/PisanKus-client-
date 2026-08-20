import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Profile } from '../shared/types'
import { requireLeafName, resolveInside } from './pathSafety'

const KEEP_PER_WORLD = 5

export interface AutoWorldBackupSummary {
  folderName: string
  backupId: string
  createdAt: number
}

function root(profile: Profile): string {
  return path.join(profile.directory, '.pisankus', 'world-backups')
}

async function worldFolders(profile: Profile): Promise<string[]> {
  const saves = path.join(profile.directory, 'saves')
  const entries = await fsp.readdir(saves, { withFileTypes: true }).catch(() => [])
  const folders: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const folder = requireLeafName(entry.name, 'Dünya klasörü')
    if (await fsp.access(path.join(saves, folder, 'level.dat')).then(() => true).catch(() => false)) folders.push(folder)
  }
  return folders
}

async function prune(worldBackupDir: string): Promise<void> {
  const names = (await fsp.readdir(worldBackupDir).catch(() => [] as string[]))
    .filter((name) => /^\d+$/.test(name))
    .sort((a, b) => Number(b) - Number(a))
  await Promise.all(names.slice(KEEP_PER_WORLD).map((name) => fsp.rm(path.join(worldBackupDir, name), { recursive: true, force: true })))
}

async function backupWorld(profile: Profile, folderName: string): Promise<void> {
  const folder = requireLeafName(folderName, 'Dünya klasörü')
  const source = resolveInside(path.join(profile.directory, 'saves'), folder, 'Dünya klasörü')
  const targetRoot = resolveInside(root(profile), folder, 'Yedek klasörü')
  await fsp.mkdir(targetRoot, { recursive: true })
  const backupId = String(Date.now())
  await fsp.cp(source, path.join(targetRoot, backupId), { recursive: true, preserveTimestamps: true })
  await prune(targetRoot)
}

export async function createAutomaticWorldBackups(profile: Profile): Promise<number> {
  const folders = await worldFolders(profile)
  for (const folder of folders) await backupWorld(profile, folder)
  return folders.length
}

export async function listAutomaticWorldBackups(profile: Profile): Promise<AutoWorldBackupSummary[]> {
  const backups: AutoWorldBackupSummary[] = []
  for (const folderName of await fsp.readdir(root(profile)).catch(() => [] as string[])) {
    const folder = requireLeafName(folderName, 'Dünya klasörü')
    const backupRoot = resolveInside(root(profile), folder, 'Yedek klasörü')
    for (const backupId of await fsp.readdir(backupRoot).catch(() => [] as string[])) {
      if (!/^\d+$/.test(backupId)) continue
      backups.push({ folderName: folder, backupId, createdAt: Number(backupId) })
    }
  }
  return backups.sort((a, b) => b.createdAt - a.createdAt)
}

export async function restoreAutomaticWorldBackup(
  profile: Profile,
  folderName: string,
  backupId: string
): Promise<void> {
  const folder = requireLeafName(folderName, 'Dünya klasörü')
  if (!/^\d+$/.test(backupId)) throw new Error('Dünya yedeği geçersiz.')
  const source = resolveInside(resolveInside(root(profile), folder, 'Yedek klasörü'), backupId, 'Dünya yedeği')
  await fsp.access(path.join(source, 'level.dat'))

  // Preserve the current world before replacing it. The selected old snapshot
  // is first copied aside so retention cannot prune it mid-restore.
  const staging = path.join(profile.directory, '.pisankus', `restore-${Date.now()}`)
  await fsp.cp(source, staging, { recursive: true, preserveTimestamps: true })
  try {
    const current = path.join(profile.directory, 'saves', folder)
    if (await fsp.access(current).then(() => true).catch(() => false)) await backupWorld(profile, folder)
    await fsp.rm(current, { recursive: true, force: true })
    await fsp.cp(staging, current, { recursive: true, preserveTimestamps: true })
  } finally {
    await fsp.rm(staging, { recursive: true, force: true })
  }
}
