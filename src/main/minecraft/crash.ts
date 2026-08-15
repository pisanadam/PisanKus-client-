import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import type {
  CrashCategory,
  CrashReport,
  GameLogLine,
  GameState,
  Profile
} from '../../shared/types'

const MAX_BUFFERED_LINES = 5_000
const MAX_EVIDENCE_LINES = 8

interface Analysis {
  category: CrashCategory
  title: string
  summary: string
  suggestions: string[]
  evidence: string[]
}

interface Signature extends Omit<Analysis, 'evidence'> {
  patterns: RegExp[]
}

const SIGNATURES: Signature[] = [
  {
    category: 'memory',
    title: 'Bellek yetersizliği',
    summary: 'Minecraft veya Java ayrılan belleği kullanamadığı için kapandı.',
    suggestions: [
      'Profil belleğini yükseltin; büyük mod paketlerinde 6–8 GB deneyin.',
      'Bilgisayardaki diğer ağır uygulamaları kapatın.',
      '“Could not reserve” görülüyorsa çok yüksek bellek değerini azaltın ve 64 bit Java seçin.'
    ],
    patterns: [/OutOfMemoryError/i, /Could not reserve enough space/i, /Java heap space/i, /GC overhead limit/i]
  },
  {
    category: 'java',
    title: 'Uyumsuz Java sürümü',
    summary: 'Seçili Java sürümü bu Minecraft veya mod sürümüyle uyumlu görünmüyor.',
    suggestions: [
      'Profil ayarlarında Java seçimini “Genel ayarı kullan” yapın.',
      'Minecraft sürümünün istediği Java sürümünü seçin ve yeniden deneyin.'
    ],
    patterns: [
      /UnsupportedClassVersionError/i,
      /class file version/i,
      /only recognizes class file versions/i,
      /requires Java \d+/i,
      /Unable to locate a Java Runtime/i
    ]
  },
  {
    category: 'dependency',
    title: 'Eksik veya uyumsuz mod bağımlılığı',
    summary: 'Bir modun ihtiyaç duyduğu sınıf, mod veya sürüm bulunamadı.',
    suggestions: [
      'Mod güncellemelerini denetleyin ve eksik bağımlılığı Modrinth üzerinden kurun.',
      'Son eklediğiniz modları geçici olarak devre dışı bırakıp yeniden deneyin.',
      'Modların profilin Minecraft ve yükleyici sürümüyle aynı olduğundan emin olun.'
    ],
    patterns: [
      /NoClassDefFoundError/i,
      /ClassNotFoundException/i,
      /ModResolutionException/i,
      /requires any version of/i,
      /depends on .* which is missing/i,
      /missing mandatory dependenc/i,
      /Incompatible mods found/i
    ]
  },
  {
    category: 'mixin',
    title: 'Mod çakışması (Mixin)',
    summary: 'Bir mod Minecraft koduna değişiklik uygularken başka bir mod veya sürümle çakıştı.',
    suggestions: [
      'Rapordaki mod adını güncelleyin veya geçici olarak devre dışı bırakın.',
      'Aynı işlevi değiştiren performans/grafik modlarını birlikte kullanmadığınızdan emin olun.'
    ],
    patterns: [/MixinApplyError/i, /MixinTransformerError/i, /InjectionError/i, /mixin.*failed/i]
  },
  {
    category: 'graphics',
    title: 'Ekran kartı veya OpenGL sorunu',
    summary: 'Minecraft grafik bağlamını oluşturamadı ya da ekran kartı sürücüsü yanıt vermedi.',
    suggestions: [
      'Ekran kartı sürücüsünü güncelleyin.',
      'Shader ve grafik modlarını kapatıp tekrar deneyin.',
      'Dizüstünde Minecraft’ın yüksek performanslı ekran kartını kullandığını kontrol edin.'
    ],
    patterns: [/GLFW error/i, /OpenGL.*(?:error|not supported)/i, /Failed to create window/i, /Pixel format launch fail/i]
  },
  {
    category: 'authentication',
    title: 'Oturum doğrulanamadı',
    summary: 'Microsoft/Minecraft oturumu çevrimiçi hizmetler tarafından kabul edilmedi.',
    suggestions: [
      'Çevrimiçi oynamak için hesaptan çıkıp yeniden giriş yapın.',
      'Yalnızca tek oyunculu oynayacaksanız profili çevrimdışı başlatabilirsiniz.'
    ],
    patterns: [/Invalid session/i, /Failed to verify username/i, /AuthenticationException/i, /Not authenticated with Minecraft/i]
  },
  {
    category: 'native',
    title: 'Yerel kütüphane yüklenemedi',
    summary: 'LWJGL veya başka bir işletim sistemi kütüphanesi açılamadı.',
    suggestions: [
      'Profil bakımından “Dosyaları önceden indir” işlemini yeniden çalıştırın.',
      'Java ve launcher mimarisinin işletim sistemiyle aynı olduğundan emin olun.'
    ],
    patterns: [/UnsatisfiedLinkError/i, /no lwjgl.* in java\.library\.path/i, /Failed to load a native library/i]
  },
  {
    category: 'network',
    title: 'Ağ veya indirme sorunu',
    summary: 'Başlatma için gereken bir hizmete veya dosyaya erişilemedi.',
    suggestions: [
      'İnternet bağlantısını kontrol edip tekrar deneyin.',
      'Dosyalar daha önce hazırlandıysa çevrimdışı başlatmayı deneyin.'
    ],
    patterns: [/fetch failed/i, /ENOTFOUND/i, /ECONNRESET/i, /ETIMEDOUT/i, /İstek başarısız/i, /dosya indirilemedi/i]
  }
]

