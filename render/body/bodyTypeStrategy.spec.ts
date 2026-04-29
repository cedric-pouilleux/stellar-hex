import { describe, it, expect } from 'vitest'
import {
  SURFACE_LOOK_STRATEGIES,
  strategyFor,
  type BodyTypeStrategy,
} from './bodyTypeStrategy'
import type { BodyConfig } from '../../types/body.types'
import type { SurfaceLook } from '../../types/surface.types'

const ALL_LOOKS: SurfaceLook[] = ['terrain', 'bands', 'metallic']

function planetary(look: SurfaceLook | undefined, overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    type:           'planetary',
    name:           'sample',
    surfaceLook:    look,
    radius:         3,
    rotationSpeed:  0.05,
    axialTilt:      0,
    ...overrides,
  } as BodyConfig
}

function star(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    type:           'star',
    name:           'sample-star',
    radius:         3,
    rotationSpeed:  0.02,
    axialTilt:      0,
    spectralType:   'G',
    ...overrides,
  } as BodyConfig
}

describe('SURFACE_LOOK_STRATEGIES', () => {
  it('has an entry for every SurfaceLook', () => {
    for (const look of ALL_LOOKS) {
      expect(SURFACE_LOOK_STRATEGIES[look]).toBeDefined()
      expect(SURFACE_LOOK_STRATEGIES[look].displayName).toBe(look)
    }
  })

  it('exposes the same shape on every strategy', () => {
    const required: (keyof BodyTypeStrategy)[] = [
      'displayName',
      'flatSurface',
      'displayMeshIsAtmosphere',
      'canHaveRings',
      'metallicSheen',
      'defaultAtmosphereOpacity',
      'tileRefRadius',
      'buildPalette',
      'buildShaderParams',
    ]
    for (const look of ALL_LOOKS) {
      const s = SURFACE_LOOK_STRATEGIES[look]
      for (const k of required) {
        expect(s[k], `strategy[${look}].${String(k)}`).toBeDefined()
      }
    }
  })

  it('keeps the per-look policies that scattered call sites used to read', () => {
    // Pinning the values that downstream consumers (layeredMaterials,
    // buildInteractiveMesh, ringVariation, useBody) used to compute via
    // inline `config.type === '…'` checks. Future changes here are
    // intentional and will surface in the diff.
    expect(SURFACE_LOOK_STRATEGIES.terrain.flatSurface).toBe(false)
    expect(SURFACE_LOOK_STRATEGIES.bands.flatSurface).toBe(false)
    expect(SURFACE_LOOK_STRATEGIES.metallic.flatSurface).toBe(false)

    // Display mesh role — only the bands look treats the smooth sphere as
    // the atmospheric silhouette; the others use it as an inert sol backdrop.
    expect(SURFACE_LOOK_STRATEGIES.terrain.displayMeshIsAtmosphere).toBe(false)
    expect(SURFACE_LOOK_STRATEGIES.bands.displayMeshIsAtmosphere).toBe(true)
    expect(SURFACE_LOOK_STRATEGIES.metallic.displayMeshIsAtmosphere).toBe(false)

    // Default atmosphere opacity drives the `'shader'` view.
    expect(SURFACE_LOOK_STRATEGIES.terrain.defaultAtmosphereOpacity).toBeGreaterThan(0)
    expect(SURFACE_LOOK_STRATEGIES.terrain.defaultAtmosphereOpacity).toBeLessThan(1)
    expect(SURFACE_LOOK_STRATEGIES.bands.defaultAtmosphereOpacity).toBe(1)
    expect(SURFACE_LOOK_STRATEGIES.metallic.defaultAtmosphereOpacity).toBe(0)

    expect(SURFACE_LOOK_STRATEGIES.terrain.canHaveRings).toBe(true)
    expect(SURFACE_LOOK_STRATEGIES.bands.canHaveRings).toBe(true)
    expect(SURFACE_LOOK_STRATEGIES.metallic.canHaveRings).toBe(true)

    expect(SURFACE_LOOK_STRATEGIES.metallic.metallicSheen).toBe(1.0)
    expect(SURFACE_LOOK_STRATEGIES.terrain.metallicSheen).toBe(0.0)
    expect(SURFACE_LOOK_STRATEGIES.bands.metallicSheen).toBe(0.0)
  })
})

describe('strategyFor', () => {
  it('returns the matching surface-look strategy for a planetary body', () => {
    for (const look of ALL_LOOKS) {
      expect(strategyFor(planetary(look))).toBe(SURFACE_LOOK_STRATEGIES[look])
    }
  })

  it('defaults to the terrain look when surfaceLook is omitted', () => {
    expect(strategyFor(planetary(undefined))).toBe(SURFACE_LOOK_STRATEGIES.terrain)
  })

  it('routes star bodies to a dedicated strategy (star pipeline)', () => {
    const s = strategyFor(star())
    expect(s.flatSurface).toBe(true)
    expect(s.canHaveRings).toBe(false)
    expect(s.displayMeshIsAtmosphere).toBe(false)
  })

  it('tileRefRadius defaults to config.radius for planetary bodies', () => {
    expect(strategyFor(planetary('terrain', { radius: 7 })).tileRefRadius(planetary('terrain', { radius: 7 }))).toBe(7)
  })

  it('tileRefRadius for stars is keyed on spectralType, not config.radius', () => {
    const s = star({ radius: 99, spectralType: 'M' })
    // M-class fallback in `STAR_TILE_REF` (physics/star) is 2.0 — must not echo `radius`.
    expect(strategyFor(s).tileRefRadius(s)).toBe(2.0)
    expect(strategyFor(s).tileRefRadius(s)).not.toBe(99)
  })
})
