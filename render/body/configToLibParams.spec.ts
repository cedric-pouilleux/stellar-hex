import { describe, it, expect } from 'vitest'
import { configToLibParams } from './configToLibParams'
import type { BodyConfig } from '../../types/body.types'

// ── Helpers ────────────────────────────────────────────────────────

function rockyConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'test-rocky',
    type: 'rocky',
    radius: 1,
    rotationSpeed: 0.1,
    axialTilt: 0,
    atmosphereThickness: 0.5,
    liquidType: 'water',
    liquidState: 'liquid',
    noiseScale: 1.0,
    ...overrides,
  }
}

function gaseousConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'test-gas',
    type: 'gaseous',
    radius: 3,
    rotationSpeed: 0.5,
    axialTilt: 5,
    atmosphereThickness: 1,
    noiseScale: 1.0,
    ...overrides,
  }
}

function metallicConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'test-metallic',
    type: 'metallic',
    radius: 0.8,
    rotationSpeed: 0.05,
    axialTilt: 0,
    atmosphereThickness: 0.05,
    noiseScale: 1.0,
    ...overrides,
  }
}

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

  it('hasLava=false → lavaAmount = 0 regardless of variation', () => {
    const p = configToLibParams(rockyConfig({ hasLava: false }), { lavaIntensity: 0.5 } as never)
    expect(Number(p.lavaAmount)).toBe(0)
  })

  it('hasLava=true + variation.lavaIntensity → lavaAmount tracks the variation', () => {
    // Caller pushes the intensity directly; the lib no longer derives a
    // baseline from temperature.
    const p = configToLibParams(
      rockyConfig({ hasLava: true }),
      { lavaIntensity: 0.5 } as never,
    )
    expect(Number(p.lavaAmount)).toBeGreaterThan(0)
  })

  it('hasCracks=false → crackAmount = 0 regardless of variation', () => {
    const p = configToLibParams(rockyConfig({ hasCracks: false }))
    expect(p.crackAmount).toBe(0)
  })

  it('wet planet (liquid surface) → lower roughness than dry planet', () => {
    const wet = configToLibParams(rockyConfig({
      liquidType: 'water', liquidState: 'liquid', atmosphereThickness: 0.8,
    }))
    const dry = configToLibParams(rockyConfig({
      liquidType: undefined, liquidState: 'none', atmosphereThickness: 0.0,
    }))
    expect(Number(wet.roughness)).toBeLessThan(Number(dry.roughness))
  })

  it('heavy erosion (thick atmo + liquid surface) → lower craterDensity than bare rock', () => {
    // Erosion = atmo*0.85 + water*0.40; higher erosion → fewer craters.
    const eroded = configToLibParams(rockyConfig({
      atmosphereThickness: 0.9, liquidType: 'water', liquidState: 'liquid',
    }))
    const bare = configToLibParams(rockyConfig({
      atmosphereThickness: 0, liquidType: undefined, liquidState: 'none',
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

  it('turbulence tracks variation.gasTurbulence (caller-driven, not temperature)', () => {
    const calm   = configToLibParams(gaseousConfig(), { gasTurbulence: 0.20 } as never)
    const stormy = configToLibParams(gaseousConfig(), { gasTurbulence: 0.85 } as never)
    expect(Number(calm.turbulence)).toBeLessThan(Number(stormy.turbulence))
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

  it('hasLava=true + variation.lavaIntensity → lavaAmount tracks the variation', () => {
    const p = configToLibParams(
      metallicConfig({ hasLava: true }),
      { lavaIntensity: 0.5 } as never,
    )
    expect(Number(p.lavaAmount)).toBeGreaterThan(0)
  })

  it('roughness tracks variation.roughnessMod (caller-driven, not temperature)', () => {
    const smooth = configToLibParams(metallicConfig(), { roughnessMod: 0.7 } as never)
    const rough  = configToLibParams(metallicConfig(), { roughnessMod: 1.4 } as never)
    expect(Number(rough.roughness)).toBeGreaterThan(Number(smooth.roughness))
  })
})

// ── configToLibParams — star ───────────────────────────────────────

describe('configToLibParams — star', () => {
  it('returns expected shader keys', () => {
    const cfg: BodyConfig = {
      name: 'test-star', type: 'star', radius: 3,
      rotationSpeed: 0.02, axialTilt: 0,
      atmosphereThickness: 0,
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
      rotationSpeed: 0.02, axialTilt: 0,
      atmosphereThickness: 0,
    }
    const mStar = configToLibParams({ ...base, spectralType: 'M' })
    const gStar = configToLibParams({ ...base, spectralType: 'G' })
    expect(Number(mStar.pulsation)).toBeGreaterThan(Number(gStar.pulsation))
  })
})
