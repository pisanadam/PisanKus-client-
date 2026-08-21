import os from 'node:os'
import type {
  CrashCategory,
  CrashProfileChange,
  CrashSecondaryCause,
  CrashSource,
  CrashSourceKind,
  InstalledContent,
  Profile,
  SuspectedCrashMod
} from '../../shared/types'

const MAX_EVIDENCE_LINES = 8

export interface CrashTextSource extends CrashSource {
  text: string
}

export interface CrashAnalysis {
  category: CrashCategory
  title: string
  summary: string
  suggestions: string[]
  evidence: string[]
  confidence: number
  secondaryCauses: CrashSecondaryCause[]
  suspectedMods: SuspectedCrashMod[]
  sources: CrashSource[]
  changesSinceLastSuccess: CrashProfileChange[]
}

export interface CrashAnalysisOptions {
  profile?: Profile
  sources?: CrashTextSource[]
  changesSinceLastSuccess?: CrashProfileChange[]
  homeDirectory?: string
}

interface CategoryInfo {
  title: string
  summary: string
  suggestions: string[]
}

interface ScoreRule {
  category: Exclude<CrashCategory, 'unknown'>
  pattern: RegExp
  points: number
}

const CATEGORY_INFO: Record<CrashCategory, CategoryInfo> = {
  memory: {
    title: 'Bellek yetersizliği',
    summary: 'Minecraft veya Java ayrılan belleği kullanamadığı için kapandı.',
    suggestions: [
      'Profil belleğini yükseltin; büyük mod paketlerinde 6–8 GB deneyin.',
      'Bilgisayardaki diğer ağır uygulamaları kapatın.',
      '“Could not reserve” görülüyorsa çok yüksek bellek değerini azaltın ve 64 bit Java seçin.'
    ]
  },
  java: {
    title: 'Uyumsuz Java sürümü',
    summary: 'Seçili Java sürümü bu Minecraft veya mod sürümüyle uyumlu görünmüyor.',
    suggestions: [
      'Profil ayarlarında Java seçimini “Genel ayarı kullan” yapın.',
      'Minecraft sürümünün istediği Java sürümünü seçin ve yeniden deneyin.'
    ]
  },
  dependency: {
    title: 'Eksik veya uyumsuz mod bağımlılığı',
    summary: 'Bir modun ihtiyaç duyduğu sınıf, mod veya sürüm bulunamadı.',
    suggestions: [
      'Mod güncellemelerini denetleyin ve eksik bağımlılığı Modrinth üzerinden kurun.',
      'Son eklediğiniz modları geçici olarak devre dışı bırakıp yeniden deneyin.',
      'Modların profilin Minecraft ve yükleyici sürümüyle aynı olduğundan emin olun.'
    ]
  },
  mixin: {
    title: 'Mod çakışması (Mixin)',
    summary: 'Bir mod Minecraft koduna değişiklik uygularken başka bir mod veya sürümle çakıştı.',
    suggestions: [
      'Rapordaki mod adını güncelleyin veya geçici olarak devre dışı bırakın.',
      'Aynı işlevi değiştiren performans/grafik modlarını birlikte kullanmadığınızdan emin olun.'
    ]
  },
  graphics: {
    title: 'Ekran kartı veya OpenGL sorunu',
    summary: 'Minecraft grafik bağlamını oluşturamadı ya da ekran kartı sürücüsü yanıt vermedi.',
    suggestions: [
      'Ekran kartı sürücüsünü güncelleyin.',
      'Shader ve grafik modlarını kapatıp tekrar deneyin.',
      'Dizüstünde Minecraft’ın yüksek performanslı ekran kartını kullandığını kontrol edin.'
    ]
  },
  authentication: {
    title: 'Oturum doğrulanamadı',
    summary: 'Microsoft/Minecraft oturumu çevrimiçi hizmetler tarafından kabul edilmedi.',
    suggestions: [
      'Çevrimiçi oynamak için hesaptan çıkıp yeniden giriş yapın.',
      'Yalnızca tek oyunculu oynayacaksanız profili çevrimdışı başlatabilirsiniz.'
    ]
  },
  native: {
    title: 'Yerel kütüphane yüklenemedi',
    summary: 'LWJGL veya başka bir işletim sistemi kütüphanesi açılamadı.',
    suggestions: [
      'Profil bakımından “Dosyaları önceden indir” işlemini yeniden çalıştırın.',
      'Java ve launcher mimarisinin işletim sistemiyle aynı olduğundan emin olun.'
    ]
  },
  network: {
    title: 'Ağ veya indirme sorunu',
    summary: 'Başlatma için gereken bir hizmete veya dosyaya erişilemedi.',
    suggestions: [
      'İnternet bağlantısını kontrol edip tekrar deneyin.',
      'Dosyalar daha önce hazırlandıysa çevrimdışı başlatmayı deneyin.'
    ]
  },
  unknown: {
    title: 'Bilinmeyen çökme',
    summary: 'Günlükte bilinen bir hata imzası bulunamadı; son satırlar rapora eklendi.',
    suggestions: [
      'Son eklediğiniz mod veya shaderı devre dışı bırakıp tekrar deneyin.',
      'Crash raporunu ve tam günlüğü paylaşarak ayrıntılı inceleme yapın.'
    ]
  }
}

