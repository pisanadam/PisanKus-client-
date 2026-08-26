import assert from 'node:assert/strict'
import test from 'node:test'
import { compareVersions, satisfiesRange } from '../src/main/content/versionRange.ts'

/**
 * These decide whether a warning is put on a mod the player installed on
 * purpose. A wrong warning is worse than a missing one — it teaches people to
 * ignore the warnings that are right — so everything unrecognised must pass.
 */
test('Maven ranges, as Forge writes them', () => {
  assert.equal(satisfiesRange('1.20.1', '[1.20.1,)'), true)
  assert.equal(satisfiesRange('1.19.2', '[1.20.1,)'), false)
  assert.equal(satisfiesRange('1.20.4', '[1.20,1.21)'), true)
  assert.equal(satisfiesRange('1.21', '[1.20,1.21)'), false)
  assert.equal(satisfiesRange('1.21', '[1.20,1.21]'), true)
  assert.equal(satisfiesRange('1.19', '(,1.21]'), true)
  assert.equal(satisfiesRange('1.20.1', '[1.20.1]'), true)
  assert.equal(satisfiesRange('1.20.2', '[1.20.1]'), false)
  // A union of two ranges: inside either one is enough.
  assert.equal(satisfiesRange('1.22', '[1.20,1.21),[1.22,)'), true)
  assert.equal(satisfiesRange('1.21.5', '[1.20,1.21),[1.22,)'), false)
})

test('predicates, as Fabric writes them', () => {
  assert.equal(satisfiesRange('1.20.1', '>=1.20.1'), true)
  assert.equal(satisfiesRange('1.20', '>=1.20.1'), false)
  assert.equal(satisfiesRange('1.20.4', '>=1.20.1 <1.21'), true)
  assert.equal(satisfiesRange('1.21', '>=1.20.1 <1.21'), false)
  assert.equal(satisfiesRange('1.20.4', '1.20.x'), true)
  assert.equal(satisfiesRange('1.21', '1.20.x'), false)
  assert.equal(satisfiesRange('1.20.6', '~1.20'), true)
  assert.equal(satisfiesRange('1.21', '~1.20'), false)
  assert.equal(satisfiesRange('1.21', '1.20.1 || 1.21'), true)
})

test('anything unrecognised is treated as a fit', () => {
  assert.equal(satisfiesRange('1.20.1', undefined), true)
  assert.equal(satisfiesRange('1.20.1', ''), true)
  assert.equal(satisfiesRange('1.20.1', '*'), true)
  assert.equal(satisfiesRange('1.20.1', 'her neyse'), true)
  assert.equal(satisfiesRange('1.20.1', '[bozuk'), true)
})

test('versions compare by number, not by text', () => {
  // The one a string comparison gets wrong.
  assert.ok(compareVersions('1.9', '1.10') < 0)
  assert.ok(compareVersions('1.20.1', '1.20') > 0)
  assert.equal(compareVersions('1.20', '1.20.0'), 0)
  assert.ok(compareVersions('1.20.1', '1.20.1-rc1') > 0)
})