/** Removes credentials that occasionally appear in mod or authentication logs. */
export function redactLogLine(value: string): string {
  return value
    .replace(/((?:access|refresh)[_-]?token["'=:\s]+)[^\s",}]+/gi, '$1[REDACTED]')
    .replace(/(Authorization["':\s]+Bearer\s+)[^\s",}]+/gi, '$1[REDACTED]')
    .replace(/(--accessToken\s+)[^\s]+/gi, '$1[REDACTED]')
    .slice(0, 8_000)
}

export function analyzeCrash(logText: string): Analysis {
  const lines = logText.split(/\r?\n/).filter(Boolean)
  for (const signature of SIGNATURES) {
    if (!signature.patterns.some((pattern) => pattern.test(logText))) continue
    const evidence = lines
      .filter((line) => signature.patterns.some((pattern) => pattern.test(line)))
      .slice(-MAX_EVIDENCE_LINES)
      .map(redactLogLine)
    return {
      category: signature.category,
      title: signature.title,
      summary: signature.summary,
      suggestions: signature.suggestions,
      evidence
    }
  }

  return {
    category: 'unknown',
    title: 'Bilinmeyen çökme',
    summary: 'Günlükte bilinen bir hata imzası bulunamadı; son satırlar rapora eklendi.',
    suggestions: [
      'Son eklediğiniz mod veya shaderı devre dışı bırakıp tekrar deneyin.',
      'Crash raporunu ve tam günlüğü paylaşarak ayrıntılı inceleme yapın.'
    ],
    evidence: lines.slice(-MAX_EVIDENCE_LINES).map(redactLogLine)
  }
}

/** Writes a live sanitized log and creates a structured report only on failure. */
export class GameDiagnostics {
  private readonly profile: Profile
  private readonly lines: string[] = []
  private readonly latestLog: string
  private readonly stream: fs.WriteStream
  private finishPromise?: Promise<CrashReport | null>

  constructor(profile: Profile) {
    this.profile = profile
    const logDir = path.join(profile.directory, 'logs')
    fs.mkdirSync(logDir, { recursive: true })
    this.latestLog = path.join(logDir, 'pisankus-latest.log')
    this.stream = fs.createWriteStream(this.latestLog, { flags: 'w', mode: 0o600 })
    // A full disk should not crash the launcher while it is trying to report a
    // different failure. The in-memory report can still be shown for the run.
    this.stream.on('error', () => undefined)
  }

  record(line: GameLogLine): void {
    const rendered = `${new Date(line.at).toISOString()} [${line.stream}] ${redactLogLine(line.line)}`
    this.lines.push(rendered)
    if (this.lines.length > MAX_BUFFERED_LINES) this.lines.splice(0, this.lines.length - MAX_BUFFERED_LINES)
    this.stream.write(`${rendered}\n`)
  }

  finish(state: GameState): Promise<CrashReport | null> {
    this.finishPromise ??= this.finishRun(state)
    return this.finishPromise
  }

  private async finishRun(state: GameState): Promise<CrashReport | null> {
    this.stream.end()
    await finished(this.stream).catch(() => undefined)
    if (state.status !== 'crashed') return null

    const createdAt = Date.now()
    const crashDir = path.join(this.profile.directory, 'crash-reports')
    const stem = `pisankus-${createdAt}`
    const logFile = path.join(crashDir, `${stem}.log`)
    const reportFile = path.join(crashDir, `${stem}.json`)
    const analysis = analyzeCrash(this.lines.join('\n'))
    const report: CrashReport = {
      id: randomUUID(),
      profileId: this.profile.id,
      profileName: this.profile.name,
      createdAt,
      exitCode: state.exitCode,
      ...analysis,
      logFile,
      reportFile
    }

    await fsp.mkdir(crashDir, { recursive: true })
    await fsp.copyFile(this.latestLog, logFile).catch(async () => {
      await fsp.writeFile(logFile, `${this.lines.join('\n')}\n`, { mode: 0o600 })
    })
    await fsp.writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 })
    return report
  }
}

export async function listCrashReports(profile: Profile): Promise<CrashReport[]> {
  const crashDir = path.join(profile.directory, 'crash-reports')
  const files = await fsp.readdir(crashDir).catch(() => [])
  const reports = await Promise.all(
    files
      // `opbay-` is the old brand's prefix. Reports written before the rename
      // are still perfectly good crash reports, so they stay listed.
      .filter((file) => /^(?:pisankus|opbay)-\d+\.json$/.test(file))
      .map(async (file): Promise<CrashReport | null> => {
        try {
          const reportFile = path.join(crashDir, file)
          const parsed = JSON.parse(await fsp.readFile(reportFile, 'utf8')) as CrashReport
          return {
            ...parsed,
            profileId: profile.id,
            profileName: profile.name,
            reportFile,
            logFile: path.join(crashDir, path.basename(parsed.logFile))
          }
        } catch {
          return null
        }
      })
  )
  return reports
    .filter((report): report is CrashReport => report !== null)
    .sort((left, right) => right.createdAt - left.createdAt)
}
