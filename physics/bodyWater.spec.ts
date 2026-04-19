import { describe, it, expect } from 'vitest'
import {
  averageBodyTemperature,
  canHaveLiquidSurfaceWater,
  canHaveAtmosphericWater,
  canHaveFrozenSurface,
  canHaveSurfaceWaterBody,
  hasLiquidSurface,
  isSurfaceWaterBiome,
  getSurfaceLiquidType,
  canHaveLiquidAmmonia,
  canHaveLiquidMethane,
  canHaveLiquidNitrogen,
  canHaveFrozenAmmonia,
  canHaveFrozenMethane,
  canHaveFrozenNitrogen,
  LIQUID_SURFACE_MAX_AVG_TEMP,
  LIQUID_SURFACE_MIN_AVG_TEMP,
  ATMOSPHERIC_WATER_MIN_AVG_TEMP,
  ATMOSPHERIC_WATER_MAX_AVG_TEMP,
} from './bodyWater'

const rocky = (temperatureMin: number, temperatureMax: number) =>
  ({ type: 'rocky' as const, temperatureMin, temperatureMax })

const gaseous = (temperatureMin: number, temperatureMax: number) =>
  ({ type: 'gaseous' as const, temperatureMin, temperatureMax })

describe('averageBodyTemperature', () => {
  it('returns arithmetic mean of min and max', () => {
    expect(averageBodyTemperature(rocky(-20, 40))).toBe(10)
    expect(averageBodyTemperature(rocky(0, 0))).toBe(0)
    expect(averageBodyTemperature(rocky(-100, 100))).toBe(0)
  })
})

describe('canHaveLiquidSurfaceWater', () => {
  it('returns false for non-rocky types', () => {
    expect(canHaveLiquidSurfaceWater(gaseous(-10, 30))).toBe(false)
    expect(canHaveLiquidSurfaceWater({ type: 'metallic', temperatureMin: -10, temperatureMax: 30 })).toBe(false)
  })

  it('temperate rocky planet → true', () => {
    // avg=10, tempMax=30 > 0, avg in [-15, 60]
    expect(canHaveLiquidSurfaceWater(rocky(-10, 30))).toBe(true)
  })

  it('tempMax ≤ 0 → false (permanently frozen)', () => {
    expect(canHaveLiquidSurfaceWater(rocky(-50, -1))).toBe(false)
    expect(canHaveLiquidSurfaceWater(rocky(-80, 0))).toBe(false)
  })

  it('avg below LIQUID_SURFACE_MIN_AVG_TEMP → false', () => {
    // avg = (-100 + 1) / 2 = -49.5, well below -15
    expect(canHaveLiquidSurfaceWater(rocky(-100, 1))).toBe(false)
  })

  it('avg above LIQUID_SURFACE_MAX_AVG_TEMP → false (oceans evaporated)', () => {
    // avg = 80 °C > 60
    expect(canHaveLiquidSurfaceWater(rocky(60, 100))).toBe(false)
  })

  it('at exact lower boundary of avg (LIQUID_SURFACE_MIN_AVG_TEMP) → true', () => {
    // avg = -15 exactly, tempMax > 0
    expect(canHaveLiquidSurfaceWater(rocky(-30, 0 + 1))).toBe(true)
  })

  it('at exact upper boundary of avg (LIQUID_SURFACE_MAX_AVG_TEMP) → true', () => {
    // avg = 60 exactly, tempMax > 0
    expect(canHaveLiquidSurfaceWater(rocky(50, 70))).toBe(true)
  })
})

describe('canHaveAtmosphericWater', () => {
  it('returns false for non-rocky types', () => {
    expect(canHaveAtmosphericWater({ type: 'star', temperatureMin: 0, temperatureMax: 20 })).toBe(false)
  })

  it('temperate planet → true', () => {
    // avg = 10, in [-60, 100]
    expect(canHaveAtmosphericWater(rocky(-10, 30))).toBe(true)
  })

  it('too cold (avg < -60) → false', () => {
    // avg = -80
    expect(canHaveAtmosphericWater(rocky(-100, -60))).toBe(false)
  })

  it('too hot (avg > 100) → false', () => {
    // avg = 110
    expect(canHaveAtmosphericWater(rocky(90, 130))).toBe(false)
  })

  it('atmospheric water wider range than liquid water', () => {
    // A planet too cold for liquid water can still have atmospheric water
    expect(ATMOSPHERIC_WATER_MIN_AVG_TEMP).toBeLessThan(LIQUID_SURFACE_MIN_AVG_TEMP)
    expect(ATMOSPHERIC_WATER_MAX_AVG_TEMP).toBeGreaterThan(LIQUID_SURFACE_MAX_AVG_TEMP)
  })

  it('at exact boundaries → true', () => {
    // avg = -60
    expect(canHaveAtmosphericWater(rocky(-120, 0))).toBe(true)
    // avg = 100
    expect(canHaveAtmosphericWater(rocky(50, 150))).toBe(true)
  })
})

