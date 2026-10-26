import fsp from 'node:fs/promises'
import path from 'node:path'
import type { PlaySession, Profile } from '../shared/types'
import { requireProfileDirectory, resolveInside } from './pathSafety.ts'

/**
 * When each profile was played, and for how long.
 *
 * `totalPlaytimeMs` on the profile answers "how long altogether" and nothing
 * else — it cannot say whether that was last week or two years ago, or which
 * evenings were the long ones. Keeping the individual sessions costs a few
 * kilobytes and is what makes any of those questions answerable.
 *
 * Written beside the profile rather than in the launcher's database on purpose:
 * exporting a profile takes its history with it, and deleting the profile takes
 * it away, which is what someone deleting a profile means.
 */

const FILE = 'sessions.json'

/**
 * How many to keep, per profile.
 *
 * Enough for years of daily play, and small enough that reading every profile's
 * file to draw one chart stays instant.
 */
const MAX_SESSIONS = 2_000

/** Sessions shorter than this are a launch that failed, not play. */
const MIN_SESSION_MS = 30_000

function sessionsFile(profile: Profile): string {
  return resolveInside(path.join(requireProfileDirectory(profile.directory), '.pisankus'), FILE)
}

export async function listSessions(profile: Profile): Promise<PlaySession[]> {
  try {
    const value = JSON.parse(await fsp.readFile(sessionsFile(profile), 'utf8')) as unknown
    if (!Array.isArray(value)) return []
    return (
      value
        .filter(
          (entry): entry is PlaySession =>
            Boolean(entry) &&
            typeof entry === 'object' &&
            Number.isFinite((entry as PlaySession).at) &&
            Number.isFinite((entry as PlaySession).ms) &&
            (entry as PlaySession).ms >= 0
        )
        // Only what a session is. Builds that measured memory also stored a
        // peak and a limit; copying those forward would keep them on disk for
        // good with nothing left that reads them.
        .map((entry) => ({ at: entry.at, ms: entry.ms }))
    )
  } catch {
    // No file yet, or one that cannot be read. Either way there is nothing to
    // show, and a broken history must not stop the launcher.
    return []
  }
}

/**
 * Records one finished session.
 *
 * Very short ones are dropped: a profile that fails to start still produces a
 * process that lived for a second, and a chart full of those says the game was
 * played every day it crashed.
 */
export async function recordSession(profile: Profile, startedAt: number, endedAt: number): Promise<void> {
  const ms = endedAt - startedAt
  if (!Number.isFinite(ms) || ms < MIN_SESSION_MS) return

  const file = sessionsFile(profile)
  const history = await listSessions(profile)
  const next = [...history, { at: startedAt, ms }].slice(-MAX_SESSIONS)

  await fsp.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  await fsp.writeFile(temporary, JSON.stringify(next), 'utf8')
  await fsp.rename(temporary, file)
}
