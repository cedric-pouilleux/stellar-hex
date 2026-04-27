/**
 * Pin: the catalogue must stand alone. `resourceDemo` previously embedded
 * the catalogue and `resourceMix` imported `DEMO_RESOURCES` from it, while
 * `resourceDemo` imported back from `resourceMix` for distribution helpers.
 * Under module-load orders that hit `resourceDemo` first, `resourceMix`
 * evaluated its top-level `DEMO_PHASE_BY_ID` against an undefined binding
 * and threw `Cannot read properties of undefined (reading 'map')`. This
 * test pins the cycle break by importing `resourceDemo` first.
 */
import { describe, it, expect } from 'vitest'
import { generateDemoDistribution } from './resourceDemo'
import { phaseWeights, T_avgK } from './resourceMix'
import { DEMO_RESOURCES, RESOURCE_BY_ID, resourceLayer } from './resourceCatalog'

describe('resourceCatalog', () => {
  it('importing resourceDemo first does not break resourceMix top-level', () => {
    expect(typeof generateDemoDistribution).toBe('function')
    const w = phaseWeights({ iron: 1 }, T_avgK({ tempMin: 10, tempMax: 20 }))
    expect(w.metallic).toBe(1)
  })

  it('exposes a non-empty unified catalogue with consistent id lookup', () => {
    expect(DEMO_RESOURCES.length).toBeGreaterThan(0)
    for (const spec of DEMO_RESOURCES) {
      expect(RESOURCE_BY_ID.get(spec.id)).toBe(spec)
    }
  })

  it('routes phases to the right render layer', () => {
    expect(resourceLayer('metallic')).toBe('sol')
    expect(resourceLayer('mineral')).toBe('sol')
    expect(resourceLayer('gas')).toBe('atmo')
  })
})