describe('canHaveFrozenSurface', () => {
  it('returns false for non-rocky types', () => {
    expect(canHaveFrozenSurface(gaseous(-80, -10))).toBe(false)
  })

  it('tempMax ≤ 0 → true (permanently frozen)', () => {
    expect(canHaveFrozenSurface(rocky(-80, 0))).toBe(true)
    expect(canHaveFrozenSurface(rocky(-50, -10))).toBe(true)
  })

  it('tempMax > 0 → false (at least partial thaw)', () => {
    expect(canHaveFrozenSurface(rocky(-80, 1))).toBe(false)
    expect(canHaveFrozenSurface(rocky(10, 30))).toBe(false)
  })
})

describe('canHaveSurfaceWaterBody', () => {
  it('liquid-water planet → true', () => {
    expect(canHaveSurfaceWaterBody(rocky(-10, 30))).toBe(true)
  })

  it('frozen planet (tempMax ≤ 0) → true', () => {
    expect(canHaveSurfaceWaterBody(rocky(-80, -5))).toBe(true)
  })

  it('too-hot planet → false', () => {
    expect(canHaveSurfaceWaterBody(rocky(80, 120))).toBe(false)
  })

  it('too-cold for water but ammonia-eligible (tempMax=1, avg=-50) → true', () => {
    // tempMax > 0 so not frozen water; avg = -49.5 falls in ammonia liquid range [-78, -33]
    // canHaveSurfaceWaterBody now considers all liquids (water, ammonia, methane, nitrogen)
    expect(canHaveSurfaceWaterBody(rocky(-100, 1))).toBe(true)
  })

  it('non-rocky → false regardless of temperature', () => {
    expect(canHaveSurfaceWaterBody(gaseous(-10, 30))).toBe(false)
  })
})

describe('hasLiquidSurface', () => {
  it('liquid-water planet → true', () => {
    expect(hasLiquidSurface(rocky(-10, 30))).toBe(true)
  })

  it('ammonia-liquid planet → true', () => {
    // avg = -55, in [-78, -33], tempMax > -78
    expect(hasLiquidSurface(rocky(-80, -30))).toBe(true)
  })

  it('methane-liquid planet → true', () => {
    // avg = -170, in [-183, -161], tempMax > -183
    expect(hasLiquidSurface(rocky(-190, -150))).toBe(true)
  })

  it('nitrogen-liquid planet → true', () => {
    // avg = -200, in [-210, -196], tempMax > -210
    expect(hasLiquidSurface(rocky(-210, -190))).toBe(true)
  })

  it('frozen water (avg between water and ammonia ranges) → false', () => {
    // avg = -25 falls outside [-15, 60] (water) and [-78, -33] (ammonia) ranges
    expect(hasLiquidSurface(rocky(-40, -10))).toBe(false)
  })

  it('extremely cold frozen planet → false', () => {
    // avg = -140 falls between ammonia and methane liquid ranges
    expect(hasLiquidSurface(rocky(-160, -120))).toBe(false)
  })

  it('dry hot planet → false', () => {
    expect(hasLiquidSurface(rocky(80, 120))).toBe(false)
  })

  it('non-rocky → false', () => {
    expect(hasLiquidSurface(gaseous(-10, 30))).toBe(false)
  })
})

describe('isSurfaceWaterBiome', () => {
  it('ocean → true', () => {
    expect(isSurfaceWaterBiome('ocean')).toBe(true)
  })

  it('other biomes → false', () => {
    for (const b of ['forest', 'desert', 'mountain', 'plains', 'volcanic', 'ice_peak', 'ice_sheet', 'star', undefined] as const) {
      expect(isSurfaceWaterBiome(b)).toBe(false)
    }
  })
})

// ── Ammonia ─────────────────────────────────────────────────────

describe('canHaveLiquidAmmonia', () => {
  it('cold rocky planet in ammonia range → true', () => {
    // avg = (-70 + -40) / 2 = -55, tempMax = -40 > -78
    expect(canHaveLiquidAmmonia(rocky(-70, -40))).toBe(true)
  })

  it('avg outside ammonia range → false', () => {
    // avg = 10, not in [-78, -33]
    expect(canHaveLiquidAmmonia(rocky(-10, 30))).toBe(false)
  })

  it('non-rocky → false', () => {
    expect(canHaveLiquidAmmonia(gaseous(-70, -40))).toBe(false)
  })
})

