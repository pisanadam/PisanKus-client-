import fsp from 'node:fs/promises'
import path from 'node:path'
import { parseOptions, serialiseOptions, writeOption } from '../../shared/options'

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
  if (existing === null) return writeProfileOptions(directory, template)

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
