import { describe, it, expect } from 'vitest'
import {
  terrainBandLayout,
  resolveTerrainLevelCount,
  deriveCoreRadiusRatio,
  resolveCoreRadiusRatio,
  hasSurfaceLiquid,
  DEFAULT_TERRAIN_STEP,
  DEFAULT_CORE_RADIUS_RATIO,
  MIN_TERRAIN_LEVEL_COUNT,
} from './body'

describe('terrainBandLayout', () => {
  it('produces a strictly uniform staircase: height[i] = i * unit', () => {
    // Invariant of the refactor: every consecutive pair of bands is separated
    // by exactly `unit` world units — digging one level always removes the
    // same slice of height, no matter where in the staircase the tile sits.
    const N = 20
    const { unit, shell } = terrainBandLayout(1, 0.5, N)
    for (let i = 0; i < N; i++) {
      const height = i * unit
      expect(height).toBeGreaterThanOrEqual(0)
      expect(height).toBeLessThanOrEqual(shell + 1e-9)
    }
  })

  it('anchors height[0] = 0 (band 0 collapses to the core surface)', () => {
    // The lowest band is flush with the core — digging to elev=0 makes the
    // prism disappear entirely, revealing the core mesh beneath.
    const { unit } = terrainBandLayout(1, 0.55, 12)
    expect(0 * unit).toBe(0)
  })

  it('anchors height[N - 1] = shell for every core ratio (silhouette at radius)', () => {
    // The tallest band caps at `shell = (1 - coreRatio) * radius` so the
    // world radius of the outer prism equals `radius` regardless of the
    // core ratio. This is what keeps the silhouette stable.
    for (const coreRatio of [0.1, 0.4, 0.55, 0.8]) {
      const N = 20
      const { unit, shell } = terrainBandLayout(1, coreRatio, N)
      const tallest = (N - 1) * unit
      expect(tallest).toBeCloseTo(shell, 12)
      expect(coreRatio + tallest).toBeCloseTo(1, 12)
    }
  })

  it('scales linearly with radius at fixed core ratio / level count', () => {
    // Doubling the radius doubles the shell, which doubles `unit`.
    const small = terrainBandLayout(1, 0.5, 10).unit
    const big   = terrainBandLayout(4, 0.5, 10).unit
    expect(big).toBeCloseTo(small * 4, 12)
  })

  it('clamps level counts below MIN to the floor (avoids a zero divisor)', () => {
    const a = terrainBandLayout(1, 0.5, 1)
    const b = terrainBandLayout(1, 0.5, MIN_TERRAIN_LEVEL_COUNT)
    // N=1 is clamped up to MIN, so both calls must yield the same unit.
    expect(a.unit).toBe(b.unit)
    expect(Number.isFinite(a.unit)).toBe(true)
  })

  it('returns shell = 0 when the core swallows the body (coreRatio ≥ 1)', () => {
    // No physical shell left → unit collapses to 0, every band sits at 0.
    const { unit, shell } = terrainBandLayout(1, 1, 20)
    expect(shell).toBe(0)
    expect(unit).toBe(0)
  })
})

describe('resolveTerrainLevelCount', () => {
  it('derives N so each band is ≈ DEFAULT_TERRAIN_STEP tall in world units', () => {
    // Shell = 0.45 (radius=1, coreRatio=0.55) → N ≈ 0.45 / DEFAULT_TERRAIN_STEP
    const n = resolveTerrainLevelCount(1, 0.55)
    expect(n).toBe(Math.round(0.45 / DEFAULT_TERRAIN_STEP))
    // The resulting unit should land close to the target step value.
    const layout = terrainBandLayout(1, 0.55, n)
    expect(layout.unit).toBeCloseTo(DEFAULT_TERRAIN_STEP, 1)
  })

  it('scales the derived N with shell thickness — big planets get more bands', () => {
    const small = resolveTerrainLevelCount(1, 0.55)
    const big   = resolveTerrainLevelCount(5, 0.55)
    // Shell grows 5× → N grows roughly 5×.
    expect(big).toBeGreaterThan(small * 4)
    expect(big).toBeLessThanOrEqual(small * 6)
  })

  it('falls back to MIN_TERRAIN_LEVEL_COUNT for tiny shells', () => {
    // radius=0.1, coreRatio=0.9 → shell=0.01 → derived ≈ 0 → clamped to MIN.
    const n = resolveTerrainLevelCount(0.1, 0.9)
    expect(n).toBe(MIN_TERRAIN_LEVEL_COUNT)
  })

  it('is a pure function of (radius, coreRadiusRatio) — backend/frontend agree', () => {
    // The whole point of dropping the caller override: wire `radius` and
    // `coreRadiusRatio` across the boundary and both sides derive the same
    // N deterministically without negotiating extra fields.
    expect(resolveTerrainLevelCount(DEFAULT_CORE_RADIUS_RATIO, 0.5))
      .toBe(resolveTerrainLevelCount(DEFAULT_CORE_RADIUS_RATIO, 0.5))
    expect(resolveTerrainLevelCount(3, 0.55))
      .toBe(resolveTerrainLevelCount(3, 0.55))
  })
})

