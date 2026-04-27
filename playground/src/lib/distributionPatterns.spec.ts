import { describe, it, expect } from 'vitest'
import type { BiomeType } from './biomes'
import {
  applyPattern,
  applyClusterPattern,
  applyBandPattern,
  applyVortexPattern,
  applyScatterPattern,
  applyGradientPattern,
  hash01,
  type DistributionContext,
  type PatternTile,
} from './distributionPatterns'

// ── Shared fixtures ──────────────────────────────────────────────
// A fibonacci-sphere lattice: uniform-ish tile coverage on the unit sphere
// so every pattern has a sane evaluation surface in tests.

function fibSphereTiles(count: number, radius = 1): PatternTile[] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: PatternTile[] = []
  for (let i = 0; i < count; i++) {
    const y     = 1 - (2 * i) / (count - 1)           // [-1, 1]
    const r_xy  = Math.sqrt(1 - y * y)
    const theta = golden * i
    out.push({
      id: i,
      centerPoint: {
        x: Math.cos(theta) * r_xy * radius,
        y: y * radius,
        z: Math.sin(theta) * r_xy * radius,
      },
    })
  }
  return out
}

function baseContext(overrides: Partial<DistributionContext> = {}): DistributionContext {
  return {
    tiles:    fibSphereTiles(200, 1),
    biomeMap: new Map<number, BiomeType>(),
    hashKey:  'seed:test',
    radius:   1,
    ...overrides,
  }
}

// ── hash01 ────────────────────────────────────────────────────────

describe('hash01', () => {
  it('is deterministic — same (seed, x) always returns the same value', () => {
    expect(hash01('abc', 1)).toBe(hash01('abc', 1))
    expect(hash01('abc', 'foo')).toBe(hash01('abc', 'foo'))
  })

  it('returns values in [0, 1)', () => {
    for (const x of [0, 1, 2, 100, 'a', 'b']) {
      const h = hash01('s', x)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(1)
    }
  })

  it('decorrelates different seeds', () => {
    const a = hash01('seed-A', 42)
    const b = hash01('seed-B', 42)
    expect(a).not.toBe(b)
  })
})

// ── Eligibility filter (shared across patterns) ───────────────────

describe('eligibility filter', () => {
  it('cluster — eligible=undefined samples every tile (no biome filter)', () => {
    const ctx = baseContext()
    const out = applyClusterPattern({ kind: 'cluster', seeds: 1, sigmaFrac: 0.5, peak: 1 }, ctx)
    expect(out).not.toBeNull()
    expect(out!.size).toBeGreaterThan(0)
  })

  it('cluster — eligible=empty-set with no matching biome returns null', () => {
    const ctx = baseContext({ eligible: new Set([]) })
    const out = applyClusterPattern({ kind: 'cluster', seeds: 1, sigmaFrac: 0.5, peak: 1 }, ctx)
    expect(out).toBeNull()
  })

  it('cluster — only eligible biomes contribute to the output', () => {
    const biomeMap = new Map<number, BiomeType>()
    // Tag the first 50 tiles as 'mountain', the rest as 'plains'
    for (let i = 0; i < 50;  i++) biomeMap.set(i, 'mountain')
    for (let i = 50; i < 200; i++) biomeMap.set(i, 'plains')

    const ctx = baseContext({ biomeMap, eligible: new Set(['mountain'] as BiomeType[]) })
    const out = applyClusterPattern({ kind: 'cluster', seeds: 5, sigmaFrac: 0.5, peak: 1 }, ctx)!
    for (const id of out.keys()) expect(id).toBeLessThan(50)
  })
})

// ── Cluster ──────────────────────────────────────────────────────

