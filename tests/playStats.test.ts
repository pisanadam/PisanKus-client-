import assert from 'node:assert/strict'
import test from 'node:test'
import { dayKey, summarise } from '../src/shared/playStats.ts'

const HOUR = 3_600_000

/** Local midnight `daysAgo` days back, plus an offset into that day. */
function at(daysAgo: number, hour: number, now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour)
  return date.getTime()
}

const NOW = new Date('2026-08-31T15:00:00').getTime()

test('totals, averages and the longest session', () => {
  const stats = summarise(
    [
      {
        profileId: 'a',
        profileName: 'cs2',
        sessions: [
          { at: at(0, 14, NOW), ms: HOUR },
          { at: at(1, 20, NOW), ms: 3 * HOUR }
        ]
      },
      { profileId: 'b', profileName: 'Hexxit', sessions: [{ at: at(2, 19, NOW), ms: 2 * HOUR }] }
    ],
    { days: 7, now: NOW }
  )

  assert.equal(stats.totalMs, 6 * HOUR)
  assert.equal(stats.sessionCount, 3)
  assert.equal(stats.longestMs, 3 * HOUR)
  assert.equal(stats.averageMs, 2 * HOUR)
  // Longest first, so the list answers "what do I actually play".
  assert.deepEqual(stats.profiles.map((entry) => entry.profileName), ['cs2', 'Hexxit'])
  assert.equal(stats.profiles[0].ms, 4 * HOUR)
  assert.equal(stats.profiles[0].sessionCount, 2)
})

/**
 * A chart that leaves empty days out puts Monday next to Friday, and five days
 * of nothing then one long evening reads as a week of steady play.
 */
test('every day in the window is present, played or not', () => {
  const stats = summarise(
    [{ profileId: 'a', profileName: 'cs2', sessions: [{ at: at(3, 21, NOW), ms: HOUR }] }],
    { days: 7, now: NOW }
  )

  assert.equal(stats.days.length, 7)
  assert.equal(stats.days.filter((day) => day.ms > 0).length, 1)
  // Oldest first, ending on today.
  assert.equal(stats.days[6].day, dayKey(NOW))
  assert.equal(stats.days[3].ms, HOUR)
  assert.equal(stats.busiest?.day, dayKey(at(3, 21, NOW)))
})

test('play older than the window still counts to the total but not to the chart', () => {
  const stats = summarise(
    [
      {
        profileId: 'a',
        profileName: 'cs2',
        sessions: [
          { at: at(200, 12, NOW), ms: 5 * HOUR },
          { at: at(1, 12, NOW), ms: HOUR }
        ]
      }
    ],
    { days: 7, now: NOW }
  )

  assert.equal(stats.totalMs, 6 * HOUR)
  assert.equal(stats.days.reduce((sum, day) => sum + day.ms, 0), HOUR)
})

/**
 * The day key has to be the local calendar's. Built from `toISOString` it would
 * be UTC, and an evening session east of Greenwich would land on tomorrow.
 */
test('a late-evening session stays on the evening it started', () => {
  const evening = new Date('2026-08-30T23:30:00').getTime()
  assert.equal(dayKey(evening), '2026-08-30')

  const stats = summarise(
    [{ profileId: 'a', profileName: 'cs2', sessions: [{ at: evening, ms: 2 * HOUR }] }],
    { days: 7, now: NOW }
  )
  // Started before midnight, ran past it, and counts for the day it began on.
  assert.equal(stats.days.find((day) => day.day === '2026-08-30')?.ms, 2 * HOUR)
  assert.equal(stats.days.find((day) => day.day === '2026-08-31')?.ms, 0)
})

test('nothing played is an empty summary, not a division by zero', () => {
  const stats = summarise([{ profileId: 'a', profileName: 'cs2', sessions: [] }], { days: 7, now: NOW })
  assert.equal(stats.totalMs, 0)
  assert.equal(stats.averageMs, 0)
  assert.equal(stats.busiest, undefined)
  assert.deepEqual(stats.profiles, [])
  assert.equal(stats.days.length, 7)
})

test('a longer window is the same days, further back', () => {
  const stats = summarise([], { days: 30, now: NOW })
  assert.equal(stats.days.length, 30)
  assert.equal(stats.days[29].day, dayKey(NOW))
  assert.equal(stats.days[0].day, dayKey(at(29, 12, NOW)))
})
