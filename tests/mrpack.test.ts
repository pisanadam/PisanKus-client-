import assert from 'node:assert/strict'
import test from 'node:test'
import { isClientFile, loaderFromDependencies, readPackIndex } from '../src/main/content/mrpack.ts'

/** A file entry, shaped the way Modrinth writes them. */
function file(pathName: string, client?: string) {
  return {
    path: pathName,
    hashes: { sha1: '0'.repeat(40) },
    downloads: [`https://cdn.modrinth.com/${pathName}`],
    fileSize: 1024,
    ...(client ? { env: { client, server: 'required' } } : {})
  }
}

test('each loader is recognised from the dependency block', () => {
  assert.deepEqual(loaderFromDependencies({ minecraft: '1.21.1', 'fabric-loader': '0.16.9' }), {
    loader: 'fabric',
    loaderVersion: '0.16.9'
  })
  assert.deepEqual(loaderFromDependencies({ minecraft: '1.21.1', 'quilt-loader': '0.26.0' }), {
    loader: 'quilt',
    loaderVersion: '0.26.0'
  })
  assert.deepEqual(loaderFromDependencies({ minecraft: '1.21.1', neoforge: '21.1.72' }), {
    loader: 'neoforge',
    loaderVersion: '21.1.72'
  })
  assert.deepEqual(loaderFromDependencies({ minecraft: '1.20.1', forge: '47.4.10' }), {
    loader: 'forge',
    loaderVersion: '47.4.10'
  })
  assert.deepEqual(loaderFromDependencies({ minecraft: '1.21.1' }), { loader: 'vanilla' })
})

/**
 * NeoForge packs sometimes still carry a `forge` entry for launchers that do
 * not know NeoForge. Picking that one builds the profile on the wrong loader,
 * and every mod in the pack then fails to load.
 */
test('a pack naming both NeoForge and Forge is a NeoForge pack', () => {
  assert.deepEqual(
    loaderFromDependencies({ minecraft: '1.21.1', neoforge: '21.1.72', forge: '21.1.72' }),
    { loader: 'neoforge', loaderVersion: '21.1.72' }
  )
})

test('server-only files are not counted', () => {
  const details = readPackIndex(
    {
      name: 'Better MC',
      versionId: 'v33',
      dependencies: { minecraft: '1.20.1', forge: '47.4.10' },
      files: [file('mods/a.jar'), file('mods/b.jar', 'unsupported'), file('mods/c.jar', 'optional')]
    },
    'better-mc'
  )
  assert.equal(details.fileCount, 2)
  assert.equal(details.gameVersion, '1.20.1')
  assert.equal(details.loader, 'forge')
  assert.equal(details.name, 'Better MC')

  assert.equal(isClientFile(file('mods/a.jar', 'unsupported')), false)
  assert.equal(isClientFile(file('mods/a.jar', 'optional')), true)
  assert.equal(isClientFile(file('mods/a.jar')), true)
})

test('a pack with no name of its own falls back to the file name', () => {
  const details = readPackIndex(
    { dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.9' } },
    'arkadastan-gelen-paket'
  )
  assert.equal(details.name, 'arkadastan-gelen-paket')
  assert.equal(details.fileCount, 0)
  assert.equal(details.loader, 'fabric')
})

/**
 * Without the Minecraft version there is nothing to build a profile on, and
 * guessing one produces a profile that downloads the wrong game.
 */
test('a pack that names no Minecraft version is refused', () => {
  assert.throws(
    () => readPackIndex({ name: 'Bozuk', dependencies: { forge: '47.4.10' } }, 'bozuk'),
    /Minecraft sürümü/
  )
  assert.throws(() => readPackIndex({}, 'bos'), /Minecraft sürümü/)
})
