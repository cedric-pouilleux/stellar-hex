import { describe, it, expect } from 'vitest'
import { buildLayeredMergedGeometry } from './buildLayeredMesh'
import type { Tile } from '../../geometry/hexasphere.types'

// ── Fixtures ──────────────────────────────────────────────────────

function makeHexTile(id: number, cx = 0, cy = 0, cz = 1): Tile {
  const boundary = []
  const R = 0.1
  for (let i = 0; i < 6; i++) {
    const theta = (i * Math.PI) / 3
    boundary.push({ x: cx + R * Math.cos(theta), y: cy + R * Math.sin(theta), z: cz })
  }
  return { id, centerPoint: { x: cx, y: cy, z: cz }, boundary, isPentagon: false }
}

// ── Merge bookkeeping ─────────────────────────────────────────────

describe('buildLayeredMergedGeometry', () => {
  it('emits face→tileId / face→layer entries aligned with vertex counts', () => {
    const tiles = [makeHexTile(0), makeHexTile(1, 0.3), makeHexTile(2, -0.3)]
    const out   = buildLayeredMergedGeometry(tiles, 1, 2, () => 0.5)

    const totalFaces = out.geometry.getAttribute('position').count / 3
    expect(out.faceToTileId.length).toBe(totalFaces)
    expect(out.faceToLayer.length).toBe(totalFaces)

    // Each layer emits 24 faces per hex tile (6 top + 12 walls + 6 bottom) →
    // 3 tiles × 2 layers × 24 faces = 144.
    expect(totalFaces).toBe(144)
  })

  it('records per-tile vertex ranges pointing inside the merged geometry', () => {
    const tiles = [makeHexTile(10), makeHexTile(20, 0.3)]
    const out   = buildLayeredMergedGeometry(tiles, 1, 2, () => 0.5)

    const ra = out.tileRange.get(10)!
    const rb = out.tileRange.get(20)!
    expect(ra).toBeDefined()
    expect(rb).toBeDefined()
    // Ranges are non-overlapping and contiguous.
    expect(ra.sol.start).toBe(0)
    expect(ra.atmo.start).toBe(ra.sol.start + ra.sol.count)
    expect(rb.sol.start).toBe(ra.atmo.start + ra.atmo.count)
    expect(rb.atmo.start).toBe(rb.sol.start + rb.sol.count)
  })

  it('computes totalThickness from surfaceRadius - coreRadius', () => {
    const out = buildLayeredMergedGeometry([makeHexTile(0)], 1.5, 3.0, () => 0)
    expect(out.totalThickness).toBeCloseTo(1.5, 6)
  })

  it('clamps per-tile solHeight into [0, totalThickness] before building the prism', () => {
    const tiles = [makeHexTile(0)]
    // Ask for a sol taller than the shell — the merger must clamp silently.
    const out = buildLayeredMergedGeometry(tiles, 1, 2, () => 99)

    const a = out.geometry.getAttribute('aSolHeight').array as Float32Array
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBeCloseTo(1.0, 5)   // clamped to totalThickness = 1
    }
  })

  it('degenerate sol (height = 0) keeps a stable 72/72 vertex split (walls degenerate but emitted)', () => {
    const out = buildLayeredMergedGeometry([makeHexTile(0)], 1, 2, () => 0)
    // Vertex counts are stable regardless of solHeight — a prerequisite
    // for the live `updateTileSolHeight` mutation API. The sol walls are
    // zero-area triangles and discarded by the GPU without shader cost.
    const r = out.tileRange.get(0)!
    expect(r.sol.count).toBe(72)
    expect(r.atmo.count).toBe(72)
  })

  it('face→layer alternates 0…0 then 1…1 per tile (sol faces before atmo faces)', () => {
    const out = buildLayeredMergedGeometry([makeHexTile(0)], 1, 2, () => 0.5)
    // Each layer carries 24 faces (6 top tris + 12 wall tris + 6 bottom tris)
    // — stable across solHeight values.
    expect(out.faceToLayer.slice(0, 24).every(l => l === 0)).toBe(true)
    expect(out.faceToLayer.slice(24, 48).every(l => l === 1)).toBe(true)
  })
})