describe('applyClusterPattern', () => {
  it('is deterministic — same hashKey produces the same map', () => {
    const ctx = baseContext()
    const p = { kind: 'cluster' as const, seeds: 3, sigmaFrac: 0.3, peak: 1 }
    const a = applyClusterPattern(p, ctx)!
    const b = applyClusterPattern(p, ctx)!
    expect([...a.entries()]).toEqual([...b.entries()])
  })

  it('different hashKeys pick different seed tiles', () => {
    const a = applyClusterPattern(
      { kind: 'cluster', seeds: 3, sigmaFrac: 0.2, peak: 1 },
      baseContext({ hashKey: 'A' }),
    )!
    const b = applyClusterPattern(
      { kind: 'cluster', seeds: 3, sigmaFrac: 0.2, peak: 1 },
      baseContext({ hashKey: 'B' }),
    )!
    // Can't demand full disjointness, but max-intensity tiles should differ.
    const peakA = [...a.entries()].sort((x, y) => y[1] - x[1])[0]
    const peakB = [...b.entries()].sort((x, y) => y[1] - x[1])[0]
    expect(peakA[0]).not.toBe(peakB[0])
  })

  it('never exceeds peak', () => {
    const out = applyClusterPattern(
      { kind: 'cluster', seeds: 5, sigmaFrac: 0.5, peak: 0.6 },
      baseContext(),
    )!
    for (const v of out.values()) expect(v).toBeLessThanOrEqual(0.6 + 1e-9)
  })
})

// ── Band ─────────────────────────────────────────────────────────

describe('applyBandPattern', () => {
  it('single equatorial band peaks at tiles near the equator', () => {
    const ctx = baseContext()
    const out = applyBandPattern(
      { kind: 'band', count: 1, width: 0.15, peak: 1 },
      ctx,
    )!
    // Highest-weight tiles should have near-zero y (equator in our fib-sphere).
    const topTiles = [...out.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id]) => ctx.tiles.find(t => t.id === id)!)
    const avgY = topTiles.reduce((s, t) => s + Math.abs(t.centerPoint.y), 0) / topTiles.length
    expect(avgY).toBeLessThan(0.1)
  })

  it('count=5 bands produce five separated intensity peaks along the axis', () => {
    const ctx = baseContext()
    const out = applyBandPattern(
      { kind: 'band', count: 5, width: 0.10, peak: 1 },
      ctx,
    )!
    // Bucket outputs by y-band — we expect roughly five modal bands.
    const yHisto = new Array(20).fill(0)
    for (const [id, v] of out) {
      const t   = ctx.tiles.find(t => t.id === id)!
      const bin = Math.min(19, Math.max(0, Math.floor((t.centerPoint.y + 1) * 10)))
      yHisto[bin] += v
    }
    // At least a handful of bins should be non-zero (the band peaks).
    const nonZero = yHisto.filter(v => v > 0.1).length
    expect(nonZero).toBeGreaterThanOrEqual(3)
  })

  it('respects a custom axis', () => {
    const ctx = baseContext()
    // Z-axis bands → intensity peak should align with z ≈ 0 (single band).
    const out = applyBandPattern(
      { kind: 'band', count: 1, axis: [0, 0, 1], width: 0.15, peak: 1 },
      ctx,
    )!
    const topTiles = [...out.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id]) => ctx.tiles.find(t => t.id === id)!)
    const avgZ = topTiles.reduce((s, t) => s + Math.abs(t.centerPoint.z), 0) / topTiles.length
    expect(avgZ).toBeLessThan(0.15)
  })
})

// ── Vortex ───────────────────────────────────────────────────────

describe('applyVortexPattern', () => {
  it("center='pole' concentrates intensity near the +Y pole", () => {
    const ctx = baseContext()
    const out = applyVortexPattern(
      { kind: 'vortex', center: 'pole', spiralTightness: 3, peak: 1 },
      ctx,
    )!
    const topTiles = [...out.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => ctx.tiles.find(t => t.id === id)!)
    const avgY = topTiles.reduce((s, t) => s + t.centerPoint.y, 0) / topTiles.length
    expect(avgY).toBeGreaterThan(0.3)  // noticeably pole-biased
  })

  it("center='random' is deterministic given the hashKey", () => {
    const p = { kind: 'vortex' as const, center: 'random' as const, spiralTightness: 2, peak: 1 }
    const a = applyVortexPattern(p, baseContext({ hashKey: 'seed-X' }))!
    const b = applyVortexPattern(p, baseContext({ hashKey: 'seed-X' }))!
    expect([...a.entries()]).toEqual([...b.entries()])
  })
})

// ── Scatter ──────────────────────────────────────────────────────

