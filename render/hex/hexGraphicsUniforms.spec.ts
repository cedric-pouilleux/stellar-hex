import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createGraphicsUniforms } from './hexGraphicsUniforms'

/**
 * The graphics-uniform bag was a module-level singleton in earlier revisions,
 * so tuning a slider on one body silently mutated every sibling body's
 * shaders. These tests pin the per-instance isolation contract.
 */
describe('createGraphicsUniforms', () => {
  it('seeds every uniform at its canonical default', () => {
    const u = createGraphicsUniforms()
    expect(u.uWaterEnabled.value).toBe(1.0)
    expect(u.uTerrainBumpEnabled.value).toBe(1.0)
    expect(u.uEdgeBlendEnabled.value).toBe(1.0)
    expect(u.uLiquidVisible.value).toBe(1.0)
    expect(u.uCloudOpacity.value).toBeCloseTo(0.90)
    expect(u.uCloudSpeed.value).toBe(1.0)
    expect(u.uCloudColor.value).toBeInstanceOf(THREE.Color)
    expect(u.uCloudColor.value.r).toBe(1)
    expect(u.uCloudColor.value.g).toBe(1)
    expect(u.uCloudColor.value.b).toBe(1)
    expect(u.uWaveStrength.value).toBe(1.0)
    expect(u.uWaveSpeed.value).toBeCloseTo(2.8)
    expect(u.uWaveScale.value).toBeCloseTo(5.0)
    expect(u.uSpecularIntensity.value).toBeCloseTo(0.9)
    expect(u.uSpecularSharpness.value).toBeCloseTo(80.0)
    expect(u.uFresnelPower.value).toBeCloseTo(5.0)
    expect(u.uLiquidRoughness.value).toBeCloseTo(0.35)
    expect(u.uDepthDarken.value).toBeCloseTo(0.50)
    expect(u.uLiquidOpacity.value).toBeCloseTo(0.88)
    expect(u.uFoamThreshold.value).toBeCloseTo(1.0)
    expect(u.uFoamColor.value).toBeInstanceOf(THREE.Color)
    expect(u.uFoamColor.value.r).toBe(1)
    expect(u.uFoamColor.value.g).toBe(1)
    expect(u.uFoamColor.value.b).toBe(1)
    expect(u.uBumpStrength.value).toBe(2.0)
    expect(u.uEdgeBlendStrength.value).toBeCloseTo(0.25)
  })

  it('returns independent instances on every call', () => {
    const a = createGraphicsUniforms()
    const b = createGraphicsUniforms()
    expect(a).not.toBe(b)
    // Each scalar uniform is its own slot — Three.js relies on identity to
    // tell two materials apart at the renderer level.
    expect(a.uCloudOpacity).not.toBe(b.uCloudOpacity)
    expect(a.uWaveStrength).not.toBe(b.uWaveStrength)
    expect(a.uCloudColor).not.toBe(b.uCloudColor)
    expect(a.uCloudColor.value).not.toBe(b.uCloudColor.value)
  })

  it('isolates writes — mutating one bag never reaches another', () => {
    const a = createGraphicsUniforms()
    const b = createGraphicsUniforms()

    a.uCloudOpacity.value = 0.0
    a.uWaveStrength.value = 5.0
    a.uCloudColor.value.set('#ff0000')

    expect(b.uCloudOpacity.value).toBeCloseTo(0.90)
    expect(b.uWaveStrength.value).toBe(1.0)
    expect(b.uCloudColor.value.r).toBe(1)
    expect(b.uCloudColor.value.g).toBe(1)
    expect(b.uCloudColor.value.b).toBe(1)
  })
})
