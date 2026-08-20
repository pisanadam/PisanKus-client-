import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import type { CrashReport, CrashSourceKind, GameLogLine, GameState, Profile } from '../../shared/types'
import {
  analyzeCrash,
  analyzeCrashText,
  redactSensitiveText,
  sanitizeCrashReportForShare,
  type CrashTextSource
} from './crashAnalysis.ts'
import {
  compareSuccessfulRunSnapshot,
  loadSuccessfulRunSnapshot,
  saveSuccessfulRunSnapshot,
  type RuntimeSnapshotInfo
} from './crashSnapshot.ts'

const MAX_BUFFERED_LINES = 5_000
const MAX_SOURCE_BYTES = 2 * 1024 * 1024
const SOURCE_CLOCK_SLOP_MS = 3_000
const INDEX_VERSION = 1

interface CrashIndex {
  schemaVersion: number
  processed: string[]
}

interface SourceCandidate {
  kind: CrashSourceKind
  file: string
  modifiedAt: number
  size: number
}

export { analyzeCrash, sanitizeCrashReportForShare }

/** Backwards-compatible line helper used by existing log consumers/tests. */
export function redactLogLine(value: string): string {
  return redactSensitiveText(value).slice(0, 8_000)
}

function publicSourcePath(profile: Profile, file: string): string {
  return `<PROFILE>/${path.relative(profile.directory, file).split(path.sep).join('/')}`
}

async function listMatching(directory: string, pattern: RegExp, kind: CrashSourceKind): Promise<SourceCandidate[]> {
  const names = await fsp.readdir(directory).catch(() => [])
  const entries = await Promise.all(
    names.filter((name) => pattern.test(name)).map(async (name): Promise<SourceCandidate | null> => {
      const file = path.join(directory, name)
      try {
        const stat = await fsp.lstat(file)
        if (!stat.isFile() || stat.isSymbolicLink()) return null
        return { kind, file, modifiedAt: stat.mtimeMs, size: stat.size }
      } catch {
        return null
      }
    })
  )
  return entries.filter((entry): entry is SourceCandidate => entry !== null)
}

async function sourceCandidates(profile: Profile): Promise<SourceCandidate[]> {
  const crashReports = await listMatching(
    path.join(profile.directory, 'crash-reports'),
    /^crash-.+\.txt$/i,
    'minecraft-crash'
  )
  const jvmCrashes = await listMatching(profile.directory, /^hs_err_pid\d+\.log$/i, 'jvm-crash')
  const latestFile = path.join(profile.directory, 'logs', 'latest.log')
  const latest = await fsp.lstat(latestFile).then<SourceCandidate | null>((stat) =>
    stat.isFile() && !stat.isSymbolicLink()
      ? { kind: 'latest-log', file: latestFile, modifiedAt: stat.mtimeMs, size: stat.size }
      : null
  ).catch(() => null)
  return [...crashReports, ...jvmCrashes, ...(latest ? [latest] : [])]
}

async function readSource(candidate: SourceCandidate, profile: Profile): Promise<CrashTextSource | null> {
  try {
    const handle = await fsp.open(candidate.file, 'r')
    try {
      const bytes = Math.min(candidate.size, MAX_SOURCE_BYTES)
      const buffer = Buffer.alloc(bytes)
      const position = candidate.kind === 'latest-log' ? Math.max(0, candidate.size - bytes) : 0
      const { bytesRead } = await handle.read(buffer, 0, bytes, position)
      return {
        kind: candidate.kind,
        path: publicSourcePath(profile, candidate.file),
        modifiedAt: candidate.modifiedAt,
        text: redactSensitiveText(buffer.subarray(0, bytesRead).toString('utf8'), {
          profileDirectory: profile.directory
        })
      }
    } finally {
      await handle.close()
    }
  } catch {
    return null
  }
}

function fingerprint(candidate: SourceCandidate, profile: Profile): string {
  return createHash('sha256')
    .update(`${path.relative(profile.directory, candidate.file)}\0${candidate.modifiedAt}\0${candidate.size}`)
    .digest('hex')
}