const RULES: ScoreRule[] = [
  { category: 'memory', pattern: /OutOfMemoryError/i, points: 100 },
  { category: 'memory', pattern: /Java heap space/i, points: 100 },
  { category: 'memory', pattern: /Could not reserve enough space/i, points: 100 },
  { category: 'memory', pattern: /GC overhead limit/i, points: 80 },
  { category: 'mixin', pattern: /MixinApplyError/i, points: 50 },
  { category: 'mixin', pattern: /MixinTransformerError/i, points: 50 },
  { category: 'mixin', pattern: /InjectionError/i, points: 50 },
  { category: 'mixin', pattern: /mixin.{0,120}failed/i, points: 35 },
  { category: 'dependency', pattern: /ModResolutionException/i, points: 70 },
  { category: 'dependency', pattern: /Incompatible mods found/i, points: 70 },
  { category: 'dependency', pattern: /depends on.{0,120}which is missing/i, points: 60 },
  { category: 'dependency', pattern: /missing mandatory dependenc/i, points: 60 },
  { category: 'dependency', pattern: /requires (?:any version of|version)/i, points: 45 },
  { category: 'dependency', pattern: /Mod loading (?:has )?failed|LoadingFailedException/i, points: 65 },
  { category: 'dependency', pattern: /NoClassDefFoundError/i, points: 20 },
  { category: 'dependency', pattern: /ClassNotFoundException/i, points: 20 },
  { category: 'graphics', pattern: /GLFW error/i, points: 70 },
  { category: 'graphics', pattern: /OpenGL.{0,100}(?:error|not supported|failed)/i, points: 70 },
  { category: 'graphics', pattern: /Failed to create (?:the )?window|window creation failed/i, points: 75 },
  { category: 'graphics', pattern: /Pixel format launch fail/i, points: 70 },
  { category: 'java', pattern: /UnsupportedClassVersionError/i, points: 100 },
  { category: 'java', pattern: /class file version|only recognizes class file versions/i, points: 90 },
  { category: 'java', pattern: /requires Java \d+|Unable to locate a Java Runtime/i, points: 75 },
  { category: 'native', pattern: /UnsatisfiedLinkError/i, points: 80 },
  { category: 'native', pattern: /no lwjgl.{0,80}java\.library\.path/i, points: 80 },
  { category: 'native', pattern: /Failed to load a native library/i, points: 80 },
  { category: 'native', pattern: /A fatal error has been detected by the Java Runtime Environment/i, points: 70 },
  { category: 'authentication', pattern: /Invalid session|Failed to verify username/i, points: 80 },
  { category: 'authentication', pattern: /AuthenticationException|Not authenticated with Minecraft/i, points: 80 },
  // How a server words the same refusal when it turns a join away.
  {
    category: 'authentication',
    pattern: /multiplayer\.disconnect\.(?:unverified_username|authservers_down)|disconnect\.loginFailedInfo/i,
    points: 80
  },
  { category: 'network', pattern: /fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT/i, points: 65 },
  { category: 'network', pattern: /İstek başarısız|dosya indirilemedi|UnknownHostException/i, points: 65 }
]

