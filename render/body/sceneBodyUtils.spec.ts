import { describe, it, expect } from 'vitest'
import { bodyOuterRadius } from './sceneBodyUtils'
import type { BodyConfig } from '../../types/body.types'
import type { TerrainLevel } from '../types/terrain.types'

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function rocky(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'Test',
    type: 'planetary', surfaceLook: 'terrain',
    radius: 1,
    rotationSpeed: 0.05,
    axialTilt: 0,
    ...overrides,
  }
}

// â”€â”€ bodyOuterRadius â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('bodyOuterRadius', () => {
  it('equals radius + palette max height when palette is provided', () => {
    const maxH = 0.045
    const palette = [
      { threshold: 0.5, height: 0.02, color: {} as any },
      { threshold: 1.0, height: maxH, color: {} as any },
    ] satisfies TerrainLevel[]
    expect(bodyOuterRadius(rocky({ radius: 1 }), palette)).toBeCloseTo(1 + maxH, 5)
  })

  it('uses the 0.06 fallback when palette is absent', () => {
    expect(bodyOuterRadius(rocky({ radius: 1 }))).toBeCloseTo(1.06, 5)
  })
})
