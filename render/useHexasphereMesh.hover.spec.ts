import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildTileRing, buildFillPositions, buildBorderPositions } from './useHexasphereMesh'
import type { Tile } from '../geometry/hexasphere.types'

// ── Helpers ───────────────────────────────────────────────────────

/** Builds a minimal hexagonal tile centered on the +Y axis (north pole). */
function makeHexTile(radius = 1): Tile {
  const center = { x: 0, y: radius, z: 0 }
  // 6 boundary vertices evenly distributed around the center
  const boundary = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2
    return {
      x: Math.cos(angle) * 0.1,
      y: radius,
      z: Math.sin(angle) * 0.1,
    }
  })
  return { id: 0, centerPoint: center, boundary, isPentagon: false }
}

// ── buildTileRing ─────────────────────────────────────────────────

describe('buildTileRing', () => {
  it('returns one ring vertex per boundary vertex', () => {
    const tile = makeHexTile()
    const { ring } = buildTileRing(tile, 0, 0.002, 0.12)
    expect(ring).toHaveLength(tile.boundary.length)
  })

  it('ring vertices are further from center than tile center (lifted + expanded)', () => {
    const tile   = makeHexTile(1)
    const { center, ring } = buildTileRing(tile, 0, 0.002, 0.12)
    for (const v of ring) {
      // Each ring vertex must be farther from origin than the tile center
      expect(v.length()).toBeGreaterThan(center.length() - 0.01)
    }
  })

  it('avgRadius is positive and reflects boundary spread', () => {
    const tile = makeHexTile()
    const { avgRadius } = buildTileRing(tile, 0, 0.002, 0.12)
    expect(avgRadius).toBeGreaterThan(0)
  })

  it('larger surfaceOffset lifts the ring higher', () => {
    const tile  = makeHexTile()
    const low   = buildTileRing(tile, 0, 0.001, 0.12)
    const high  = buildTileRing(tile, 0, 0.010, 0.12)
    // Center Y should be strictly higher with larger offset
    expect(high.center.y).toBeGreaterThan(low.center.y)
  })
})

// ── buildFillPositions ────────────────────────────────────────────

describe('buildFillPositions', () => {
  it('returns 3 floats × 3 vertices × n triangles (one per edge)', () => {
    const n      = 6
    const center = new THREE.Vector3(0, 1, 0)
    const ring   = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return new THREE.Vector3(Math.cos(a) * 0.1, 1, Math.sin(a) * 0.1)
    })
    const buf = buildFillPositions(center, ring)
    // n triangles × 3 vertices × 3 components
    expect(buf.length).toBe(n * 3 * 3)
  })

  it('first vertex of every triangle is the center point', () => {
    const n      = 6
    const center = new THREE.Vector3(0, 2, 0)
    const ring   = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return new THREE.Vector3(Math.cos(a) * 0.1, 2, Math.sin(a) * 0.1)
    })
    const buf = buildFillPositions(center, ring)
    for (let i = 0; i < n; i++) {
      const base = i * 9  // 3 vertices × 3 components per triangle
      expect(buf[base])     .toBeCloseTo(center.x)
      expect(buf[base + 1]) .toBeCloseTo(center.y)
      expect(buf[base + 2]) .toBeCloseTo(center.z)
    }
  })
})

// ── buildBorderPositions ──────────────────────────────────────────

describe('buildBorderPositions', () => {
  it('returns 2 triangles per edge (6 vertices, 18 floats per edge)', () => {
    const n         = 6
    const center    = new THREE.Vector3(0, 1, 0)
    const avgRadius = 0.1
    const ring      = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return new THREE.Vector3(Math.cos(a) * avgRadius, 1, Math.sin(a) * avgRadius)
    })
    const buf = buildBorderPositions(center, ring, avgRadius, 0.08)
    // n edges × 2 triangles × 3 vertices × 3 components
    expect(buf.length).toBe(n * 2 * 3 * 3)
  })

  it('inner vertices are strictly closer to center than outer ring', () => {
    const n         = 6
    const center    = new THREE.Vector3(0, 1, 0)
    const avgRadius = 0.2
    const ring      = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return new THREE.Vector3(Math.cos(a) * avgRadius, 1, Math.sin(a) * avgRadius)
    })
    const buf = buildBorderPositions(center, ring, avgRadius, 0.08)

    const outerDists = ring.map(v => {
      const dx = v.x - center.x, dz = v.z - center.z
      return Math.sqrt(dx * dx + dz * dz)
    })
    const minOuter = Math.min(...outerDists)

    // Buffer layout per edge (18 floats = 2 triangles × 3 vertices × 3 components):
    //   [0..8]  triangle1: a(outer), b(outer), c(inner)
    //   [9..17] triangle2: a(outer), c(inner), d(inner)
    for (let e = 0; e < n; e++) {
      const base = e * 18
      for (const offset of [6, 15]) {
        const x = buf[base + offset], z = buf[base + offset + 2]
        const dx = x - center.x, dz = z - center.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        expect(dist).toBeLessThan(minOuter)
      }
    }
  })
})

