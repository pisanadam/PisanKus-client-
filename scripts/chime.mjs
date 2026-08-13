// Synthesises the launcher's welcome chime into src/renderer/assets/welcome.wav.
//
// The file is committed, so this only needs running when the sound should
// change. It is written out rather than pulled from a sample library so the
// licence of everything shipped in the installer stays obvious.
//
//   node scripts/chime.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RATE = 44100
const SECONDS = 2.8
const LENGTH = Math.round(RATE * SECONDS)

const left = new Float64Array(LENGTH)
const right = new Float64Array(LENGTH)

/**
 * A struck-bell voice: a handful of partials that each decay at their own rate,
 * the top ones fastest. That uneven decay is what reads as "bell" rather than
 * "beep" — a pure sine with one envelope sounds like a phone tone.
 */
const PARTIALS = [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 2, gain: 0.5, decay: 1.35 },
  { ratio: 3, gain: 0.22, decay: 1.8 },
  { ratio: 4.16, gain: 0.14, decay: 2.4 },
  { ratio: 5.43, gain: 0.08, decay: 3.1 }
]

function bell(startSeconds, frequency, amplitude, release, pan) {
  const start = Math.round(startSeconds * RATE)
  const attack = Math.round(0.006 * RATE) // enough to avoid a click, short enough to stay percussive
  // Equal-power panning keeps the perceived loudness steady across the stereo field.
  const angle = ((pan + 1) / 2) * (Math.PI / 2)
  const gainL = Math.cos(angle)
  const gainR = Math.sin(angle)

  for (let i = start; i < LENGTH; i++) {
    const t = (i - start) / RATE
    const envelope = Math.min(1, (i - start) / attack)
    let sample = 0
    for (const partial of PARTIALS) {
      sample += partial.gain * Math.sin(2 * Math.PI * frequency * partial.ratio * t) *
        Math.exp(-t * partial.decay / release)
    }
    const value = sample * amplitude * envelope
    left[i] += value * gainL
    right[i] += value * gainR
  }
}

/** Low sine that swells in and fades out, giving the chime some weight underneath. */
function pad(startSeconds, frequency, amplitude, duration) {
  const start = Math.round(startSeconds * RATE)
  const end = Math.min(LENGTH, start + Math.round(duration * RATE))
  for (let i = start; i < end; i++) {
    const t = (i - start) / RATE
    const progress = t / duration
    // Sine-shaped swell: silent at both ends, loudest a third of the way in.
    const envelope = Math.sin(Math.PI * Math.pow(progress, 0.55))
    const value =
      (Math.sin(2 * Math.PI * frequency * t) + 0.3 * Math.sin(2 * Math.PI * frequency * 2 * t)) *
      amplitude * envelope
    left[i] += value
    right[i] += value
  }
}

/**
 * Noise sweeping upward into the first hit. Two one-pole filters open together,
 * so the band moves up as it gets louder — the lift before the chime lands.
 */
function riser(duration, amplitude) {
  const end = Math.round(duration * RATE)
  let lowpass = 0
  let highpassState = 0
  for (let i = 0; i < end; i++) {
    const progress = i / end
    const noise = Math.random() * 2 - 1
    const cutoff = 0.02 + 0.35 * Math.pow(progress, 2)
    lowpass += cutoff * (noise - lowpass)
    highpassState += 0.012 * (lowpass - highpassState)
    const value = (lowpass - highpassState) * amplitude * Math.pow(progress, 2.4)
    // Slight decorrelation between the channels widens it.
    left[i] += value
    right[i] += value * 0.86
  }
}

/**
 * Schroeder reverb: parallel combs build density, series allpasses smear it.
 * Channel delays differ by a few samples so the tail is not dead centre.
 */
