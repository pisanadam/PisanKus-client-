import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { extractZip } from '../archive.ts'
import type { LoaderId } from '../../shared/types.ts'

/**
 * What a mod says about itself, read out of its own jar.
 *
 * Until now the launcher knew only what Modrinth told it, which leaves it blind
 * to every jar that did not come from there — one dropped into the folder by
 * hand, one that arrived inside a modpack. Those are exactly the jars that cause
 * the failures nobody can explain: the wrong Minecraft version, a missing
 * library, or two builds of the same mod sitting side by side.
 *
 * Every mod already carries the answer. Fabric and Quilt ship a JSON manifest,
 * Forge and NeoForge a TOML one, and all four name the mod, the loader, the
 * Minecraft versions it accepts and what it depends on.
 */

export interface ModDependency {
  id: string
  /** Version range as the manifest wrote it, kept verbatim for the message. */
  range?: string
  required: boolean
}

export interface ModMetadata {
  /** The id the loader uses; two jars sharing it is a conflict. */
  id: string
  name: string
  version?: string
  loader: LoaderId
  /** Minecraft versions this build accepts, in the manifest's own notation. */
  minecraft?: string
  dependencies: ModDependency[]
}

/**
 * Ids that are the environment rather than another mod.
 *
 * A missing one of these is not a mod the player forgot to install, so treating
 * them as dependencies would put a warning on every jar in the folder.
 */
export const ENVIRONMENT_IDS = new Set([
  'minecraft',
  'java',
  'fabricloader',
  'fabric-loader',
  'quilt_loader',
  'quilt_base',
  'forge',
  'neoforge',
  'mcp'
])

const MANIFESTS = [
  'fabric.mod.json',
  'quilt.mod.json',
  'META-INF/mods.toml',
  'META-INF/neoforge.mods.toml'
]

/** Reads the four manifests a mod may carry, in one pass over the archive. */
export async function readModMetadata(jarPath: string): Promise<ModMetadata | null> {
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-mod-'))
  try {
    await extractZip(jarPath, { dir: staging, filter: (name) => MANIFESTS.includes(name) })

    const read = async (name: string): Promise<string | null> =>
      fsp.readFile(path.join(staging, name), 'utf8').catch(() => null)

    const fabric = await read('fabric.mod.json')
    if (fabric) return parseFabric(fabric, 'fabric')

    const quilt = await read('quilt.mod.json')
    if (quilt) return parseQuilt(quilt)

    // NeoForge reads its own file first and falls back to Forge's, so a jar
    // carrying both is a NeoForge mod.
    const neo = await read('META-INF/neoforge.mods.toml')
    if (neo) return parseToml(neo, 'neoforge')

    const forge = await read('META-INF/mods.toml')
    if (forge) return parseToml(forge, 'forge')

    return null
  } catch {
    // A jar that cannot be opened says nothing; the file checks catch those.
    return null
  } finally {
    await fsp.rm(staging, { recursive: true, force: true })
  }
}

function parseFabric(text: string, loader: LoaderId): ModMetadata | null {
  const json = safeJson<{
    id?: string
    name?: string
    version?: string
    depends?: Record<string, string | string[]>
    recommends?: Record<string, string | string[]>
  }>(text)
  if (!json?.id) return null

  const depends = json.depends ?? {}
  const dependencies: ModDependency[] = Object.entries(depends).map(([id, range]) => ({
    id,
    range: Array.isArray(range) ? range.join(' || ') : range,
    required: true
  }))
  for (const [id, range] of Object.entries(json.recommends ?? {})) {
    dependencies.push({ id, range: Array.isArray(range) ? range.join(' || ') : range, required: false })
  }

  const minecraft = depends.minecraft
  return {
    id: json.id,
    name: json.name ?? json.id,
    version: json.version,
    loader,
    minecraft: Array.isArray(minecraft) ? minecraft.join(' || ') : minecraft,
    dependencies
  }
}

function parseQuilt(text: string): ModMetadata | null {
  const json = safeJson<{
    quilt_loader?: {
      id?: string
      version?: string
      metadata?: { name?: string }
      depends?: ({ id?: string; versions?: unknown; optional?: boolean } | string)[]
    }
  }>(text)
  const loader = json?.quilt_loader
  if (!loader?.id) return null

  const dependencies: ModDependency[] = []
  for (const entry of loader.depends ?? []) {
    if (typeof entry === 'string') {
      dependencies.push({ id: entry, required: true })
      continue
    }
    if (!entry.id) continue
    dependencies.push({
      id: entry.id,
      range: typeof entry.versions === 'string' ? entry.versions : undefined,
      required: entry.optional !== true
    })
  }

  return {
    id: loader.id,
    name: loader.metadata?.name ?? loader.id,
    version: loader.version,
    loader: 'quilt',
    minecraft: dependencies.find((entry) => entry.id === 'minecraft')?.range,
    dependencies
  }
}

/**
 * The slice of TOML `mods.toml` actually uses.
 *
 * Bringing in a parser for a file with tables, arrays of tables and string
 * values would be more dependency than the job deserves. Anything this does not
 * understand is skipped rather than guessed at — a manifest read wrongly would
 * put a warning on a mod that is perfectly fine.
 */
function parseToml(text: string, loader: LoaderId): ModMetadata | null {
  const mods: Record<string, string>[] = []
  const dependencies: { table: string; fields: Record<string, string> }[] = []

  let current: Record<string, string> | null = null
  let section: 'mods' | 'dependencies' | null = null

  for (const raw of stripMultiline(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const arrayTable = /^\[\[([^\]]+)]]$/.exec(line)
    if (arrayTable) {
      const name = arrayTable[1].trim()
      current = {}
      if (name === 'mods') {
        section = 'mods'
        mods.push(current)
      } else if (name.startsWith('dependencies.')) {
        section = 'dependencies'
        dependencies.push({ table: name.slice('dependencies.'.length), fields: current })
      } else {
        section = null
      }
      continue
    }
    if (/^\[[^\]]+]$/.test(line)) {
      current = null
      section = null
      continue
    }

    const pair = /^([A-Za-z_][\w-]*)\s*=\s*(.+)$/.exec(line)
    if (!pair || !current || !section) continue
    current[pair[1]] = unquote(pair[2].trim())
  }

  const first = mods[0]
  if (!first?.modId) return null

  const owned = dependencies.filter((entry) => entry.table === first.modId)
  return {
    id: first.modId,
    name: first.displayName ?? first.modId,
    version: first.version,
    loader,
    minecraft: owned.find((entry) => entry.fields.modId === 'minecraft')?.fields.versionRange,
    dependencies: owned.flatMap((entry) =>
      entry.fields.modId
        ? [
            {
              id: entry.fields.modId,
              range: entry.fields.versionRange,
              // Forge's key; NeoForge writes `type = "required"` instead.
              required: entry.fields.mandatory !== 'false' && entry.fields.type !== 'optional'
            }
          ]
        : []
    )
  }
}

/** Replaces `"""…"""` blocks with a single line, so they cannot look like keys. */
function stripMultiline(text: string): string {
  return text.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '""')
}

function unquote(value: string): string {
  const withoutComment = value.replace(/\s+#.*$/, '').trim()
  const quoted = /^(["'])([\s\S]*)\1$/.exec(withoutComment)
  return quoted ? quoted[2] : withoutComment
}

function safeJson<T>(text: string): T | null {
  try {
    // Some manifests ship with trailing commas or comments, which the loaders
    // tolerate and JSON.parse does not. Better to skip one than to guess.
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
