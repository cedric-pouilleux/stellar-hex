import { describe, it, expect } from 'vitest'
import { continentMask3D, continentSeedFromName } from './continents'

/** Sample a fixed set of points distributed on the unit sphere (Fibonacci). */
function fibSphere(n: number): Array<{ x: number; y: number; z: number }> {
  const pts: Array<{ x: number; y: number; z: number }> = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y     = 1 - (i / (n - 1)) * 2
    const r     = Math.sqrt(1 - y * y)
    const theta = golden * i
    pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r })
  }
  return pts
}

describe('continentSeedFromName', () => {
  it('is deterministic', () => {
    const a = continentSeedFromName('alpha')
    const b = continentSeedFromName('alpha')
    expect(a).toEqual(b)
  })

  it('decorrelates different names', () => {
    const a = continentSeedFromName('alpha')
    const b = continentSeedFromName('beta')
    expect(a[0]).not.toBeCloseTo(b[0], 3)
  })

  it('keeps offsets bounded for shader uniform precision', () => {
    const seed = continentSeedFromName('any-name-here')
    for (const v of seed) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1000)
    }
  })
})

describe('continentMask3D', () => {
  const seed = continentSeedFromName('test-planet')

  it('returns values in [-1, +1]', () => {
    for (const p of fibSphere(64)) {
      const m = continentMask3D(p, 1.5, seed)
      expect(m).toBeGreaterThanOrEqual(-1)
      expect(m).toBeLessThanOrEqual(1)
    }
  })

  it('produces both continents and depressions across the sphere', () => {
    let positives = 0, negatives = 0
    for (const p of fibSphere(200)) {
      const m = continentMask3D(p, 1.5, seed)
      if (m > 0.3)  positives++
      if (m < -0.3) negatives++
    }
    // At scale 1.5 we expect a non-trivial split — neither side dominates.
    expect(positives).toBeGreaterThan(20)
    expect(negatives).toBeGreaterThan(20)
  })

  it('is deterministic for a given (point, scale, seed)', () => {
    const p = { x: 0.6, y: 0.5, z: -0.6245 } // off-axis, no symmetry
    const a = continentMask3D(p, 2.0, seed)
    const b = continentMask3D(p, 2.0, seed)
    expect(a).toBe(b)
  })

  it('differs when the seed changes', () => {
    const p = { x: 1, y: 0, z: 0 }
    const a = continentMask3D(p, 1.5, continentSeedFromName('a'))
    const b = continentMask3D(p, 1.5, continentSeedFromName('b'))
    // Same point sampled with different seeds usually lands on different cells
    // → mask values diverge. Tested over a few candidates because the equator
    // sample could rarely happen to coincide.
    let diffs = 0
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      const v = continentMask3D(p, 1.5, continentSeedFromName(name))
      if (Math.abs(v - a) > 0.1) diffs++
    }
    void b
    expect(diffs).toBeGreaterThanOrEqual(1)
  })

  it('produces more coastlines (sign changes between neighbours) when scale increases', () => {
    // Sample on a regular lat/lon grid so "neighbour" is well-defined.
    const samples = (scale: number): number => {
      const W = 24, H = 12
      const grid: boolean[][] = []
      for (let i = 0; i < H; i++) {
        const row: boolean[] = []
        const lat = (i / (H - 1)) * Math.PI - Math.PI / 2
        for (let j = 0; j < W; j++) {
          const lon = (j / W) * 2 * Math.PI
          const cy  = Math.sin(lat)
          const cr  = Math.cos(lat)
          const p   = { x: Math.cos(lon) * cr, y: cy, z: Math.sin(lon) * cr }
          row.push(continentMask3D(p, scale, seed) > 0)
        }
        grid.push(row)
      }
      let coastlines = 0
      for (let i = 0; i < H; i++) {
        for (let j = 0; j < W; j++) {
          const here = grid[i][j]
          if (here !== grid[i][(j + 1) % W])               coastlines++
          if (i + 1 < H && here !== grid[i + 1][j])        coastlines++
        }
      }
      return coastlines
    }
    expect(samples(3.0)).toBeGreaterThan(samples(1.0))
  })
})
