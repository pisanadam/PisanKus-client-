import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string): string => readFileSync(path, 'utf8')

test('desktop and Android use independent rolling releases', () => {
  const desktop = read('.github/workflows/release.yml')
  const android = read('.github/workflows/android-release.yml')

  assert.match(desktop, /tag_name: desktop-latest/)
  assert.doesNotMatch(desktop, /PisanKusClient-android\.apk/)
  assert.match(android, /tag_name: android-latest/)
  assert.match(android, /tags:\s*\n\s*- 'android-v\*'/)
  assert.doesNotMatch(android, /branches:/)
})

test('each updater is pinned to its own channel', () => {
  const desktop = read('src/main/updater.ts')
  const android = read('android/app_pojavlauncher/src/main/java/net/kdt/pojavlaunch/PisanKusUpdater.java')

  assert.match(desktop, /desktop-latest/)
  assert.match(desktop, /provider: 'generic'/)
  assert.doesNotMatch(desktop, /android-latest/)
  assert.match(android, /android-latest\/android-update\.json/)
  assert.doesNotMatch(android, /releases\/latest/)
  assert.match(android, /publishedCode <= BuildConfig\.VERSION_CODE/)
})

test('repository latest remains the Android migration bridge', () => {
  const desktop = read('.github/workflows/release.yml')
  const android = read('.github/workflows/android-release.yml')

  assert.match(desktop, /tag_name: desktop-latest[\s\S]*?make_latest: false/)
  assert.match(android, /tag_name: android-latest[\s\S]*?make_latest: true/)
})
