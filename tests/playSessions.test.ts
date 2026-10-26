import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { listSessions, recordSession } from '../src/main/playSessions.ts'
import type { Profile } from '../src/shared/types.ts'

test('a session is filed under the limit it was launched with, not the one set since', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'pisankus-sessions-'))
  try {
    const directory = path.join(root, 'profiles', 'p1')
    // Raised from 2 GB to 8 GB while the game was still running.
    const profile = { id: 'p1', directory, memoryMb: 8_192 } as Profile
    await recordSession(profile, 0, 60_000, 1_950, 2_048)
    const [session] = await listSessions(profile)
    // Under the real 2 GB limit this peak is "starved", not "8 GB is plenty".
    assert.equal(session.peakMb, 1_950)
    assert.equal(session.capMb, 2_048)

    // Without an explicit limit the profile's own is still used.
    await recordSession(profile, 100_000, 200_000, 3_000)
    assert.equal((await listSessions(profile))[1].capMb, 8_192)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})
