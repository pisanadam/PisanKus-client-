import { packById, type CuratedPack, type PackMod } from '../../shared/curatedPack'
import { store } from '../store'
import { installContent, type ProgressReporter } from './install'
import * as modrinth from './modrinth'

export interface PackReport {
  installed: { name: string; role: string }[]
  /** Entries with no build for this Minecraft version, and why. */
  skipped: { name: string; reason: string }[]
}

/** One Modrinth project, resolved to the build that fits this profile. */
interface Resolved {
  mod: PackMod
  projectId: string
  versionId: string
}

function requirePack(packId: string): CuratedPack {
  const pack = packById(packId)
  if (!pack) throw new Error(`Paket bulunamadı: ${packId}`)
  return pack
}

/**
 * The newest build of one project for this version, trying each of the pack's
 * loader facets in turn.
 *
 * A mod may be published under `legacy-fabric`, under plain `fabric`, or both;
 * insisting on one of them would drop half a 1.8.9 pack over a tagging detail.
 */
async function resolveOne(
  pack: CuratedPack,
  projectId: string,
  gameVersion: string
): Promise<string | undefined> {
  for (const loader of pack.modrinthLoaders) {
    const version = await modrinth.bestVersion(projectId, gameVersion, loader).catch(() => undefined)
    if (version) return version.id
  }
  return undefined
}

/**
 * Resolves a pack against Modrinth for one Minecraft version.
 *
 * Slugs are turned into project ids in a single bulk request, then each project
 * is asked for its newest build. A mod with nothing for this version is
 * reported rather than guessed at — installing a build for the wrong version
 * would produce a profile that crashes on launch.
 */
async function resolvePack(
  pack: CuratedPack,
  gameVersion: string
): Promise<{ ready: Resolved[]; missing: PackReport['skipped'] }> {
  const projects = await modrinth.getProjects(pack.mods.map((mod) => mod.slug))
  const bySlug = new Map(projects.map((project) => [project.slug, project.id]))

  const ready: Resolved[] = []
  const missing: PackReport['skipped'] = []

  // Sequential on purpose: Modrinth rate-limits, and a pack install that trips
  // the limit halfway through is worse than one that takes a few seconds longer.
  for (const mod of pack.mods) {
    const projectId = bySlug.get(mod.slug)
    if (!projectId) {
      missing.push({ name: mod.name, reason: 'Modrinth’te bulunamadı' })
      continue
    }

    const versionId = await resolveOne(pack, projectId, gameVersion)
    if (!versionId) {
      missing.push({ name: mod.name, reason: `${gameVersion} için sürümü yok` })
      continue
    }
    ready.push({ mod, projectId, versionId })
  }

  const blocked = missing.find((entry) =>
    pack.mods.some((mod) => mod.essential && mod.name === entry.name)
  )
  if (blocked) {
    throw new Error(
      `${pack.name} bu sürüme kurulamıyor: ${blocked.name} ${gameVersion} için yayınlanmamış. ` +
        'Başka bir Minecraft sürümü seçin.'
    )
  }

  return { ready, missing }
}

/** Which Minecraft versions a pack can be installed on, newest first. */
export async function packVersions(packId: string): Promise<string[]> {
  const pack = requirePack(packId)
  const essentials = pack.mods.filter((mod) => mod.essential)
  const projects = await modrinth.getProjects(essentials.map((mod) => mod.slug))

  // Only the versions every essential mod supports — the rest of the pack is
  // allowed to be missing, these are not.
  let shared: string[] | null = null
  for (const project of projects) {
    const supported = project.gameVersions.filter((version) => /^\d+\.\d+(\.\d+)?$/.test(version))
    shared = shared === null ? supported : shared.filter((version) => supported.includes(version))
  }

  return (shared ?? []).sort(compareVersions).reverse()
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] => value.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const a = parse(left)
  const b = parse(right)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Fills an already-created profile with a pack.
 *
 * The profile is made by the caller so a failure here can delete it whole —
 * a half-populated profile looks installed and is not.
 */
export async function installPackInto(
  packId: string,
  profileId: string,
  onProgress: ProgressReporter
): Promise<PackReport> {
  const pack = requirePack(packId)
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')

  const taskId = `pack-${profileId}`
  onProgress({ id: taskId, label: `${pack.name} hazırlanıyor`, progress: -1, state: 'running' })

  const { ready, missing } = await resolvePack(pack, profile.gameVersion)
  const installed: PackReport['installed'] = []

  for (const [index, entry] of ready.entries()) {
    onProgress({
      id: taskId,
      label: `${pack.name} kuruluyor`,
      progress: index / ready.length,
      detail: `${entry.mod.name} — ${entry.mod.role}`,
      state: 'running'
    })

    try {
      await installContent(
        {
          profileId,
          projectId: entry.projectId,
          versionId: entry.versionId,
          kind: 'mod',
          name: entry.mod.name,
          // The libraries the pack knows about are listed and installed first,
          // so this normally finds them already there. It stays on for the ones
          // nobody anticipated — a missing library is a profile that will not
          // start, which is far worse than an extra jar.
          withDependencies: true
        },
        // The per-mod progress would fight the pack's own bar for the same tray
        // slot, so only failures are worth surfacing from inside.
        () => undefined
      )
      installed.push({ name: entry.mod.name, role: entry.mod.role })
    } catch (error) {
      missing.push({ name: entry.mod.name, reason: error instanceof Error ? error.message : 'kurulamadı' })
    }
  }

  onProgress({
    id: taskId,
    label: `${pack.name} kuruldu`,
    progress: 1,
    detail: `${installed.length} mod`,
    state: 'done'
  })

  return { installed, skipped: missing }
}
