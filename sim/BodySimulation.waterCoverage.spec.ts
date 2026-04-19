import { describe, it, expect } from 'vitest'
import { initBodySimulation } from './BodySimulation'
import { WATER_COVERAGE_RANGE } from '../config/defaults'
import type { Tile } from '../geometry/hexasphere.types'
import type { BodyConfig } from '../types/body.types'

// ── Fixtures ──────────────────────────────────────────────────────

/**
 * Build a deterministic ring of fake tiles distributed on the unit sphere.
 * Enough resolution so percentile-based sea level selection is numerically
 * stable (small ring would round the coverage to large buckets).
 */
function makeTiles(count = 200): Tile[] {
  const tiles: Tile[] = []
  for (let i = 0; i < count; i++) {
    // Spiral on a sphere — no clustering, no duplicate centers.
    const phi   = Math.acos(1 - 2 * (i + 0.5) / count)
    const theta = Math.PI * (1 + Math.sqrt(5)) * i
    const x = Math.sin(phi) * Math.cos(theta)
    const y = Math.sin(phi) * Math.sin(theta)
    const z = Math.cos(phi)
    tiles.push({
      id:          i,
      centerPoint: { x, y, z },
      boundary:    [],
      isPentagon:  false,
    })
  }
  return tiles
}

/** Config helper — only the temperature drives the liquid type selection. */
function rockyConfig(name: string, tMin: number, tMax: number): BodyConfig {
  return {
    type:           'rocky',
    name,
    temperatureMin: tMin,
    temperatureMax: tMax,
    radius:         1,
    rotationSpeed:  0,
    axialTilt:      0,
  }
}

// ── Tests ─────────────────────────────────────────────────────────

describe('initBodySimulation — water coverage per liquid type', () => {
  const tiles = makeTiles(400)

  // Tolerance: percentile bucketing on a 400-tile sample can push the
  // produced coverage one-slot past the target bound (1/400 = 0.25 %).
  const TOL = 1 / tiles.length + 1e-6

  it.each([
    { label: 'water',    tMin:   -5, tMax:  35 },
    { label: 'ammonia',  tMin:  -70, tMax: -40 },
    { label: 'methane',  tMin: -180, tMax: -165 },
    { label: 'nitrogen', tMin: -208, tMax: -200 },
  ] as const)(
    'clamps default coverage inside the $label range',
    ({ label, tMin, tMax }) => {
      const [min, max] = WATER_COVERAGE_RANGE[label]

      // Sweep many seeds so we actually exercise the range, not a single draw.
      for (let i = 0; i < 50; i++) {
        const sim = initBodySimulation(tiles, rockyConfig(`seed-${label}-${i}`, tMin, tMax))
        expect(sim.waterCoverage).toBeGreaterThanOrEqual(min - TOL)
        expect(sim.waterCoverage).toBeLessThanOrEqual(max + TOL)
      }
    },
  )

  it('exotic liquids produce a strictly narrower coverage than water', () => {
    // Average of many seeds — drift beyond the water upper bound is impossible
    // for methane/nitrogen by construction, so means must diverge too.
    const meanFor = (tMin: number, tMax: number): number => {
      let total = 0
      for (let i = 0; i < 50; i++) {
        const sim = initBodySimulation(tiles, rockyConfig(`mean-${tMin}-${i}`, tMin, tMax))
        total += sim.waterCoverage
      }
      return total / 50
    }

    const waterMean    = meanFor(-5, 35)
    const methaneMean  = meanFor(-180, -165)
    const nitrogenMean = meanFor(-208, -200)

    expect(methaneMean).toBeLessThan(waterMean)
    expect(nitrogenMean).toBeLessThan(waterMean)
    // Nitrogen is narrower than methane (0.01-0.10 vs 0.01-0.15).
    expect(nitrogenMean).toBeLessThan(methaneMean + 0.03)
  })

  it('explicit config.waterCoverage overrides the liquid-type default', () => {
    const cfg = { ...rockyConfig('override', -180, -165), waterCoverage: 0.62 }
    const sim = initBodySimulation(tiles, cfg)
    // Within one percentile bucket of the requested value.
    expect(sim.waterCoverage).toBeGreaterThanOrEqual(0.62 - TOL)
    expect(sim.waterCoverage).toBeLessThanOrEqual(0.62 + TOL)
  })
})
