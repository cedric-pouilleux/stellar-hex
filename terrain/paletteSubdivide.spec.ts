import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { subdividePalette } from './paletteSubdivide'
import type { TerrainLevel } from '../types/body.types'

function make(level: Partial<TerrainLevel> & Pick<TerrainLevel, 'threshold' | 'height' | 'color'>): TerrainLevel {
  return level as TerrainLevel
}

const BASE: TerrainLevel[] = [
  make({ threshold: 0.0,     height: 0.00, color: new THREE.Color(0x000000), roughness: 0.10 }),
  make({ threshold: 0.5,     height: 0.10, color: new THREE.Color(0xffffff), roughness: 0.90 }),
  make({ threshold: Infinity, height: 0.20, color: new THREE.Color(0xff0000), roughness: 1.00 }),
]

describe('subdividePalette', () => {
  it('returns input unchanged when targetCount <= source length', () => {
    expect(subdividePalette(BASE, 3)).toBe(BASE)
    expect(subdividePalette(BASE, 2)).toBe(BASE)
  })

  it('returns input unchanged for palettes with < 2 anchors', () => {
    const tiny: TerrainLevel[] = [BASE[0]]
    expect(subdividePalette(tiny, 10)).toBe(tiny)
  })

  it('produces exactly targetCount levels', () => {
    expect(subdividePalette(BASE, 10)).toHaveLength(10)
    expect(subdividePalette(BASE, 15)).toHaveLength(15)
  })

  it('keeps the first and last height anchors intact', () => {
    const out = subdividePalette(BASE, 10)
    expect(out[0].height).toBeCloseTo(0.00)
    expect(out[out.length - 1].height).toBeCloseTo(0.20)
  })

  it('preserves Infinity threshold on the last level', () => {
    const out = subdividePalette(BASE, 12)
    expect(out[out.length - 1].threshold).toBe(Infinity)
  })

  it('interpolates heights monotonically', () => {
    const out = subdividePalette(BASE, 10)
    for (let i = 1; i < out.length; i++) {
      expect(out[i].height).toBeGreaterThanOrEqual(out[i - 1].height)
    }
  })

  it('interpolates roughness values', () => {
    const out = subdividePalette(BASE, 10)
    for (const lvl of out) {
      expect(lvl.roughness).toBeGreaterThanOrEqual(0.10)
      expect(lvl.roughness).toBeLessThanOrEqual(1.00)
    }
  })

  it('leaves finite thresholds strictly increasing', () => {
    const out = subdividePalette(BASE, 10)
    const finite = out.filter(l => isFinite(l.threshold))
    for (let i = 1; i < finite.length; i++) {
      expect(finite[i].threshold).toBeGreaterThan(finite[i - 1].threshold)
    }
  })
})
