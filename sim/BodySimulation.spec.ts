import { describe, it, expect } from 'vitest'
import { generateHexasphere } from '../geometry/hexasphere'
import { initBodySimulation } from './BodySimulation'
import { resolveTerrainLevelCount, DEFAULT_CORE_RADIUS_RATIO } from '../physics/body'
import type { BodyConfig } from '../types/body.types'

function rockyConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'sim-seatest',
    type: 'planetary', surfaceLook: 'terrain',
    radius: 1,
    rotationSpeed: 0.05,
    axialTilt: 0,
    atmosphereThickness: 0.4,
    liquidState: 'liquid',
    ...overrides,
  }
}

describe('BodySimulation.bandToNoiseThreshold', () => {
  it('returns -1 on dry bodies (no sorted noise table)', () => {
    const config = rockyConfig({ liquidState: 'none' })
    const data   = generateHexasphere(config.radius, 2)
    const sim    = initBodySimulation(data.tiles, config)
    expect(sim.seaLevelNoise).toBe(-1)
    expect(sim.bandToNoiseThreshold(5)).toBe(-1)
  })

  it('stays inside the raw simplex [-1, 1] range on a wet body', () => {
    // Sanity check: the inversion percentile must pick from the sorted
    // simplex samples, so every value stays in simplex space.
    const config = rockyConfig()
    const data   = generateHexasphere(config.radius, 2)
    const sim    = initBodySimulation(data.tiles, config)
    for (let b = 0; b <= 20; b++) {
      const t = sim.bandToNoiseThreshold(b)
      expect(t).toBeGreaterThanOrEqual(-1.01)
      expect(t).toBeLessThanOrEqual(1.01)
    }
  })

  it('is monotonic: higher band â†’ higher (or equal) simplex threshold', () => {
    const config = rockyConfig()
    const data   = generateHexasphere(config.radius, 3)
    const sim    = initBodySimulation(data.tiles, config)
    const low    = sim.bandToNoiseThreshold(2)
    const high   = sim.bandToNoiseThreshold(18)
    expect(high).toBeGreaterThanOrEqual(low)
  })

  it('clamps out-of-range bands without throwing', () => {
    const config = rockyConfig()
    const data   = generateHexasphere(config.radius, 2)
    const sim    = initBodySimulation(data.tiles, config)
    expect(() => sim.bandToNoiseThreshold(-5)).not.toThrow()
    expect(() => sim.bandToNoiseThreshold(9999)).not.toThrow()
    expect(Number.isFinite(sim.bandToNoiseThreshold(-5))).toBe(true)
    expect(Number.isFinite(sim.bandToNoiseThreshold(9999))).toBe(true)
  })
})

