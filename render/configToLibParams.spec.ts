import { describe, it, expect } from 'vitest'
import { configToLibParams, bodyTypeToLibType } from './configToLibParams'
import type { BodyConfig } from '../types/body.types'

// ── Helpers ────────────────────────────────────────────────────────

function rockyConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'test-rocky',
    type: 'rocky',
    radius: 1,
    temperatureMin: -20,
    temperatureMax: 30,
    rotationSpeed: 0.1,
    axialTilt: 0,
    atmosphereThickness: 0.5,
    liquidCoverage: 0.4,
    noiseScale: 1.0,
    ...overrides,
  }
}

function gaseousConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'test-gas',
    type: 'gaseous',
    radius: 3,
    temperatureMin: -120,
    temperatureMax: -80,
    rotationSpeed: 0.5,
    axialTilt: 5,
    atmosphereThickness: 1,
    liquidCoverage: 0,
    noiseScale: 1.0,
    ...overrides,
  }
}

function metallicConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'test-metallic',
    type: 'metallic',
    radius: 0.8,
    temperatureMin: 100,
    temperatureMax: 300,
    rotationSpeed: 0.05,
    axialTilt: 0,
    atmosphereThickness: 0.05,
    liquidCoverage: 0,
    noiseScale: 1.0,
    ...overrides,
  }
}

// ── bodyTypeToLibType ────────────────────────────────────────────

describe('bodyTypeToLibType', () => {
  it.each([
    ['rocky',    'rocky'],
    ['metallic', 'metallic'],
    ['star',     'star'],
    ['gaseous',  'gas'],
  ] as const)('%s → %s', (input, expected) => {
    expect(bodyTypeToLibType(input)).toBe(expected)
  })
})

// ── configToLibParams — rocky ──────────────────────────────────────

describe('configToLibParams — rocky', () => {
  it('returns an object with expected shader keys', () => {
    const p = configToLibParams(rockyConfig())
    expect(p).toHaveProperty('roughness')
    expect(p).toHaveProperty('heightScale')
    expect(p).toHaveProperty('colorA')
    expect(p).toHaveProperty('colorB')
    expect(p).toHaveProperty('craterDensity')
    expect(p).toHaveProperty('lavaAmount')
  })

  it('weathered planet (avg in [-20, 50]°C) → no craters, no lava, no cracks', () => {
    // avg = 5 °C → weathered
    const p = configToLibParams(rockyConfig({ temperatureMin: -10, temperatureMax: 20 }))
    expect(p.craterDensity).toBe(0)
    expect(p.craterCount).toBe(0)
    expect(p.craterDepth).toBe(0)
    expect(p.lavaAmount).toBe(0)
    expect(p.crackAmount).toBe(0)
  })

  it('hot rocky planet without hasLava → lava disabled (caller decides)', () => {
    const p = configToLibParams(rockyConfig({ temperatureMin: 180, temperatureMax: 260 }))
    expect(Number(p.lavaAmount)).toBe(0)
  })

  it('hot rocky planet with hasLava:true → lava enabled', () => {
    const p = configToLibParams(rockyConfig({ temperatureMin: 180, temperatureMax: 260, hasLava: true }))
    expect(Number(p.lavaAmount)).toBeGreaterThan(0)
  })

  it('wet planet (high liquidCoverage) → lower roughness than dry planet', () => {
    const wet = configToLibParams(rockyConfig({ liquidCoverage: 0.9, atmosphereThickness: 0.8 }))
    const dry = configToLibParams(rockyConfig({ liquidCoverage: 0.0, atmosphereThickness: 0.0 }))
    expect(Number(wet.roughness)).toBeLessThan(Number(dry.roughness))
  })

  it('heavy erosion (thick atmo + high water) → lower craterDensity than bare rock', () => {
    // Erosion = atmo*0.85 + water*0.40; higher erosion → fewer craters
    const eroded = configToLibParams(rockyConfig({
      atmosphereThickness: 0.9, liquidCoverage: 0.5,
      temperatureMin: -80, temperatureMax: -40,
    }))
    const bare = configToLibParams(rockyConfig({
      atmosphereThickness: 0, liquidCoverage: 0,
      temperatureMin: -80, temperatureMax: -40,
    }))
    expect(Number(eroded.craterDensity)).toBeLessThan(Number(bare.craterDensity))
  })

  it('seed is deterministic from name', () => {
    const a = configToLibParams(rockyConfig({ name: 'alpha' }))
    const b = configToLibParams(rockyConfig({ name: 'alpha' }))
    expect(a.seed).toBe(b.seed)
  })

  it('different names produce different seeds', () => {
    const a = configToLibParams(rockyConfig({ name: 'alpha' }))
    const b = configToLibParams(rockyConfig({ name: 'beta' }))
    expect(a.seed).not.toBe(b.seed)
  })
})

// ── configToLibParams — gaseous ────────────────────────────────────

