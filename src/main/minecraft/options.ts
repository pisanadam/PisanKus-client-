import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { parseOptions, readOption, serialiseOptions, writeOption } from '../../shared/options.ts'
import { extractZip } from '../archive.ts'

/**
 * Writes the configured options.txt into a profile directory.
 *
 * By default an existing file is left alone: the player may have tuned settings
 * in-game since the profile was made, and silently reverting those on every
 * launch would be worse than not managing options at all. `overwrite` is for the
 * explicit "apply to these profiles" action.
 *
 * When overwriting, keys the template does not mention are kept from the file
 * that is already there — so a profile keeps its resource pack list and key
 * bindings even though the template says nothing about them.
 */
export async function writeProfileOptions(
  directory: string,
  template: string,
  overwrite = false
): Promise<boolean> {
  if (!template.trim()) return false

  const file = path.join(directory, 'options.txt')
  const existing = await fsp.readFile(file, 'utf8').catch(() => null)
  if (existing !== null && !overwrite) return false

  const text = existing === null ? template : merge(existing, template)
  await fsp.mkdir(directory, { recursive: true })
  await fsp.writeFile(file, text, 'utf8')
  return true
}

/**
 * The data version Minecraft stamps into options.txt, read from the client jar.
 *
 * This one line decides whether the file is used at all: "If this field is
 * missing, the file is discarded and replaced with the defaults." A seeded
 * options.txt without it therefore does nothing — the game throws it away on
 * first launch and the player sees stock settings, which is exactly what was
 * being reported.
 *
 * The jar carries the number in its own `version.json`, so it is read from
 * there rather than guessed.
 */
export async function clientDataVersion(clientJar: string): Promise<number | undefined> {
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-ver-'))
  try {
    await extractZip(clientJar, { dir: staging, filter: (name) => name === 'version.json' })
    const raw = await fsp.readFile(path.join(staging, 'version.json'), 'utf8')
    const parsed = JSON.parse(raw) as { world_version?: number }
    return typeof parsed.world_version === 'number' ? parsed.world_version : undefined
  } catch {
    return undefined
  } finally {
    await fsp.rm(staging, { recursive: true, force: true })
  }
}

/**
 * Writes the launcher's template into a profile that has no options.txt yet,
 * stamped with the version the game expects.
 *
 * Only ever creates. A file that already exists belongs to the player and the
 * game, and is left exactly as it is.
 */
export async function seedProfileOptions(
  directory: string,
  template: string,
  dataVersion: number | undefined
): Promise<boolean> {
  const file = path.join(directory, 'options.txt')
  const existing = await fsp.readFile(file, 'utf8').catch(() => null)

  if (existing === null) {
    if (!template.trim()) return false
    // The version is stamped when it could be read. When it could not — an
    // unreadable jar, a build old enough to ship no version.json — the file is
    // still written: the game runs its own upgrade path over a file with no
    // version, whereas a file that was never created leaves the player with
    // stock settings and no way back to the template.
    const parsed = parseOptions(template)
    const lines =
      dataVersion === undefined ? parsed : writeOption(parsed, 'version', String(dataVersion))
    await fsp.mkdir(directory, { recursive: true })
    await fsp.writeFile(file, serialiseOptions(lines), 'utf8')
    return true
  }

  if (dataVersion === undefined) return false

  // A file the launcher wrote before this profile had ever been launched has no
  // `version` line, because the number only exists inside a client jar that had
  // not been downloaded yet. Minecraft throws such a file away and starts from
  // its own defaults — which is what "my settings do not apply" looks like from
  // the outside. The number is known by the time the game is about to start, so
  // it is stamped in here rather than the settings being lost.
  const lines = parseOptions(existing)
  if (lines.some((line) => !('raw' in line) && line.key === 'version')) return false

  await fsp.writeFile(file, serialiseOptions(writeOption(lines, 'version', String(dataVersion))), 'utf8')
  return true
}

/**
 * Adds the keys a file does not mention, leaving everything it does say alone.
 *
 * This is what a modpack needs. Packs ship their own options.txt in `overrides`
 * and it lands on top of the one the profile was seeded with — the pack tuned
 * those values on purpose, so they must win. But a pack file is usually a short
 * list: the one measured here set 26 keys and only 6 key bindings, leaving the
 * player without the other 28. Filling the gaps afterwards gives them back
 * without arguing with the pack about anything it actually chose.
 */
export async function fillMissingOptions(directory: string, template: string): Promise<boolean> {
  if (!template.trim()) return false

  const file = path.join(directory, 'options.txt')
  const existing = await fsp.readFile(file, 'utf8').catch(() => null)
  // Nothing to fill in yet, and creating one here would produce a file with no
  // `version` line — which Minecraft discards on sight. First launch seeds it
  // properly instead.
  if (existing === null) return false

  const lines = parseOptions(existing)
  const present = new Set(lines.flatMap((line) => ('raw' in line ? [] : [line.key])))

  const additions = parseOptions(template).filter((line) => !('raw' in line) && !present.has(line.key))
  if (additions.length === 0) return false

  await fsp.writeFile(file, serialiseOptions([...lines, ...additions]), 'utf8')
  return true
}

/** Applies every key from `template` onto `existing`, keeping the rest. */
function merge(existing: string, template: string): string {
  let lines = parseOptions(existing)
  for (const line of parseOptions(template)) {
    if ('raw' in line) continue
    lines = writeOption(lines, line.key, line.value)
  }
  return serialiseOptions(lines)
}

/**
 * One line for the launch log describing the file the game is about to read.
 *
 * "My settings do not apply" is impossible to tell apart from "the file never
 * reached the profile" without seeing the file, and asking a player to find it
 * on disk rarely works. The log already goes with every bug report, so the
 * answer travels with it.
 */
export async function describeProfileOptions(directory: string): Promise<string> {
  const text = await fsp.readFile(path.join(directory, 'options.txt'), 'utf8').catch(() => null)
  if (text === null) return 'options.txt: yok'

  const lines = parseOptions(text)
  const keys = lines.filter((line) => !('raw' in line)).length
  return `options.txt: ${keys} anahtar, version:${readOption(lines, 'version') ?? 'yok'}`
}