function indexFile(profile: Profile): string {
  return path.join(profile.directory, '.pisankus', 'crash-index.json')
}

async function readIndex(profile: Profile): Promise<CrashIndex> {
  try {
    const parsed = JSON.parse(await fsp.readFile(indexFile(profile), 'utf8')) as CrashIndex
    if (parsed.schemaVersion === INDEX_VERSION && Array.isArray(parsed.processed)) return parsed
  } catch {
    // A missing/corrupt index is safely rebuilt from reports discovered below.
  }
  const existing = await listCrashReports(profile)
  return {
    schemaVersion: INDEX_VERSION,
    processed: existing.map((report) => report.sourceFingerprint).filter((value): value is string => Boolean(value))
  }
}

async function writeIndex(profile: Profile, index: CrashIndex): Promise<void> {
  const file = indexFile(profile)
  const temporary = `${file}.${process.pid}.tmp`
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(temporary, JSON.stringify({ ...index, processed: index.processed.slice(-2_000) }, null, 2), {
    mode: 0o600
  })
  await fsp.rename(temporary, file)
}

async function markProcessed(profile: Profile, fingerprints: string[]): Promise<void> {
  if (fingerprints.length === 0) return
  const index = await readIndex(profile)
  index.processed = [...new Set([...index.processed, ...fingerprints])]
  await writeIndex(profile, index)
}

async function writeReport(
  profile: Profile,
  report: Omit<CrashReport, 'logFile' | 'reportFile'>,
  sourceText: string
): Promise<CrashReport> {
  const crashDir = path.join(profile.directory, 'crash-reports')
  const stem = `pisankus-${report.createdAt}-${report.id.slice(0, 8)}`
  const logFile = path.join(crashDir, `${stem}.log`)
  const reportFile = path.join(crashDir, `${stem}.json`)
  const complete: CrashReport = { ...report, logFile, reportFile }
  await fsp.mkdir(crashDir, { recursive: true })
  await fsp.writeFile(logFile, redactSensitiveText(sourceText, { profileDirectory: profile.directory }), {
    mode: 0o600
  })
  const temporaryReport = `${reportFile}.${process.pid}.tmp`
  await fsp.writeFile(temporaryReport, JSON.stringify(complete, null, 2), { mode: 0o600 })
  await fsp.rename(temporaryReport, reportFile)
  return complete
}

async function analyzeSources(
  profile: Profile,
  sources: CrashTextSource[],
  state: GameState,
  detectedWhileLauncherClosed: boolean,
  sourceFingerprint?: string,
  runtime: RuntimeSnapshotInfo = {}
): Promise<CrashReport> {
  const previous = await loadSuccessfulRunSnapshot(profile)
  const changes = compareSuccessfulRunSnapshot(previous, profile, runtime)
  const analysis = analyzeCrashText(sources.map((source) => source.text).join('\n'), {
    profile,
    sources,
    changesSinceLastSuccess: changes
  })
  const createdAt = Date.now()
  return writeReport(
    profile,
    {
      id: randomUUID(),
      profileId: profile.id,
      profileName: profile.name,
      createdAt,
      exitCode: state.exitCode,
      signal: state.signal,
      detectedWhileLauncherClosed,
      sourceFingerprint,
      ...analysis
    },
    sources.map((source) => `===== ${source.path} =====\n${source.text}`).join('\n\n')
  )
}

/** Writes a live sanitized log and creates a structured report only on failure. */
export class GameDiagnostics {
  private readonly profile: Profile
  private readonly lines: string[] = []
  private readonly latestLog: string
  private readonly stream: fs.WriteStream
  private readonly startedAt = Date.now()
  private runtime: RuntimeSnapshotInfo = {}
  private observedRunning = false
  private finishPromise?: Promise<CrashReport | null>

  constructor(profile: Profile) {
    this.profile = profile
    const logDir = path.join(profile.directory, 'logs')
    fs.mkdirSync(logDir, { recursive: true })
    this.latestLog = path.join(logDir, 'pisankus-latest.log')
    this.stream = fs.createWriteStream(this.latestLog, { flags: 'w', mode: 0o600 })
    this.stream.on('error', () => undefined)
  }

