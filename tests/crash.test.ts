import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Profile } from '../src/shared/types.ts'
import {
  analyzeCrash,
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

test('crash analysis scores an out-of-memory failure above weaker symptoms', () => {
  const report = analyzeCrash('NoClassDefFoundError\njava.lang.OutOfMemoryError: Java heap space')
  assert.equal(report.category, 'memory')
  assert.ok(report.confidence >= 90)
  assert.ok(report.secondaryCauses.some((cause) => cause.category === 'dependency'))
})

test('crash analysis identifies the wrong Java class version', () => {
  assert.equal(analyzeCrash('UnsupportedClassVersionError: class file version 65.0').category, 'java')
})

test('crash analysis identifies Fabric missing dependencies', () => {
  const report = analyzeCrash('ModResolutionException: mod example depends on fabric-api which is missing')
  assert.equal(report.category, 'dependency')
  assert.match(report.evidence.join('\n'), /fabric-api/)
})

test('crash analysis identifies Fabric incompatible mods', () => {
  assert.equal(analyzeCrash('Incompatible mods found! replace mod fabric-api with version 1.2').category, 'dependency')
})

test('crash analysis identifies Forge and NeoForge mod loading failures', () => {
  assert.equal(analyzeCrash('net.minecraftforge.fml.LoadingFailedException: Mod loading has failed').category, 'dependency')
  assert.equal(analyzeCrash('net.neoforged.fml.ModLoadingException: Mod loading failed').category, 'dependency')
})

test('crash analysis identifies MixinApplyError', () => {
  assert.equal(analyzeCrash('MixinTransformerError caused by MixinApplyError: mixin failed').category, 'mixin')
})

test('crash analysis identifies shader/OpenGL window crashes', () => {
  assert.equal(analyzeCrash('GLFW error 65542: OpenGL not supported; Failed to create window').category, 'graphics')
})

test('crash analysis identifies native LWJGL failures', () => {
  assert.equal(analyzeCrash('java.lang.UnsatisfiedLinkError: no lwjgl in java.library.path').category, 'native')
})

test('hs_err fatal JVM crash receives native classification and source metadata', () => {
  const report = analyzeCrash('', {
    sources: [{
      kind: 'jvm-crash',
      path: '<PROFILE>/hs_err_pid123.log',
      text: '# A fatal error has been detected by the Java Runtime Environment'
    }]
  })
  assert.equal(report.category, 'native')
  assert.equal(report.sources[0]?.kind, 'jvm-crash')
})

test('unknown crashes keep only a short tail as evidence', () => {
  const report = analyzeCrash(Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n'))
  assert.equal(report.category, 'unknown')
  assert.deepEqual(report.evidence, Array.from({ length: 8 }, (_, index) => `line ${index + 12}`))
})

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

test('suspected mod detection matches installed content and snapshot changes', async () => {
  const fixture = await fsp.readFile(path.join(import.meta.dirname, 'fixtures', 'crashes', 'fabric-mixin-crash.txt'), 'utf8')
  const current = profile()
  const previousProfile = profile()
  current.content[0].versionId = 'new-version'
  current.content[0].fileName = 'sodium-fabric-0.6.13+mc1.21.4.jar'
  const snapshot = createSuccessfulRunSnapshot(previousProfile)
  const changes = compareSuccessfulRunSnapshot(snapshot, current)
  const report = analyzeCrash(fixture, { profile: current, changesSinceLastSuccess: changes })
  assert.equal(report.suspectedMods[0]?.name, 'Sodium')
  assert.ok((report.suspectedMods[0]?.confidence ?? 0) >= 90)
  assert.ok(report.suspectedMods[0]?.reasons.some((reason) => /güncellendi/.test(reason)))
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

test('a real-format Minecraft crash fixture is analyzed from its primary source', async () => {
  const fixture = await fsp.readFile(path.join(import.meta.dirname, 'fixtures', 'crashes', 'fabric-mixin-crash.txt'), 'utf8')
  const report = analyzeCrash('', {
    sources: [{ kind: 'minecraft-crash', path: '<PROFILE>/crash-reports/crash-fixture.txt', text: fixture }]
  })
  assert.equal(report.category, 'mixin')
  assert.equal(report.sources[0]?.kind, 'minecraft-crash')
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
