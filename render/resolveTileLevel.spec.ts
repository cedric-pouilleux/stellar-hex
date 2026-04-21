import { describe, it, expect } from 'vitest'
import { resolveTileLevel } from './useBody'
import type { BodyConfig } from '../types/body.types'

/** Wet rocky body — palette splits into ocean bands + land bands around seaLevel. */
function wetRocky(): BodyConfig {
  return {
    name: 'TestWet', type: 'rocky',
    temperatureMin: -10, temperatureMax: 30,
    atmosphereThickness: 0.5,
    liquidType: 'water', liquidState: 'liquid', liquidCoverage: 0.4,
    radius: 3, rotationSpeed: 0, axialTilt: 0,
    terrainLevelCount: 10,
  }
}

/** Dry rocky body — no sea, every band is above the reference sphere. */
function dryRocky(): BodyConfig {
  return {
    name: 'TestDry', type: 'rocky',
    temperatureMin: -10, temperatureMax: 30,
    atmosphereThickness: 0.5,
    liquidState: 'none', liquidCoverage: 0,
    radius: 3, rotationSpeed: 0, axialTilt: 0,
    terrainLevelCount: 8,
  }
}

describe('resolveTileLevel', () => {
  it('returns 0 for the waterline tile on a wet rocky body', () => {
    const cfg      = wetRocky()
    const seaLevel = 0.1
    expect(resolveTileLevel(cfg, seaLevel, seaLevel)).toBe(0)
  })

  it('returns a strictly negative level for submerged tiles', () => {
    const cfg      = wetRocky()
    const seaLevel = 0.1
    expect(resolveTileLevel(cfg, seaLevel, -0.9)).toBeLessThan(0)
    expect(resolveTileLevel(cfg, seaLevel, -0.2)).toBeLessThan(0)
    // Immediately below sea level → shallowest ocean band = -1.
    expect(resolveTileLevel(cfg, seaLevel, seaLevel - 0.001)).toBe(-1)
  })

  it('returns a strictly positive level for land tiles above the shoreline', () => {
    const cfg      = wetRocky()
    const seaLevel = 0.1
    expect(resolveTileLevel(cfg, seaLevel, 0.99)).toBeGreaterThan(0)
    // Just above sea level → first land band = 0 (shoreline).
    expect(resolveTileLevel(cfg, seaLevel, seaLevel + 0.001)).toBe(0)
  })

  it('produces integer values in the range [-oceanBands, landBands-1]', () => {
    const cfg      = wetRocky()
    const seaLevel = 0.0
    const N        = cfg.terrainLevelCount!
    const K        = Math.max(1, Math.floor(N / 2))
    const M        = Math.max(1, N - K)

    for (const e of [-1, -0.5, -0.01, 0, 0.01, 0.5, 1]) {
      const l = resolveTileLevel(cfg, seaLevel, e)
      expect(Number.isInteger(l)).toBe(true)
      expect(l).toBeGreaterThanOrEqual(-K)
      expect(l).toBeLessThanOrEqual(M - 1)
    }
  })

  it('returns only non-negative levels on a dry body (no sea)', () => {
    const cfg = dryRocky()
    // Dry bodies report seaLevel = -1 from the simulation.
    const seaLevel = -1
    for (const e of [-1, -0.5, 0, 0.5, 1]) {
      const l = resolveTileLevel(cfg, seaLevel, e)
      expect(l).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(l)).toBe(true)
    }
  })
})
