import fsp from 'node:fs/promises'
import path from 'node:path'
import { CONTENT_DIRS, type Profile, type ProfileHealthFix, type ProfileHealthIssue, type ProfileHealthReport } from '../shared/types'
import { ENVIRONMENT_IDS, readModMetadata } from './content/modMetadata.ts'
import { satisfiesRange } from './content/versionRange.ts'
import { requireProfileDirectory } from './pathSafety'
import { store } from './store'

async function exists(target: string): Promise<boolean> {
  return fsp.access(target).then(() => true).catch(() => false)
}

function contentPath(profile: Profile, index: number): string | null {
  const entry = profile.content[index]
  if (!entry || entry.kind === 'modpack') return null
  const name = entry.enabled ? entry.fileName : `${entry.fileName}.disabled`
  return path.join(profile.directory, CONTENT_DIRS[entry.kind], name)
}

async function missingContentIndexes(profile: Profile): Promise<number[]> {
  const checks = await Promise.all(profile.content.map(async (_entry, index) => {
    const target = contentPath(profile, index)
    return target && !(await exists(target)) ? index : -1
  }))
  return checks.filter((index) => index >= 0)
}

export async function inspectProfileHealth(profile: Profile): Promise<ProfileHealthReport> {
  const issues: ProfileHealthReport['issues'] = []
  const directoryExists = await exists(profile.directory)

  if (!directoryExists) {
    issues.push({
      id: 'profile-directory', severity: 'error', title: 'Profil klasörü bulunamadı',
      detail: 'Oyunun ve bu profile ait modların tutulduğu klasör diskte yok.',
      fix: 'create-profile-directory', fixLabel: 'Klasörü yeniden oluştur'
    })
  } else {
    const missing = await missingContentIndexes(profile)
    if (missing.length > 0) {
      issues.push({
        id: 'missing-content', severity: 'warning', title: `${missing.length} içerik kaydı dosyasını bulamıyor`,
        detail: 'Dosyalar dışarıdan silinmiş veya taşınmış. Kayıtları temizlemek listedeki hayalet girdileri kaldırır.',
        fix: 'remove-missing-content', fixLabel: 'Kayıp kayıtları temizle'
      })
    }
  }

  if (profile.javaPath && !(await exists(profile.javaPath))) {
    issues.push({
      id: 'custom-java', severity: 'error', title: 'Özel Java yolu bulunamadı',
      detail: 'Bu yoldaki Java taşınmış veya silinmiş. Otomatik Java seçimine dönülebilir.',
      fix: 'clear-custom-java', fixLabel: 'Otomatik Java kullan'
    })
  }

  const enabledMods = profile.content.filter((entry) => entry.kind === 'mod' && entry.enabled).length
  if (enabledMods > 0 && profile.memoryMb < 2048) {
    issues.push({
      id: 'low-memory', severity: 'warning', title: 'Modlar için ayrılan bellek düşük',
      detail: `${enabledMods} etkin mod var fakat profil 2 GB'den az bellek kullanıyor.`,
      fix: 'set-safe-memory', fixLabel: '4 GB olarak ayarla'
    })
  }

  if (profile.loader === 'vanilla' && enabledMods > 0) {
    issues.push({
      id: 'vanilla-mods', severity: 'warning', title: 'Vanilla profil etkin mod içeriyor',
      detail: 'Vanilla Minecraft modları yüklemez. Fabric, Forge, Quilt veya NeoForge kullanan bir profil gerekir.'
    })
  }

  const seenProjects = new Set<string>()
  const duplicateProjects = new Set<string>()
  for (const entry of profile.content) {
    if (!entry.projectId) continue
    if (seenProjects.has(entry.projectId)) duplicateProjects.add(entry.projectId)
    seenProjects.add(entry.projectId)
  }
  if (duplicateProjects.size > 0) {
    issues.push({
      id: 'duplicate-projects', severity: 'warning', title: 'Aynı modun birden fazla sürümü kayıtlı',
      detail: 'Çakışma ve açılış hatası yaşamamak için içerik listesindeki eski sürümü elle kaldırın.'
    })
  }

  issues.push(...(await inspectModJars(profile)))

  // No score. A percentage invented from a penalty table said nothing the list
  // of issues does not say better, and a profile with nothing wrong wore a
  // "100%" badge that only added noise to its name.
  return { checkedAt: Date.now(), issues }
}

export async function fixProfileHealth(profileId: string, fix: ProfileHealthFix): Promise<ProfileHealthReport> {
  const profile = store.profile(profileId)
  if (!profile) throw new Error('Profil bulunamadı.')

  switch (fix) {
    case 'create-profile-directory':
      await fsp.mkdir(requireProfileDirectory(profile.directory), { recursive: true })
      break
    case 'clear-custom-java':
      store.updateProfile(profileId, { javaPath: undefined })
      break
    case 'set-safe-memory':
      store.updateProfile(profileId, { memoryMb: 4096 })
      break
    case 'remove-missing-content': {
      const missing = new Set(await missingContentIndexes(profile))
      store.updateProfile(profileId, { content: profile.content.filter((_entry, index) => !missing.has(index)) })
      break
    }
  }

  return inspectProfileHealth(store.profile(profileId)!)
}

