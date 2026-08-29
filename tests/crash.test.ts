import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Profile } from '../src/shared/types.ts'
import {
  detectUnprocessedCrashes,
  GameDiagnostics,
  listCrashReports,
  redactLogLine,
  sanitizeCrashReportForShare
} from '../src/main/minecraft/crash.ts'
import { classifyGameExit } from '../src/main/minecraft/gameLifecycle.ts'
import {
  compareSuccessfulRunSnapshot,
  createSuccessfulRunSnapshot
} from '../src/main/minecraft/crashSnapshot.ts'

function profile(directory = '/profiles/test'): Profile {
  return {
    id: 'profile-1',
    name: 'Test Profile',
    gameVersion: '1.21.4',
    loader: 'fabric',
    loaderVersion: '0.16.10',
    directory,
    memoryMb: 4096,
    content: [
      {
        id: 'modrinth:sodium',
        source: 'modrinth',
        projectId: 'AANobbMI',
        versionId: 'old-version',
        kind: 'mod',
        name: 'Sodium',
        fileName: 'sodium-fabric-0.6.12+mc1.21.4.jar',
        enabled: true,
        installedAt: 1
      }
    ],
    createdAt: 1,
    totalPlaytimeMs: 0
  }
}

test('crash reports redact bearer, access and refresh tokens', () => {
  const line = 'Authorization: Bearer very-secret --accessToken another-secret access_token=third-secret refreshToken=fourth'
  const redacted = redactLogLine(line)
  assert.doesNotMatch(redacted, /very-secret|another-secret|third-secret|fourth/)
  assert.equal((redacted.match(/\[REDACTED\]/g) ?? []).length, 4)
})

test('home directories and private absolute paths are redacted', () => {
  const redacted = redactLogLine('C:\\Users\\FixtureUser\\AppData\\Roaming\\game /home/fixture/.minecraft/logs/latest.log /root/private/cache/file.jar')
  assert.doesNotMatch(redacted, /FixtureUser|\/home\/fixture|\/root\/private/)
  assert.match(redacted, /<USER_HOME>/)
})

test('clipboard crash reports are sanitized recursively', () => {
  const report = sanitizeCrashReportForShare({
    logFile: '/home/fixture/.minecraft/crash.log',
    evidence: ['--accessToken secret-token']
  }, '/home/fixture/.minecraft', '/home/fixture')
  assert.equal(report.logFile, '<PROFILE>/crash.log')
  assert.doesNotMatch(report.evidence[0], /secret-token/)
})

test('successful snapshot comparison detects added, updated, enabled, loader, Java and RAM changes', () => {
  const previousProfile = profile()
  previousProfile.content.push({
    id: 'modrinth:iris', source: 'modrinth', projectId: 'iris', versionId: '1', kind: 'mod',
    name: 'Iris', fileName: 'iris-1.jar', enabled: false, installedAt: 1
  })
  const snapshot = createSuccessfulRunSnapshot(previousProfile, { javaPath: '/runtime/java17', javaMajorVersion: 17 })
  const current = structuredClone(previousProfile)
  current.loaderVersion = '0.16.11'
  current.memoryMb = 6144
  current.content[0].versionId = 'new-version'
  current.content[1].enabled = true
  current.content.push({
    id: 'modrinth:lithium', source: 'modrinth', projectId: 'lithium', versionId: '1', kind: 'mod',
    name: 'Lithium', fileName: 'lithium.jar', enabled: true, installedAt: 2
  })
  const changes = compareSuccessfulRunSnapshot(snapshot, current, {
    javaPath: '/runtime/java21', javaMajorVersion: 21
  })
  for (const kind of ['added', 'updated', 'enabled', 'loader', 'java', 'memory'] as const) {
    assert.ok(changes.some((change) => change.kind === kind), `missing ${kind}`)
  }
})

test('Durdur requested SIGTERM/SIGKILL is exited, not crashed', () => {
  assert.equal(classifyGameExit(null, 'SIGTERM', true), 'exited')
  assert.equal(classifyGameExit(null, 'SIGKILL', true), 'exited')
  assert.equal(classifyGameExit(0, null, false), 'exited')
  assert.equal(classifyGameExit(null, 'SIGSEGV', false), 'crashed')
  assert.equal(classifyGameExit(1, null, false), 'crashed')
})

test('an intentional stopped session writes no crash report and does write the success snapshot', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-stop-test-'))
  try {
    const currentProfile = profile(directory)
    const diagnostics = new GameDiagnostics(currentProfile)
    diagnostics.markRunning()
    diagnostics.setRuntime({ javaPath: '/runtime/java', javaMajorVersion: 21, memoryMb: 4096 })
    const result = await diagnostics.finish({ profileId: currentProfile.id, status: 'exited', signal: 'SIGTERM' })
    assert.equal(result, null)
    assert.equal((await listCrashReports(currentProfile)).length, 0)
    const snapshot = JSON.parse(await fsp.readFile(path.join(directory, '.pisankus', 'last-success.json'), 'utf8'))
    assert.equal(snapshot.java.majorVersion, 21)
    assert.doesNotMatch(JSON.stringify(snapshot), /\/runtime\/java/)
  } finally {
    await fsp.rm(directory, { recursive: true, force: true })
  }
})

test('the same detached crash file is imported only once', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-crash-test-'))
  try {
    const currentProfile = profile(directory)
    const crashDir = path.join(directory, 'crash-reports')
    await fsp.mkdir(crashDir, { recursive: true })
    const fixture = await fsp.readFile(path.join(import.meta.dirname, 'fixtures', 'crashes', 'fabric-mixin-crash.txt'), 'utf8')
    await fsp.writeFile(path.join(crashDir, 'crash-2026-08-20_12.00.00-client.txt'), fixture)
    assert.equal((await detectUnprocessedCrashes(currentProfile)).length, 1)
    assert.equal((await detectUnprocessedCrashes(currentProfile)).length, 0)
  } finally {
    await fsp.rm(directory, { recursive: true, force: true })
  }
})

/**
 * The analyser is gone. It scored keywords in the log into a category, a
 * confidence percentage and a "probable mod", and it was wrong often enough to
 * send people after mods that were fine — while the one failure that mattered,
 * a loader whose own build steps had never run, came out as "unknown crash".
 *
 * What is kept is what the launcher actually knows, and the redaction, which was
 * never analysis: a log carries the access token the game was launched with.
 */
test('a crash report states facts and guesses nothing', () => {
  const types = readFileSync('src/shared/types.ts', 'utf8')
  const report = types.slice(types.indexOf('export interface CrashReport {'))

  for (const guessed of ['category', 'confidence', 'suggestions', 'suspectedMods', 'summary', 'title']) {
    assert.doesNotMatch(report.slice(0, report.indexOf('\n}')), new RegExp(`\\b${guessed}[?]?:`), guessed)
  }
  // The facts stay.
  for (const fact of ['exitCode', 'signal', 'logFile', 'sources', 'changesSinceLastSuccess']) {
    assert.match(report.slice(0, report.indexOf('\n}')), new RegExp(`\\b${fact}[?]?:`), fact)
  }

  // The module that did the guessing is gone; the one that redacts is not.
  assert.equal(existsSync('src/main/minecraft/crashAnalysis.ts'), false)
  assert.equal(existsSync('src/main/minecraft/redact.ts'), true)

  // And the notice no longer names a cause or a percentage.
  const context = readFileSync('src/renderer/state/AppContext.tsx', 'utf8')
  assert.doesNotMatch(context, /güven/)
  assert.doesNotMatch(context, /Muhtemel mod/)
})
