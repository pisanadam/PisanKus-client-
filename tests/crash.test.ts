import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeCrash, redactLogLine } from '../src/main/minecraft/crash.ts'

test('crash analysis identifies an out-of-memory failure', () => {
  const report = analyzeCrash('java.lang.OutOfMemoryError: Java heap space')
  assert.equal(report.category, 'memory')
  assert.match(report.title, /Bellek/)
  assert.ok(report.suggestions.length >= 2)
})

test('crash analysis identifies missing mod dependencies', () => {
  const report = analyzeCrash('ModResolutionException: mod example depends on fabric-api which is missing')
  assert.equal(report.category, 'dependency')
  assert.match(report.evidence.join('\n'), /fabric-api/)
})

test('crash reports redact bearer and Minecraft access tokens', () => {
  const line = 'Authorization: Bearer very-secret --accessToken another-secret access_token=third-secret'
  const redacted = redactLogLine(line)
  assert.doesNotMatch(redacted, /very-secret|another-secret|third-secret/)
  assert.equal((redacted.match(/\[REDACTED\]/g) ?? []).length, 3)
})

test('unknown crashes keep only a short tail as evidence', () => {
  const report = analyzeCrash(Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n'))
  assert.equal(report.category, 'unknown')
  assert.deepEqual(report.evidence, Array.from({ length: 8 }, (_, index) => `line ${index + 12}`))
})
