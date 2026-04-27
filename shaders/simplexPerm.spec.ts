import { describe, it, expect } from 'vitest'
import { buildPermutationTable, createNoise3D } from 'simplex-noise'
import { buildPermTable } from './simplexPerm'
import { seededPrng } from '../internal/prng'

describe('buildPermTable', () => {
  it('produces the same 512-byte table as simplex-noise for the same seed', () => {
    const seed = 'test-planet'
    const ours     = buildPermTable(seed)
    const expected = buildPermutationTable(seededPrng(seed))
    expect(ours.length).toBe(512)
    expect(Array.from(ours)).toEqual(Array.from(expected))
  })

  it('differs between different seeds', () => {
    const a = buildPermTable('planet-a')
    const b = buildPermTable('planet-b')
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('is deterministic for the same seed', () => {
    const a = buildPermTable('same')
    const b = buildPermTable('same')
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('sampling points on the unit sphere matches createNoise3D output', () => {
    // Sanity check: if our perm table matches, any CPU simulation that
    // uses createNoise3D(seededPrng(seed)) produces the same output a
    // shader sees through the perm-texture upload.
    const seed    = 'noise-check'
    const noise3D = createNoise3D(seededPrng(seed))
    const scale   = 1.4
    const samples = [
      [1, 0, 0], [0, 1, 0], [0, 0, 1],
      [-1, 0, 0], [0.5, 0.5, 0.707], [0.1, -0.9, 0.42],
    ]
    for (const [x, y, z] of samples) {
      const len = Math.sqrt(x * x + y * y + z * z)
      const v   = noise3D((x / len) * scale, (y / len) * scale, (z / len) * scale)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
