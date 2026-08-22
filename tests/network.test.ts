import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isNetworkFailure } from '../src/main/network.ts'

/**
 * The launcher starts the game offline when the network is unreachable, and
 * must not when a server refused something. Getting that line wrong in the
 * permissive direction is the dangerous one: a refused token would become a
 * silent offline launch, and the player would only find out when no server
 * would let them in.
 */
test('an unreachable network is recognised through the cause chain', () => {
  assert.equal(isNetworkFailure(Object.assign(new Error('boom'), { code: 'ENOTFOUND' })), true)
  assert.equal(isNetworkFailure(new TypeError('fetch failed')), true)
  assert.equal(
    isNetworkFailure(new Error('request failed', { cause: { code: 'ECONNREFUSED' } })),
    true
  )
  assert.equal(
    isNetworkFailure(new Error('outer', { cause: new Error('inner', { cause: { code: 'EAI_AGAIN' } }) })),
    true
  )
})

test('a refusal is not mistaken for a missing network', () => {
  assert.equal(isNetworkFailure(new Error('Microsoft oturumunuzun süresi doldu.')), false)
  assert.equal(isNetworkFailure(new Error('Bu hesapta Minecraft: Java Edition lisansı bulunamadı.')), false)
  assert.equal(isNetworkFailure(Object.assign(new Error('nope'), { code: 'ERR_BAD_REQUEST' })), false)
  assert.equal(isNetworkFailure(undefined), false)
  assert.equal(isNetworkFailure('kapalı'), false)
})

test('offline is decided by the launcher, not offered as a button', () => {
  const ipc = readFileSync('src/main/ipc.ts', 'utf8')
  assert.match(ipc, /let offline = options\?\.offline === true \|\| !looksOnline\(\)/)
  assert.match(ipc, /if \(!isNetworkFailure\(error\)\) \{/)

  // The two launch buttons that used to sit beside Play are gone.
  const profileDetail = readFileSync('src/renderer/pages/ProfileDetail.tsx', 'utf8')
  const library = readFileSync('src/renderer/pages/Library.tsx', 'utf8')
  assert.doesNotMatch(profileDetail, /offline: true/)
  assert.doesNotMatch(library, /offline: true/)
  assert.doesNotMatch(library, /t\('Çevrimdışı'\)/)
})
