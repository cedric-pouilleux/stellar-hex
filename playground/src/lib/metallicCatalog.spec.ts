import { describe, it, expect } from 'vitest'
import { deriveMetallicBands } from './metallicCatalog'

function temp(min: number, max: number): { min: number; max: number } {
  return { min, max }
}

describe('deriveMetallicBands', () => {
  describe('structure', () => {
    it('always returns exactly 4 bands', () => {
      expect(deriveMetallicBands(temp(-150, -100))).toHaveLength(4)
      expect(deriveMetallicBands(temp(-10, 40))).toHaveLength(4)
      expect(deriveMetallicBands(temp(300, 500))).toHaveLength(4)
    })

    it('every band has a hex colour string', () => {
      const bands = deriveMetallicBands(temp(0, 50))
      for (const b of bands) {
        expect(typeof b.color).toBe('string')
        expect(b.color).toMatch(/^#[0-9a-f]{6}$/)
      }
    })

    it('height schedule is monotonic non-decreasing', () => {
      const bands = deriveMetallicBands(temp(-10, 40))
      for (let i = 0; i < bands.length - 1; i++) {
        expect(bands[i + 1]!.height!).toBeGreaterThanOrEqual(bands[i]!.height!)
      }
    })
  })

  describe('material ladders', () => {
    it('all metalness / roughness values are in [0, 1]', () => {
      for (const avg of [-150, -40, 15, 120, 400]) {
        const bands = deriveMetallicBands(temp(avg - 20, avg + 20))
        for (const b of bands) {
          expect(b.metalness!).toBeGreaterThanOrEqual(0)
          expect(b.metalness!).toBeLessThanOrEqual(1)
          expect(b.roughness!).toBeGreaterThanOrEqual(0)
          expect(b.roughness!).toBeLessThanOrEqual(1)
        }
      }
    })

    it('peaks are more metallic than crater floors', () => {
      const bands = deriveMetallicBands(temp(-10, 40))
      expect(bands[3]!.metalness!).toBeGreaterThan(bands[0]!.metalness!)
    })

    it('rust (cold) → higher plains roughness than polished steel (temperate)', () => {
      const rust  = deriveMetallicBands(temp(-80, -20))   // avg = -50°C → max rust
      const steel = deriveMetallicBands(temp(-5,  35))    // avg = +15°C → polished
      expect(rust[1]!.roughness!).toBeGreaterThan(steel[1]!.roughness!)
    })

    it('hot planet has lower plains roughness than cold planet', () => {
      const cold = deriveMetallicBands(temp(-20, 20))
      const hot  = deriveMetallicBands(temp(180, 280))    // avg = 230°C → max hotFactor
      expect(hot[1]!.roughness!).toBeLessThan(cold[1]!.roughness!)
    })
  })

  describe('volcanic peaks (avg > 200°C)', () => {
    it('peak band carries an emissive override', () => {
      const bands = deriveMetallicBands(temp(300, 500))   // avg = 400°C
      expect(bands[3]!.emissive).toBeDefined()
      expect(bands[3]!.emissiveIntensity!).toBeGreaterThan(0)
    })

    it('non-volcanic planet leaves peak emissive undefined', () => {
      const bands = deriveMetallicBands(temp(-10, 40))
      expect(bands[3]!.emissive).toBeUndefined()
    })

    it('hotter planet yields higher peak emissive intensity', () => {
      const mild = deriveMetallicBands(temp(240, 260))    // avg = 250°C
      const hot  = deriveMetallicBands(temp(380, 420))    // avg = 400°C
      expect(hot[3]!.emissiveIntensity!).toBeGreaterThan(mild[3]!.emissiveIntensity!)
    })
  })

  describe('peak height schedule', () => {
    it('cold world has taller peaks than a molten one', () => {
      const frozen = deriveMetallicBands(temp(-170, -130))  // avg = -150°C
      const molten = deriveMetallicBands(temp(380, 420))    // avg = 400°C
      expect(frozen[3]!.height!).toBeGreaterThan(molten[3]!.height!)
    })
  })

  describe('determinism', () => {
    it('same temperature pair produces equal output', () => {
      const a = deriveMetallicBands(temp(10, 20))
      const b = deriveMetallicBands(temp(10, 20))
      expect(a).toEqual(b)
    })

    it('clamps beyond the catalogue range', () => {
      const superHot = deriveMetallicBands(temp(2000, 2100))
      const topAnchor = deriveMetallicBands(temp(390, 410))   // avg = 400
      expect(superHot[2]!.color).toBe(topAnchor[2]!.color)
    })

    // Two calls on the same input produce structurally equal output but
    // distinct references. Callers that feed `deriveMetallicBands` straight
    // into a Vue reactive proxy on every resync will retrigger the deep
    // watcher every frame — the playground caches the call by
    // `(temperatureMin, temperatureMax)` to avoid that loop (App.vue's
    // `applyMetallicBands` memo). This test pins the precondition that
    // motivates the cache.
    it('returns a fresh array reference each call (caller must memoize)', () => {
      const a = deriveMetallicBands(temp(10, 20))
      const b = deriveMetallicBands(temp(10, 20))
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })
})
