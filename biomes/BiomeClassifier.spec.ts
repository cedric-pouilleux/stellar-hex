import { describe, it, expect } from 'vitest'
import { classifyBiome } from './BiomeClassifier'
import type { BodyConfig } from '../types/body.types'

// ── Helpers ───────────────────────────────────────────────────────

function rockyConfig(avg = 15, atmo = 0.5, tempRange = 40): BodyConfig {
  const temperatureMin = avg - tempRange / 2
  const temperatureMax = avg + tempRange / 2
  // Derive caller-owned liquid fields via a minimal local rule, keeping the
  // spec independent of the playground's physics module. The lib itself no
  // longer infers these from temperature.
  let liquidType:  string | undefined
  let liquidState: 'liquid' | 'frozen' | 'none' = 'none'
  if (avg >= -15 && avg <= 60 && temperatureMax > 0) {
    liquidType  = 'water'
    liquidState = 'liquid'
  } else if (temperatureMax <= 0) {
    liquidType  = 'water'
    liquidState = 'frozen'
  }
  return {
    name:                'TestRocky',
    type:                'rocky',
    temperatureMin,
    temperatureMax,
    atmosphereThickness: atmo,
    radius:              1,
    rotationSpeed:       0.05,
    axialTilt:           0,
    liquidType,
    liquidState,
    liquidCoverage:      liquidType ? 0.5 : 0,
  }
}

const metallicConfig: BodyConfig = {
  name: 'TestMetal', type: 'metallic',
  temperatureMin: -10, temperatureMax: 40,
  radius: 1, rotationSpeed: 0.05, axialTilt: 0,
}

const gasConfig: BodyConfig = {
  name: 'TestGas', type: 'gaseous',
  temperatureMin: -100, temperatureMax: 100,
  radius: 2, rotationSpeed: 0.05, axialTilt: 0,
}

const starConfig: BodyConfig = {
  name: 'TestStar', type: 'star',
  temperatureMin: 2000, temperatureMax: 8000,
  radius: 3, rotationSpeed: 0.01, axialTilt: 0,
}

// ── Non-rocky planets ─────────────────────────────────────────────

describe('classifyBiome — star', () => {
  it('returns star biome', () => {
    expect(classifyBiome(0.5, -1, starConfig)).toBe('star')
  })
})

describe('classifyBiome — gaseous planet', () => {
  it('returns undefined (no biome)', () => {
    expect(classifyBiome(0.5, -1, gasConfig)).toBeUndefined()
    expect(classifyBiome(-0.5, -1, gasConfig)).toBeUndefined()
  })
})

describe('classifyBiome — metallic planet', () => {
  it('returns undefined (no biome)', () => {
    expect(classifyBiome(0.0, -1, metallicConfig)).toBeUndefined()
    expect(classifyBiome(0.5, -1, metallicConfig)).toBeUndefined()
    expect(classifyBiome(1.0, -1, metallicConfig)).toBeUndefined()
  })
})

// ── Rocky planet ──────────────────────────────────────────────────

describe('classifyBiome — rocky: ocean / ice_sheet', () => {
  it('just below sea level on temperate water world → ocean (top ocean band)', () => {
    // avg=15 → liquidType='water' liquidState='liquid'.
    // With default 20 levels, ocean gets 10 bands; the topmost slice
    // (seaLevel - bandSize → seaLevel) classifies as 'ocean'.
    expect(classifyBiome(0.45, 0.5, rockyConfig(15))).toBe('ocean')
  })

  it('deep below sea level on temperate water world → ocean_deep', () => {
    // Same config but well below the top ocean band → 'ocean_deep'.
    expect(classifyBiome(-0.5, 0.5, rockyConfig(15))).toBe('ocean_deep')
  })

  it('frozen world below sea level → ice_sheet (no liquid surface)', () => {
    // temperatureMax <= 0 → liquidType='water' liquidState='frozen'
    const frozen = rockyConfig(-80, 0, 40)  // max = -60 ≤ 0
    expect(classifyBiome(0.0, 0.5, frozen)).toBe('ice_sheet')
  })
})

describe('classifyBiome — rocky: lowlands', () => {
  // With seaLevelElev = -1: landPos = (elev + 1) / 2
  // For landPos = 0.15 (< LOW_FRAC=0.30): elev = -0.70

  it('moderate atmo, good temp → plains', () => {
    // avg=15, atmo=0.2 → habit = 0.2 * ~0.97 ≈ 0.19 < FOREST_HABIT_THRESH(0.30) → plains
    expect(classifyBiome(-0.70, -1, rockyConfig(15, 0.2))).toBe('plains')
  })

  it('high atmo + good temp → forest', () => {
    expect(classifyBiome(-0.70, -1, rockyConfig(15, 0.8))).toBe('forest')
  })

  it('arid → desert', () => {
    // atmo < 0.15 → desert
    expect(classifyBiome(-0.70, -1, rockyConfig(40, 0.05))).toBe('desert')
  })

  it('frozen world → plains (cold)', () => {
    // temperatureMax = -80 + 10 = -70 ≤ 0 → isFrozen
    const frozen = rockyConfig(-80, 0.3, 20)
    expect(classifyBiome(-0.70, -1, frozen)).toBe('plains')
  })

  it('volcanic world → volcanic', () => {
    // avg > 200
    expect(classifyBiome(-0.70, -1, rockyConfig(220, 0.1))).toBe('volcanic')
  })
})

describe('classifyBiome — rocky: mountain / peaks', () => {
  it('high elevation temperate → mountain', () => {
    // landPos > MID_FRAC, avg=15 → mountain
    expect(classifyBiome(1.0, -1, rockyConfig(15, 0.5))).toBe('mountain')
  })

  it('high elevation frozen → ice_peak', () => {
    const frozen = rockyConfig(-80, 0, 20)   // max = -70 ≤ 0 → isFrozen
    expect(classifyBiome(1.0, -1, frozen)).toBe('ice_peak')
  })

  it('high elevation cold (avg < 5) → ice_peak', () => {
    expect(classifyBiome(1.0, -1, rockyConfig(0, 0.1))).toBe('ice_peak')
  })

  it('high elevation volcanic → volcanic', () => {
    expect(classifyBiome(1.0, -1, rockyConfig(220, 0.1))).toBe('volcanic')
  })
})

describe('classifyBiome — only 9 rocky biomes are returned', () => {
  const VALID: Set<string> = new Set(['ocean', 'ocean_deep', 'ice_sheet', 'plains', 'forest', 'desert', 'mountain', 'volcanic', 'ice_peak'])
  const configs = [
    rockyConfig(15, 0.8),
    rockyConfig(15, 0.05),
    rockyConfig(40, 0.05),
    rockyConfig(-80, 0, 20),
    rockyConfig(220, 0.1),
  ]
  const seaLevels = [-1, 0.3, 0.5]

  for (const cfg of configs) {
    for (const sea of seaLevels) {
      for (const elev of [-0.5, 0.0, 0.5, 1.0]) {
        const biome = classifyBiome(elev, sea, cfg)
        if (biome !== undefined && biome !== 'star') {
          it(`elev=${elev} sea=${sea} avg=${(cfg.temperatureMin! + cfg.temperatureMax!) / 2} → valid biome`, () => {
            expect(VALID.has(biome)).toBe(true)
          })
        }
      }
    }
  }
})