function reverb(channel, wet, offset) {
  const combs = [1557, 1617, 1491, 1422].map((size) => ({
    buffer: new Float64Array(size + offset),
    index: 0,
    feedback: 0.79
  }))
  const allpasses = [225, 556].map((size) => ({
    buffer: new Float64Array(size + offset),
    index: 0
  }))

  const output = new Float64Array(LENGTH)
  for (let i = 0; i < LENGTH; i++) {
    let sample = 0
    for (const comb of combs) {
      const stored = comb.buffer[comb.index]
      comb.buffer[comb.index] = channel[i] + stored * comb.feedback
      comb.index = (comb.index + 1) % comb.buffer.length
      sample += stored
    }
    sample /= combs.length

    for (const allpass of allpasses) {
      const stored = allpass.buffer[allpass.index]
      allpass.buffer[allpass.index] = sample + stored * 0.5
      allpass.index = (allpass.index + 1) % allpass.buffer.length
      sample = stored - sample * 0.5
    }
    output[i] = channel[i] + sample * wet
  }
  return output
}

// --- the arrangement -------------------------------------------------------
// An F major pentatonic rise (F–A–C–F) resolving onto a held A/C shimmer. The
// notes accelerate slightly, which lands the last one as an arrival rather than
// the fourth beat of a metronome.
riser(0.42, 0.09)
pad(0.0, 87.31, 0.2, 2.4) // F2

const NOTES = [
  { at: 0.0, hz: 349.23, pan: -0.35 }, // F4
  { at: 0.135, hz: 440.0, pan: 0.3 }, // A4
  { at: 0.255, hz: 523.25, pan: -0.22 }, // C5
  { at: 0.36, hz: 698.46, pan: 0.15 } // F5
]
for (const note of NOTES) bell(note.at, note.hz, 0.3, 1.15, note.pan)

// The shimmer that the run lands on, an octave up and left to ring out.
bell(0.42, 880.0, 0.17, 3.2, -0.45) // A5
bell(0.42, 1046.5, 0.13, 3.4, 0.45) // C6
bell(0.44, 1396.9, 0.06, 3.6, 0) // F6

const wetLeft = reverb(left, 0.34, 0)
const wetRight = reverb(right, 0.34, 23)

// Fade the last 300ms so the tail does not end on a step.
const fade = Math.round(0.3 * RATE)
for (let i = LENGTH - fade; i < LENGTH; i++) {
  const gain = (LENGTH - i) / fade
  wetLeft[i] *= gain
  wetRight[i] *= gain
}

// Normalise to -1.2 dBFS, then soft-clip. tanh only bites on the peaks, so it
// guards against clipping without audibly squashing the body of the sound.
let peak = 0
for (let i = 0; i < LENGTH; i++) {
  peak = Math.max(peak, Math.abs(wetLeft[i]), Math.abs(wetRight[i]))
}
const normalise = 0.871 / peak

const pcm = Buffer.alloc(LENGTH * 4)
for (let i = 0; i < LENGTH; i++) {
  pcm.writeInt16LE(Math.round(Math.tanh(wetLeft[i] * normalise) * 32767), i * 4)
  pcm.writeInt16LE(Math.round(Math.tanh(wetRight[i] * normalise) * 32767), i * 4 + 2)
}

const header = Buffer.alloc(44)
header.write('RIFF', 0)
header.writeUInt32LE(36 + pcm.length, 4)
header.write('WAVE', 8)
header.write('fmt ', 12)
header.writeUInt32LE(16, 16) // PCM chunk size
header.writeUInt16LE(1, 20) // format: PCM
header.writeUInt16LE(2, 22) // channels
header.writeUInt32LE(RATE, 24)
header.writeUInt32LE(RATE * 4, 28) // byte rate
header.writeUInt16LE(4, 32) // block align
header.writeUInt16LE(16, 34) // bits per sample
header.write('data', 36)
header.writeUInt32LE(pcm.length, 40)

const target = path.join(root, 'src', 'renderer', 'assets', 'welcome.wav')
await mkdir(path.dirname(target), { recursive: true })
await writeFile(target, Buffer.concat([header, pcm]))
console.log(`${path.relative(root, target)} — ${SECONDS}s, ${(pcm.length / 1024).toFixed(0)} KiB`)