const SOURCE_MULTIPLIER: Record<CrashSourceKind, number> = {
  'minecraft-crash': 1.25,
  'jvm-crash': 1.15,
  'latest-log': 1.05,
  'launcher-log': 1
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Removes credentials, usernames and private absolute paths from persisted/shareable text. */
export function redactSensitiveText(
  value: string,
  options: { profileDirectory?: string; homeDirectory?: string } = {}
): string {
  let redacted = value
  const replacements = [
    [options.profileDirectory, '<PROFILE>'],
    [options.homeDirectory ?? os.homedir(), '<USER_HOME>']
  ] as const
  for (const [target, replacement] of replacements) {
    if (target) redacted = redacted.replace(new RegExp(escapeRegex(target), 'gi'), replacement)
  }

  return redacted
    .replace(/((?:access|refresh)[_-]?token["'=:\s]+)[^\s",}]+/gi, '$1[REDACTED]')
    .replace(/(Authorization["':\s]+Bearer\s+)[^\s",}]+/gi, '$1[REDACTED]')
    .replace(/(--accessToken(?:=|\s+))[^\s]+/gi, '$1[REDACTED]')
    .replace(/\b[A-Za-z]:\\Users\\[^\\\s]+/gi, '<USER_HOME>')
    .replace(/\b[A-Za-z]:\/Users\/[^/\s]+/gi, '<USER_HOME>')
    .replace(/\/(?:home|Users)\/[^/\s]+/g, '<USER_HOME>')
    .replace(/\\\\[^\\\s]+\\[^\\\s]+(?:\\[^\\\s]+)+/g, '<PATH>')
    .replace(/\b[A-Za-z]:\\(?:[^\s\\]+\\){2,}([^\s\\]+)/g, '<PATH>/$1')
    .replace(/\/(?:root|tmp|var|opt)\/(?:[^\s/]+\/)+([^\s/]+)/g, '<PATH>/$1')
    .replace(/(^|[\s"'=<(])\/(?:[^/\s]+\/){2,}([^/\s"'():,]+)/g, '$1<PATH>/$2')
}

function confidenceFor(score: number): number {
  if (score <= 0) return 15
  return Math.min(99, Math.round(45 + score / 2))
}

function sourcePublic(source: CrashTextSource): CrashSource {
  return { kind: source.kind, path: source.path, modifiedAt: source.modifiedAt }
}

function normalizedTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\.jar(?:\.disabled)?$/i, '')
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3 && !/^\d+$/.test(part))
}

function contentNeedles(content: InstalledContent): string[] {
  const fileStem = content.fileName.replace(/\.jar(?:\.disabled)?$/i, '')
  return [...new Set([content.projectId, content.name, fileStem].filter((value): value is string => Boolean(value)))]
}

function detectSuspectedMods(
  text: string,
  profile: Profile | undefined,
  changes: CrashProfileChange[]
): SuspectedCrashMod[] {
  if (!profile) return []
  const lower = text.toLowerCase()
  const strongLines = text
    .split(/\r?\n/)
    .filter((line) => /Suspected Mods?:|Mod File:|Failure message:|incompatible mod|mod loading error/i.test(line))
    .join('\n')
    .toLowerCase()

  const suspects: Array<SuspectedCrashMod & { score: number }> = []
  for (const content of profile.content.filter((item) => item.kind === 'mod')) {
    let score = 0
    const reasons: string[] = []
    for (const needle of contentNeedles(content)) {
      const normalized = needle.toLowerCase()
      if (normalized.length < 3) continue
      if (strongLines.includes(normalized)) {
        score = Math.max(score, 72)
        reasons.push('Crash raporunun mod alanlarında adı veya dosyası bulundu')
      } else if (lower.includes(normalized)) {
        score = Math.max(score, needle === content.fileName ? 62 : 45)
        reasons.push('Crash günlüğünde mod adı, proje kimliği veya dosyası bulundu')
      } else {
        const tokens = normalizedTokens(normalized)
        const found = tokens.filter((token) => lower.includes(token))
        if (tokens.length > 0 && found.length === tokens.length) {
          score = Math.max(score, 32)
          reasons.push('Stack trace içinde modla ilişkili paket parçaları bulundu')
        }
      }
    }

    const change = changes.find((item) => item.contentId === content.id)
    if (change && score > 0) {
      score += change.kind === 'updated' ? 22 : 16
      reasons.push(`Son başarılı çalıştırmadan sonra ${change.kind === 'updated' ? 'güncellendi' : change.kind === 'added' ? 'eklendi' : 'etkinleştirildi'}`)
    } else if (change && change.kind === 'updated') {
      score = 25
      reasons.push('Son başarılı çalıştırmadan sonra güncellendi; logda doğrudan kanıt zayıf')
    }

    if (score >= 25) {
      suspects.push({
        name: content.name,
        contentId: content.id,
        versionId: content.versionId,
        fileName: content.fileName,
        confidence: Math.min(95, score),
        reasons: [...new Set(reasons)],
        score
      })
    }
  }

  const explicitCandidates = [
    ...[...text.matchAll(/Suspected Mods?:\s*([^\r\n]+)/gi)].map((match) => ({
      name: match[1].split(/[,(]/)[0].trim(),
      confidence: 70,
      reason: 'Minecraft crash raporunda “Suspected Mods” alanında belirtildi'
    })),
    ...[...text.matchAll(/Mod File:\s*([^\r\n/\\]+\.jar)/gi)].map((match) => ({
      name: match[1].replace(/\.jar$/i, ''),
      confidence: 58,
      reason: 'Mod yükleme hatasındaki dosya adı bulundu'
    })),
    ...[...text.matchAll(/(?:^|\s)([a-z0-9_.-]+)\.mixins?\.json/gi)].map((match) => ({
      name: match[1],
      confidence: 38,
      reason: 'Hata veren Mixin yapılandırmasının paket adı bulundu'
    }))
  ].filter((candidate) => candidate.name.length >= 3 && candidate.name.length <= 160)

  for (const candidate of explicitCandidates) {
    const alreadyMatched = suspects.some((suspect) =>
      contentNeedles({
        id: '', source: 'local', kind: 'mod', name: suspect.name,
        fileName: suspect.fileName ?? suspect.name, enabled: true, installedAt: 0
      }).some((needle) => candidate.name.toLowerCase().includes(needle.toLowerCase()))
    )
    if (!alreadyMatched && !suspects.some((suspect) => suspect.name.toLowerCase() === candidate.name.toLowerCase())) {
      suspects.push({
        name: candidate.name,
        confidence: candidate.confidence,
        reasons: [candidate.reason],
        score: candidate.confidence
      })
    }
  }

  return suspects
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ score: _score, ...suspect }) => suspect)
}

