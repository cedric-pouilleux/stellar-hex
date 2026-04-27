import { describe, it, expect } from 'vitest'
import {
  buildLayeredPrismGeometry,
  LAYER_SOL,
  LAYER_ATMO,
} from './buildLayeredPrism'
import type { Tile } from '../../geometry/hexasphere.types'

// ── Fixtures ──────────────────────────────────────────────────────

/** Unit-radius hex tile centred on +z, boundary is a regular hexagon in the xy plane. */
function makeHexTile(): Tile {
  const boundary = []
  const R = 0.1
  for (let i = 0; i < 6; i++) {
    const theta = (i * Math.PI) / 3
    boundary.push({ x: R * Math.cos(theta), y: R * Math.sin(theta), z: 1 })
  }
  return {
    id:         0,
    centerPoint: { x: 0, y: 0, z: 1 },
    boundary,
    isPentagon: false,
  }
}

/** Unit-radius pentagon tile — 5 boundary vertices. Used to verify the primitive handles both hex and pentagon cases. */
function makePentagonTile(): Tile {
  const boundary = []
  const R = 0.1
  for (let i = 0; i < 5; i++) {
    const theta = (i * 2 * Math.PI) / 5
    boundary.push({ x: R * Math.cos(theta), y: R * Math.sin(theta), z: 1 })
  }
  return {
    id:         1,
    centerPoint: { x: 0, y: 0, z: 1 },
    boundary,
    isPentagon: true,
  }
}

/** Length of a vertex position read from the positions attribute. */
function vertexRadius(positions: Float32Array, i: number): number {
  const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2]
  return Math.sqrt(x * x + y * y + z * z)
}

// ── Vertex counts ─────────────────────────────────────────────────

describe('buildLayeredPrismGeometry — vertex counts', () => {
  it('hex tile with both layers: 6 top tris + 6*2 wall tris + 6 bottom tris per layer = 24 tris/layer = 72 verts/layer', () => {
    const { geometry, ranges } = buildLayeredPrismGeometry(makeHexTile(), 1, 0.3, 1.0)
    expect(ranges.sol.count).toBe(72)   // 6 top + 12 wall + 6 bottom tris × 3 verts
    expect(ranges.atmo.count).toBe(72)
    expect(geometry.getAttribute('position').count).toBe(144)
  })

  it('pentagon tile: 5 top tris + 5*2 wall tris + 5 bottom tris per layer = 20 tris = 60 verts/layer', () => {
    const { ranges } = buildLayeredPrismGeometry(makePentagonTile(), 1, 0.2, 1.0)
    expect(ranges.sol.count).toBe(60)
    expect(ranges.atmo.count).toBe(60)
  })

  it('solHeight = 0 → sol walls are degenerate but still present (stable vertex count = 72)', () => {
    const { ranges } = buildLayeredPrismGeometry(makeHexTile(), 1, 0, 1.0)
    expect(ranges.sol.count).toBe(72)   // unchanged — degenerate walls emitted
    expect(ranges.atmo.count).toBe(72)
  })

  it('solHeight = totalThickness → atmo walls are degenerate but still present', () => {
    const { ranges } = buildLayeredPrismGeometry(makeHexTile(), 1, 1.0, 1.0)
    expect(ranges.sol.count).toBe(72)
    expect(ranges.atmo.count).toBe(72)   // unchanged — degenerate walls emitted
  })
})

// ── Radial placement ──────────────────────────────────────────────

describe('buildLayeredPrismGeometry — radial placement', () => {
  it('sol top vertices sit exactly at coreRadius + solHeight', () => {
    const { geometry, ranges } = buildLayeredPrismGeometry(makeHexTile(), 2, 0.5, 1.0)
    const pos = geometry.getAttribute('position').array as Float32Array

    // First 18 sol vertices belong to the top fan (6 tris × 3 verts).
    for (let i = ranges.sol.start; i < ranges.sol.start + 18; i++) {
      expect(vertexRadius(pos, i)).toBeCloseTo(2 + 0.5, 5)
    }
  })

  it('atmo top vertices sit exactly at coreRadius + totalThickness (= surfaceRadius)', () => {
    const { geometry, ranges } = buildLayeredPrismGeometry(makeHexTile(), 2, 0.5, 1.0)
    const pos = geometry.getAttribute('position').array as Float32Array

    for (let i = ranges.atmo.start; i < ranges.atmo.start + 18; i++) {
      expect(vertexRadius(pos, i)).toBeCloseTo(2 + 1.0, 5)
    }
  })

  it('sol and atmo meet: sol top ring radius == atmo wall bottom radius', () => {
    const { geometry, ranges } = buildLayeredPrismGeometry(makeHexTile(), 1, 0.3, 1.0)
    const pos  = geometry.getAttribute('position').array as Float32Array

    // Find atmo wall bottom vertices: in emitPrism the wall's bA/bB positions
    // are written at the bottom ring radius (= coreRadius + solHeight).
    // Walls start after the 18-vertex top fan of the atmo layer.
    const atmoWallStart = ranges.atmo.start + 18
    const atmoWallCount = ranges.atmo.count - 18
    expect(atmoWallCount).toBeGreaterThan(0)

    let bottomRings = 0
    for (let i = atmoWallStart; i < atmoWallStart + atmoWallCount; i++) {
      const r = vertexRadius(pos, i)
      if (Math.abs(r - (1 + 0.3)) < 1e-4) bottomRings++
    }
    expect(bottomRings).toBeGreaterThan(0)
  })

  it('clamps solHeight above totalThickness', () => {
    const { geometry, ranges } = buildLayeredPrismGeometry(makeHexTile(), 1, 99, 1.0)
    const pos = geometry.getAttribute('position').array as Float32Array
    // Clamped: sol top must sit at coreRadius + totalThickness, not coreRadius + 99.
    for (let i = ranges.sol.start; i < ranges.sol.start + 18; i++) {
      expect(vertexRadius(pos, i)).toBeCloseTo(1 + 1.0, 5)
    }
  })

  it('clamps negative solHeight to 0', () => {
    const { geometry, ranges } = buildLayeredPrismGeometry(makeHexTile(), 1, -0.5, 1.0)
    const pos = geometry.getAttribute('position').array as Float32Array
    for (let i = ranges.sol.start; i < ranges.sol.start + 18; i++) {
      expect(vertexRadius(pos, i)).toBeCloseTo(1, 5)
    }
  })
})

