import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GAS_PATTERN,
  GAS_PATTERN_KINDS,
  resolveGasPattern,
  assignGaseousTiles,
} from './gasPatterns'
import type { PatternTile } from './distributionPatterns'
import { VOLATILE_IDS } from './volatileCatalog'

/** Small fibonacci-sphere lattice used to exercise the assigner deterministically. */
function fibSphereTiles(count: number, radius = 1): PatternTile[] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: PatternTile[] = []
  for (let i = 0; i < count; i++) {
    const y    = 1 - (2 * i) / (count - 1)
    const r_xy = Math.sqrt(1 - y * y)
    const t    = golden * i
    out.push({
      id: i,
      centerPoint: {
        x: Math.cos(t) * r_xy * radius,
        y: y * radius,
        z: Math.sin(t) * r_xy * radius,
      },
    })
  }
  return out
}

describe('DEFAULT_GAS_PATTERN catalogue', () => {
  it('declares a pattern for every catalogued volatile', () => {
    for (const id of VOLATILE_IDS) {
      expect(DEFAULT_GAS_PATTERN[id]).toBeDefined()
      expect(DEFAULT_GAS_PATTERN[id].peak).toBeGreaterThan(0)
    }
  })

  it('every default kind is in the UI dropdown list', () => {
    for (const id of VOLATILE_IDS) {
      expect(GAS_PATTERN_KINDS).toContain(DEFAULT_GAS_PATTERN[id].kind)
    }
  })

  it('archetype assignments match the visual intent', () => {
    expect(DEFAULT_GAS_PATTERN.h2he.kind).toBe('band')      // Jupiter stripes
    expect(DEFAULT_GAS_PATTERN.ch4.kind).toBe('vortex')     // Neptune storm
    expect(DEFAULT_GAS_PATTERN.nh3.kind).toBe('scatter')    // Saturn haze
    expect(DEFAULT_GAS_PATTERN.n2.kind).toBe('gradient')    // Polar frosts
    expect(DEFAULT_GAS_PATTERN.h2o.kind).toBe('cluster')    // Water storms
  })
})

describe('resolveGasPattern', () => {
  it('returns the per-volatile default when no override is set', () => {
    expect(resolveGasPattern('h2he').kind).toBe(DEFAULT_GAS_PATTERN.h2he.kind)
    expect(resolveGasPattern('ch4').kind).toBe(DEFAULT_GAS_PATTERN.ch4.kind)
  })

  it('overrides win over the default catalogue entry', () => {
    const swapped = resolveGasPattern('h2he', { h2he: 'vortex' })
    expect(swapped.kind).toBe('vortex')
  })

  it('overrides keep meaningful default params for the chosen kind', () => {
    const swapped = resolveGasPattern('h2he', { h2he: 'cluster' })
    if (swapped.kind === 'cluster') {
      expect(swapped.seeds).toBeGreaterThan(0)
      expect(swapped.sigmaFrac).toBeGreaterThan(0)
      expect(swapped.peak).toBeGreaterThan(0)
    } else {
      throw new Error('expected cluster kind')
    }
  })

  it('an empty override map is a no-op — same as omitting the argument', () => {
    expect(resolveGasPattern('ch4', {})).toEqual(resolveGasPattern('ch4'))
  })

  it('unknown id falls back to scatter (custom user-added gas resource)', () => {
    const fallback = resolveGasPattern('xenon-cloud')
    expect(fallback.kind).toBe('scatter')
    expect(fallback.peak).toBeGreaterThan(0)
  })

  it('unknown id still honours the override when supplied', () => {
    const swapped = resolveGasPattern('xenon-cloud', { 'xenon-cloud': 'band' })
    expect(swapped.kind).toBe('band')
  })
})

// ── assignGaseousTiles — exclusive assignment ────────────────────

