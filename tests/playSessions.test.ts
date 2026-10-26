import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { listSessions, recordSession } from '../src/main/playSessions.ts'
import type { Profile } from '../src/shared/types.ts'

async function withProfile(run: (profile: Profile) => Promise<void>): Promise<void> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-sessions-'))
  try {
    await run({ id: 'p1', directory: path.join(root, 'profiles', 'p1') } as Profile)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
}

test('a launch that died at once is not recorded as play', async () => {
  await withProfile(async (profile) => {
    await recordSession(profile, 0, 5_000)
    assert.deepEqual(await listSessions(profile), [])
    await recordSession(profile, 0, 60_000)
    assert.deepEqual(await listSessions(profile), [{ at: 0, ms: 60_000 }])
  })
})

test('memory figures left by older builds are dropped on the next write', async () => {
  await withProfile(async (profile) => {
    const file = path.join(profile.directory, '.pisankus', 'sessions.json')
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await fsp.writeFile(file, JSON.stringify([{ at: 0, ms: 60_000, peakMb: 1_950, capMb: 2_048 }, 'junk']))
    await recordSession(profile, 100_000, 200_000)
    assert.deepEqual(JSON.parse(await fsp.readFile(file, 'utf8')), [
      { at: 0, ms: 60_000 },
      { at: 100_000, ms: 100_000 }
    ])
  })
})
