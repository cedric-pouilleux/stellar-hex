import { describe, it, expect } from 'vitest'
import { resolveTileLevel } from './useBody'
import { DEFAULT_CORE_RADIUS_RATIO, resolveTerrainLevelCount } from '../../physics/body'
import type { BodyConfig } from '../../types/body.types'

/** Wet rocky body â€” sea level sits inside the integer band range. */
function wetRocky(): BodyConfig {
  return {
    name: 'TestWet', type: 'planetary', surfaceLook: 'terrain',
    atmosphereThickness: 0.5,
    liquidState: 'liquid',
    radius: 3, rotationSpeed: 0, axialTilt: 0,
  }
}

/** Dry rocky body â€” no sea. `seaLevel = -1` from the sim. */
function dryRocky(): BodyConfig {
  return {
    name: 'TestDry', type: 'planetary', surfaceLook: 'terrain',
    atmosphereThickness: 0.5,
    liquidState: 'none',
    radius: 3, rotationSpeed: 0, axialTilt: 0,
  }
}

// Under the band-indexed model, `resolveTileLevel(seaLevel, elevation)`
// reports `round(elevation - seaLevel)` with `-1` passed as sea level meaning
// "dry world". Elevations are integer bands in `[0, N-1]`, sea level is a
// fractional band position.

describe('resolveTileLevel', () => {
  it('returns 0 for the tile sitting exactly at the waterline', () => {
    const cfg      = wetRocky()
    const seaLevel = 5
    expect(resolveTileLevel(seaLevel, 5)).toBe(0)
  })

  it('returns a strictly negative level for submerged tiles', () => {
    const cfg      = wetRocky()
    const seaLevel = 5
    expect(resolveTileLevel(seaLevel, 0)).toBeLessThan(0)
    expect(resolveTileLevel(seaLevel, 3)).toBeLessThan(0)
    // Immediately below sea level â†’ shallowest ocean band = -1.
    expect(resolveTileLevel(seaLevel, 4)).toBe(-1)
  })

  it('returns a strictly positive level for land tiles above the shoreline', () => {
    const cfg      = wetRocky()
    const seaLevel = 5
    expect(resolveTileLevel(seaLevel, 9)).toBeGreaterThan(0)
    // Just above sea level â†’ first land band = +1.
    expect(resolveTileLevel(seaLevel, 6)).toBe(1)
  })

  it('produces integer values bracketed by the band range', () => {
    const cfg      = wetRocky()
    const seaLevel = 4.5
    const N        = resolveTerrainLevelCount(cfg.radius, cfg.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO)
    for (const e of [0, 1, 2, 5, 6, 9]) {
      const l = resolveTileLevel(seaLevel, e)
      expect(Number.isInteger(l)).toBe(true)
      expect(l).toBeGreaterThanOrEqual(-Math.ceil(seaLevel))
      expect(l).toBeLessThanOrEqual(N - 1 - Math.floor(seaLevel))
    }
  })

  it('returns the raw band index on a dry body (seaLevel = -1)', () => {
    const cfg = dryRocky()
    const seaLevel = -1
    for (const e of [0, 1, 3, 5, 7]) {
      const l = resolveTileLevel(seaLevel, e)
      expect(l).toBe(e)
      expect(Number.isInteger(l)).toBe(true)
    }
  })
})
