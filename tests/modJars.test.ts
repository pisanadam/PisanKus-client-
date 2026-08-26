import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ENVIRONMENT_IDS, readModMetadata } from '../src/main/content/modMetadata.ts'

const CRC_TABLE = Array.from({ length: 256 }, (_unused, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Writes a real jar, without shelling out to `zip`.
 *
 * The first version of this called the `zip` binary, which every runner has
 * except the one that packages the app for most of its users: Windows. The
 * whole release stopped there. Entries are stored rather than deflated, which
 * is a valid zip and enough for a manifest.
 */
async function makeJar(name: string, files: Record<string, string>): Promise<string> {
  const entries = Object.entries(files).map(([file, content]) => ({
    nameBytes: Buffer.from(file, 'utf8'),
    data: Buffer.from(content, 'utf8')
  }))

  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const crc = crc32(entry.data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4) // version needed
    header.writeUInt16LE(0, 6) // flags — nothing encrypted
    header.writeUInt16LE(0, 8) // stored
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(entry.data.length, 18)
    header.writeUInt32LE(entry.data.length, 22)
    header.writeUInt16LE(entry.nameBytes.length, 26)
    locals.push(header, entry.nameBytes, entry.data)

    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50, 0)
    record.writeUInt16LE(20, 4) // version made by
    record.writeUInt16LE(20, 6) // version needed
    record.writeUInt16LE(0, 8)
    record.writeUInt16LE(0, 10)
    record.writeUInt32LE(crc, 16)
    record.writeUInt32LE(entry.data.length, 20)
    record.writeUInt32LE(entry.data.length, 24)
    record.writeUInt16LE(entry.nameBytes.length, 28)
    record.writeUInt32LE(offset, 42)
    central.push(record, entry.nameBytes)

    offset += header.length + entry.nameBytes.length + entry.data.length
  }

  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)

  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-jar-'))
  const jar = path.join(staging, name)
  await fsp.writeFile(jar, Buffer.concat([...locals, directory, end]))
  return jar
}

test('a Fabric manifest is read the way the loader reads it', async () => {
  const jar = await makeJar('sodium.jar', {
    'fabric.mod.json': JSON.stringify({
      id: 'sodium',
      name: 'Sodium',
      version: '0.5.11',
      depends: { minecraft: '>=1.20.1 <1.21', fabricloader: '>=0.15', 'fabric-api': '*' },
      recommends: { 'sodium-extra': '*' }
    })
  })

  const meta = await readModMetadata(jar)
  assert.equal(meta?.id, 'sodium')
  assert.equal(meta?.name, 'Sodium')
  assert.equal(meta?.loader, 'fabric')
  assert.equal(meta?.minecraft, '>=1.20.1 <1.21')
  assert.deepEqual(
    meta?.dependencies.filter((entry) => entry.required).map((entry) => entry.id).sort(),
    ['fabric-api', 'fabricloader', 'minecraft']
  )
  // A recommendation is not a requirement.
  assert.equal(meta?.dependencies.find((entry) => entry.id === 'sodium-extra')?.required, false)
})

/**
 * The one the launcher had no way to read. Forge writes TOML, with the
 * dependencies in tables named after the mod that owns them.
 */
test('a Forge mods.toml is read, including its dependency ranges', async () => {
  const jar = await makeJar('jei.jar', {
    'META-INF/mods.toml': `
modLoader="javafml"
loaderVersion="[47,)"
license="MIT"

[[mods]]
modId="jei"
version="15.3.0.4"
displayName="Just Enough Items"
description='''
Bir tarif rehberi.
[[mods]] burada bir metin, tablo değil.
'''

[[dependencies.jei]]
    modId="forge"
    mandatory=true
    versionRange="[47,)"
    ordering="NONE"
    side="BOTH"

[[dependencies.jei]]
    modId="minecraft"
    mandatory=true
    versionRange="[1.20.1,1.20.2)"

[[dependencies.jei]]
    modId="patchouli"   # yorum
    mandatory=false
    versionRange="[1.0,)"
`
  })

  const meta = await readModMetadata(jar)
  assert.equal(meta?.id, 'jei')
  assert.equal(meta?.name, 'Just Enough Items')
  assert.equal(meta?.version, '15.3.0.4')
  assert.equal(meta?.loader, 'forge')
  assert.equal(meta?.minecraft, '[1.20.1,1.20.2)')
  // Optional stays optional, and the comment after the value is not part of it.
  assert.equal(meta?.dependencies.find((entry) => entry.id === 'patchouli')?.required, false)
  assert.equal(meta?.dependencies.find((entry) => entry.id === 'forge')?.range, '[47,)')
})

test('a NeoForge manifest wins over the Forge one beside it', async () => {
  const jar = await makeJar('both.jar', {
    'META-INF/mods.toml': '[[mods]]\nmodId="eski"\n',
    'META-INF/neoforge.mods.toml': '[[mods]]\nmodId="yeni"\ndisplayName="Yeni"\n'
  })

  const meta = await readModMetadata(jar)
  assert.equal(meta?.id, 'yeni')
  assert.equal(meta?.loader, 'neoforge')
})

test('a jar with no manifest is not guessed at', async () => {
  const jar = await makeJar('kutuphane.jar', { 'README.txt': 'sadece bir kütüphane' })
  assert.equal(await readModMetadata(jar), null)

  // Neither is one that is not an archive at all.
  const broken = path.join(await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-bad-')), 'bozuk.jar')
  await fsp.writeFile(broken, 'bu bir zip değil', 'utf8')
  assert.equal(await readModMetadata(broken), null)
})

test('the loader and the game are not treated as missing mods', () => {
  for (const id of ['minecraft', 'java', 'fabricloader', 'forge', 'neoforge', 'quilt_loader']) {
    assert.ok(ENVIRONMENT_IDS.has(id), id)
  }
  assert.equal(ENVIRONMENT_IDS.has('fabric-api'), false)
})

/**
 * Everything above works from the launcher's own records, which know nothing
 * about a jar that did not come through Modrinth — one dropped in by hand, one
 * that arrived inside a modpack. Those are the jars behind the failures that
 * are hardest to explain.
 */
test('the jar checks run in the profile scan and again before launch', () => {
  const health = readFileSync('src/main/profileHealth.ts', 'utf8')

  // Two jars claiming one id: the loader refuses to start naming the id but not
  // the files, so this names the files.
  assert.match(health, /id: 'duplicate-mod-ids'/)
  assert.match(health, /id: 'mod-version-mismatch'/)
  assert.match(health, /id: 'mod-loader-mismatch'/)
  assert.match(health, /id: 'missing-mod-dependency'/)
  // Quilt runs Fabric mods; nothing else crosses.
  assert.match(health, /return profileLoader === 'quilt' && modLoader === 'fabric'/)
  // Environment ids are not mods the player forgot to install.
  assert.match(health, /ENVIRONMENT_IDS\.has\(dependency\.id\) \|\| present\.has\(dependency\.id\)/)

  // Reported before the game starts — but it still starts. A launcher that
  // refuses over a warning is worse than one that says so and launches.
  const ipc = readFileSync('src/main/ipc.ts', 'utf8')
  const warn = ipc.indexOf('Uyarı — ${issue.title}')
  const launch = ipc.indexOf('const session = await launch({')
  assert.ok(warn > 0 && launch > 0 && warn < launch)
})
