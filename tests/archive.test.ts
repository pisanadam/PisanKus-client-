import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { extractZip } from '../src/main/archive.ts'

const NORMAL_ZIP =
  'UEsDBBQAAAAAAAAAIQBH3dx5AgAAAAIAAAAQAAAAbW9kcy9leGFtcGxlLnR4dG9rUEsBAhQAFAAAAAAAAAAhAEfd3HkCAAAAAgAAABAAAAAAAAAAAAAAAIABAAAAAG1vZHMvZXhhbXBsZS50eHRQSwUGAAAAAAEAAQA+AAAAMAAAAAAA'
const TRAVERSAL_ZIP =
  'UEsDBBQAAAAAAAAAIQD7OSuCAwAAAAMAAAANAAAALi4vZXNjYXBlLnR4dGJhZFBLAQIUABQAAAAAAAAAIQD7OSuCAwAAAAMAAAANAAAAAAAAAAAAAACAAQAAAAAuLi9lc2NhcGUudHh0UEsFBgAAAAABAAEAOwAAAC4AAAAAAA=='
const SYMLINK_ZIP =
  'UEsDBBQAAAAAAAAAIQC7CabWDQAAAA0AAAAEAAAAbGluay4uL2VzY2FwZS50eHRQSwECFAMUAAAAAAAAACEAuwmm1g0AAAANAAAABAAAAAAAAAAAAAAA/6EAAAAAbGlua1BLBQYAAAAAAQABADIAAAAvAAAAAAA='

async function withArchive(
  encoded: string,
  run: (archive: string, destination: string, root: string) => Promise<void>
): Promise<void> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'opbay-archive-test-'))
  try {
    const archive = path.join(root, 'fixture.zip')
    const destination = path.join(root, 'out')
    await fsp.writeFile(archive, Buffer.from(encoded, 'base64'))
    await run(archive, destination, root)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
}

test('extractZip materialises a normal entry', async () => {
  await withArchive(NORMAL_ZIP, async (archive, destination) => {
    await extractZip(archive, { dir: destination })
    assert.equal(await fsp.readFile(path.join(destination, 'mods', 'example.txt'), 'utf8'), 'ok')
  })
})

test('extractZip rejects traversal before writing outside the destination', async () => {
  await withArchive(TRAVERSAL_ZIP, async (archive, destination, root) => {
    await assert.rejects(extractZip(archive, { dir: destination }), /dışına çıkamaz|invalid relative path/)
    await assert.rejects(fsp.access(path.join(root, 'escape.txt')))
  })
})

test('extractZip rejects symbolic links', async () => {
  await withArchive(SYMLINK_ZIP, async (archive, destination) => {
    await assert.rejects(extractZip(archive, { dir: destination }), /bağlantı içeremez/)
  })
})
