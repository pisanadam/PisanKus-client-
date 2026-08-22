import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  applyManagedOptions,
  changedOptions,
  describeProfileOptions,
  seedProfileOptions,
  writeProfileOptions
} from '../src/main/minecraft/options.ts'

async function profileDir(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-options-'))
}

async function read(directory: string): Promise<string> {
  return fsp.readFile(path.join(directory, 'options.txt'), 'utf8')
}

test('a seeded file carries the data version', async () => {
  const directory = await profileDir()
  assert.equal(await seedProfileOptions(directory, 'fov:0.5\n', 4189), true)

  const text = await read(directory)
  assert.match(text, /^version:4189$/m)
  assert.match(text, /^fov:0\.5$/m)
})

/**
 * The failure this guards against: settings saved before the profile had ever
 * been launched produced a file with no `version` line, because the number
 * lives inside a client jar that had not been downloaded yet. Minecraft
 * discards such a file and starts from its own defaults, so the settings
 * silently did nothing.
 */
test('a file written before the version was known is stamped at launch', async () => {
  const directory = await profileDir()
  await writeProfileOptions(directory, 'fov:0.5\nguiScale:2\n', true)
  assert.doesNotMatch(await read(directory), /^version:/m)

  assert.equal(await seedProfileOptions(directory, 'fov:0.5\n', 4189), true)

  const text = await read(directory)
  assert.match(text, /^version:4189$/m)
  // Stamping must not disturb what the player set.
  assert.match(text, /^fov:0\.5$/m)
  assert.match(text, /^guiScale:2$/m)
})

test('a file that already names a version is left alone', async () => {
  const directory = await profileDir()
  await fsp.writeFile(path.join(directory, 'options.txt'), 'version:3465\nfov:0.7\n', 'utf8')

  assert.equal(await seedProfileOptions(directory, 'fov:0.5\n', 4189), false)
  assert.match(await read(directory), /^version:3465$/m)
  assert.match(await read(directory), /^fov:0\.7$/m)
})

test('applying the template keeps keys the template says nothing about', async () => {
  const directory = await profileDir()
  await fsp.writeFile(
    path.join(directory, 'options.txt'),
    'version:3465\nfov:0.7\nkey_key.jump:key.keyboard.space\n',
    'utf8'
  )

  assert.equal(await writeProfileOptions(directory, 'fov:0.5\n', true), true)

  const text = await read(directory)
  assert.match(text, /^fov:0\.5$/m)
  assert.match(text, /^version:3465$/m)
  assert.match(text, /^key_key\.jump:key\.keyboard\.space$/m)
})

/**
 * Minecraft reads options.txt once, at startup, and writes the whole file back
 * when it quits. A save made while the game is running is therefore invisible
 * in that session and then flattened on exit — the launcher holds it until the
 * process is gone instead.
 */
