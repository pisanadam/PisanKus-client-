import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')

test('pinned content cannot enter one-item or bulk updates', async () => {
  const installer = await fsp.readFile(path.join(root, 'src/main/content/install.ts'), 'utf8')
  const renderer = await fsp.readFile(path.join(root, 'src/renderer/pages/ProfileDetail.tsx'), 'utf8')
  assert.match(installer, /entry\.pinned/)
  assert.match(renderer, /item\.updateAvailable && !item\.pinned/)
})

test('server join supports quick play and the legacy server argument', async () => {
  const launcher = await fsp.readFile(path.join(root, 'src/main/minecraft/launcher.ts'), 'utf8')
  assert.match(launcher, /quickPlayMultiplayer/)
  assert.match(launcher, /gameArgs\.push\('--server', host\)/)
})

test('automatic world restore preserves the current world and keeps bounded history', async () => {
  const backups = await fsp.readFile(path.join(root, 'src/main/worldBackups.ts'), 'utf8')
  const ipc = await fsp.readFile(path.join(root, 'src/main/ipc.ts'), 'utf8')
  assert.match(backups, /const KEEP_PER_WORLD = 5/)
  assert.match(backups, /await backupWorld\(profile, folder\)/)
  assert.match(backups, /await fsp\.cp\(source, staging/)
  assert.match(backups, /if \(await fsp\.access\(current\).*await backupWorld\(profile, folder\)/)
  assert.match(ipc, /if \(profile\.autoBackupWorlds\)/)
})

test('profile health UI offers scanning and one-click fixes', async () => {
  const renderer = await fsp.readFile(path.join(root, 'src/renderer/pages/ProfileDetail.tsx'), 'utf8')
  const health = await fsp.readFile(path.join(root, 'src/main/profileHealth.ts'), 'utf8')
  assert.match(renderer, /api\.profiles\.health\(profileId\)/)
  assert.match(renderer, /api\.profiles\.fixHealth\(profileId/)
  assert.match(health, /remove-missing-content/)
  assert.match(health, /clear-custom-java/)
  assert.match(health, /status: score >= 85 \? 'healthy'/)
})

test('safe mode, storage manager, history and bulk content controls are wired end to end', async () => {
  const maintenance = await fsp.readFile(path.join(root, 'src/main/profileMaintenance.ts'), 'utf8')
  const preload = await fsp.readFile(path.join(root, 'src/preload/index.ts'), 'utf8')
  const renderer = await fsp.readFile(path.join(root, 'src/renderer/pages/ProfileDetail.tsx'), 'utf8')
  assert.match(maintenance, /enableSafeMode/)
  assert.match(maintenance, /restoreSafeMode/)
  assert.match(maintenance, /cleanProfileStorage/)
  assert.match(maintenance, /recordProfileHistory/)
  assert.match(preload, /content:toggleMany/)
  assert.match(renderer, /Güvenli başlat/)
  assert.match(renderer, /Değişiklik geçmişi/)
  assert.match(renderer, /Depolama kullanımı/)
  assert.match(renderer, /Güncellemesi olanlar/)
  assert.match(renderer, /Son 7 günde eklenenler/)
})

test('first-run wizard saves a selected play preset', async () => {
  const welcome = await fsp.readFile(path.join(root, 'src/renderer/components/Welcome.tsx'), 'utf8')
  assert.match(welcome, /performance/)
  assert.match(welcome, /balanced/)
  assert.match(welcome, /visuals/)
  assert.match(welcome, /defaultMemoryMb/)
})