  setRuntime(runtime: RuntimeSnapshotInfo): void {
    this.runtime = { ...this.runtime, ...runtime }
  }

  markRunning(): void {
    this.observedRunning = true
  }

  record(line: GameLogLine): void {
    const rendered = `${new Date(line.at).toISOString()} [${line.stream}] ${redactSensitiveText(line.line, {
      profileDirectory: this.profile.directory
    }).slice(0, 8_000)}`
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

    if (state.status !== 'crashed') {
      if (this.observedRunning && state.status === 'exited') {
        await saveSuccessfulRunSnapshot(this.profile, this.runtime).catch(() => undefined)
      }
      return null
    }

    const candidates = (await sourceCandidates(this.profile))
      .filter((candidate) => candidate.modifiedAt >= this.startedAt - SOURCE_CLOCK_SLOP_MS)
      .sort((left, right) => right.modifiedAt - left.modifiedAt)
    const selected: SourceCandidate[] = []
    for (const kind of ['minecraft-crash', 'jvm-crash', 'latest-log'] as const) {
      const candidate = candidates.find((item) => item.kind === kind)
      if (candidate) selected.push(candidate)
    }
    const diskSources = (await Promise.all(selected.map((candidate) => readSource(candidate, this.profile))))
      .filter((source): source is CrashTextSource => source !== null)
    const liveSource: CrashTextSource = {
      kind: 'launcher-log',
      path: '<PROFILE>/logs/pisankus-latest.log',
      modifiedAt: Date.now(),
      text: this.lines.join('\n')
    }
    const fingerprints = selected.map((candidate) => fingerprint(candidate, this.profile))
    const report = await analyzeSources(this.profile, [...diskSources, liveSource], state, false, fingerprints[0], this.runtime)
    await markProcessed(this.profile, fingerprints).catch(() => undefined)
    return report
  }
}

/** Imports crash/JVM reports written while the detached game outlived the launcher. */
export async function detectUnprocessedCrashes(profile: Profile): Promise<CrashReport[]> {
  const index = await readIndex(profile)
  const processed = new Set(index.processed)
  const candidates = (await sourceCandidates(profile))
    .filter((candidate) => candidate.kind === 'minecraft-crash' || candidate.kind === 'jvm-crash')
    .sort((left, right) => left.modifiedAt - right.modifiedAt)
  const reports: CrashReport[] = []

  for (const candidate of candidates) {
    const sourceFingerprint = fingerprint(candidate, profile)
    if (processed.has(sourceFingerprint)) continue
    const primary = await readSource(candidate, profile)
    if (!primary) continue

    const latestCandidate = (await sourceCandidates(profile))
      .filter((item) => item.kind === 'latest-log' && Math.abs(item.modifiedAt - candidate.modifiedAt) < 10 * 60_000)
      .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]
    const latest = latestCandidate ? await readSource(latestCandidate, profile) : null
    const report = await analyzeSources(
      profile,
      latest ? [primary, latest] : [primary],
      { profileId: profile.id, status: 'crashed' },
      true,
      sourceFingerprint
    )
    reports.push(report)
    processed.add(sourceFingerprint)
  }

  if (reports.length > 0) await writeIndex(profile, { schemaVersion: INDEX_VERSION, processed: [...processed] })
  return reports
}

export async function listCrashReports(profile: Profile): Promise<CrashReport[]> {
  const crashDir = path.join(profile.directory, 'crash-reports')
  const files = await fsp.readdir(crashDir).catch(() => [])
  const reports = await Promise.all(
    files
      .filter((file) => /^(?:pisankus|opbay)-\d+(?:-[a-f0-9]{8})?\.json$/.test(file))
      .map(async (file): Promise<CrashReport | null> => {
        try {
          const reportFile = path.join(crashDir, file)
          const parsed = JSON.parse(await fsp.readFile(reportFile, 'utf8')) as CrashReport
          return {
            ...parsed,
            profileId: profile.id,
            profileName: profile.name,
            reportFile,
            logFile: path.join(crashDir, path.basename(parsed.logFile ?? file.replace(/\.json$/, '.log')))
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
