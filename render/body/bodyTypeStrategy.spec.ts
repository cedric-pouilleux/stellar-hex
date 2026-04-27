import { describe, it, expect } from 'vitest'
import {
  BODY_TYPE_STRATEGIES,
  strategyFor,
  type BodyTypeStrategy,
} from './bodyTypeStrategy'
import type { BodyType } from '../../types/surface.types'

const ALL_TYPES: BodyType[] = ['rocky', 'gaseous', 'metallic', 'star']

describe('BODY_TYPE_STRATEGIES', () => {
  it('has an entry for every BodyType', () => {
    for (const t of ALL_TYPES) {
      expect(BODY_TYPE_STRATEGIES[t]).toBeDefined()
      expect(BODY_TYPE_STRATEGIES[t].displayName).toBe(t)
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
    for (const t of ALL_TYPES) {
      const s = BODY_TYPE_STRATEGIES[t]
      for (const k of required) {
        expect(s[k], `strategy[${t}].${String(k)}`).toBeDefined()
      }
    }
  })

  it('keeps the per-type policies that scattered call sites used to read', () => {
    // Pinning the values that downstream consumers (layeredMaterials,
    // buildInteractiveMesh, ringVariation, useBody) used to compute via
    // inline `config.type === '…'` checks. Future changes here are
    // intentional and will surface in the diff.
    expect(BODY_TYPE_STRATEGIES.rocky.flatSurface).toBe(false)
    expect(BODY_TYPE_STRATEGIES.gaseous.flatSurface).toBe(false)
    expect(BODY_TYPE_STRATEGIES.metallic.flatSurface).toBe(false)
    expect(BODY_TYPE_STRATEGIES.star.flatSurface).toBe(true)

    // Display mesh role — only gas giants treat it as the atmospheric
    // silhouette; every other type uses it as an inert sol backdrop.
    expect(BODY_TYPE_STRATEGIES.rocky.displayMeshIsAtmosphere).toBe(false)
    expect(BODY_TYPE_STRATEGIES.gaseous.displayMeshIsAtmosphere).toBe(true)
    expect(BODY_TYPE_STRATEGIES.metallic.displayMeshIsAtmosphere).toBe(false)
    expect(BODY_TYPE_STRATEGIES.star.displayMeshIsAtmosphere).toBe(false)

    // Default atmosphere opacity drives the `'shader'` view: rocky bodies
    // show a translucent halo, gas envelopes are opaque (smooth sphere
    // skipped), metallic + star skip the atmo halo entirely.
    expect(BODY_TYPE_STRATEGIES.rocky.defaultAtmosphereOpacity).toBeGreaterThan(0)
    expect(BODY_TYPE_STRATEGIES.rocky.defaultAtmosphereOpacity).toBeLessThan(1)
    expect(BODY_TYPE_STRATEGIES.gaseous.defaultAtmosphereOpacity).toBe(1)
    expect(BODY_TYPE_STRATEGIES.metallic.defaultAtmosphereOpacity).toBe(0)
    expect(BODY_TYPE_STRATEGIES.star.defaultAtmosphereOpacity).toBe(0)

    expect(BODY_TYPE_STRATEGIES.rocky.canHaveRings).toBe(true)
    expect(BODY_TYPE_STRATEGIES.gaseous.canHaveRings).toBe(true)
    expect(BODY_TYPE_STRATEGIES.metallic.canHaveRings).toBe(true)
    expect(BODY_TYPE_STRATEGIES.star.canHaveRings).toBe(false)

    expect(BODY_TYPE_STRATEGIES.metallic.metallicSheen).toBe(1.0)
    expect(BODY_TYPE_STRATEGIES.rocky.metallicSheen).toBe(0.0)
    expect(BODY_TYPE_STRATEGIES.gaseous.metallicSheen).toBe(0.0)
    expect(BODY_TYPE_STRATEGIES.star.metallicSheen).toBe(0.0)
  })
})

describe('strategyFor', () => {
  it('returns the same instance as the table for every known type', () => {
    for (const t of ALL_TYPES) {
      expect(strategyFor(t)).toBe(BODY_TYPE_STRATEGIES[t])
    }
  })

  it('throws on an unknown type so missing-entry bugs surface loud', () => {
    // Cast out to simulate a developer adding a new BodyType union member
    // without registering its strategy — production code should never
    // hit this path, but the throw is the safety net.
    expect(() => strategyFor('icy' as BodyType)).toThrow(/no body-type strategy/i)
  })

  it('tileRefRadius defaults to config.radius for non-star bodies', () => {
    const config = { type: 'rocky' as const, radius: 7 } as Parameters<BodyTypeStrategy['tileRefRadius']>[0]
    expect(strategyFor('rocky').tileRefRadius(config)).toBe(7)
  })

  it('tileRefRadius for stars is keyed on spectralType, not config.radius', () => {
    const star = { type: 'star' as const, radius: 99, spectralType: 'M' as const } as Parameters<BodyTypeStrategy['tileRefRadius']>[0]
    // M-class fallback in `useStar.STAR_TILE_REF` is 2.0 — must not echo `radius`.
    expect(strategyFor('star').tileRefRadius(star)).toBe(2.0)
    expect(strategyFor('star').tileRefRadius(star)).not.toBe(99)
  })
})
