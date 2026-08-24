import fsp from 'node:fs/promises'
import path from 'node:path'
import { compound, readNbt, stringValue, Tag, writeNbt, type NbtFile, type NbtValue } from './nbt.ts'

/**
 * The multiplayer list a profile shows in game, kept in `servers.dat`.
 *
 * Entries are edited in place rather than rebuilt: Minecraft stores a cached
 * server icon and a resource-pack preference alongside the name and address,
 * and rewriting the file from scratch would throw those away.
 */

export interface ServerEntry {
  /** Position in the list, which is also the order shown in game. */
  index: number
  name: string
  address: string
  /** Base64 png Minecraft cached the last time it connected. */
  icon?: string
}

function fileFor(profileDirectory: string): string {
  return path.join(profileDirectory, 'servers.dat')
}

function emptyFile(): NbtFile {
  return {
    name: '',
    // Minecraft writes this one uncompressed, unlike level.dat.
    compressed: false,
    root: {
      type: Tag.Compound,
      value: new Map([['servers', { type: Tag.List, itemType: Tag.Compound, value: [] }]])
    }
  }
}

async function load(profileDirectory: string): Promise<NbtFile> {
  const raw = await fsp.readFile(fileFor(profileDirectory)).catch(() => null)
  if (!raw || raw.length === 0) return emptyFile()

  try {
    const file = readNbt(raw)
    // A file with no `servers` list is still a valid starting point.
    if (!compound(file.root)?.has('servers')) {
      compound(file.root)?.set('servers', { type: Tag.List, itemType: Tag.Compound, value: [] })
    }
    return file
  } catch {
    // Unreadable rather than missing. Refusing here beats silently replacing a
    // list the player spent time building.
    throw new Error('servers.dat okunamadı; dosya bozuk olabilir.')
  }
}

function listOf(file: NbtFile): NbtValue[] {
  const entry = compound(file.root)?.get('servers')
  return entry?.type === Tag.List ? entry.value : []
}

/** Reads a profile's multiplayer list. */
export async function listServers(profileDirectory: string): Promise<ServerEntry[]> {
  const file = await load(profileDirectory)

  return listOf(file).flatMap((item, index) => {
    const fields = compound(item)
    if (!fields) return []
    return [
      {
        index,
        name: stringValue(fields.get('name')) ?? '',
        address: stringValue(fields.get('ip')) ?? '',
        icon: stringValue(fields.get('icon'))
      }
    ]
  })
}

async function persist(profileDirectory: string, file: NbtFile): Promise<void> {
  await fsp.mkdir(profileDirectory, { recursive: true })
  const target = fileFor(profileDirectory)
  const temp = `${target}.tmp`
  await fsp.writeFile(temp, writeNbt(file))
  await fsp.rename(temp, target)
}

export async function addServer(
  profileDirectory: string,
  input: { name: string; address: string }
): Promise<ServerEntry[]> {
  const file = await load(profileDirectory)
  listOf(file).push({
    type: Tag.Compound,
    value: new Map<string, NbtValue>([
      ['name', { type: Tag.String, value: input.name }],
      ['ip', { type: Tag.String, value: input.address }]
    ])
  })

  await persist(profileDirectory, file)
  return listServers(profileDirectory)
}

/**
 * Adds the launcher's default servers to a profile that does not have them.
 *
 * Only ever adds, and only what is missing — matched by address, so a server the
 * player already added by hand is not duplicated and one they deliberately
 * removed does not come back on the next launch. That makes it safe to run
 * before every start, which is what a new profile needs: it is created empty and
 * `servers.dat` does not exist until either the game or this writes one.
 *
 * The address is compared with case and surrounding space ignored, because
 * `Play.Example.NET ` and `play.example.net` are the same server to everyone
 * except a string comparison.
 */
export async function seedProfileServers(
  profileDirectory: string,
  template: { name: string; address: string }[]
): Promise<number> {
  const wanted = template.filter((entry) => entry.address.trim())
  if (wanted.length === 0) return 0

  const file = await load(profileDirectory)
  const servers = listOf(file)
  const present = new Set(
    servers.flatMap((item) => {
      const address = stringValue(compound(item)?.get('ip'))
      return address ? [address.trim().toLowerCase()] : []
    })
  )

  let added = 0
  for (const entry of wanted) {
    const key = entry.address.trim().toLowerCase()
    if (present.has(key)) continue
    present.add(key)
    servers.push({
      type: Tag.Compound,
      value: new Map<string, NbtValue>([
        ['name', { type: Tag.String, value: entry.name || entry.address }],
        ['ip', { type: Tag.String, value: entry.address.trim() }]
      ])
    })
    added += 1
  }

  if (added === 0) return 0
  await persist(profileDirectory, file)
  return added
}

export async function updateServer(
  profileDirectory: string,
  index: number,
  input: { name: string; address: string }
): Promise<ServerEntry[]> {
  const file = await load(profileDirectory)
  const fields = compound(listOf(file)[index])
  if (!fields) throw new Error('Sunucu bulunamadı.')

  // Only these two are touched; the icon and any flag beside them stay.
  fields.set('name', { type: Tag.String, value: input.name })
  fields.set('ip', { type: Tag.String, value: input.address })

  await persist(profileDirectory, file)
  return listServers(profileDirectory)
}

export async function removeServer(profileDirectory: string, index: number): Promise<ServerEntry[]> {
  const file = await load(profileDirectory)
  const servers = listOf(file)
  if (index < 0 || index >= servers.length) throw new Error('Sunucu bulunamadı.')

  servers.splice(index, 1)
  await persist(profileDirectory, file)
  return listServers(profileDirectory)
}

/** Moves one entry, which is how the in-game order is changed. */
export async function moveServer(
  profileDirectory: string,
  from: number,
  to: number
): Promise<ServerEntry[]> {
  const file = await load(profileDirectory)
  const servers = listOf(file)
  if (from < 0 || from >= servers.length || to < 0 || to >= servers.length) {
    throw new Error('Sunucu bulunamadı.')
  }

  servers.splice(to, 0, ...servers.splice(from, 1))
  await persist(profileDirectory, file)
  return listServers(profileDirectory)
}

export interface ServerStatus {
  online: boolean
  players?: { online: number; max: number }
  motd?: string
  version?: string
  /** Data url, straight from the service. */
  icon?: string
  error?: string
}

/**
 * Asks a public status service what a server is doing right now.
 *
 * Deliberately request-scoped: nothing here polls. The renderer asks when the
 * tab is open or the player presses refresh, and the launcher makes no other
 * contact with the service.
 */
export async function serverStatus(address: string): Promise<ServerStatus> {
  const host = address.trim()
  if (!host) return { online: false, error: 'Adres boş.' }

  try {
    const response = await fetch(
      `https://api.mcstatus.io/v2/status/java/${encodeURIComponent(host)}`,
      { headers: { 'User-Agent': 'PisanKusClient/1.0' }, signal: AbortSignal.timeout(8000) }
    )
    if (!response.ok) return { online: false, error: `Durum servisi ${response.status} döndü.` }

    const data = (await response.json()) as {
      online: boolean
      players?: { online: number; max: number }
      motd?: { clean?: string }
      version?: { name_clean?: string }
      icon?: string
    }

    return {
      online: data.online,
      players: data.players,
      motd: data.motd?.clean?.replace(/\s+/g, ' ').trim(),
      version: data.version?.name_clean,
      icon: data.icon
    }
  } catch (error) {
    return {
      online: false,
      error: error instanceof Error && error.name === 'TimeoutError' ? 'Yanıt vermedi.' : 'Ulaşılamadı.'
    }
  }
}