describe('canHaveFrozenAmmonia', () => {
  it('rocky planet with tempMax ≤ -78 and avg in frozen range → true', () => {
    // avg = -95, tempMax = -80 ≤ -78
    expect(canHaveFrozenAmmonia(rocky(-110, -80))).toBe(true)
  })

  it('tempMax above -78 → false (not permanently frozen ammonia)', () => {
    expect(canHaveFrozenAmmonia(rocky(-110, -50))).toBe(false)
  })
})

// ── Methane ─────────────────────────────────────────────────────

describe('canHaveLiquidMethane', () => {
  it('very cold rocky planet in methane range → true', () => {
    // avg = (-180 + -165) / 2 = -172.5, tempMax = -165 > -183
    expect(canHaveLiquidMethane(rocky(-180, -165))).toBe(true)
  })

  it('avg outside methane range → false', () => {
    expect(canHaveLiquidMethane(rocky(-70, -40))).toBe(false)
  })

  it('non-rocky → false', () => {
    expect(canHaveLiquidMethane(gaseous(-180, -165))).toBe(false)
  })
})

describe('canHaveFrozenMethane', () => {
  it('rocky planet with tempMax ≤ -183 and avg in frozen range → true', () => {
    // avg = -200, tempMax = -190 ≤ -183
    expect(canHaveFrozenMethane(rocky(-210, -190))).toBe(true)
  })

  it('tempMax above -183 → false', () => {
    expect(canHaveFrozenMethane(rocky(-210, -170))).toBe(false)
  })
})

// ── Nitrogen ────────────────────────────────────────────────────

describe('canHaveLiquidNitrogen', () => {
  it('extreme cold rocky planet in nitrogen range → true', () => {
    // avg = (-208 + -198) / 2 = -203, tempMax = -198 > -210
    expect(canHaveLiquidNitrogen(rocky(-208, -198))).toBe(true)
  })

  it('avg outside nitrogen range → false', () => {
    expect(canHaveLiquidNitrogen(rocky(-180, -165))).toBe(false)
  })
})

describe('canHaveFrozenNitrogen', () => {
  it('rocky planet with tempMax ≤ -210 and avg in frozen range → true', () => {
    // avg = -220, tempMax = -215 ≤ -210
    expect(canHaveFrozenNitrogen(rocky(-225, -215))).toBe(true)
  })

  it('tempMax above -210 → false', () => {
    expect(canHaveFrozenNitrogen(rocky(-225, -200))).toBe(false)
  })
})

// ── getSurfaceLiquidType ────────────────────────────────────────

describe('getSurfaceLiquidType', () => {
  it('temperate planet → water', () => {
    expect(getSurfaceLiquidType(rocky(-10, 30))).toBe('water')
  })

  it('frozen water world → water', () => {
    // avg = -30, tempMax = -10 ≤ 0
    expect(getSurfaceLiquidType(rocky(-50, -10))).toBe('water')
  })

  it('cold rocky in ammonia liquid range → ammonia', () => {
    expect(getSurfaceLiquidType(rocky(-70, -40))).toBe('ammonia')
  })

  it('very cold rocky in methane liquid range → methane', () => {
    expect(getSurfaceLiquidType(rocky(-180, -165))).toBe('methane')
  })

  it('extreme cold rocky in nitrogen liquid range → nitrogen', () => {
    expect(getSurfaceLiquidType(rocky(-208, -198))).toBe('nitrogen')
  })

  it('frozen ammonia world → ammonia', () => {
    expect(getSurfaceLiquidType(rocky(-110, -80))).toBe('ammonia')
  })

  it('frozen methane world → methane', () => {
    // avg = -193, tempMax = -186 ≤ -183 (frozen methane), not in nitrogen liquid range
    expect(getSurfaceLiquidType(rocky(-200, -186))).toBe('methane')
  })

  it('frozen nitrogen world → nitrogen', () => {
    expect(getSurfaceLiquidType(rocky(-225, -215))).toBe('nitrogen')
  })

  it('too hot for any liquid → undefined (dry world)', () => {
    expect(getSurfaceLiquidType(rocky(80, 120))).toBeUndefined()
  })

  it('non-rocky → undefined', () => {
    expect(getSurfaceLiquidType(gaseous(-10, 30))).toBeUndefined()
  })
})

