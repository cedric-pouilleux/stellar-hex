import { describe, it, expect } from 'vitest'
import { generateMetallicPalette } from './terrainPalette'
import { METALLIC_PLAIN_THRESH, METALLIC_PEAK_THRESH } from '../config/defaults'

describe('generateMetallicPalette', () => {
  describe('structure', () => {
    it('always returns exactly 4 levels', () => {
      expect(generateMetallicPalette(-50, 50)).toHaveLength(4)
      expect(generateMetallicPalette(-150, -100)).toHaveLength(4)
      expect(generateMetallicPalette(300, 500)).toHaveLength(4)
    })

    it('last level has threshold Infinity', () => {
      const levels = generateMetallicPalette(-10, 40)
      expect(levels[levels.length - 1].threshold).toBe(Infinity)
    })

    it('uses the shared terrain constants for band thresholds', () => {
      const levels = generateMetallicPalette(-10, 40)
      expect(levels[0].threshold).toBe(METALLIC_PLAIN_THRESH)
      expect(levels[2].threshold).toBe(METALLIC_PEAK_THRESH)
    })

    it('thresholds are strictly ascending', () => {
      const levels = generateMetallicPalette(-10, 40)
      for (let i = 0; i < levels.length - 1; i++) {
        expect(levels[i].threshold).toBeLessThan(levels[i + 1].threshold)
      }
    })
  })

  describe('PBR values', () => {
    it('all metalness values are in [0, 1]', () => {
      for (const avg of [-150, -40, 15, 120, 400]) {
        const levels = generateMetallicPalette(avg - 20, avg + 20)
        for (const l of levels) {
          expect(l.metalness).toBeGreaterThanOrEqual(0)
          expect(l.metalness).toBeLessThanOrEqual(1)
        }
      }
    })

    it('all roughness values are in [0, 1]', () => {
      for (const avg of [-150, -40, 15, 120, 400]) {
        const levels = generateMetallicPalette(avg - 20, avg + 20)
        for (const l of levels) {
          expect(l.roughness).toBeGreaterThanOrEqual(0)
          expect(l.roughness).toBeLessThanOrEqual(1)
        }
      }
    })

    it('peaks have higher metalness than crater floors', () => {
      const levels = generateMetallicPalette(-10, 40)
      expect(levels[3]!.metalness).toBeGreaterThan(levels[0]!.metalness!)
    })

    it('craters are rougher than peaks (for all climates)', () => {
      for (const avg of [-100, 0, 15, 100]) {
        const levels = generateMetallicPalette(avg - 20, avg + 20)
        expect(levels[0]!.roughness).toBeGreaterThan(levels[3]!.roughness!)
      }
    })

    it('rust (cold) → higher roughness on plains than polished steel (temperate)', () => {
      const rust   = generateMetallicPalette(-80, -20)   // avg = -50°C → max rust
      const steel  = generateMetallicPalette(-5,  35)    // avg = +15°C → polished
      expect(rust[1]!.roughness).toBeGreaterThan(steel[1]!.roughness!)
    })

    it('hot planet has lower roughness on plains than cold planet', () => {
      const cold = generateMetallicPalette(-20, 20)
      const hot  = generateMetallicPalette(180, 280)   // avg = 230°C → max hotFactor
      expect(hot[1]!.roughness).toBeLessThan(cold[1]!.roughness!)
    })
  })

  describe('volcanic conditions (avg > 200°C)', () => {
    it('peak level has emissive color set', () => {
      const levels = generateMetallicPalette(300, 500)  // avg = 400°C
      const peak   = levels[levels.length - 1]
      expect(peak.emissive).toBeDefined()
      expect(peak.emissiveIntensity).toBeGreaterThan(0)
    })

    it('non-volcanic planet has no peak emissive', () => {
      const levels = generateMetallicPalette(-10, 40)
      const peak   = levels[levels.length - 1]
      expect(peak.emissive).toBeUndefined()
    })
  })

  describe('height values', () => {
    it('crater floors have height 0', () => {
      const levels = generateMetallicPalette(-10, 40)
      expect(levels[0].height).toBe(0)
    })

    it('height increases from craters to peaks', () => {
      const levels = generateMetallicPalette(-10, 40)
      for (let i = 0; i < levels.length - 1; i++) {
        expect(levels[i + 1].height).toBeGreaterThanOrEqual(levels[i].height)
      }
    })
  })
})
