import { describe, it, expect } from 'vitest'
import { godRaysFromStar } from './godRaysFromStar'

const G_STAR = { spectralType: 'G' as const }
const M_STAR = { spectralType: 'M' as const }
const O_STAR = { spectralType: 'O' as const }

describe('godRaysFromStar', () => {
  it('all properties are within their clamped bounds', () => {
    for (const type of ['O', 'B', 'A', 'F', 'G', 'K', 'M'] as const) {
      const rays = godRaysFromStar({ spectralType: type })
      expect(rays.exposure).toBeGreaterThanOrEqual(0.20)
      expect(rays.exposure).toBeLessThanOrEqual(1.20)
      expect(rays.decay).toBeGreaterThanOrEqual(0.88)
      expect(rays.decay).toBeLessThanOrEqual(0.97)
      expect(rays.density).toBeGreaterThanOrEqual(0.52)
      expect(rays.density).toBeLessThanOrEqual(0.88)
      expect(rays.weight).toBeGreaterThanOrEqual(0.28)
      expect(rays.weight).toBeLessThanOrEqual(0.56)
    }
  })

  it('hotter / more luminous star → higher exposure', () => {
    const mRays = godRaysFromStar(M_STAR)
    const oRays = godRaysFromStar(O_STAR)
    expect(oRays.exposure).toBeGreaterThan(mRays.exposure)
  })

  it('larger star → longer god rays (decay closer to 1)', () => {
    const mRays = godRaysFromStar(M_STAR)  // radius 1.5
    const oRays = godRaysFromStar(O_STAR)  // radius 15
    expect(oRays.decay).toBeGreaterThan(mRays.decay)
  })

  it('hotter star → heavier weight (sharper rays)', () => {
    const mRays = godRaysFromStar(M_STAR)
    const oRays = godRaysFromStar(O_STAR)
    expect(oRays.weight).toBeGreaterThan(mRays.weight)
  })

  it('G-type reference produces calibrated values', () => {
    // G: radius=3, tempK=5778, luminosity=1
    // exposure = 0.30 + 1.0 * 0.14 = 0.44
    // decay    = 0.88 + 3   * 0.020 = 0.94
    // density  = 0.52 + 3   * 0.060 = 0.70
    // weight   = 0.28 + 5778/70000  ≈ 0.36
    const rays = godRaysFromStar(G_STAR)
    expect(rays.exposure).toBeCloseTo(0.44, 1)
    expect(rays.decay).toBeCloseTo(0.94, 1)
    expect(rays.density).toBeCloseTo(0.70, 1)
    expect(rays.weight).toBeCloseTo(0.36, 1)
  })
})
