import { describe, it, expect } from 'vitest'
import {
  SPECTRAL_TABLE,
  resolveStarData,
  toStarParams,
} from './starPhysics'

const G_STAR = { spectralType: 'G' as const }
const M_STAR = { spectralType: 'M' as const }
const O_STAR = { spectralType: 'O' as const }

describe('SPECTRAL_TABLE', () => {
  it('contains all 7 spectral types (O B A F G K M)', () => {
    expect(Object.keys(SPECTRAL_TABLE)).toEqual(expect.arrayContaining(['O', 'B', 'A', 'F', 'G', 'K', 'M']))
  })

  it('temperature decreases O → M', () => {
    const types = ['O', 'B', 'A', 'F', 'G', 'K', 'M'] as const
    for (let i = 0; i < types.length - 1; i++) {
      expect(SPECTRAL_TABLE[types[i]].tempK).toBeGreaterThan(SPECTRAL_TABLE[types[i + 1]].tempK)
    }
  })

  it('radius decreases O → M', () => {
    const types = ['O', 'B', 'A', 'F', 'G', 'K', 'M'] as const
    for (let i = 0; i < types.length - 1; i++) {
      expect(SPECTRAL_TABLE[types[i]].radius).toBeGreaterThan(SPECTRAL_TABLE[types[i + 1]].radius)
    }
  })
})

describe('resolveStarData', () => {
  it('G-type uses SPECTRAL_TABLE defaults', () => {
    const data = resolveStarData(G_STAR)
    expect(data.tempK).toBe(SPECTRAL_TABLE.G.tempK)
    expect(data.radius).toBe(SPECTRAL_TABLE.G.radius)
    expect(data.color).toBe(SPECTRAL_TABLE.G.color)
  })

  it('custom tempK override is applied', () => {
    const data = resolveStarData({ spectralType: 'G', tempK: 6000 })
    expect(data.tempK).toBe(6000)
  })

  it('custom radius override is applied', () => {
    const data = resolveStarData({ spectralType: 'G', radius: 5 })
    expect(data.radius).toBe(5)
  })

  it('luminosity increases with temperature (Stefan-Boltzmann)', () => {
    const cool = resolveStarData(M_STAR)
    const hot  = resolveStarData(O_STAR)
    expect(hot.luminosity).toBeGreaterThan(cool.luminosity)
  })

  it('G-type reference (radius=REF_STAR_RADIUS, tempK≈REF_STAR_TEMP) → luminosity ≈ 1', () => {
    // G has radius=3=REF_STAR_RADIUS, tempK=5778=REF_STAR_TEMP
    const { luminosity } = resolveStarData(G_STAR)
    expect(luminosity).toBeCloseTo(1, 1)
  })
})

describe('toStarParams', () => {
  it('returns radius and tempK from resolved star data', () => {
    const params = toStarParams(G_STAR)
    expect(params.radius).toBe(SPECTRAL_TABLE.G.radius)
    expect(params.tempK).toBe(SPECTRAL_TABLE.G.tempK)
  })
})

