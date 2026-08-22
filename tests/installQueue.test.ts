import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const transaction = readFileSync('src/main/profileTransaction.ts', 'utf8')
const discover = readFileSync('src/renderer/pages/Discover.tsx', 'utf8')

test('a second install on the same profile waits instead of being refused', () => {
  // The refusal is what the player used to see; it must not come back.
  assert.doesNotMatch(transaction, /başka bir kurulum işlemi/)
  assert.doesNotMatch(transaction, /activeProfiles/)

  // Each call chains onto whatever is already running for that profile.
  assert.match(transaction, /const previous = queues\.get\(profileId\)/)
  assert.match(transaction, /await previous\.catch\(\(\) => undefined\)/)
  assert.match(transaction, /queues\.set\(profileId, run\)/)
})

test('the queue is not left holding a finished operation', () => {
  assert.match(transaction, /if \(queues\.get\(profileId\) === run\) queues\.delete\(profileId\)/)
})

test('the install button reports what it is doing', () => {
  assert.match(discover, /installing \? t\('Kuruluyor…'\) : installed \? t\('Kuruldu'\) : t\('Kur'\)/)
  assert.match(discover, /disabled=\{!canInstall \|\| installing \|\| installed\}/)
})

test('an install finished in the dialog also marks the card', () => {
  // Both paths add the project id, so the card is right whichever way the
  // install was completed.
  const marks = discover.match(/setInstalled\(\(current\) => new Set\(current\)\.add\(/g) ?? []
  assert.equal(marks.length, 2)
})
