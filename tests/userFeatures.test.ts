import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import { readFileSync } from 'node:fs'
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
  // Safe mode is a state the profile is left in, so it is offered in the
  // profile's own maintenance section rather than as a second launch button.
  assert.match(renderer, /Güvenli modu aç/)
  assert.doesNotMatch(renderer, /Güvenli başlat/)
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

/**
 * Adding a second account used to be impossible: the sign-in window shared one
 * persistent cookie jar and never asked which account to use, so Microsoft
 * signed it straight back in as whoever it saw last and redirected before the
 * page was drawn — the window opened and shut itself. Trying again repeated the
 * same silent sign-in until Microsoft answered "too many requests".
 */
test('each sign-in gets its own cookie jar and asks which account', () => {
  const auth = readFileSync('src/main/auth/microsoft.ts', 'utf8')

  assert.doesNotMatch(auth, /persist:msa/)
  assert.match(auth, /const partition = `msa-\$\{randomBytes\(8\)\.toString\('hex'\)\}`/)
  assert.match(auth, /partition\s*\}\s*\n\s*\}\)/)

  // The prompt is set for both platforms, not only the one that uses PKCE.
  const prompt = auth.indexOf("params.set('prompt', 'select_account')")
  assert.ok(prompt > 0)
  assert.ok(prompt > auth.indexOf('if (pkce) {'))
  assert.equal(auth.split("params.set('prompt', 'select_account')").length - 1, 1)
})

test('the profile icon controls stay inside the settings column', () => {
  const css = readFileSync('src/renderer/styles/global.css', 'utf8')
  assert.match(css, /\.settings-row > \*\s*\{\s*min-width:\s*0;/)
  assert.match(css, /\.settings-row__controls\s*\{\s*flex-wrap:\s*wrap;/)

  const detail = readFileSync('src/renderer/pages/ProfileDetail.tsx', 'utf8')
  assert.match(detail, /className="row settings-row__controls"/)
})
