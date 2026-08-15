import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { assertLocalFiles } from '../src/main/minecraft/downloader.ts'

test('offline readiness accepts complete local files without fetching', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'opbay-offline-test-'))
  try {
    const file = path.join(root, 'client.jar')
    await fsp.writeFile(file, 'ready')
    await assert.doesNotReject(
      assertLocalFiles([{ url: 'https://invalid.example/client.jar', destination: file, size: 5 }])
    )
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('offline readiness reports missing and truncated files', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'opbay-offline-test-'))
  try {
    const truncated = path.join(root, 'library.jar')
    await fsp.writeFile(truncated, 'x')
    await assert.rejects(
      assertLocalFiles([
        { url: 'https://invalid.example/library.jar', destination: truncated, size: 20 },
        { url: 'https://invalid.example/asset.dat', destination: path.join(root, 'asset.dat'), size: 4 }
      ]),
      /2 dosya eksik veya bozuk/
    )
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})