// ── Attributes ────────────────────────────────────────────────────

describe('buildLayeredPrismGeometry — attributes', () => {
  it('aLayer = LAYER_SOL over the sol range, LAYER_ATMO over the atmo range', () => {
    const { geometry, ranges } = buildLayeredPrismGeometry(makeHexTile(), 1, 0.3, 1.0)
    const a = geometry.getAttribute('aLayer').array as Float32Array

    for (let i = ranges.sol.start; i < ranges.sol.start + ranges.sol.count; i++) {
      expect(a[i]).toBe(LAYER_SOL)
    }
    for (let i = ranges.atmo.start; i < ranges.atmo.start + ranges.atmo.count; i++) {
      expect(a[i]).toBe(LAYER_ATMO)
    }
  })

  it('aSolHeight carries the clamped sol height on every vertex (sol and atmo alike)', () => {
    const totalThickness = 1.0
    const { geometry } = buildLayeredPrismGeometry(makeHexTile(), 1, 0.3, totalThickness)
    const a = geometry.getAttribute('aSolHeight').array as Float32Array
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(0.3, 6)
  })

  it('aSolHeight reports the clamped value when the input was out of range', () => {
    const { geometry } = buildLayeredPrismGeometry(makeHexTile(), 1, 5, 1.0)
    const a = geometry.getAttribute('aSolHeight').array as Float32Array
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(1.0, 6)
  })
})

// ── Face winding (back-face culling) ──────────────────────────────

/**
 * For a face `(A, B, C)` the geometric normal is `cross(B-A, C-A)`. A face
 * is front-facing (visible) when that normal points toward the viewer. For
 * a hex prism sitting on a sphere, every visible face's normal must have a
 * positive radial component at the face centre — i.e. point away from the
 * sphere centre.
 *
 * These tests guard against a previous regression where wall triangles were
 * emitted with reversed winding, producing inward-pointing normals that got
 * silently back-face-culled (visible symptom: hollow-looking prisms).
 */
describe('buildLayeredPrismGeometry — face winding', () => {
  /**
   * Signed distance of the face-centre → normal direction with respect to
   * a reference point known to sit inside the prism volume. Positive means
   * the normal points "away from the interior" — i.e. the face is
   * front-facing to any camera outside that prism. Negative means inward
   * (back-face-culled from outside).
   */
  function outwardness(pos: Float32Array, f: number, interior: [number, number, number]): number {
    const i = f * 9
    const ax = pos[i],     ay = pos[i + 1], az = pos[i + 2]
    const bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5]
    const cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8]
    // cross(B-A, C-A) — geometric face normal.
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    // Face centre minus interior reference — points from the prism interior
    // to the face surface, i.e. the "outward" direction from this face.
    const dx = (ax + bx + cx) / 3 - interior[0]
    const dy = (ay + by + cy) / 3 - interior[1]
    const dz = (az + bz + cz) / 3 - interior[2]
    return nx * dx + ny * dy + nz * dz
  }

  it('top fan + walls point outward from the sol prism interior', () => {
    const coreRadius = 1, solH = 0.3
    const { geometry, ranges } = buildLayeredPrismGeometry(makeHexTile(), coreRadius, solH, 1.0)
    const pos = geometry.getAttribute('position').array as Float32Array
    // Mid-height point on the tile axis — guaranteed inside the sol prism.
    const solInterior: [number, number, number] = [0, 0, coreRadius + solH / 2]
    const solFaceStart = ranges.sol.start / 3
    for (let f = solFaceStart; f < solFaceStart + 18; f++) {
      expect(outwardness(pos, f, solInterior)).toBeGreaterThan(0)
    }
  })

  it('top fan + walls point outward from the atmo prism interior', () => {
    const coreRadius = 1, solH = 0.3, total = 1.0
    const { geometry, ranges } = buildLayeredPrismGeometry(makeHexTile(), coreRadius, solH, total)
    const pos = geometry.getAttribute('position').array as Float32Array
    const atmoInterior: [number, number, number] = [0, 0, coreRadius + solH + (total - solH) / 2]
    const atmoFaceStart = ranges.atmo.start / 3
    for (let f = atmoFaceStart; f < atmoFaceStart + 18; f++) {
      expect(outwardness(pos, f, atmoInterior)).toBeGreaterThan(0)
    }
  })

  it('bottom fan points inward (toward sphere origin) — back-face-culled from outside', () => {
    const { geometry, ranges } = buildLayeredPrismGeometry(makeHexTile(), 1, 0.3, 1.0)
    const pos = geometry.getAttribute('position').array as Float32Array
    const solBottomStart = ranges.sol.start / 3 + 18   // skip top(6) + walls(12)
    // Reference: sphere origin. Bottom fan sits above origin; an inward
    // normal points down toward origin, so `face_centre - origin` and the
    // normal are anti-aligned → outwardness < 0.
    for (let f = solBottomStart; f < solBottomStart + 6; f++) {
      expect(outwardness(pos, f, [0, 0, 0])).toBeLessThan(0)
    }
  })
})
