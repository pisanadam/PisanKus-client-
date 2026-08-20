import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const profileDetail = readFileSync('src/renderer/pages/ProfileDetail.tsx', 'utf8')
const installer = readFileSync('src/main/content/install.ts', 'utf8')

test('available updates are shown without being installed automatically', () => {
  assert.match(profileDetail, /item\.updateAvailable/)
  assert.match(profileDetail, /Yeni sürüm çıktı/)
  assert.match(profileDetail, /onClick=\{\(\) => setPendingUpdates\(\[item\]\)\}/)
  assert.doesNotMatch(profileDetail, /onClick=\{\(\) => void run\(item\.id, \(\) => api\.content\.update/)
})

test('an update requires a discovered version and an explicit risk confirmation', () => {
  assert.match(installer, /!entry\.updateAvailable/)
  assert.match(profileDetail, /Bu güncelleme profili veya modları bozabilir ya da kararsız hâle getirebilir\./)
  assert.match(profileDetail, /Yine de güncelle/)
  assert.match(profileDetail, /api\.content\.update\(profileId, item\.id\)/)
})