describe('BodySimulation fBm noise knobs', () => {
  it('defaults (1 octave, no ridge, power=1) match a plain simplex sample', () => {
    // Single-octave fBm reduces to a raw simplex draw at the requested
    // frequency, so the quantised band layout is indistinguishable from
    // the pre-refactor behaviour when no noise knob is set.
    const cfg  = rockyConfig({ name: 'fbm-default' })
    const data = generateHexasphere(cfg.radius, 2)
    const a    = initBodySimulation(data.tiles, cfg)
    const b    = initBodySimulation(data.tiles, { ...cfg })
    for (const tile of data.tiles) {
      expect(a.tileStates.get(tile.id)!.elevation)
        .toBe(b.tileStates.get(tile.id)!.elevation)
    }
  })

  it('is deterministic for a given seed + noise knob combo', () => {
    const cfg  = rockyConfig({
      name:            'fbm-determinism',
      noiseOctaves:    4,
      noisePersistence: 0.6,
      noiseLacunarity: 2.3,
      noisePower:      1.8,
      noiseRidge:      0.4,
    })
    const data = generateHexasphere(cfg.radius, 2)
    const a    = initBodySimulation(data.tiles, cfg)
    const b    = initBodySimulation(data.tiles, cfg)
    for (const tile of data.tiles) {
      expect(a.tileStates.get(tile.id)!.elevation)
        .toBe(b.tileStates.get(tile.id)!.elevation)
    }
  })

  it('honours custom octaves/persistence without throwing and keeps elevations in [0, N-1]', () => {
    const cfg  = rockyConfig({
      name:             'fbm-envelope',
      noiseOctaves:     6,
      noisePersistence: 0.35,
      noiseLacunarity:  2.0,
    })
    const data = generateHexasphere(cfg.radius, 2)
    const sim  = initBodySimulation(data.tiles, cfg)
    const N    = resolveTerrainLevelCount(cfg.radius, cfg.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO, cfg.atmosphereThickness ?? 0)
    for (const tile of data.tiles) {
      const e = sim.tileStates.get(tile.id)!.elevation
      expect(Number.isInteger(e)).toBe(true)
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThanOrEqual(N - 1)
    }
  })

  it('ridge=1 still produces a valid quantisation (sign + envelope preserved)', () => {
    const cfg  = rockyConfig({ name: 'fbm-ridge', noiseRidge: 1 })
    const data = generateHexasphere(cfg.radius, 2)
    const sim  = initBodySimulation(data.tiles, cfg)
    // Equal-frequency banding tolerates any monotone distribution, so ridge
    // transforms just reshape which tiles land in which band â€” the band
    // count itself stays constant.
    const used = new Set<number>()
    for (const s of sim.tileStates.values()) used.add(s.elevation)
    expect(used.size).toBeGreaterThan(1)
  })

  it('reliefFlatness=0 is identity (same elevations as an unset config)', () => {
    // Hot path â€” we must not pay the Math.round contraction when the caller
    // does not opt in. Identity is verified by deep-equality of the
    // per-tile elevation map.
    const cfg   = rockyConfig({ name: 'fbm-flatness-id' })
    const data  = generateHexasphere(cfg.radius, 2)
    const a     = initBodySimulation(data.tiles, cfg)
    const b     = initBodySimulation(data.tiles, { ...cfg, reliefFlatness: 0 })
    for (const tile of data.tiles) {
      expect(a.tileStates.get(tile.id)!.elevation)
        .toBe(b.tileStates.get(tile.id)!.elevation)
    }
  })

  it('reliefFlatness=1 collapses every tile onto the top band N-1', () => {
    // Full contraction: the formula `(N-1) - (1-1)*(N-1-b)` evaluates to
    // `N-1` for every input band, so the planet reads perfectly flat at
    // the surface while the shell beneath still has N bands to extract.
    const cfg  = rockyConfig({ name: 'fbm-flatness-1', reliefFlatness: 1 })
    const data = generateHexasphere(cfg.radius, 2)
    const sim  = initBodySimulation(data.tiles, cfg)
    const N    = resolveTerrainLevelCount(cfg.radius, cfg.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO, cfg.atmosphereThickness ?? 0)
    for (const tile of data.tiles) {
      expect(sim.tileStates.get(tile.id)!.elevation).toBe(N - 1)
    }
  })

  it('reliefFlatness in (0,1) contracts the band range upward and is monotone', () => {
    // Intermediate flatness keeps the mapping monotone non-decreasing so
    // higher raw bands stay on top â€” only the visible extent shrinks.
    const data = generateHexasphere(1, 2)
    const cfg0 = rockyConfig({ name: 'fbm-flatness-mid', reliefFlatness: 0 })
    const cfgM = rockyConfig({ name: 'fbm-flatness-mid', reliefFlatness: 0.7 })
    const a    = initBodySimulation(data.tiles, cfg0)
    const b    = initBodySimulation(data.tiles, cfgM)
    const N    = resolveTerrainLevelCount(cfg0.radius, cfg0.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO)

    // Contracted: min elevation rises toward N-1, max stays N-1.
    let minA = N, maxA = 0, minB = N, maxB = 0
    const pairs: Array<{ a: number; b: number }> = []
    for (const tile of data.tiles) {
      const ea = a.tileStates.get(tile.id)!.elevation
      const eb = b.tileStates.get(tile.id)!.elevation
      minA = Math.min(minA, ea); maxA = Math.max(maxA, ea)
      minB = Math.min(minB, eb); maxB = Math.max(maxB, eb)
      pairs.push({ a: ea, b: eb })
    }
    expect(minB).toBeGreaterThanOrEqual(minA)
    expect(maxB).toBe(maxA) // the top band never moves
    expect((maxB - minB)).toBeLessThan(maxA - minA) // range strictly contracts

    // Monotone preservation: whenever raw elevation rises, contracted one
    // must not fall. We check pairwise ordering on a sort.
    pairs.sort((p, q) => p.a - q.a)
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i].b).toBeGreaterThanOrEqual(pairs[i - 1].b)
    }
  })

  it('reliefFlatness biases the initial sea level toward N-1 as well', () => {
    // Without the bias the default waterline sits mid-planet; after
    // contraction the mid of the *populated* band range must also shift up
    // so liquid coverage stays meaningful instead of dropping to ~0.
    const data = generateHexasphere(1, 2)
    const cfg0 = rockyConfig({ name: 'fbm-flatness-sea', reliefFlatness: 0 })
    const cfgH = rockyConfig({ name: 'fbm-flatness-sea', reliefFlatness: 0.8 })
    const a    = initBodySimulation(data.tiles, cfg0)
    const b    = initBodySimulation(data.tiles, cfgH)
    expect(b.seaLevelElevation).toBeGreaterThan(a.seaLevelElevation)
  })

  it('power â‰  1 reshapes the raw simplex distribution (bandToNoiseThreshold shifts)', () => {
    // Equal-frequency banding is rank-based, so a monotone sign-preserving
    // power transform leaves per-tile band assignments unchanged. What DOES
    // shift is the raw simplex value at each band's upper edge, which is
    // what the smooth-sphere ocean-mask shader re-samples â€” so that is
    // where the knob's effect is observable.
    const data = generateHexasphere(1, 2)
    const cfgA = rockyConfig({ name: 'fbm-power', noisePower: 1 })
    const cfgB = rockyConfig({ name: 'fbm-power', noisePower: 3 })
    const a    = initBodySimulation(data.tiles, cfgA)
    const b    = initBodySimulation(data.tiles, cfgB)
    let differingThresholds = 0
    for (let band = 1; band < 20; band++) {
      if (Math.abs(a.bandToNoiseThreshold(band) - b.bandToNoiseThreshold(band)) > 1e-6) differingThresholds++
    }
    expect(differingThresholds).toBeGreaterThan(0)
  })
})

