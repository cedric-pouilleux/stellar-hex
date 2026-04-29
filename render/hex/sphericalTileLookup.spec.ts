import { describe, it, expect } from 'vitest'
import {
  buildSphericalNearestLookup,
  buildSphericalKNearestLookup,
  type SphericalIndexedTile,
} from './sphericalTileLookup'

// ── Helpers ──────────────────────────────────────────────────────────────

function tile(id: number, x: number, y: number, z: number): SphericalIndexedTile {
  return { id, centerPoint: { x, y, z } }
}

/** Six tiles sitting on the unit-axis poles — easy to reason about. */
const AXIS_TILES: SphericalIndexedTile[] = [
  tile(10, +1,  0,  0),  // +X
  tile(11, -1,  0,  0),  // -X
  tile(20,  0, +1,  0),  // +Y
  tile(21,  0, -1,  0),  // -Y
  tile(30,  0,  0, +1),  // +Z
  tile(31,  0,  0, -1),  // -Z
]

describe('buildSphericalNearestLookup', () => {
  it('returns the tile whose centre is closest to the query direction', () => {
    const lookup = buildSphericalNearestLookup(AXIS_TILES)
    expect(lookup( 5,  0,  0)).toBe(10) // +X
    expect(lookup(-3,  0,  0)).toBe(11) // -X
    expect(lookup( 0,  0,  9)).toBe(30) // +Z
    expect(lookup( 0, -2,  0)).toBe(21) // -Y
  })

  it('biases toward the nearer pole when the query sits near an axis', () => {
    const lookup = buildSphericalNearestLookup(AXIS_TILES)
    expect(lookup( 1, 0.05, 0.05)).toBe(10) // +X dominates
    expect(lookup(0.05, 0.05, -1)).toBe(31) // -Z dominates
  })

  it('handles queries near the polar singularities', () => {
    const lookup = buildSphericalNearestLookup(AXIS_TILES)
    // ny ≈ 1 → polar bin row, must wrap fully in azimuth.
    expect(lookup(0.001, 0.999, 0.001)).toBe(20)
    expect(lookup(0.001, -0.999, 0.001)).toBe(21)
  })

  it('normalises non-unit query magnitudes', () => {
    const lookup = buildSphericalNearestLookup(AXIS_TILES)
    expect(lookup(100, 1, 1)).toBe(10) // +X still wins after normalisation
  })
})

// ── K-NN lookup ──────────────────────────────────────────────────────────

describe('buildSphericalKNearestLookup', () => {
  it('writes K ids + weights summing to 1 at the requested offset', () => {
    const lookup     = buildSphericalKNearestLookup(AXIS_TILES, 3)
    const outIds     = new Int32Array(6) // two slots of K=3
    const outWeights = new Float32Array(6)

    lookup(1, 0.1, 0.1, outIds, outWeights, 0)
    // First 3 slots written, last 3 still zero.
    const sum = outWeights[0] + outWeights[1] + outWeights[2]
    expect(sum).toBeCloseTo(1, 5)
    expect(outWeights[3]).toBe(0)
    // Best (highest dot) is +X tile.
    expect(outIds[0]).toBe(10)
  })

  it('best weight is highest, k-th is zero (floor-relative normalisation)', () => {
    const lookup     = buildSphericalKNearestLookup(AXIS_TILES, 3)
    const outIds     = new Int32Array(3)
    const outWeights = new Float32Array(3)

    lookup(1, 0.5, 0.2, outIds, outWeights, 0)
    expect(outWeights[0]).toBeGreaterThan(outWeights[1])
    expect(outWeights[1]).toBeGreaterThan(outWeights[2])
    expect(outWeights[2]).toBeCloseTo(0, 5)
  })

  it('falls back to uniform 1/K when all K dots collapse to the same value', () => {
    // Three tiles equidistant from the +X direction (45° around the X axis).
    const symmetric: SphericalIndexedTile[] = [
      tile(1, 1, 1, 0),
      tile(2, 1, 0, 1),
      tile(3, 1, -1, 0),
    ]
    const lookup     = buildSphericalKNearestLookup(symmetric, 3)
    const outIds     = new Int32Array(3)
    const outWeights = new Float32Array(3)

    lookup(1, 0, 0, outIds, outWeights, 0)
    expect(outWeights[0]).toBeCloseTo(1 / 3, 5)
    expect(outWeights[1]).toBeCloseTo(1 / 3, 5)
    expect(outWeights[2]).toBeCloseTo(1 / 3, 5)
  })

  it('clamps K to the tile count when the caller asks for too many', () => {
    const tiles      = [tile(7, 1, 0, 0), tile(8, 0, 1, 0)]
    const lookup     = buildSphericalKNearestLookup(tiles, 5)
    const outIds     = new Int32Array(2)
    const outWeights = new Float32Array(2)

    // Lookup must not write past the actual tile count even though K=5
    // was requested. Two slots at offset 0, no out-of-bounds writes.
    lookup(1, 0.2, 0, outIds, outWeights, 0)
    expect(new Set(Array.from(outIds))).toEqual(new Set([7, 8]))
  })

  it('respects the offset argument so callers can pre-allocate one flat buffer', () => {
    const lookup     = buildSphericalKNearestLookup(AXIS_TILES, 2)
    const outIds     = new Int32Array(8)   // 4 vertices × K=2
    const outWeights = new Float32Array(8)

    lookup(1, 0, 0, outIds, outWeights, 0) // vertex 0 → slots 0..1
    lookup(0, 1, 0, outIds, outWeights, 4) // vertex 2 → slots 4..5

    expect(outIds[0]).toBe(10) // +X
    expect(outIds[4]).toBe(20) // +Y
    // Untouched slots stay at zero.
    expect(outIds[2]).toBe(0)
    expect(outWeights[3]).toBe(0)
  })
})