describe('assignGaseousTiles', () => {
  it('returns an empty map when no gas is present', () => {
    const out = assignGaseousTiles({
      tiles: fibSphereTiles(50),
      gasMix: {},
      hashKey: 'seed',
      radius: 1,
    })
    expect(out.size).toBe(0)
  })

  it('assigns every tile when at least one gas is present', () => {
    const tiles = fibSphereTiles(100)
    const out   = assignGaseousTiles({
      tiles,
      gasMix:  { h2he: 1 },
      hashKey: 'seed',
      radius:  1,
    })
    expect(out.size).toBe(tiles.length)
  })

  it('each tile carries exactly one volatile (no mixing)', () => {
    const tiles = fibSphereTiles(80)
    const out   = assignGaseousTiles({
      tiles,
      gasMix:  { h2he: 0.7, ch4: 0.2, nh3: 0.1 },
      hashKey: 'seed',
      radius:  1,
    })
    // Every value is a valid VolatileId (not an array, not a map).
    for (const v of out.values()) {
      expect(typeof v).toBe('string')
    }
  })

  it('is deterministic — same inputs → identical output', () => {
    const tiles = fibSphereTiles(80)
    const a = assignGaseousTiles({ tiles, gasMix: { h2he: 0.6, ch4: 0.4 }, hashKey: 'k', radius: 1 })
    const b = assignGaseousTiles({ tiles, gasMix: { h2he: 0.6, ch4: 0.4 }, hashKey: 'k', radius: 1 })
    expect([...a.entries()]).toEqual([...b.entries()])
  })

  it('different hashKeys produce different background assignments', () => {
    const tiles = fibSphereTiles(120)
    const mix   = { h2he: 0.5, nh3: 0.5 }
    const a = assignGaseousTiles({ tiles, gasMix: mix, hashKey: 'A', radius: 1 })
    const b = assignGaseousTiles({ tiles, gasMix: mix, hashKey: 'B', radius: 1 })
    // At least one tile must differ (stochastic fallback breaks the tie
    // everywhere NH3's scatter doesn't dominate, so the 50/50 split must
    // shift between seeds).
    let differs = 0
    for (const [id, v] of a) if (b.get(id) !== v) differs++
    expect(differs).toBeGreaterThan(0)
  })

  it('CH₄ vortex claims the polar tiles even when H₂He dominates the mix', () => {
    const tiles = fibSphereTiles(200)
    const out   = assignGaseousTiles({
      tiles,
      gasMix:  { h2he: 0.9, ch4: 0.1 },  // H₂He dominant, CH₄ trace
      hashKey: 'seed',
      radius:  1,
    })
    // Collect tiles CH₄ won and check they sit near the +Y pole.
    const ch4Tiles = tiles.filter(t => out.get(t.id) === 'ch4')
    expect(ch4Tiles.length).toBeGreaterThan(0)
    const avgY = ch4Tiles.reduce((s, t) => s + t.centerPoint.y, 0) / ch4Tiles.length
    // CH₄'s default vortex centres on +Y → winning tiles must skew north.
    expect(avgY).toBeGreaterThan(0)
  })

  it('share-weighted fallback: with patterns gated off, tile counts track mix shares', () => {
    const tiles = fibSphereTiles(300)
    // `minWinnerIntensity: 1.5` puts the pattern floor above peak so no tile
    // can be claimed through pattern strength alone — every tile falls into
    // the stochastic fallback, which must respect the mix shares.
    const out = assignGaseousTiles({
      tiles,
      gasMix:              { h2he: 0.9, nh3: 0.1 },
      hashKey:             'seed',
      radius:              1,
      minWinnerIntensity:  1.5,
    })
    const h2heCount = [...out.values()].filter(v => v === 'h2he').length
    const nh3Count  = [...out.values()].filter(v => v === 'nh3').length
    // Expected ratio 90/10 = 9× — comfortable tolerance for the deterministic
    // FNV-1a hash (empirically ≈ 8× on this lattice size).
    expect(h2heCount).toBeGreaterThan(nh3Count * 5)
  })
})