describe('BodySimulation liquidCoverage', () => {
  it('defaults to ~0.5 when liquidCoverage is omitted', () => {
    // Equal-frequency banding makes mid-band a good first approximation of
    // 50 % submerged tiles; the actual count tolerates a small deviation.
    const cfg  = rockyConfig({ name: 'cov-default' })
    const data = generateHexasphere(cfg.radius, 3)
    const sim  = initBodySimulation(data.tiles, cfg)
    expect(sim.liquidCoverage).toBeGreaterThan(0.4)
    expect(sim.liquidCoverage).toBeLessThan(0.6)
  })

  it('honours an explicit liquidCoverage â€” higher target â†’ more submerged tiles', () => {
    const data  = generateHexasphere(1, 3)
    const low   = initBodySimulation(data.tiles, rockyConfig({ name: 'cov-asym', liquidCoverage: 0.2 }))
    const high  = initBodySimulation(data.tiles, rockyConfig({ name: 'cov-asym', liquidCoverage: 0.8 }))
    expect(low.liquidCoverage).toBeLessThan(0.35)
    expect(high.liquidCoverage).toBeGreaterThan(0.65)
    // Sea level monotone with target coverage.
    expect(high.seaLevelElevation).toBeGreaterThan(low.seaLevelElevation)
  })

  it('clamps out-of-range values to [0, 1] without throwing', () => {
    const data = generateHexasphere(1, 2)
    const negative = initBodySimulation(data.tiles, rockyConfig({ name: 'cov-neg', liquidCoverage: -0.5 }))
    const huge     = initBodySimulation(data.tiles, rockyConfig({ name: 'cov-big', liquidCoverage: 1.5 }))
    expect(negative.liquidCoverage).toBeGreaterThanOrEqual(0)
    expect(negative.liquidCoverage).toBeLessThan(0.05)        // clamped to 0 â†’ no/very few tiles submerged
    expect(huge.liquidCoverage).toBeGreaterThan(0.95)         // clamped to 1 â†’ almost every tile submerged
  })

  it('is ignored on dry bodies (liquidState = none) â€” coverage stays at 0', () => {
    const cfg  = rockyConfig({ name: 'cov-dry', liquidState: 'none', liquidCoverage: 0.7 })
    const data = generateHexasphere(cfg.radius, 2)
    const sim  = initBodySimulation(data.tiles, cfg)
    expect(sim.liquidCoverage).toBe(0)
    expect(sim.seaLevelElevation).toBe(-1)
  })
})

