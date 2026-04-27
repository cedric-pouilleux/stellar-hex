import { describe, it, expect } from 'vitest'
import { playgroundGraphicsUniforms as hexGraphicsUniforms } from './playgroundUniforms'
import {
  LIQUID_SHADER_DEFAULTS,
  LIQUID_SHADER_RANGES,
  applyLiquidShaderParams,
  type LiquidShaderNumericKey,
} from './liquidShader'

describe('applyLiquidShaderParams', () => {
  it('writes every param into the matching hexGraphicsUniforms slot', () => {
    const snapshot = {
      enabled:           false,
      liquidVisible:     false,
      waveStrength:      2.5,
      waveSpeed:         4.0,
      waveScale:         12.0,
      specularIntensity: 1.5,
      specularSharpness: 32.0,
      fresnelPower:      3.0,
      liquidRoughness:   0.6,
      depthDarken:       0.7,
      liquidOpacity:     0.3,
      foamThreshold:     0.7,
      foamColor:         '#80c0ff',
    }

    applyLiquidShaderParams(snapshot)

    expect(hexGraphicsUniforms.uWaterEnabled.value).toBe(0)
    expect(hexGraphicsUniforms.uLiquidVisible.value).toBe(0)
    expect(hexGraphicsUniforms.uWaveStrength.value).toBeCloseTo(2.5)
    expect(hexGraphicsUniforms.uWaveSpeed.value).toBeCloseTo(4.0)
    expect(hexGraphicsUniforms.uWaveScale.value).toBeCloseTo(12.0)
    expect(hexGraphicsUniforms.uSpecularIntensity.value).toBeCloseTo(1.5)
    expect(hexGraphicsUniforms.uSpecularSharpness.value).toBeCloseTo(32.0)
    expect(hexGraphicsUniforms.uFresnelPower.value).toBeCloseTo(3.0)
    expect(hexGraphicsUniforms.uLiquidRoughness.value).toBeCloseTo(0.6)
    expect(hexGraphicsUniforms.uDepthDarken.value).toBeCloseTo(0.7)
    expect(hexGraphicsUniforms.uLiquidOpacity.value).toBeCloseTo(0.3)
    expect(hexGraphicsUniforms.uFoamThreshold.value).toBeCloseTo(0.7)
    // 0x80c0ff → r=128/255, g=192/255, b=1.
    expect(hexGraphicsUniforms.uFoamColor.value.r).toBeCloseTo(128 / 255)
    expect(hexGraphicsUniforms.uFoamColor.value.g).toBeCloseTo(192 / 255)
    expect(hexGraphicsUniforms.uFoamColor.value.b).toBeCloseTo(1)
  })

  it('maps boolean toggles to 0/1 floats', () => {
    applyLiquidShaderParams({ ...LIQUID_SHADER_DEFAULTS, enabled: true, liquidVisible: true })
    expect(hexGraphicsUniforms.uWaterEnabled.value).toBe(1)
    expect(hexGraphicsUniforms.uLiquidVisible.value).toBe(1)
  })
})

describe('LIQUID_SHADER_RANGES', () => {
  it('covers every numeric param of LiquidShaderParams', () => {
    const numericKeys: LiquidShaderNumericKey[] = [
      'waveStrength', 'waveSpeed', 'waveScale',
      'specularIntensity', 'specularSharpness', 'fresnelPower',
      'liquidRoughness', 'depthDarken', 'liquidOpacity', 'foamThreshold',
    ]
    for (const k of numericKeys) {
      const r = LIQUID_SHADER_RANGES[k]
      expect(r).toBeDefined()
      expect(r.min).toBeLessThan(r.max)
      expect(r.step).toBeGreaterThan(0)
      const def = (LIQUID_SHADER_DEFAULTS as Record<string, number | boolean | string>)[k]
      expect(typeof def).toBe('number')
      expect(def as number).toBeGreaterThanOrEqual(r.min)
      expect(def as number).toBeLessThanOrEqual(r.max)
    }
  })
})
