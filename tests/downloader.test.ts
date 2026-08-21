import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { assertLocalFiles, downloadFile } from '../src/main/minecraft/downloader.ts'

test('offline readiness accepts complete local files without fetching', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-offline-test-'))
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

test('download resumes an existing partial file with an HTTP Range request', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-resume-test-'))
  const payload = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz')
  let receivedRange = ''
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers)
    receivedRange = headers.get('Range') ?? ''
    const start = Number(receivedRange.match(/bytes=(\d+)-/)?.[1] ?? 0)
    return new Response(payload.subarray(start), {
      status: start > 0 ? 206 : 200,
      headers: {
        'Content-Length': String(payload.length - start),
        ...(start > 0 ? { 'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}` } : {})
      }
    })
  }
  try {
    const destination = path.join(root, 'asset.bin')
    await fsp.writeFile(`${destination}.part`, payload.subarray(0, 10))
    await downloadFile({
      url: 'https://downloads.example/asset.bin',
      destination,
      size: payload.length
    })
    assert.equal(receivedRange, 'bytes=10-')
    assert.deepEqual(await fsp.readFile(destination), payload)
  } finally {
    globalThis.fetch = originalFetch
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('offline readiness reports missing and truncated files', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-offline-test-'))
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
