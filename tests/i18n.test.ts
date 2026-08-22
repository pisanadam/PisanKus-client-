import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const DIRECTORY = 'src/shared/i18n'

function keysOf(file: string): string[] {
  const text = readFileSync(path.join(DIRECTORY, file), 'utf8')
  return [...text.matchAll(/^ {2}'((?:[^'\\]|\\.)*)':/gm)].map((match) => match[1])
}

/**
 * Every table is keyed by the same Turkish source text, so a key that only
 * exists in some of them is a string that silently falls back to Turkish for
 * everyone else — invisible in a type check and invisible in the app until a
 * player who reads none of it opens that screen.
 */
test('every language table carries the same keys', () => {
  const tables = readdirSync(DIRECTORY).filter(
    (file) => file.endsWith('.ts') && file !== 'index.ts' && file !== 'tables.ts'
  )
  assert.equal(tables.length, 16)

  const reference = keysOf('en.ts')
  assert.ok(reference.length > 600)

  for (const file of tables) {
    const keys = keysOf(file)
    const missing = reference.filter((key) => !keys.includes(key))
    const extra = keys.filter((key) => !reference.includes(key))
    assert.deepEqual(missing, [], `${file} eksik`)
    assert.deepEqual(extra, [], `${file} fazla`)
  }
})
