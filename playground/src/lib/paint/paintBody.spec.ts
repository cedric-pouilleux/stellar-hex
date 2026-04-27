import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import type { Body } from '@lib'
import { paintBody, type LayeredDistribution, type TileResourceDistribution } from './paintBody'
import type { ResourceRules } from './tileResourceBlend'
import { registerResourceVisual } from './resourceVisualRegistry'

/**
 * Covers the orchestration of `paintBody`: reading pre-blend palette bases
 * from the body, running the playground-side blend, uploading each layer
 * via `applyTileOverlay`, merging sol + atmo into the smooth-sphere
 * projection, and skipping tiles whose base lookup fails.
 */

const RULES: ResourceRules = {
  isMetallic:      (id) => id === 'iron',
  isSurfaceLiquid: (id) => id === 'water',
}

type BaseVisual = NonNullable<ReturnType<Body['tiles']['tileBaseVisual']>>

function makeFakeBody(
  resolver: (tileId: number) => BaseVisual | null,
  bodyType: 'rocky' | 'metallic' | 'gaseous' | 'star' = 'rocky',
): {
  body:               Body
  applyTileOverlay:   ReturnType<typeof vi.fn>
  paintSmoothSphere:  ReturnType<typeof vi.fn>
  paintAtmoShell:     ReturnType<typeof vi.fn>
} {
  const applyTileOverlay  = vi.fn()
  const paintSmoothSphere = vi.fn()
  const paintAtmoShell    = vi.fn()
  const fake = {
    config: { type: bodyType, name: 'spec-body' } as unknown as Body['config'],
    tiles: {
      tileBaseVisual:    vi.fn((id: number) => resolver(id)),
      applyTileOverlay,
      paintSmoothSphere,
      paintAtmoShell,
    },
  } as unknown as Body
  return { body: fake, applyTileOverlay, paintSmoothSphere, paintAtmoShell }
}

const NEUTRAL_BASE: BaseVisual = {
  r: 0.2, g: 0.2, b: 0.2,
  roughness: 0.8, metalness: 0.0,
  emissive: undefined, emissiveIntensity: 0,
  submerged: false,
}

/** Tiny factory — wraps a sol-only distribution in the layered shape. */
function solOnly(sol: TileResourceDistribution): LayeredDistribution {
  return { sol, atmo: new Map() }
}

const EMPTY_LAYERED: LayeredDistribution = { sol: new Map(), atmo: new Map() }

beforeEach(() => {
  registerResourceVisual('iron', {
    color: new THREE.Color(0.9, 0.1, 0.1),
    metalness: 0.9, roughness: 0.4, colorBlend: 0.9,
  })
  registerResourceVisual('gold', {
    color: new THREE.Color(0.9, 0.8, 0.2),
    metalness: 0.95, roughness: 0.3, colorBlend: 0.9,
  })
  registerResourceVisual('h2he', {
    color: new THREE.Color(0.91, 0.72, 0.44),
    metalness: 0.0, roughness: 0.85, colorBlend: 0.98,
  })
})

