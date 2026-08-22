import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  dedupeOptions,
  parseOptions,
  readOption,
  serialiseOptions,
  writeOption
} from '../../shared/options.ts'
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
  // Any key the file repeated is collapsed on the way out. Otherwise the
  // launcher and the game can read different values from the same file.
  return serialiseOptions(dedupeOptions(lines))
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

/**
 * The keys whose value `next` changes, relative to `existing`.
 *
 * This is what the player actually asked for when they saved the editor: the
 * rest of the text they saved is simply the file they were shown. Recording
 * only the difference keeps the launcher's claim over the file down to the
 * handful of settings the player deliberately touched, so everything they
 * change in-game afterwards stays theirs.
 */
export function changedOptions(existing: string, next: string): Record<string, string> {
  const before = parseOptions(existing)
  const changed: Record<string, string> = {}

  for (const line of parseOptions(next)) {
    if ('raw' in line) continue
    if (readOption(before, line.key) === line.value) continue
    changed[line.key] = line.value
  }
  return changed
}

/**
 * Stamps the launcher-managed keys back onto options.txt, just before the game
 * reads it.
 *
 * One write when the player pressed save is not enough. Minecraft rewrites the
 * whole file when it quits, so the launcher's values only survive if the game
 * read them first — and a file the game rejects is replaced by its own defaults
 * outright. Re-applying here means the settings the player chose in the
 * launcher are the ones the game starts with, every time, whatever happened to
 * the file in between.
 *
 * Returns the number of keys that had to be corrected, which the launch log
 * reports: a number that stays above zero every launch is the game rejecting
 * the file, and says so out loud instead of looking like nothing happened.
 */
export async function applyManagedOptions(
  directory: string,
  managed: Record<string, string> | undefined,
  dataVersion: number | undefined
): Promise<number> {
  const entries = Object.entries(managed ?? {})
  if (entries.length === 0) return 0

  const file = path.join(directory, 'options.txt')
  const existing = await fsp.readFile(file, 'utf8').catch(() => null)
  let lines = parseOptions(existing ?? '')

  let corrected = 0
  for (const [key, value] of entries) {
    if (readOption(lines, key) === value) continue
    lines = writeOption(lines, key, value)
    corrected += 1
  }

  // A file with no version line is one Minecraft runs its whole upgrade path
  // over; stamping the number the client actually reports keeps it out of that.
  if (dataVersion !== undefined && readOption(lines, 'version') === undefined) {
    lines = writeOption(lines, 'version', String(dataVersion))
    corrected += 1
  }

  if (corrected === 0) return 0
  await fsp.mkdir(directory, { recursive: true })
  await fsp.writeFile(file, serialiseOptions(lines), 'utf8')
  return corrected
}
