import fsp from 'node:fs/promises'
import path from 'node:path'
import { CONTENT_DIRS, type Profile, type ProfileHealthFix, type ProfileHealthReport } from '../shared/types'
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

  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === 'error' ? 35 : 15), 0)
  const score = Math.max(0, 100 - penalty)
  return {
    checkedAt: Date.now(),
    issues,
    score,
    status: score >= 85 ? 'healthy' : score >= 50 ? 'attention' : 'critical'
  }
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