describe('configToLibParams — gaseous', () => {
  it('returns expected shader keys', () => {
    const p = configToLibParams(gaseousConfig())
    expect(p).toHaveProperty('bandCount')
    expect(p).toHaveProperty('animSpeed')
    expect(p).toHaveProperty('turbulence')
    expect(p).toHaveProperty('colorA')
    expect(p).toHaveProperty('colorB')
    expect(p).toHaveProperty('colorC')
    expect(p).toHaveProperty('colorD')
  })

  it('faster rotation → more bands and higher animSpeed', () => {
    const slow = configToLibParams(gaseousConfig({ rotationSpeed: 0.05 }))
    const fast = configToLibParams(gaseousConfig({ rotationSpeed: 0.90 }))
    expect(Number(fast.bandCount)).toBeGreaterThan(Number(slow.bandCount))
    expect(Number(fast.animSpeed)).toBeGreaterThan(Number(slow.animSpeed))
  })

  it('bandCount is an integer in [3, 20]', () => {
    for (const rot of [0.0, 0.1, 0.5, 1.0]) {
      const p = configToLibParams(gaseousConfig({ rotationSpeed: rot }))
      expect(Number(p.bandCount)).toBeGreaterThanOrEqual(3)
      expect(Number(p.bandCount)).toBeLessThanOrEqual(20)
      expect(Number(p.bandCount) % 1).toBe(0)
    }
  })

  it('CH4-rich gas (> 30%) produces lower turbulence (ice giant behavior)', () => {
    const iceGiant = configToLibParams(gaseousConfig({
      gasComposition: { CH4: 0.50, H2He: 0.50, NH3: 0, H2O: 0, sulfur: 0 },
      temperatureMin: -200, temperatureMax: -150,
    }))
    const hotGas = configToLibParams(gaseousConfig({
      gasComposition: { H2He: 1.0, CH4: 0, NH3: 0, H2O: 0, sulfur: 0 },
      temperatureMin: 0, temperatureMax: 50,
    }))
    expect(Number(iceGiant.turbulence)).toBeLessThan(Number(hotGas.turbulence))
  })
})

// ── configToLibParams — metallic ───────────────────────────────────

describe('configToLibParams — metallic', () => {
  it('returns expected shader keys', () => {
    const p = configToLibParams(metallicConfig())
    expect(p).toHaveProperty('roughness')
    expect(p).toHaveProperty('metalness')
    expect(p).toHaveProperty('colorA')
    expect(p).toHaveProperty('colorB')
    expect(p).toHaveProperty('crackAmount')
    expect(p).toHaveProperty('lavaAmount')
  })

  it('hasCracks=false → crackAmount = 0', () => {
    const p = configToLibParams(metallicConfig({ hasCracks: false }))
    expect(p.crackAmount).toBe(0)
  })

  it('hasLava=false → lavaAmount = 0', () => {
    const p = configToLibParams(metallicConfig({ hasLava: false }))
    expect(p.lavaAmount).toBe(0)
  })

  it('hot planet (avg > 150°C) with hasLava=true → lavaAmount > 0', () => {
    const p = configToLibParams(metallicConfig({
      temperatureMin: 150, temperatureMax: 300, hasLava: true,
    }))
    expect(Number(p.lavaAmount)).toBeGreaterThan(0)
  })

  it('high T_range → higher roughness', () => {
    const narrow = configToLibParams(metallicConfig({ temperatureMin: 50,  temperatureMax: 100 }))
    const wide   = configToLibParams(metallicConfig({ temperatureMin: -100, temperatureMax: 300 }))
    expect(Number(wide.roughness)).toBeGreaterThan(Number(narrow.roughness))
  })
})

// ── configToLibParams — star ───────────────────────────────────────

describe('configToLibParams — star', () => {
  it('returns expected shader keys', () => {
    const cfg: BodyConfig = {
      name: 'test-star', type: 'star', radius: 3,
      temperatureMin: 4000, temperatureMax: 6000,
      rotationSpeed: 0.02, axialTilt: 0,
      atmosphereThickness: 0, liquidCoverage: 0,
      spectralType: 'G',
    }
    const p = configToLibParams(cfg)
    expect(p).toHaveProperty('animSpeed')
    expect(p).toHaveProperty('granulationContrast')
    expect(p).toHaveProperty('pulsation')
    expect(p).toHaveProperty('coronaSize')
    expect(p).toHaveProperty('temperature')
    expect(p).toHaveProperty('seed')
  })

  it('M-type star → higher pulsation than G-type', () => {
    const base: BodyConfig = {
      name: 'star', type: 'star', radius: 2,
      temperatureMin: 3000, temperatureMax: 3500,
      rotationSpeed: 0.02, axialTilt: 0,
      atmosphereThickness: 0, liquidCoverage: 0,
    }
    const mStar = configToLibParams({ ...base, spectralType: 'M' })
    const gStar = configToLibParams({ ...base, spectralType: 'G' })
    expect(Number(mStar.pulsation)).toBeGreaterThan(Number(gStar.pulsation))
  })
})
