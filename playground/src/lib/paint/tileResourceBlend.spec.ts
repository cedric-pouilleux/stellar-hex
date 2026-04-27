import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  applyResourceBlend,
  addEmissive,
  type ResourceRules,
  type TileResources,
} from './tileResourceBlend'
import { registerResourceVisual } from './resourceVisualRegistry'

/**
 * Covers the `ResourceRules` callback shape introduced by the playground
 * copy — the lib version consumed a `BodyResourceBridge`, this version
 * takes two boolean callbacks directly. Ensures the control flow for the
 * three gating conditions (no resource / submerged / liquid dominant)
 * still returns the untinted base.
 */

const RULES: ResourceRules = {
  isMetallic:      (id) => id === 'iron',
  isSurfaceLiquid: (id) => id === 'water',
}

describe('addEmissive', () => {
  it('clamps channel sum to [0, 1]', () => {
    expect(addEmissive(0.8, 0.5, 1.0)).toBe(1)
    expect(addEmissive(0.2, 0.1, 0.5)).toBeCloseTo(0.25)
  })
  it('passes base through when emissive is undefined', () => {
    expect(addEmissive(0.4, undefined, 1)).toBe(0.4)
  })
})

describe('applyResourceBlend', () => {
  const baseColor = new THREE.Color(0.2, 0.2, 0.2)

  beforeEach(() => {
    registerResourceVisual('iron', {
      color:      new THREE.Color(0.9, 0.1, 0.1),
      metalness:  0.9,
      roughness:  0.4,
      colorBlend: 0.9,
    })
    registerResourceVisual('water', {
      color:      new THREE.Color(0.1, 0.3, 0.8),
      metalness:  0.0,
      roughness:  0.2,
      colorBlend: 0.9,
    })
  })

  it('passes base through when resources are empty', () => {
    const res: TileResources = new Map()
    const out = applyResourceBlend(baseColor, 0.8, 0.0, undefined, 0, false, res, RULES)
    expect(out.r).toBeCloseTo(0.2)
    expect(out.rough).toBe(0.8)
    expect(out.metal).toBe(0.0)
  })

  it('passes base through when submerged', () => {
    const res: TileResources = new Map([['iron', 0.9]])
    const out = applyResourceBlend(baseColor, 0.8, 0.0, undefined, 0, true, res, RULES)
    expect(out.r).toBeCloseTo(0.2)
    expect(out.metal).toBe(0.0)
  })

  it('passes base through when the dominant resource is a surface liquid', () => {
    const res: TileResources = new Map([['water', 0.9]])
    const out = applyResourceBlend(baseColor, 0.8, 0.0, undefined, 0, false, res, RULES)
    expect(out.b).toBeCloseTo(0.2)
    expect(out.metal).toBe(0.0)
  })

  it('picks a distinct material-blend curve for metallic resources', () => {
    // The metallic curve is `amount * METALLIC_BLEND_SCALE` — independent of
    // `vis.colorBlend`. The non-metallic curve reuses the colour-blend
    // magnitude. They must therefore diverge on material values for any
    // `amount` that keeps one of the curves below saturation.
    const res: TileResources = new Map([['iron', 0.5]])
    const metallicOut = applyResourceBlend(baseColor, 0.8, 0.0, undefined, 0, false, res, RULES)
    const nonMetallicOut = applyResourceBlend(
      baseColor, 0.8, 0.0, undefined, 0, false, res,
      { isMetallic: () => false, isSurfaceLiquid: () => false },
    )
    expect(metallicOut.metal).not.toBeCloseTo(nonMetallicOut.metal)
    expect(metallicOut.rough).not.toBeCloseTo(nonMetallicOut.rough)
  })

  it('treats null rules as non-metallic, non-liquid', () => {
    const res: TileResources = new Map([['iron', 0.4]])
    const out = applyResourceBlend(baseColor, 0.8, 0.0, undefined, 0, false, res, null)
    expect(out.metal).toBeGreaterThan(0)
    expect(out.r).toBeGreaterThan(0.2)
  })

  it('falls back to base when no visual is registered for the dominant id', () => {
    const res: TileResources = new Map([['unknown-ore', 0.9]])
    const out = applyResourceBlend(baseColor, 0.8, 0.0, undefined, 0, false, res, RULES)
    expect(out.r).toBeCloseTo(0.2)
    expect(out.metal).toBe(0.0)
  })
})