/**
 * What the jars in `mods/` say about themselves.
 *
 * Everything above this works from the launcher's own records, which know
 * nothing about a jar that did not come through Modrinth — one dropped in by
 * hand, one that arrived inside a modpack. Those are the jars behind the
 * failures that are hardest to explain, and every one of them carries the
 * answer in its own manifest.
 *
 * Three questions are worth asking, and only three. Each is one the game would
 * otherwise answer with a crash log.
 */
async function inspectModJars(profile: Profile): Promise<ProfileHealthIssue[]> {
  if (profile.loader === 'vanilla') return []

  const directory = path.join(profile.directory, CONTENT_DIRS.mod)
  const names = await fsp.readdir(directory).catch(() => [])
  const jars = names.filter((name) => name.toLowerCase().endsWith('.jar'))
  if (jars.length === 0) return []

  const read = await Promise.all(
    jars.map(async (name) => ({ name, meta: await readModMetadata(path.join(directory, name)) }))
  )
  const found = read.flatMap((entry) => (entry.meta ? [{ name: entry.name, meta: entry.meta }] : []))
  const issues: ProfileHealthIssue[] = []

  // 1. Two jars claiming the same mod id. The loader refuses to start, naming
  //    the id but not the files — this names the files.
  const byId = new Map<string, string[]>()
  for (const entry of found) byId.set(entry.meta.id, [...(byId.get(entry.meta.id) ?? []), entry.name])
  const duplicates = [...byId].filter(([, files]) => files.length > 1)
  if (duplicates.length > 0) {
    issues.push({
      id: 'duplicate-mod-ids',
      severity: 'error',
      title: 'Aynı mod iki kez kurulu',
      detail: duplicates
        .map(([id, files]) => `${id}: ${files.join(', ')}`)
        .join(' · ') + ' — birer tanesini silin, oyun bu hâlde açılmaz.'
    })
  }

  // 2. A build for another Minecraft version. Only reported when the manifest
  //    says so plainly; an unreadable range counts as a fit.
  const wrongVersion = found.filter((entry) => !satisfiesRange(profile.gameVersion, entry.meta.minecraft))
  if (wrongVersion.length > 0) {
    issues.push({
      id: 'mod-version-mismatch',
      severity: 'error',
      title: 'Bu sürüme uymayan mod',
      detail: wrongVersion
        .map((entry) => `${entry.meta.name} (${entry.meta.minecraft})`)
        .join(', ') + ` — profil Minecraft ${profile.gameVersion} kullanıyor.`
    })
  }

  // 3. A build for another loader. Quilt runs Fabric mods, so that pair is fine.
  const wrongLoader = found.filter((entry) => !loaderAccepts(profile.loader, entry.meta.loader))
  if (wrongLoader.length > 0) {
    issues.push({
      id: 'mod-loader-mismatch',
      severity: 'error',
      title: 'Başka yükleyici için yapılmış mod',
      detail: wrongLoader
        .map((entry) => `${entry.meta.name} (${entry.meta.loader})`)
        .join(', ') + ` — profil ${profile.loader} kullanıyor.`
    })
  }

  // 4. A required dependency nothing here provides. The environment ids are not
  //    mods, and a mod may ship its dependency inside itself, so only ids no jar
  //    in the folder declares are reported.
  const present = new Set(found.map((entry) => entry.meta.id))
  const missing = new Map<string, string>()
  for (const entry of found) {
    for (const dependency of entry.meta.dependencies) {
      if (!dependency.required) continue
      if (ENVIRONMENT_IDS.has(dependency.id) || present.has(dependency.id)) continue
      if (!missing.has(dependency.id)) missing.set(dependency.id, entry.meta.name)
    }
  }
  if (missing.size > 0) {
    issues.push({
      id: 'missing-mod-dependency',
      severity: 'warning',
      title: 'Eksik bağımlılık',
      detail: [...missing]
        .map(([id, requiredBy]) => `${id} (${requiredBy} istiyor)`)
        .join(', ') + ' — profil ayarlarındaki "Eksikleri indir" bunları kurmayı dener.'
    })
  }

  return issues
}

/** Quilt runs Fabric mods; nothing else crosses. */
function loaderAccepts(profileLoader: Profile['loader'], modLoader: Profile['loader']): boolean {
  if (profileLoader === modLoader) return true
  return profileLoader === 'quilt' && modLoader === 'fabric'
}
