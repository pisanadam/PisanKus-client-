import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

/**
 * No hook may sit after a return that can be taken.
 *
 * React identifies hooks by the order they are called in, so a component whose
 * hook count changes between renders is torn down whole — the error is
 * "Rendered more hooks than during the previous render" and what the player
 * sees is a window that opens black and never draws anything. It costs nothing
 * to catch here and there is no linter in this project to catch it instead.
 *
 * The check is deliberately shallow: it looks only at statements written at the
 * top level of a component's body, which is where both early returns and hook
 * calls belong. A hook nested deeper is already wrong for other reasons and a
 * return nested deeper is a callback's, not the component's.
 */

const HOOK = /^ {2}(?:const .*?=\s*)?(use[A-Z]\w*)\(/
const COMPONENT = /^(?:export )?function ([A-Z]\w*)\(/

function filesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry)
    if (statSync(full).isDirectory()) return filesIn(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

/** Hooks called after the component's first top-level return, if any. */
function lateHooks(source: string): { component: string; hook: string; line: number }[] {
  // Split on either ending: a Windows checkout hands these files over with
  // CRLF, and a trailing carriage return makes every exact line match fail —
  // which is how this check first reported the whole renderer as broken.
  const lines = source.split(/\r?\n/)
  const found: { component: string; hook: string; line: number }[] = []

  let component: string | null = null
  let returned = false
  // Depth of the `if (…) {` block currently open at the body's top level, so a
  // return inside one still counts as the component's own.
  let inBranch = false

  for (const [index, line] of lines.entries()) {
    const starts = COMPONENT.exec(line)
    if (starts) {
      component = starts[1]
      returned = false
      inBranch = false
      continue
    }
    if (line === '}') {
      component = null
      continue
    }
    if (!component) continue

    if (/^ {2}if \(/.test(line)) inBranch = !/}\s*$/.test(line) && !line.trimEnd().endsWith('{') === false
    if (/^ {2}}/.test(line)) inBranch = false

    // `if (x) return y` on one line, a bare `return`, or a return inside a
    // top-level `if` block.
    if (/^ {2}(if \(.*\) )?return\b/.test(line) || (inBranch && /^ {4}return\b/.test(line))) {
      returned = true
      continue
    }

    const hook = HOOK.exec(line)
    if (hook && returned) found.push({ component, hook: hook[1], line: index + 1 })
  }
  return found
}

test('no renderer component calls a hook after an early return', () => {
  const offenders: string[] = []
  for (const file of filesIn('src/renderer')) {
    for (const late of lateHooks(readFileSync(file, 'utf8'))) {
      offenders.push(`${file}:${late.line} ${late.component} → ${late.hook}`)
    }
  }
  assert.deepEqual(offenders, [])
})

/** The detector has to actually detect; a check that never fires is not one. */
test('the hook-order check catches the shape that shipped a black window', () => {
  const broken = `
export function App(): JSX.Element {
  const { ready, profiles } = useApp()
  useEffect(() => undefined, [])

  if (!ready) {
    return <div className="gate" />
  }

  const recent = useMemo(() => profiles, [profiles])
  return <div>{recent.length}</div>
}
`
  const found = lateHooks(broken)
  assert.equal(found.length, 1)
  assert.equal(found[0].hook, 'useMemo')
  assert.equal(found[0].component, 'App')

  // And the same component with the hook moved up is clean.
  assert.deepEqual(
    lateHooks(broken.replace('  const recent = useMemo(() => profiles, [profiles])\n', '')),
    []
  )
})
