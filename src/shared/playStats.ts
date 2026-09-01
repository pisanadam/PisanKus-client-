/**
 * Turning play sessions into the few numbers worth looking at.
 *
 * Kept apart from both the file that stores them and the page that draws them,
 * because the interesting part is neither: it is which day a session counts
 * towards, what happens to one that runs past midnight, and how a run of empty
 * days is still a run of days on the chart.
 */

export interface PlaySession {
  /** When the session started. */
  at: number
  /** How long it lasted, in milliseconds. */
  ms: number
}

export interface ProfileSessions {
  profileId: string
  profileName: string
  sessions: PlaySession[]
}

export interface DayTotal {
  /** `YYYY-MM-DD` in local time, so it matches the calendar the player uses. */
  day: string
  ms: number
}

export interface ProfileTotal {
  profileId: string
  profileName: string
  ms: number
  sessionCount: number
}

export interface PlayStats {
  totalMs: number
  sessionCount: number
  /** Longest single session across every profile. */
  longestMs: number
  /** Average session length, or 0 with nothing played. */
  averageMs: number
  /** One entry per day in the window, oldest first, empty days included. */
  days: DayTotal[]
  /** Every profile that has been played, longest first. */
  profiles: ProfileTotal[]
  /** The busiest day in the window, if any day has time on it. */
  busiest?: DayTotal
}

/** Local-calendar day key. `toISOString` would be UTC and shift the evening. */
export function dayKey(when: number | Date): string {
  const date = when instanceof Date ? when : new Date(when)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The days in the window, oldest first.
 *
 * Every day is present even with nothing on it: a chart that omits empty days
 * puts Monday next to Friday and reads as five days of steady play.
 */
function windowDays(days: number, now: number): string[] {
  const keys: string[] = []
  for (let back = days - 1; back >= 0; back -= 1) {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - back)
    keys.push(dayKey(date))
  }
  return keys
}

export function summarise(input: ProfileSessions[], options: { days: number; now?: number }): PlayStats {
  const now = options.now ?? Date.now()
  const keys = windowDays(options.days, now)
  const inWindow = new Set(keys)
  const perDay = new Map<string, number>(keys.map((key) => [key, 0]))

  let totalMs = 0
  let sessionCount = 0
  let longestMs = 0
  const perProfile: ProfileTotal[] = []

  for (const entry of input) {
    let profileMs = 0
    let profileSessions = 0

    for (const session of entry.sessions) {
      // A session belongs to the day it started on. Splitting one that runs past
      // midnight across two days would be more accurate and less useful: people
      // remember playing on the evening they sat down.
      const key = dayKey(session.at)
      if (inWindow.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + session.ms)

      totalMs += session.ms
      sessionCount += 1
      profileMs += session.ms
      profileSessions += 1
      if (session.ms > longestMs) longestMs = session.ms
    }

    if (profileSessions > 0) {
      perProfile.push({
        profileId: entry.profileId,
        profileName: entry.profileName,
        ms: profileMs,
        sessionCount: profileSessions
      })
    }
  }

  const days = keys.map((day) => ({ day, ms: perDay.get(day) ?? 0 }))
  const busiest = days.reduce<DayTotal | undefined>(
    (best, candidate) => (candidate.ms > 0 && (!best || candidate.ms > best.ms) ? candidate : best),
    undefined
  )

  return {
    totalMs,
    sessionCount,
    longestMs,
    averageMs: sessionCount > 0 ? Math.round(totalMs / sessionCount) : 0,
    days,
    profiles: perProfile.sort((left, right) => right.ms - left.ms),
    busiest
  }
}