describe('applyScatterPattern', () => {
  it('density=0 produces an empty map', () => {
    const out = applyScatterPattern(
      { kind: 'scatter', density: 0, peak: 1 },
      baseContext(),
    )!
    expect(out.size).toBe(0)
  })

  it('density=1 populates roughly every tile', () => {
    const ctx = baseContext()
    const out = applyScatterPattern(
      { kind: 'scatter', density: 1, peak: 1, threshold: 0 },
      ctx,
    )!
    // `threshold: 0` keeps every sample whose intensity ≥ 0. Since scatter
    // intensity = 1 - n/density ∈ [0, 1], we keep every tile.
    expect(out.size).toBe(ctx.tiles.length)
  })

  it('is deterministic', () => {
    const p = { kind: 'scatter' as const, density: 0.5, peak: 1 }
    const a = applyScatterPattern(p, baseContext())!
    const b = applyScatterPattern(p, baseContext())!
    expect([...a.entries()]).toEqual([...b.entries()])
  })
})

// ── Gradient ─────────────────────────────────────────────────────

describe('applyGradientPattern', () => {
  it("axis='pole' peaks at both poles, drops to zero at the equator", () => {
    const ctx = baseContext()
    const out = applyGradientPattern(
      { kind: 'gradient', axis: 'pole', falloff: 1, peak: 1 },
      ctx,
    )!
    // Pick the tile closest to the north pole — it should have the highest weight.
    const north = ctx.tiles.reduce((a, b) => a.centerPoint.y > b.centerPoint.y ? a : b)
    const equat = ctx.tiles.reduce((a, b) =>
      Math.abs(a.centerPoint.y) < Math.abs(b.centerPoint.y) ? a : b,
    )
    const nWeight = out.get(north.id) ?? 0
    const eWeight = out.get(equat.id) ?? 0
    expect(nWeight).toBeGreaterThan(0.5)
    expect(eWeight).toBeLessThan(0.2)
  })

  it("axis='equator' inverts the gradient", () => {
    const ctx = baseContext()
    const out = applyGradientPattern(
      { kind: 'gradient', axis: 'equator', falloff: 1, peak: 1 },
      ctx,
    )!
    const north = ctx.tiles.reduce((a, b) => a.centerPoint.y > b.centerPoint.y ? a : b)
    const equat = ctx.tiles.reduce((a, b) =>
      Math.abs(a.centerPoint.y) < Math.abs(b.centerPoint.y) ? a : b,
    )
    const nWeight = out.get(north.id) ?? 0
    const eWeight = out.get(equat.id) ?? 0
    expect(eWeight).toBeGreaterThan(0.5)
    expect(nWeight).toBeLessThan(0.2)
  })

  it('higher falloff sharpens the transition', () => {
    const ctx = baseContext()
    const soft = applyGradientPattern(
      { kind: 'gradient', axis: 'pole', falloff: 1, peak: 1 },
      ctx,
    )!
    const sharp = applyGradientPattern(
      { kind: 'gradient', axis: 'pole', falloff: 4, peak: 1 },
      ctx,
    )!
    // With a steeper exponent, the mid-latitudes should be dimmer.
    const midTile = ctx.tiles.find(t => Math.abs(t.centerPoint.y - 0.5) < 0.1)!
    expect(sharp.get(midTile.id) ?? 0).toBeLessThan(soft.get(midTile.id) ?? 0)
  })
})

// ── Dispatcher ───────────────────────────────────────────────────

describe('applyPattern dispatcher', () => {
  it('routes each kind to its dedicated implementation', () => {
    const ctx = baseContext()
    const cluster  = applyPattern({ kind: 'cluster',  seeds: 2, sigmaFrac: 0.3, peak: 1 }, ctx)
    const band     = applyPattern({ kind: 'band',     count: 2, width: 0.2,    peak: 1 }, ctx)
    const vortex   = applyPattern({ kind: 'vortex',   center: 'pole', spiralTightness: 1, peak: 1 }, ctx)
    const scatter  = applyPattern({ kind: 'scatter',  density: 0.5,    peak: 1 }, ctx)
    const gradient = applyPattern({ kind: 'gradient', axis: 'pole', falloff: 1, peak: 1 }, ctx)

    expect(cluster).not.toBeNull()
    expect(band).not.toBeNull()
    expect(vortex).not.toBeNull()
    expect(scatter).not.toBeNull()
    expect(gradient).not.toBeNull()
  })
})
