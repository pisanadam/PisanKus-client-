import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { listScreenshots, thumbnailCacheName } from '../src/main/screenshots.ts'

async function workspace(): Promise<{ shots: string; cache: string }> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-shots-'))
  const shots = path.join(root, 'screenshots')
  await fsp.mkdir(shots, { recursive: true })
  return { shots, cache: path.join(root, '.pisankus', 'cache', 'thumbnails') }
}

/** Stands in for Electron's decoder, and counts how often it was needed. */
function counting(bytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb])) {
  let calls = 0
  return {
    encode: async () => {
      calls += 1
      return bytes
    },
    get calls() {
      return calls
    }
  }
}

test('thumbnails are JPEG data urls, not PNG', async () => {
  const { shots, cache } = await workspace()
  await fsp.writeFile(path.join(shots, 'bir.png'), 'ham veri')

  const [entry] = await listScreenshots(shots, cache, counting().encode)
  assert.equal(entry.fileName, 'bir.png')
  assert.match(entry.thumbnail, /^data:image\/jpeg;base64,/)
})

test('a second listing reads the cache instead of re-encoding', async () => {
  const { shots, cache } = await workspace()
  await fsp.writeFile(path.join(shots, 'bir.png'), 'ham veri')
  await fsp.writeFile(path.join(shots, 'iki.png'), 'başka veri')

  const encoder = counting()
  const first = await listScreenshots(shots, cache, encoder.encode)
  assert.equal(encoder.calls, 2)

  const second = await listScreenshots(shots, cache, encoder.encode)
  assert.equal(encoder.calls, 2, 'ikinci listede yeniden kodlanmamalı')
  assert.deepEqual(second, first)
})

test('a replaced screenshot re-renders rather than serving the old thumbnail', async () => {
  const { shots, cache } = await workspace()
  const file = path.join(shots, 'bir.png')
  await fsp.writeFile(file, 'ilk')

  const before = counting(Buffer.from([1, 2, 3]))
  const [old] = await listScreenshots(shots, cache, before.encode)

  // Same name, different bytes — and a modification time the filesystem will
  // report as later, which is what the key is built from.
  await fsp.writeFile(file, 'ikinci sürüm, daha uzun')
  await fsp.utimes(file, new Date(), new Date(Date.now() + 5_000))

  const after = counting(Buffer.from([9, 9, 9]))
  const [fresh] = await listScreenshots(shots, cache, after.encode)
  assert.equal(after.calls, 1)
  assert.notEqual(fresh.thumbnail, old.thumbnail)
})

test('thumbnails of deleted screenshots are dropped from the cache', async () => {
  const { shots, cache } = await workspace()
  await fsp.writeFile(path.join(shots, 'bir.png'), 'ham veri')
  await fsp.writeFile(path.join(shots, 'iki.png'), 'başka veri')

  await listScreenshots(shots, cache, counting().encode)
  assert.equal((await fsp.readdir(cache)).length, 2)

  await fsp.rm(path.join(shots, 'iki.png'))
  await listScreenshots(shots, cache, counting().encode)
  assert.deepEqual(
    await fsp.readdir(cache),
    [thumbnailCacheName('bir.png', (await fsp.stat(path.join(shots, 'bir.png'))).mtimeMs, 8)]
  )
})

test('a file that cannot be decoded is listed without a thumbnail', async () => {
  const { shots, cache } = await workspace()
  await fsp.writeFile(path.join(shots, 'bozuk.png'), 'resim değil')
  await fsp.writeFile(path.join(shots, 'notlar.txt'), 'resim bile değil')

  const entries = await listScreenshots(shots, cache, async () => null)
  assert.deepEqual(entries.map((entry) => entry.fileName), ['bozuk.png'])
  assert.equal(entries[0].thumbnail, '')
  // Nothing was produced, so nothing should have been cached.
  assert.deepEqual(await fsp.readdir(cache).catch(() => []), [])
})
