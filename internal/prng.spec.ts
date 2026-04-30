import { describe, it, expect } from 'vitest'
import { seededPrng } from './prng'

describe('seededPrng', () => {
  it('produces values in [0, 1)', () => {
    const rng = seededPrng('alpha')
    for (let i = 0; i < 100; i++) {
      const n = rng()
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })

  it('is deterministic — same seed yields the same stream', () => {
    const a = seededPrng('planet-A')
    const b = seededPrng('planet-A')
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b())
    }
  })

  it('decorrelates seeds — different seeds yield different streams', () => {
    const a = seededPrng('alpha')
    const b = seededPrng('beta')
    const sampleA = Array.from({ length: 20 }, () => a())
    const sampleB = Array.from({ length: 20 }, () => b())
    expect(sampleA).not.toEqual(sampleB)
  })

  it('decorrelates scoped seeds on the same name', () => {
    const resources = seededPrng('planet:resources')
    const factions  = seededPrng('planet:factions')
    expect(resources()).not.toBe(factions())
  })
})
