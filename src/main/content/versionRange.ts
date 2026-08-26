/**
 * Does a Minecraft version fall inside the range a mod declares?
 *
 * Two notations are in play and neither is negotiable: Forge writes Maven
 * ranges (`[1.20.1,1.21)`), Fabric writes npm-ish predicates (`>=1.20.1 <1.21`,
 * `~1.20`, `1.20.x`). Both appear in the same profile.
 *
 * Everything here answers "is it *definitely* outside" and errs towards yes-it
 * fits. This decides whether to put a warning on a mod the player installed on
 * purpose, and a warning that is wrong is worse than a missing one: it teaches
 * people to ignore the warnings that are right.
 */

/** Compares dotted versions the way releases actually order. */
export function compareVersions(left: string, right: string): number {
  const a = left.split(/[.\-+]/)
  const b = right.split(/[.\-+]/)

  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const one = a[index]
    const two = b[index]

    // One side ran out. A trailing number is a zero — 1.20 and 1.20.0 are the
    // same release — but a trailing word is a pre-release, and the version
    // without it is the finished one: 1.20.1 comes after 1.20.1-rc1.
    if (one === undefined || two === undefined) {
      const present = (one ?? two)!
      if (!/^\d+$/.test(present)) return one === undefined ? 1 : -1
      if (Number(present) !== 0) return one === undefined ? -1 : 1
      continue
    }

    if (/^\d+$/.test(one) && /^\d+$/.test(two)) {
      const difference = Number(one) - Number(two)
      if (difference !== 0) return difference < 0 ? -1 : 1
      continue
    }
    if (one === two) continue
    return one < two ? -1 : 1
  }
  return 0
}

/**
 * Whether `version` satisfies `range`.
 *
 * An empty, missing or unrecognised range is a yes: the launcher has no opinion
 * about a notation it does not understand.
 */
export function satisfiesRange(version: string, range: string | undefined): boolean {
  const text = range?.trim()
  if (!text || text === '*') return true

  // `a || b` — any alternative is enough. Fabric writes this, and so does the
  // array form once it has been joined.
  if (text.includes('||')) {
    return text.split('||').some((part) => satisfiesRange(version, part))
  }

  if (/^[[(]/.test(text)) return satisfiesMaven(version, text)

  // A bare space-separated list of predicates, all of which must hold.
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return true
  return parts.every((part) => satisfiesPredicate(version, part))
}

/** Maven: `[1.20,1.21)`, `[1.20.1,)`, `(,1.21]`, and comma-joined unions. */
function satisfiesMaven(version: string, range: string): boolean {
  // A union like `[1.20,1.21),[1.22,)` is several ranges, and each range itself
  // contains a comma — so split on the boundary between them, not on commas.
  const groups = range.match(/[[(][^[\]()]*[\])]/g)
  if (!groups) return true

  return groups.some((group) => {
    const lowerInclusive = group.startsWith('[')
    const upperInclusive = group.endsWith(']')
    const body = group.slice(1, -1)
    // No comma means a single pinned version: `[1.20.1]`.
    if (!body.includes(',')) return body.trim() === '' || compareVersions(version, body.trim()) === 0

    const [low, high] = body.split(',').map((part) => part.trim())
    if (low) {
      const order = compareVersions(version, low)
      if (order < 0 || (order === 0 && !lowerInclusive)) return false
    }
    if (high) {
      const order = compareVersions(version, high)
      if (order > 0 || (order === 0 && !upperInclusive)) return false
    }
    return true
  })
}

/** One npm-ish predicate: `>=1.20.1`, `<1.21`, `~1.20`, `^1.20`, `1.20.x`, `1.20.1`. */
function satisfiesPredicate(version: string, predicate: string): boolean {
  const operator = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(predicate)
  if (!operator) return true
  const [, symbol = '=', target] = operator

  // Not a version at all. Prose, a codename, a notation nobody here knows —
  // whatever it is, it is not grounds for warning about the mod.
  if (!/^\d/.test(target)) return true

  if (target.includes('x') || target.includes('*')) {
    const prefix = target.replace(/[.\-]?[x*].*$/, '')
    return prefix === '' || version === prefix || version.startsWith(`${prefix}.`)
  }

  const order = compareVersions(version, target)
  switch (symbol) {
    case '>':
      return order > 0
    case '>=':
      return order >= 0
    case '<':
      return order < 0
    case '<=':
      return order <= 0
    case '~':
    case '^': {
      // Both mean "this release line": `~1.20` and `^1.20` accept 1.20.4 but
      // not 1.21. Precise enough for Minecraft versions, which is all this sees.
      if (order < 0) return false
      const line = target.split('.').slice(0, 2).join('.')
      return version === line || version.startsWith(`${line}.`)
    }
    default:
      return order === 0
  }
}