test('a save made while the game runs is held until it exits', () => {
  const ipc = readFileSync('src/main/ipc.ts', 'utf8')

  // Both save paths check the running session before touching the file.
  assert.match(ipc, /if \(sessions\.has\(id\)\) \{\s*pendingOptions\.set\(id, text\)/)
  assert.match(ipc, /if \(sessions\.has\(id\)\) \{\s*pendingOptions\.set\(id, store\.settings\.minecraftOptions\)/)

  // And the held text is written on exit, and again before the next launch in
  // case the launcher was closed before the game was.
  assert.match(ipc, /sessions\.delete\(profileId\)\s*\n\s*launchAborts\.delete\(profileId\)\s*\n\s*void flushPendingOptions\(profileId\)/)
  assert.match(ipc, /await flushPendingOptions\(profileId\)/)
})

test('the template is still seeded when the data version cannot be read', async () => {
  const directory = await profileDir()
  assert.equal(await seedProfileOptions(directory, 'fov:0.5\nguiScale:2\n', undefined), true)

  const text = await read(directory)
  assert.match(text, /^fov:0\.5$/m)
  assert.match(text, /^guiScale:2$/m)
  assert.doesNotMatch(text, /^version:/m)
})

test('the launch log says what the game is about to read', async () => {
  const directory = await profileDir()
  assert.equal(await describeProfileOptions(directory), 'options.txt: yok')

  await fsp.writeFile(path.join(directory, 'options.txt'), 'version:4189\nfov:0.5\n', 'utf8')
  assert.equal(await describeProfileOptions(directory), 'options.txt: 2 anahtar, version:4189')
})

/**
 * The failure the player kept hitting: a setting saved in the launcher was
 * correct on disk and still had no effect in the game, because Minecraft
 * rewrites the whole file when it quits — and replaces it outright with its own
 * defaults whenever it will not read it. One write at save time cannot survive
 * either. Recording what the player changed and stamping it back just before
 * the game reads the file is what makes the setting stick.
 */
test('only what the player changed is claimed by the launcher', () => {
  const before = 'version:4189\nrenderDistance:12\nfov:0.0\nkey_key.jump:key.keyboard.space\n'
  const after = 'version:4189\nrenderDistance:20\nfov:0.0\nkey_key.jump:key.keyboard.space\n'

  assert.deepEqual(changedOptions(before, after), { renderDistance: '20' })
})

test('a launcher setting survives the game resetting the file', async () => {
  const directory = await profileDir()
  const managed = { renderDistance: '20', enableVsync: 'false' }

  // What Minecraft leaves behind when it discards a file and writes its own.
  await fsp.writeFile(
    path.join(directory, 'options.txt'),
    'version:4189\nrenderDistance:12\nenableVsync:true\nresourcePacks:["vanilla"]\n',
    'utf8'
  )

  assert.equal(await applyManagedOptions(directory, managed, 4189), 2)

  const text = await read(directory)
  assert.match(text, /^renderDistance:20$/m)
  assert.match(text, /^enableVsync:false$/m)
  // Everything the launcher does not manage is left exactly as the game wrote it.
  assert.match(text, /^resourcePacks:\["vanilla"\]$/m)
  assert.match(text, /^version:4189$/m)

  // A second launch has nothing to correct, which is how the log tells a healthy
  // profile apart from one whose file the game keeps rejecting.
  assert.equal(await applyManagedOptions(directory, managed, 4189), 0)
})

test('managed keys are stamped onto a file the game never wrote', async () => {
  const directory = await profileDir()
  assert.equal(await applyManagedOptions(directory, { fov: '0.5' }, 4189), 2)

  const text = await read(directory)
  assert.match(text, /^fov:0\.5$/m)
  assert.match(text, /^version:4189$/m)
})

test('a profile the launcher manages nothing for is not touched', async () => {
  const directory = await profileDir()
  assert.equal(await applyManagedOptions(directory, undefined, 4189), 0)
  assert.equal(await applyManagedOptions(directory, {}, 4189), 0)
  await assert.rejects(read(directory))
})

test('the launcher re-applies its settings on every launch', () => {
  const launcher = readFileSync('src/main/minecraft/launcher.ts', 'utf8')
  const seed = launcher.indexOf('seedProfileOptions(profile.directory')
  const apply = launcher.indexOf('applyManagedOptions(profile.directory')
  const spawn = launcher.indexOf('spawn(')

  assert.ok(seed > 0 && apply > 0 && spawn > 0)
  // Seed first (it only ever creates), then the player's own choices, and both
  // before the process that reads the file exists.
  assert.ok(seed < apply, 'managed options must go on after the template')
  assert.ok(apply < spawn, 'options must be written before the game starts')
})

test('saving records the change and clearing gives the file back', () => {
  const ipc = readFileSync('src/main/ipc.ts', 'utf8')

  // Both save paths record, and the deferred one records too.
  assert.equal(ipc.split('await recordManagedOptions(').length - 1, 3)
  assert.match(ipc, /handle\('profiles:clearManagedOptions'/)
  assert.match(ipc, /managedOptions: \{\}/)

  // Nothing is claimed from a profile that has no file yet: that would hand the
  // launcher every key in the template at once.
  assert.match(ipc, /if \(existing === null\) return/)
})
