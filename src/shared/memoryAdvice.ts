/**
 * How much memory a profile actually wants.
 *
 * Everyone's first instinct is to give Minecraft as much as the machine has,
 * and it is the wrong instinct: the Java garbage collector has to walk what it
 * was given, so a heap far larger than the game needs turns short, unnoticeable
 * pauses into long ones. A 12 GB heap on a profile that uses three is measurably
 * choppier than a 4 GB one, which is exactly the opposite of what the person
 * dragging the slider expects.
 *
 * The other direction is worse but at least it announces itself: too little
 * memory and the game crashes with OutOfMemoryError.
 *
 * So the launcher has an opinion. It does not enforce it — someone who knows
 * their pack needs 10 GB should be able to say so — it just says what it would
 * have picked and why.
 */

export interface MemoryAdvice {
  /** What the launcher would set, in MB. */
  recommendedMb: number
  /** Set only when the current value is worth saying something about. */
  warning?: 'too-low' | 'too-high' | 'starves-system'
  /**
   * The reason, as a translation template rather than a finished sentence.
   *
   * Building the sentence here would put a Turkish string with a number in it
   * in front of every player: the tables are keyed by source text, so a message
   * assembled from pieces matches no key and stays Turkish in all sixteen
   * languages.
   */
  reason: string
  reasonParams: Record<string, string | number>
}

/** Vanilla runs comfortably here; every step above is about mods. */
const BASE_MB = 2048

/**
 * Mods cost memory in two ways: the jars themselves, and the world data the
 * bigger ones keep in memory. These steps come from what the common packs
 * actually need rather than from a formula.
 */
function forModCount(modCount: number): number {
  if (modCount === 0) return BASE_MB
  if (modCount <= 20) return 3072
  if (modCount <= 60) return 4096
  if (modCount <= 120) return 6144
  return 8192
}

/** Rounded to the slider's own step so the advice is reachable by dragging. */
function toStep(megabytes: number): number {
  return Math.round(megabytes / 512) * 512
}

export function memoryAdvice(input: {
  currentMb: number
  modCount: number
  /** The machine's total RAM, when it is known. */
  totalMb?: number
}): MemoryAdvice {
  const { currentMb, modCount, totalMb } = input
  const wanted = forModCount(modCount)

  // Never advise more than half the machine: the rest of the system, and
  // Minecraft's own non-heap memory, have to live in what is left.
  const ceiling = totalMb ? Math.max(2048, toStep(totalMb / 2)) : Number.POSITIVE_INFINITY
  const recommendedMb = toStep(Math.min(wanted, ceiling))

  const params = { count: modCount }

  // Leaving the system under 2 GB is the one that makes the whole computer
  // unusable rather than just the game, so it is checked first.
  if (totalMb && totalMb - currentMb < 2048) {
    return {
      recommendedMb,
      warning: 'starves-system',
      reason: 'Bu makinede {total} GB var; bu kadarını oyuna verince sisteme yetecek kadarı kalmıyor.',
      reasonParams: { total: Math.round(totalMb / 1024) }
    }
  }

  if (currentMb < wanted - 512) {
    return {
      recommendedMb,
      warning: 'too-low',
      reason:
        modCount === 0
          ? 'Bu sürüm için az; oyun bellek yetmediği için çökebilir.'
          : '{count} mod için az; oyun bellek yetmediği için çökebilir.',
      reasonParams: params
    }
  }

  // A heap well past what the profile needs is the case nobody suspects, so the
  // reason says out loud that more is not better.
  if (currentMb > recommendedMb + 2048) {
    return {
      recommendedMb,
      warning: 'too-high',
      reason:
        modCount === 0
          ? 'Mod yok; bu kadarı gereksiz. Gereğinden büyük bellek çöp toplayıcıyı yavaşlatır, FPS düşer.'
          : '{count} mod için fazla. Gereğinden büyük bellek çöp toplayıcıyı yavaşlatır, FPS düşer.',
      reasonParams: params
    }
  }

  return {
    recommendedMb,
    reason: modCount === 0 ? 'Mod yok; bu ayar uygun.' : '{count} mod için uygun.',
    reasonParams: params
  }
}