export function analyzeCrashText(logText: string, options: CrashAnalysisOptions = {}): CrashAnalysis {
  const sources = options.sources?.length
    ? options.sources
    : [{ kind: 'launcher-log' as const, path: 'logs/pisankus-latest.log', text: logText }]
  const scores = new Map<CrashCategory, number>()
  const matchedLines = new Map<CrashCategory, string[]>()

  for (const source of sources) {
    const lines = source.text.split(/\r?\n/).filter(Boolean)
    for (const rule of RULES) {
      const matches = lines.filter((line) => rule.pattern.test(line))
      if (matches.length === 0) continue
      const score = Math.round(rule.points * SOURCE_MULTIPLIER[source.kind])
      scores.set(rule.category, (scores.get(rule.category) ?? 0) + score)
      matchedLines.set(rule.category, [...(matchedLines.get(rule.category) ?? []), ...matches])
    }
  }

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1])
  const category = ranked[0]?.[0] ?? 'unknown'
  const info = CATEGORY_INFO[category]
  const combined = sources.map((source) => source.text).join('\n')
  const evidenceLines = category === 'unknown'
    ? combined.split(/\r?\n/).filter(Boolean).slice(-MAX_EVIDENCE_LINES)
    : (matchedLines.get(category) ?? []).slice(-MAX_EVIDENCE_LINES)
  const redactOptions = {
    profileDirectory: options.profile?.directory,
    homeDirectory: options.homeDirectory
  }
  const changes = options.changesSinceLastSuccess ?? []

  return {
    category,
    ...info,
    confidence: confidenceFor(ranked[0]?.[1] ?? 0),
    secondaryCauses: ranked.slice(1, 4).map(([secondaryCategory, score]) => ({
      category: secondaryCategory,
      confidence: confidenceFor(score)
    })),
    evidence: evidenceLines.map((line) => redactSensitiveText(line, redactOptions).slice(0, 8_000)),
    suspectedMods: detectSuspectedMods(combined, options.profile, changes),
    sources: sources.map(sourcePublic),
    changesSinceLastSuccess: changes
  }
}

/** Backwards-compatible single-log entry point used by existing callers/tests. */
export function analyzeCrash(logText: string, options: CrashAnalysisOptions = {}): CrashAnalysis {
  return analyzeCrashText(logText, options)
}

/** `path` values are already public, but old reports may still contain absolute paths. */
export function sanitizeCrashReportForShare<T>(
  report: T,
  profileDirectory?: string,
  homeDirectory?: string
): T {
  const sanitize = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return redactSensitiveText(value, { profileDirectory, homeDirectory })
    }
    if (Array.isArray(value)) return value.map(sanitize)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitize(child)]))
    }
    return value
  }
  return sanitize(report) as T
}
