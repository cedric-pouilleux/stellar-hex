import { describe, it, expect } from 'vitest'
import { hexGraphicsUniforms } from '@lib'
import {
  OCEAN_SHADER_DEFAULTS,
  OCEAN_SHADER_RANGES,
  applyOceanShaderParams,
  type OceanShaderNumericKey,
} from './oceanShader'

describe('applyOceanShaderParams', () => {
  it('writes every param into the matching hexGraphicsUniforms slot', () => {
    const snapshot = {
      enabled:           false,
      oceanVisible:      false,
      waveStrength:      2.5,
      waveSpeed:         4.0,
      specularIntensity: 1.5,
      depthDarken:       0.7,
      oceanOpacity:      0.3,
    }

    applyOceanShaderParams(snapshot)

    expect(hexGraphicsUniforms.uWaterEnabled.value).toBe(0)
    expect(hexGraphicsUniforms.uOceanVisible.value).toBe(0)
    expect(hexGraphicsUniforms.uWaveStrength.value).toBeCloseTo(2.5)
    expect(hexGraphicsUniforms.uWaveSpeed.value).toBeCloseTo(4.0)
    expect(hexGraphicsUniforms.uSpecularIntensity.value).toBeCloseTo(1.5)
    expect(hexGraphicsUniforms.uDepthDarken.value).toBeCloseTo(0.7)
    expect(hexGraphicsUniforms.uOceanOpacity.value).toBeCloseTo(0.3)
  })

  it('maps boolean toggles to 0/1 floats', () => {
    applyOceanShaderParams({ ...OCEAN_SHADER_DEFAULTS, enabled: true, oceanVisible: true })
    expect(hexGraphicsUniforms.uWaterEnabled.value).toBe(1)
    expect(hexGraphicsUniforms.uOceanVisible.value).toBe(1)
  })
})

describe('OCEAN_SHADER_RANGES', () => {
  it('covers every numeric param of OceanShaderParams', () => {
    const numericKeys: OceanShaderNumericKey[] = [
      'waveStrength', 'waveSpeed', 'specularIntensity', 'depthDarken', 'oceanOpacity',
    ]
    for (const k of numericKeys) {
      const r = OCEAN_SHADER_RANGES[k]
      expect(r).toBeDefined()
      expect(r.min).toBeLessThan(r.max)
      expect(r.step).toBeGreaterThan(0)
      const def = (OCEAN_SHADER_DEFAULTS as Record<string, number | boolean>)[k]
      expect(typeof def).toBe('number')
      expect(def).toBeGreaterThanOrEqual(r.min)
      expect(def).toBeLessThanOrEqual(r.max)
    }
  })
})
