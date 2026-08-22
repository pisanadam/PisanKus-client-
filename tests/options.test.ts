import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { seedProfileOptions, writeProfileOptions } from '../src/main/minecraft/options.ts'

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
