import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { addServer, listServers, seedProfileServers } from '../src/main/minecraft/servers.ts'

async function profileDir(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-servers-'))
}

/**
 * A new profile has no `servers.dat` at all, so a player running several
 * profiles types the same addresses into each of them. The launcher's default
 * list fills them in — the same idea as the options template, for the other
 * file a fresh profile starts without.
 */
test('the default servers reach a profile that has none', async () => {
  const directory = await profileDir()
  const added = await seedProfileServers(directory, [
    { name: 'PisanKus', address: 'play.pisankus.net' },
    { name: 'Hypixel', address: 'mc.hypixel.net' }
  ])

  assert.equal(added, 2)
  const servers = await listServers(directory)
  assert.deepEqual(
    servers.map((entry) => [entry.name, entry.address]),
    [
      ['PisanKus', 'play.pisankus.net'],
      ['Hypixel', 'mc.hypixel.net']
    ]
  )
})

/**
 * Run before every launch, so it must never duplicate an entry — and must never
 * bring back one the player deliberately removed.
 */
test('seeding twice adds nothing the second time', async () => {
  const directory = await profileDir()
  const template = [{ name: 'PisanKus', address: 'play.pisankus.net' }]

  assert.equal(await seedProfileServers(directory, template), 1)
  assert.equal(await seedProfileServers(directory, template), 0)
  assert.equal((await listServers(directory)).length, 1)
})

test('a server the player already added is not duplicated', async () => {
  const directory = await profileDir()
  // Typed by hand, with the casing and spacing a person actually uses.
  await addServer(directory, { name: 'Benim sunucum', address: '  Play.PisanKus.NET ' })

  assert.equal(await seedProfileServers(directory, [{ name: 'PisanKus', address: 'play.pisankus.net' }]), 0)

  const servers = await listServers(directory)
  assert.equal(servers.length, 1)
  // Their own name for it survives; the template does not rename anything.
  assert.equal(servers[0].name, 'Benim sunucum')
})

test('what the player already has is kept, and only the new one is added', async () => {
  const directory = await profileDir()
  await addServer(directory, { name: 'Arkadaşın sunucusu', address: 'friend.example.net' })

  assert.equal(await seedProfileServers(directory, [{ name: 'PisanKus', address: 'play.pisankus.net' }]), 1)

  const servers = await listServers(directory)
  assert.deepEqual(servers.map((entry) => entry.address), ['friend.example.net', 'play.pisankus.net'])
})

test('an empty template writes no file at all', async () => {
  const directory = await profileDir()
  assert.equal(await seedProfileServers(directory, []), 0)
  assert.equal(await seedProfileServers(directory, [{ name: 'boş', address: '   ' }]), 0)
  await assert.rejects(fsp.access(path.join(directory, 'servers.dat')))
})

test('the list is seeded at launch and can be applied to existing profiles', () => {
  const launcher = readFileSync('src/main/minecraft/launcher.ts', 'utf8')
  const seed = launcher.indexOf('seedProfileServers(profile.directory')
  const spawn = launcher.indexOf('spawn(javaPath')
  assert.ok(seed > 0 && seed < spawn, 'sunucular oyun başlamadan önce yazılmalı')

  const ipc = readFileSync('src/main/ipc.ts', 'utf8')
  assert.match(ipc, /handle\('servers:applyToProfiles'/)
})
