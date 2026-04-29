import { describe, it, expect } from 'vitest'
import { buildLayeredPrismGeometry } from './buildLayeredPrism'
import type { Tile } from '../../geometry/hexasphere.types'

/** Synthetic hex tile centred at the north pole — keeps the test math simple. */
function makeTile(): Tile {
  return {
    id:          1,
    centerPoint: { x: 0, y: 1, z: 0 },
    boundary: [
      { x:  0.10, y: 1, z:  0.00 },
      { x:  0.05, y: 1, z:  0.087 },
      { x: -0.05, y: 1, z:  0.087 },
      { x: -0.10, y: 1, z:  0.00 },
      { x: -0.05, y: 1, z: -0.087 },
      { x:  0.05, y: 1, z: -0.087 },
    ],
    isPentagon: false,
  }
}

describe('buildLayeredPrismGeometry', () => {
  it('produces a non-indexed geometry with position, normal and aSolHeight', () => {
    const { geometry } = buildLayeredPrismGeometry(makeTile(), 1.0, 0.3, 1.0)
    expect(geometry.index).toBeNull()
    expect(geometry.getAttribute('position')).toBeDefined()
    expect(geometry.getAttribute('normal')).toBeDefined()
    expect(geometry.getAttribute('aSolHeight')).toBeDefined()
    geometry.dispose()
  })

  it('clamps solHeight into [0, shellThickness]', () => {
    const tile = makeTile()
    const { geometry: gOver } = buildLayeredPrismGeometry(tile, 1.0,  999, 0.5)
    const { geometry: gNeg }  = buildLayeredPrismGeometry(tile, 1.0, -5,   0.5)
    const solHOver = (gOver.getAttribute('aSolHeight').array as Float32Array)[0]
    const solHNeg  = (gNeg.getAttribute('aSolHeight').array  as Float32Array)[0]
    expect(solHOver).toBeCloseTo(0.5, 6)
    expect(solHNeg).toBeCloseTo(0,   6)
    gOver.dispose()
    gNeg.dispose()
  })

  it('vertex positions stay between coreRadius and coreRadius + solHeight', () => {
    const { geometry } = buildLayeredPrismGeometry(makeTile(), 1.0, 0.3, 1.0)
    const pos     = geometry.getAttribute('position').array as Float32Array
    const epsilon = 1e-4
    let minR = Infinity, maxR = 0
    for (let v = 0; v < pos.length / 3; v++) {
      const i = v * 3
      const r = Math.sqrt(pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2)
      if (r < minR) minR = r
      if (r > maxR) maxR = r
    }
    expect(minR).toBeGreaterThanOrEqual(1.0 - epsilon)
    expect(maxR).toBeLessThanOrEqual(1.3 + epsilon)
    geometry.dispose()
  })

  it('aSolHeight broadcasts the same height onto every vertex', () => {
    const { geometry } = buildLayeredPrismGeometry(makeTile(), 1.0, 0.42, 1.0)
    const solH = geometry.getAttribute('aSolHeight').array as Float32Array
    for (let i = 0; i < solH.length; i++) {
      expect(solH[i]).toBeCloseTo(0.42, 6)
    }
    geometry.dispose()
  })

  it('emits stable vertex counts even when the prism collapses (solHeight = 0)', () => {
    const tile = makeTile()
    const { geometry: gFull }  = buildLayeredPrismGeometry(tile, 1.0, 0.5, 0.5)
    const { geometry: gZero }  = buildLayeredPrismGeometry(tile, 1.0, 0,   0.5)
    expect(gFull.getAttribute('position').count).toBe(gZero.getAttribute('position').count)
    gFull.dispose()
    gZero.dispose()
  })

  it('range describes a single contiguous span starting at vertex 0', () => {
    const { geometry, range } = buildLayeredPrismGeometry(makeTile(), 1.0, 0.3, 1.0)
    expect(range.start).toBe(0)
    expect(range.count).toBe(geometry.getAttribute('position').count)
    geometry.dispose()
  })
})
