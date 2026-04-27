/**
 * SplitMix32 — a fast, high-quality 32-bit PRNG.
 *
 * Passes BigCrush and PractRand. Unlike xorshift32, it has no weak bit
 * patterns and produces well-distributed output across all bit widths.
 *
 * Pure-logic helper — no `three` dependency, safe to load from the
 * headless `sim` entry point and from any render code that needs a
 * deterministic stream.
 *
 * Usage:
 *   const rng = seededPrng('my-planet')
 *   const n = rng()  // → float in [0, 1)
 */
export function seededPrng(seed: string): () => number {
  // FNV-1a hash of the seed string → initial 32-bit state
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  }

  // SplitMix32 generator
  return (): number => {
    h = (h + 0x9e3779b9) >>> 0
    let z = h
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    return ((z ^ (z >>> 16)) >>> 0) / 4294967296
  }
}
