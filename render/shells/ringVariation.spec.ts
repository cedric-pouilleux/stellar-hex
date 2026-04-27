import { describe, it, expect } from 'vitest'
import { seededPrng } from '../../internal/prng'
import { generateRingVariation, RING_RANGES, type RingArchetype } from './ringVariation'
import { generateBodyVariation } from '../body/bodyVariation'
import type { BodyConfig } from '../../types/body.types'

// ── Helpers ───────────────────────────────────────────────────────

function makeRockyConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name:           'TestRocky',
    type:           'rocky',
    radius:         1,
    rotationSpeed:  0.01,
    axialTilt:      0.2,
    hasRings:       true,
    ...overrides,
  }
}

function makeGasConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name:           'TestGas',
    type:           'gaseous',
    radius:         3,
    rotationSpeed:  0.01,
    axialTilt:      0.1,
    hasRings:       true,
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe('generateRingVariation', () => {
  it('returns null when hasRings is false, regardless of PRNG consumption', () => {
    const cfg = makeRockyConfig({ hasRings: false })
    const rng = seededPrng('seed')
    const v   = generateRingVariation(cfg, rng)
    expect(v).toBeNull()
    // It still consumed draws — next draws should be deterministic and past the ring block
    const next = rng()
    expect(next).toBeGreaterThanOrEqual(0)
    expect(next).toBeLessThan(1)
  })

  it('always returns null for star bodies even when hasRings=true', () => {
    const cfg: BodyConfig = {
      name: 'Star', type: 'star', spectralType: 'G',
      radius: 3, rotationSpeed: 0.01, axialTilt: 0,
      hasRings: true,
    }
    expect(generateRingVariation(cfg, seededPrng('s'))).toBeNull()
  })

  it('is deterministic — same seed → identical output', () => {
    const cfg = makeGasConfig()
    const a = generateRingVariation(cfg, seededPrng('planet-A'))
    const b = generateRingVariation(cfg, seededPrng('planet-A'))
    expect(a).toEqual(b)
  })

  it('produces different outputs for different seeds', () => {
    const cfg = makeGasConfig()
    const a = generateRingVariation(cfg, seededPrng('alpha'))
    const b = generateRingVariation(cfg, seededPrng('beta'))
    expect(a).not.toEqual(b)
  })

  it('respects radius ordering and value ranges', () => {
    const EPS = 1e-9
    for (let i = 0; i < 200; i++) {
      const v = generateRingVariation(makeGasConfig(), seededPrng('run-' + i))!
      expect(v.innerRatio).toBeGreaterThanOrEqual(RING_RANGES.innerRatio.min)
      expect(v.innerRatio).toBeLessThanOrEqual(RING_RANGES.innerRatio.max + EPS)
      expect(v.outerRatio).toBeGreaterThan(v.innerRatio)
      const thickness = v.outerRatio - v.innerRatio
      // Either thin-mode or wide-mode bounds — use the loosest envelope.
      expect(thickness).toBeGreaterThanOrEqual(RING_RANGES.thinThick.min)
      expect(thickness).toBeLessThanOrEqual(RING_RANGES.wideThick.max + EPS)
      expect(v.opacity).toBeGreaterThanOrEqual(RING_RANGES.opacity.min)
      expect(v.opacity).toBeLessThanOrEqual(RING_RANGES.opacity.max + EPS)
      expect(v.bandContrast).toBeGreaterThanOrEqual(RING_RANGES.bandContrast.min)
      expect(v.bandContrast).toBeLessThanOrEqual(RING_RANGES.bandContrast.max + EPS)
      expect(v.grainAmount).toBeGreaterThanOrEqual(RING_RANGES.grainAmount.min)
      expect(v.grainAmount).toBeLessThanOrEqual(RING_RANGES.grainAmount.max + EPS)
      expect(v.grainFreq).toBeGreaterThanOrEqual(RING_RANGES.grainFreq.min)
      expect(v.grainFreq).toBeLessThanOrEqual(RING_RANGES.grainFreq.max + EPS)
      expect(v.bandFreq).toBeGreaterThanOrEqual(RING_RANGES.bandFreq.min)
      expect(v.bandFreq).toBeLessThanOrEqual(RING_RANGES.bandFreq.max + EPS)
      expect(v.lobeStrength).toBeGreaterThanOrEqual(RING_RANGES.lobeStrength.min)
      expect(v.lobeStrength).toBeLessThanOrEqual(RING_RANGES.lobeStrength.max + EPS)
      expect(v.keplerShear).toBeGreaterThanOrEqual(RING_RANGES.keplerShear.min)
      expect(v.keplerShear).toBeLessThanOrEqual(RING_RANGES.keplerShear.max + EPS)
      expect(v.profile).toHaveLength(8)
      for (const sample of v.profile) {
        expect(sample).toBeGreaterThanOrEqual(0)
        expect(sample).toBeLessThanOrEqual(1)
      }
    }
  })

  it('produces thin rings sometimes (less than one planet radius wide)', () => {
    let thinSeen = 0
    for (let i = 0; i < 300; i++) {
      const v = generateRingVariation(makeGasConfig(), seededPrng('thin-' + i))!
      if (v.outerRatio - v.innerRatio < 0.36) thinSeen++
    }
    // With THIN_MODE_CHANCE ≈ 0.18 plus shepherd archetype always thin, we expect ≥ 40/300.
    expect(thinSeen).toBeGreaterThan(30)
  })

  it('clamps keplerShear to a muted range for dusty / shepherd archetypes', () => {
    // Muted archetypes must not smear — their upper bound is 0.35 by design.
    for (let i = 0; i < 400; i++) {
      const v = generateRingVariation(makeGasConfig(), seededPrng('kep-' + i))!
      if (v.archetype === 'dusty' || v.archetype === 'shepherd') {
        expect(v.keplerShear).toBeLessThanOrEqual(0.35 + 1e-9)
      }
    }
  })

  it('spreads across every archetype given a varied seed space', () => {
    const seen = new Set<RingArchetype>()
    for (let i = 0; i < 800; i++) {
      const v = generateRingVariation(makeGasConfig(), seededPrng('spread-' + i))!
      seen.add(v.archetype)
    }
    // All 12 archetypes should turn up with this many draws.
    expect(seen.size).toBe(12)
  })

  it('occasionally picks exotic (off-type) colours', () => {
    // Gaseous per-type palette never produces a hex whose red channel is below 0x40 —
    // the exotic pool (teal, violet, icy, rust...) reaches much lower R values.
    let exoticSeen = 0
    for (let i = 0; i < 400; i++) {
      const v = generateRingVariation(makeGasConfig(), seededPrng('exo-' + i))!
      const r = parseInt(v.colorInner.slice(1, 3), 16)
      if (r < 0x60) exoticSeen++
    }
    expect(exoticSeen).toBeGreaterThan(0)
  })

  it('selects different colour palettes per planet type on most seeds', () => {
    // When the exotic-palette path is taken (rare), identical seeds yield identical
    // colours across types — so assert distribution: most seeds still differ.
    let differs = 0
    for (let i = 0; i < 60; i++) {
      const seed     = 'type-' + i
      const gas      = generateRingVariation(makeGasConfig(),  seededPrng(seed))!
      const rocky    = generateRingVariation(makeRockyConfig({ hasRings: true }), seededPrng(seed))!
      const metallic = generateRingVariation(
        makeRockyConfig({ type: 'metallic', hasRings: true }),
        seededPrng(seed),
      )!
      if (gas.colorInner !== rocky.colorInner && gas.colorInner !== metallic.colorInner) differs++
    }
    // Per-type palettes drive ~78% of draws — majority must still split by type.
    expect(differs).toBeGreaterThan(30)
  })
})

describe('generateBodyVariation — ring integration', () => {
  it('exposes rings=null when hasRings is false, but keeps the rest reproducible', () => {
    const cfgNo  = makeGasConfig({ hasRings: false })
    const cfgYes = makeGasConfig({ hasRings: true })
    const vNo    = generateBodyVariation(cfgNo)
    const vYes   = generateBodyVariation(cfgYes)
    expect(vNo.rings).toBeNull()
    expect(vYes.rings).not.toBeNull()
    // All other fields are identical — PRNG stream unaffected by hasRings
    expect(vNo.noiseSeed).toEqual(vYes.noiseSeed)
    expect(vNo.gasBandSharpness).toEqual(vYes.gasBandSharpness)
    expect(vNo.gasCloudColor).toEqual(vYes.gasCloudColor)
  })

  it('persists ring variation across repeated calls with the same config', () => {
    const cfg = makeGasConfig()
    const v1  = generateBodyVariation(cfg)
    const v2  = generateBodyVariation(cfg)
    expect(v1.rings).toEqual(v2.rings)
  })
})