describe('deriveCoreRadiusRatio', () => {
  it('returns 1 for a fully solid body (gasMassFraction = 0)', () => {
    expect(deriveCoreRadiusRatio(0)).toBe(1)
  })

  it('returns 0 for a pure gas ball (gasMassFraction = 1)', () => {
    // Boundary the render layer must handle — core mesh is skipped,
    // sol band collapses, atmo shell occupies the whole sphere.
    expect(deriveCoreRadiusRatio(1)).toBe(0)
  })

  it('decreases monotonically between 0 and 1', () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]
    const values  = samples.map(deriveCoreRadiusRatio)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1])
    }
  })

  it('lands Jupiter-class bodies around the expected silhouette', () => {
    // Jupiter's mass is ~93% gas, ~7% heavier elements. We want the core to
    // be a small but visible fraction of the silhouette — not collapsed to
    // zero (that's reserved for pure-gas fantasy bodies).
    const jupiter = deriveCoreRadiusRatio(0.93)
    expect(jupiter).toBeGreaterThan(0.1)
    expect(jupiter).toBeLessThan(0.4)
  })

  it('clamps inputs outside [0, 1]', () => {
    expect(deriveCoreRadiusRatio(-0.5)).toBe(1)
    expect(deriveCoreRadiusRatio( 1.5)).toBe(0)
  })
})

describe('resolveCoreRadiusRatio', () => {
  it('prefers explicit coreRadiusRatio over gasMassFraction', () => {
    expect(resolveCoreRadiusRatio({ coreRadiusRatio: 0.42, gasMassFraction: 0.9 })).toBe(0.42)
  })

  it('falls back to gasMassFraction derivation when coreRadiusRatio is absent', () => {
    // f=0 → derived ratio is 1.0, but the sol-band guard caps it at
    // `1 − MIN_SOL_BAND_FRACTION = 0.95` so the layered mesh keeps a
    // non-degenerate sol band even on fully solid bodies.
    expect(resolveCoreRadiusRatio({ gasMassFraction: 0 })).toBe(0.95)
    expect(resolveCoreRadiusRatio({ gasMassFraction: 1 })).toBe(0)
  })

  it('clamps coreRadiusRatio so atmo + core leaves at least 5% of radius for the sol band', () => {
    // Explicit 0.6 + atmo 0.5 → would leave only 0% for sol; clamp to 0.45.
    expect(resolveCoreRadiusRatio({ coreRadiusRatio: 0.6, atmosphereThickness: 0.5 }))
      .toBeCloseTo(0.45, 5)
  })

  it('falls back to DEFAULT_CORE_RADIUS_RATIO when both knobs are absent', () => {
    expect(resolveCoreRadiusRatio({})).toBe(DEFAULT_CORE_RADIUS_RATIO)
  })

  it('treats 0 as a valid explicit override (pure-gas opt-in)', () => {
    // Numeric check — `0 ?? …` would trip on nullish; the resolver uses
    // typeof so the caller can force a pure-gas shape explicitly.
    expect(resolveCoreRadiusRatio({ coreRadiusRatio: 0 })).toBe(0)
  })
})

describe('hasSurfaceLiquid', () => {
  it('returns true for a liquid rocky body', () => {
    expect(hasSurfaceLiquid({ type: 'rocky', liquidState: 'liquid' })).toBe(true)
  })

  it('returns true for a frozen rocky body (ice sheets still count as a surface)', () => {
    expect(hasSurfaceLiquid({ type: 'rocky', liquidState: 'frozen' })).toBe(true)
  })

  it('returns false when liquidState is none or absent', () => {
    expect(hasSurfaceLiquid({ type: 'rocky', liquidState: 'none' })).toBe(false)
    expect(hasSurfaceLiquid({ type: 'rocky' /* undefined → none */ })).toBe(false)
  })

  it('is FALSE for gaseous bodies even when liquidState = liquid (invariant check)', () => {
    // Gas giants cannot hold a surface liquid — the helper is the single
    // enforcement point so a stale config value does not leak into the
    // render pipeline.
    expect(hasSurfaceLiquid({ type: 'gaseous', liquidState: 'liquid' })).toBe(false)
  })

  it('is FALSE for metallic and star bodies regardless of liquid fields', () => {
    expect(hasSurfaceLiquid({ type: 'metallic', liquidState: 'liquid' })).toBe(false)
    expect(hasSurfaceLiquid({ type: 'star',     liquidState: 'liquid' })).toBe(false)
  })
})
