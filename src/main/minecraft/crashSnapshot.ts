import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { CrashProfileChange, InstalledContent, Profile } from '../../shared/types'

const SNAPSHOT_VERSION = 1

export interface SuccessfulRunSnapshot {
  schemaVersion: number
  successfulAt: number
  gameVersion: string
  loader: Profile['loader']
  loaderVersion?: string
  java: {
    majorVersion?: number
    executable: string
    /** Lets us notice a changed runtime without persisting the private path. */
    pathFingerprint: string
  }
  memoryMb: number
  content: Array<Pick<InstalledContent, 'id' | 'versionId' | 'fileName' | 'enabled' | 'name'>>
}

export interface RuntimeSnapshotInfo {
  javaPath?: string
  javaMajorVersion?: number
  memoryMb?: number
}

function snapshotFile(profile: Profile): string {
  return path.join(profile.directory, '.pisankus', 'last-success.json')
}

function javaFingerprint(javaPath: string | undefined): string {
  return createHash('sha256').update(javaPath ?? 'automatic').digest('hex').slice(0, 16)
}

export function createSuccessfulRunSnapshot(
  profile: Profile,
  runtime: RuntimeSnapshotInfo = {},
  successfulAt = Date.now()
): SuccessfulRunSnapshot {
  return {
    schemaVersion: SNAPSHOT_VERSION,
    successfulAt,
    gameVersion: profile.gameVersion,
    loader: profile.loader,
    loaderVersion: profile.loaderVersion,
    java: {
      majorVersion: runtime.javaMajorVersion,
      executable: path.basename(runtime.javaPath ?? profile.javaPath ?? 'automatic'),
      pathFingerprint: javaFingerprint(runtime.javaPath ?? profile.javaPath)
    },
    memoryMb: runtime.memoryMb ?? profile.memoryMb,
    content: profile.content.map(({ id, versionId, fileName, enabled, name }) => ({
      id,
      versionId,
      fileName,
      enabled,
      name
    }))
  }
}

export async function loadSuccessfulRunSnapshot(profile: Profile): Promise<SuccessfulRunSnapshot | null> {
  try {
    const parsed = JSON.parse(await fsp.readFile(snapshotFile(profile), 'utf8')) as SuccessfulRunSnapshot
    if (parsed.schemaVersion !== SNAPSHOT_VERSION || !Array.isArray(parsed.content)) return null
    return parsed
  } catch {
    return null
  }
}

export async function saveSuccessfulRunSnapshot(
  profile: Profile,
  runtime: RuntimeSnapshotInfo = {}
): Promise<SuccessfulRunSnapshot> {
  const snapshot = createSuccessfulRunSnapshot(profile, runtime)
  const file = snapshotFile(profile)
  const temporary = `${file}.${process.pid}.tmp`
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(temporary, JSON.stringify(snapshot, null, 2), { mode: 0o600 })
  await fsp.rename(temporary, file)
  return snapshot
}

export function compareSuccessfulRunSnapshot(
  previous: SuccessfulRunSnapshot | null,
  profile: Profile,
  runtime: RuntimeSnapshotInfo = {}
): CrashProfileChange[] {
  if (!previous) return []
  const changes: CrashProfileChange[] = []
  const oldContent = new Map(previous.content.map((content) => [content.id, content]))

  for (const content of profile.content) {
    const old = oldContent.get(content.id)
    if (!old) {
      changes.push({
        kind: 'added',
        label: `${content.name} eklendi`,
        detail: content.fileName,
        contentId: content.id
      })
    } else if (old.versionId !== content.versionId || old.fileName !== content.fileName) {
      changes.push({
        kind: 'updated',
        label: `${content.name} güncellendi`,
        detail: `${old.fileName} → ${content.fileName}`,
        contentId: content.id
      })
    } else if (!old.enabled && content.enabled) {
      changes.push({
        kind: 'enabled',
        label: `${content.name} etkinleştirildi`,
        detail: content.fileName,
        contentId: content.id
      })
    }
  }

  if (previous.loader !== profile.loader || previous.loaderVersion !== profile.loaderVersion) {
    changes.push({
      kind: 'loader',
      label: 'Mod yükleyici değişti',
      detail: `${previous.loader} ${previous.loaderVersion ?? ''} → ${profile.loader} ${profile.loaderVersion ?? ''}`.trim()
    })
  }

  const currentJavaPath = runtime.javaPath ?? profile.javaPath
  const currentJavaFingerprint = javaFingerprint(currentJavaPath)
  if (currentJavaPath && (
    previous.java.pathFingerprint !== currentJavaFingerprint ||
    (runtime.javaMajorVersion != null && previous.java.majorVersion !== runtime.javaMajorVersion)
  )) {
    changes.push({
      kind: 'java',
      label: 'Java çalışma zamanı değişti',
      detail: `${previous.java.executable}${previous.java.majorVersion ? ` ${previous.java.majorVersion}` : ''} → ${path.basename(currentJavaPath ?? 'automatic')}${runtime.javaMajorVersion ? ` ${runtime.javaMajorVersion}` : ''}`
    })
  }

  const memoryMb = runtime.memoryMb ?? profile.memoryMb
  if (previous.memoryMb !== memoryMb) {
    changes.push({
      kind: 'memory',
      label: 'Ayrılan RAM değişti',
      detail: `${previous.memoryMb} MB → ${memoryMb} MB`
    })
  }

  return changes
}
