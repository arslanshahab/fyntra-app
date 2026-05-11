// Mulberry32 — tiny deterministic PRNG so the seed is reproducible.
// All randomness in mocks must flow through this so dev demos are stable.
export function createPrng(seed: number) {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    nextInt(minInclusive: number, maxInclusive: number): number {
      return Math.floor(next() * (maxInclusive - minInclusive + 1)) + minInclusive
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() called on empty array')
      return items[Math.floor(next() * items.length)]!
    },
    chance(probability: number): boolean {
      return next() < probability
    },
  }
}

export type Prng = ReturnType<typeof createPrng>
