import os from 'node:os'

/**
 * Taking secrets out of text before it is written down or shared.
 *
 * A crash log carries the access token the game was launched with, the player's
 * home directory and, on Windows, their account name. All three end up in a file
 * on disk and, when someone asks for help, in a message to a stranger.
 *
 * This used to sit beside a crash analyser that guessed at causes from keywords.
 * The guessing is gone — it named the wrong thing often enough to send people
 * after mods that were fine — but redaction is not analysis, and every line the
 * launcher writes still goes through it.
 */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Removes credentials, usernames and private absolute paths from persisted/shareable text. */
export function redactSensitiveText(
  value: string,
  options: { profileDirectory?: string; homeDirectory?: string } = {}
): string {
  let redacted = value
  const replacements = [
    [options.profileDirectory, '<PROFILE>'],
    [options.homeDirectory ?? os.homedir(), '<USER_HOME>']
  ] as const
  for (const [target, replacement] of replacements) {
    if (target) redacted = redacted.replace(new RegExp(escapeRegex(target), 'gi'), replacement)
  }

  return redacted
    .replace(/((?:access|refresh)[_-]?token["'=:\s]+)[^\s",}]+/gi, '$1[REDACTED]')
    .replace(/(Authorization["':\s]+Bearer\s+)[^\s",}]+/gi, '$1[REDACTED]')
    .replace(/(--accessToken(?:=|\s+))[^\s]+/gi, '$1[REDACTED]')
    .replace(/\b[A-Za-z]:\\Users\\[^\\\s]+/gi, '<USER_HOME>')
    .replace(/\b[A-Za-z]:\/Users\/[^/\s]+/gi, '<USER_HOME>')
    .replace(/\/(?:home|Users)\/[^/\s]+/g, '<USER_HOME>')
    .replace(/\\\\[^\\\s]+\\[^\\\s]+(?:\\[^\\\s]+)+/g, '<PATH>')
    .replace(/\b[A-Za-z]:\\(?:[^\s\\]+\\){2,}([^\s\\]+)/g, '<PATH>/$1')
    .replace(/\/(?:root|tmp|var|opt)\/(?:[^\s/]+\/)+([^\s/]+)/g, '<PATH>/$1')
    .replace(/(^|[\s"'=<(])\/(?:[^/\s]+\/){2,}([^/\s"'():,]+)/g, '$1<PATH>/$2')
}

export function sanitizeCrashReportForShare<T>(
  report: T,
  profileDirectory?: string,
  homeDirectory?: string
): T {
  const sanitize = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return redactSensitiveText(value, { profileDirectory, homeDirectory })
    }
    if (Array.isArray(value)) return value.map(sanitize)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitize(child)]))
    }
    return value
  }
  return sanitize(report) as T
}