describe('paintBody', () => {
  it('returns 0 and never touches the mesh on empty layered input', () => {
    const { body, applyTileOverlay, paintSmoothSphere } = makeFakeBody(() => NEUTRAL_BASE)
    expect(paintBody(body, EMPTY_LAYERED, RULES)).toBe(0)
    expect(applyTileOverlay).not.toHaveBeenCalled()
    expect(paintSmoothSphere).not.toHaveBeenCalled()
  })

  it('forwards sol tiles in a single applyTileOverlay("sol") call', () => {
    const { body, applyTileOverlay } = makeFakeBody(() => NEUTRAL_BASE)
    const painted = paintBody(body, solOnly(new Map([
      [1, new Map([['iron', 0.8]])],
      [2, new Map([['gold', 0.5]])],
      [7, new Map([['iron', 0.2]])],
    ])), RULES)
    expect(painted).toBe(3)
    expect(applyTileOverlay).toHaveBeenCalledTimes(1)
    const [layer, colors] = applyTileOverlay.mock.calls[0] as [string, Map<number, RGB>]
    expect(layer).toBe('sol')
    expect(colors.size).toBe(3)
  })

  it('forwards atmo tiles in a single applyTileOverlay("atmo") call', () => {
    const { body, applyTileOverlay } = makeFakeBody(() => NEUTRAL_BASE)
    const painted = paintBody(body, {
      sol:  new Map(),
      atmo: new Map([[1, new Map([['h2he', 1.0]])]]),
    }, RULES)
    expect(painted).toBe(1)
    expect(applyTileOverlay).toHaveBeenCalledTimes(1)
    const [layer] = applyTileOverlay.mock.calls[0] as [string, Map<number, RGB>]
    expect(layer).toBe('atmo')
  })

  it('paints both layers when both buckets carry data', () => {
    const { body, applyTileOverlay } = makeFakeBody(() => NEUTRAL_BASE)
    paintBody(body, {
      sol:  new Map([[1, new Map([['iron', 0.7]])]]),
      atmo: new Map([[2, new Map([['h2he', 1.0]])]]),
    }, RULES)
    expect(applyTileOverlay).toHaveBeenCalledTimes(2)
    const layers = applyTileOverlay.mock.calls.map(c => c[0]).sort()
    expect(layers).toEqual(['atmo', 'sol'])
  })

  it('skips tiles whose base lookup returns null', () => {
    const { body, applyTileOverlay } = makeFakeBody((id) =>
      id === 99 ? null : NEUTRAL_BASE,
    )
    const painted = paintBody(body, solOnly(new Map([
      [1,  new Map([['iron', 0.5]])],
      [99, new Map([['gold', 0.5]])],
    ])), RULES)
    expect(painted).toBe(1)
    const [, colors] = applyTileOverlay.mock.calls[0] as [string, Map<number, unknown>]
    expect(colors.has(1)).toBe(true)
    expect(colors.has(99)).toBe(false)
  })

  it('tints the sol overlay away from the base when a dominant resource is present', () => {
    const { body, applyTileOverlay } = makeFakeBody(() => NEUTRAL_BASE)
    paintBody(body, solOnly(new Map([
      [1, new Map([['iron', 0.9]])],
    ])), RULES)
    const [, colors] = applyTileOverlay.mock.calls[0] as [string, Map<number, RGB>]
    const tinted = colors.get(1)!
    // Iron visual is reddish (0.9, 0.1, 0.1); overlay should pull r up from base 0.2.
    expect(tinted.r).toBeGreaterThan(NEUTRAL_BASE.r)
  })

  it('rocky body: smooth sphere receives the sol overlay only — atmo stays on hex shell', () => {
    const { body, paintSmoothSphere } = makeFakeBody(() => NEUTRAL_BASE, 'rocky')
    paintBody(body, {
      sol:  new Map([[1, new Map([['iron', 0.5]])]]),
      atmo: new Map([[2, new Map([['h2he', 1.0]])]]),
    }, RULES)
    expect(paintSmoothSphere).toHaveBeenCalledTimes(1)
    const [sphereMap] = paintSmoothSphere.mock.calls[0] as [Map<number, RGB>]
    // Sol entry (tile 1) shows on the smooth sphere; atmo entry (tile 2)
    // must NOT leak onto the solid silhouette — gases live on the atmo hex
    // shell exclusively for rocky / metallic bodies.
    expect(sphereMap.has(1)).toBe(true)
    expect(sphereMap.has(2)).toBe(false)
  })

  it('gaseous body: smooth sphere receives the atmo overlay; no atmo shell mounted', () => {
    const { body, paintSmoothSphere, paintAtmoShell } = makeFakeBody(() => NEUTRAL_BASE, 'gaseous')
    paintBody(body, {
      sol:  new Map(),
      atmo: new Map([[2, new Map([['h2he', 1.0]])]]),
    }, RULES)
    // Gaseous: the smooth sphere IS the procedural atmosphere
    // (`BodyMaterial.gas`), so resource colours route to it. No
    // separate corona shell is mounted on gas — adding one would
    // stack a second halo over the existing atmospheric silhouette.
    expect(paintSmoothSphere).toHaveBeenCalledTimes(1)
    const [sphereMap] = paintSmoothSphere.mock.calls[0] as [Map<number, RGB>]
    expect(sphereMap.has(2)).toBe(true)
    expect(paintAtmoShell).not.toHaveBeenCalled()
  })

  it('skips the smooth sphere entirely when its routed bucket is empty', () => {
    // Rocky body with no sol entries (atmo-only distribution) → no paint.
    const { body, paintSmoothSphere } = makeFakeBody(() => NEUTRAL_BASE, 'rocky')
    paintBody(body, {
      sol:  new Map(),
      atmo: new Map([[1, new Map([['h2he', 1.0]])]]),
    }, RULES)
    // Gaseous-body shape: sol bucket empty → smooth sphere paint is a no-op
    // so the sphere keeps its procedural gas-shader look (bandColors uniform).
    expect(paintSmoothSphere).not.toHaveBeenCalled()
  })

  it('preserves the base colour when submerged (liquid gate)', () => {
    const { body, applyTileOverlay } = makeFakeBody(() => ({
      ...NEUTRAL_BASE,
      r: 0.1, g: 0.3, b: 0.8,
      submerged: true,
    }))
    paintBody(body, solOnly(new Map([
      [1, new Map([['water', 1.0]])],
    ])), RULES)
    const [, colors] = applyTileOverlay.mock.calls[0] as [string, Map<number, RGB>]
    const kept = colors.get(1)!
    expect(kept.r).toBeCloseTo(0.1)
    expect(kept.g).toBeCloseTo(0.3)
    expect(kept.b).toBeCloseTo(0.8)
  })
})

type RGB = { r: number; g: number; b: number }