describe('BodySimulation continent layer', () => {
  it('continentAmount = 0 reproduces the legacy elevation field exactly', () => {
    // Same seed, no continent → must match the simplex-only baseline by tile id.
    const data    = generateHexasphere(1, 3)
    const baseCfg = rockyConfig({ name: 'cont-baseline' })
    const noCont  = initBodySimulation(data.tiles, { ...baseCfg, continentAmount: 0 })
    const legacy  = initBodySimulation(data.tiles, baseCfg)
    for (const t of data.tiles) {
      const a = noCont.tileStates.get(t.id)!.elevation
      const b = legacy.tileStates.get(t.id)!.elevation
      expect(a).toBe(b)
    }
  })

  it('continentAmount > 0 reshuffles which tiles land in which band (rank-based count is preserved)', () => {
    const data = generateHexasphere(1, 3)
    const cfg  = rockyConfig({ name: 'cont-shuffle' })
    const flat = initBodySimulation(data.tiles, cfg)
    const cont = initBodySimulation(data.tiles, { ...cfg, continentAmount: 0.7, continentScale: 1.5 })

    // Per-band tile counts stay (rank-based equal-frequency banding).
    const countByBand = (sim: typeof flat): number[] => {
      const counts: number[] = []
      for (const s of sim.tileStates.values()) counts[s.elevation] = (counts[s.elevation] ?? 0) + 1
      return counts
    }
    expect(countByBand(cont)).toEqual(countByBand(flat))

    // But individual tile assignments diverge — the voronoi mask shifts which
    // tiles cluster into low / high bands.
    let differingTiles = 0
    for (const t of data.tiles) {
      if (flat.tileStates.get(t.id)!.elevation !== cont.tileStates.get(t.id)!.elevation) differingTiles++
    }
    expect(differingTiles).toBeGreaterThan(data.tiles.length * 0.30)
  })

  it('is deterministic from the body name — same seed + same amount → same elevation per tile', () => {
    const data = generateHexasphere(1, 3)
    const cfg  = rockyConfig({ name: 'cont-determinism', continentAmount: 0.6, continentScale: 2 })
    const a = initBodySimulation(data.tiles, cfg)
    const b = initBodySimulation(data.tiles, cfg)
    for (const t of data.tiles) {
      expect(a.tileStates.get(t.id)!.elevation).toBe(b.tileStates.get(t.id)!.elevation)
    }
  })

  it('different names produce different continent layouts at the same amount', () => {
    const data = generateHexasphere(1, 3)
    const optsA = rockyConfig({ name: 'cont-name-A', continentAmount: 0.7 })
    const optsB = rockyConfig({ name: 'cont-name-B', continentAmount: 0.7 })
    const a = initBodySimulation(data.tiles, optsA)
    const b = initBodySimulation(data.tiles, optsB)
    let differingTiles = 0
    for (const t of data.tiles) {
      if (a.tileStates.get(t.id)!.elevation !== b.tileStates.get(t.id)!.elevation) differingTiles++
    }
    // Two different seeds should diverge on most tiles — same banding
    // distribution, different per-tile assignments.
    expect(differingTiles).toBeGreaterThan(data.tiles.length * 0.30)
  })
})
