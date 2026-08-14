import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { requireLeafName, requireProfileDirectory, resolveInside } from '../src/main/pathSafety.ts'

test('resolveInside accepts a normal pack-relative path', () => {
  const root = path.resolve('sandbox', 'profile')
  assert.equal(resolveInside(root, 'mods/example.jar'), path.join(root, 'mods', 'example.jar'))
  assert.equal(resolveInside(root, './mods//example.jar'), path.join(root, 'mods', 'example.jar'))
})

test('resolveInside rejects traversal and absolute paths', () => {
  const root = path.resolve('sandbox', 'profile')
  for (const candidate of ['../outside.txt', 'mods/../../outside.txt', '/tmp/outside', 'C:\\outside.txt']) {
    assert.throws(() => resolveInside(root, candidate), /dışına çıkamaz/)
  }
})

test('requireLeafName rejects paths passed as names', () => {
  assert.equal(requireLeafName('world-one'), 'world-one')
  for (const candidate of ['..', '../world', 'folder/world', 'folder\\world']) {
    assert.throws(() => requireLeafName(candidate), /geçersiz/)
  }
})

test('requireProfileDirectory only accepts direct children of profiles', () => {
  const valid = path.resolve('game-data', 'profiles', 'survival')
  assert.equal(requireProfileDirectory(valid), valid)
  assert.throws(() => requireProfileDirectory(path.parse(valid).root), /dosyalar silinmedi/)
  assert.throws(() => requireProfileDirectory(path.resolve('game-data')), /dosyalar silinmedi/)
})
