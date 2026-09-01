/**
 * The one thing the launcher accepts on its command line.
 *
 * A desktop shortcut points at the installed launcher with `--profile=<id>`
 * after it, and that argument is the whole reason this exists: double-clicking
 * the shortcut has to reach the profile the shortcut was made for.
 *
 * The argument arrives from a `.lnk` or a `.desktop` file that anyone can edit,
 * so it is checked rather than trusted: only something shaped like one of our
 * own ids gets through, and everything else is treated as "no profile named".
 * A launcher that opened whatever a text file told it to would be a launcher
 * that could be pointed anywhere.
 */

const FLAG = '--profile'

/** `randomUUID()` is what `store.addProfile` stamps on every profile. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function profileIdFromArgv(argv: readonly string[]): string | null {
  for (const [index, argument] of argv.entries()) {
    // `--profile=<id>`, which is what the shortcuts are written with.
    if (argument.startsWith(`${FLAG}=`)) {
      const value = argument.slice(FLAG.length + 1)
      return UUID.test(value) ? value : null
    }
    // `--profile <id>`, because someone typing it by hand will write it this way.
    if (argument === FLAG) {
      const value = argv[index + 1]
      return value && UUID.test(value) ? value : null
    }
  }
  return null
}

/** The argument a shortcut carries, for whichever profile it points at. */
export function profileArgument(profileId: string): string {
  return `${FLAG}=${profileId}`
}
