import assert from 'node:assert/strict'
import test from 'node:test'
import { memoryAdvice } from '../src/shared/memoryAdvice.ts'

test('a vanilla profile is not told it needs more', () => {
  const advice = memoryAdvice({ currentMb: 2048, modCount: 0, totalMb: 16384 })
  assert.equal(advice.recommendedMb, 2048)
  assert.equal(advice.warning, undefined)
})

test('a big pack on too little memory is warned', () => {
  const advice = memoryAdvice({ currentMb: 2048, modCount: 140, totalMb: 16384 })
  assert.equal(advice.warning, 'too-low')
  assert.equal(advice.recommendedMb, 8192)
  assert.match(advice.reason, /\{count\} mod/)
  assert.deepEqual(advice.reasonParams, { count: 140 })
})

/**
 * The one nobody suspects: a heap far past what the profile needs makes the
 * game choppier, not smoother, because the collector has to walk all of it.
 */
test('far more memory than the pack needs is a warning, not a compliment', () => {
  const advice = memoryAdvice({ currentMb: 12288, modCount: 10, totalMb: 32768 })
  assert.equal(advice.warning, 'too-high')
  assert.equal(advice.recommendedMb, 3072)
  assert.match(advice.reason, /FPS/)
})

test('the advice never claims more than half the machine', () => {
  const advice = memoryAdvice({ currentMb: 4096, modCount: 200, totalMb: 8192 })
  // 200 mods want 8 GB, but half of 8 GB is 4 GB and that is the ceiling.
  assert.equal(advice.recommendedMb, 4096)
})

test('leaving the system without 2 GB is caught before anything else', () => {
  const advice = memoryAdvice({ currentMb: 7168, modCount: 0, totalMb: 8192 })
  assert.equal(advice.warning, 'starves-system')
  assert.match(advice.reason, /\{total\} GB/)
  assert.deepEqual(advice.reasonParams, { total: 8 })
})

test('an unknown machine size still advises, without a ceiling', () => {
  const advice = memoryAdvice({ currentMb: 4096, modCount: 140 })
  assert.equal(advice.recommendedMb, 8192)
  assert.equal(advice.warning, 'too-low')
})

/** Half a gigabyte either way is not worth a warning about. */
test('close enough is left alone', () => {
  for (const currentMb of [3584, 4096, 4608, 5120]) {
    assert.equal(memoryAdvice({ currentMb, modCount: 40, totalMb: 16384 }).warning, undefined, String(currentMb))
  }
})

test('the recommendation always lands on the slider step', () => {
  for (const modCount of [0, 5, 30, 90, 300]) {
    for (const totalMb of [4096, 8192, 12288, 16384, 65536]) {
      const { recommendedMb } = memoryAdvice({ currentMb: 4096, modCount, totalMb })
      assert.equal(recommendedMb % 512, 0, `${modCount} mod / ${totalMb} MB`)
      assert.ok(recommendedMb >= 2048)
    }
  }
})
