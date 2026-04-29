import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { generateHexasphere } from '../../geometry/hexasphere'
import { buildLiquidShell } from './buildLiquidShell'
import { createGraphicsUniforms } from '../hex/hexGraphicsUniforms'
import { topFanVertexCount } from './hexShellGeometry'
import { buildPrismGeometry } from '../hex/hexPrismGeometry'
import type { TerrainLevel } from '../../types/terrain.types'

// ── Fixtures ──────────────────────────────────────────────────────

/** Synthetic linear palette so band-space ↔ world-space is trivial. */
function syntheticPalette(N: number): TerrainLevel[] {
  const palette: TerrainLevel[] = []
  for (let i = 0; i < N; i++) {
    palette.push({
      threshold: i + 1,
      height:    i,
      color:     new THREE.Color(0xffffff),
    })
  }
  return palette
}

function tilesAtRadius(subdivisions: number) {
  return generateHexasphere(1, subdivisions).tiles
}

const gu = () => createGraphicsUniforms()

// ── Tests ─────────────────────────────────────────────────────────

describe('buildLiquidShell', () => {
  it('produces a hidden placeholder mesh when no tile qualifies', () => {
    const tiles = tilesAtRadius(2)
    const handle = buildLiquidShell({
      tiles,
      baseElevation:    new Map(), // no eligible tile
      topElevation:     5,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      graphicsUniforms: gu(),
    })
    expect(handle.mesh.visible).toBe(false)
    expect(handle.faceToTileId).toEqual([])
    // No-op handle does not throw.
    expect(() => handle.setTopElevation(7)).not.toThrow()
    expect(() => handle.setOpacity(0.5)).not.toThrow()
    expect(() => handle.setVisible(true)).not.toThrow()
    expect(() => handle.tick(1)).not.toThrow()
    handle.dispose()
  })

  it('builds a merged mesh with a face → tileId mapping for every triangle', () => {
    const tiles = tilesAtRadius(2)
    const baseElevation = new Map<number, number>()
    for (const tile of tiles) baseElevation.set(tile.id, 0) // every tile submerged from band 0

    const handle = buildLiquidShell({
      tiles, baseElevation,
      topElevation:     5,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      graphicsUniforms: gu(),
    })

    expect(handle.mesh).toBeInstanceOf(THREE.Mesh)
    expect(handle.faceToTileId.length).toBeGreaterThan(0)
    // 1 face per 3 vertices on a non-indexed buffer.
    const vertexCount = handle.mesh.geometry.getAttribute('position').count
    expect(handle.faceToTileId.length).toBe(vertexCount / 3)
    handle.dispose()
  })

  it('emits only the top fan of every prism (no walls, no bottom fan)', () => {
    const tiles = tilesAtRadius(2).slice(0, 4)
    const baseElevation = new Map<number, number>()
    for (const tile of tiles) baseElevation.set(tile.id, 0)

    const handle = buildLiquidShell({
      tiles, baseElevation,
      topElevation:     3,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      graphicsUniforms: gu(),
    })

    // Top-fan-only geometry: total vertex count equals the sum of every
    // tile's `topFanVertexCount`. A full prism (with walls + degenerate
    // bottom) would emit several times this — the assertion catches any
    // accidental fall-back to the ice-style stacked prism path.
    let expectedTopVerts = 0
    for (const tile of tiles) expectedTopVerts += topFanVertexCount(tile)
    expect(handle.mesh.geometry.getAttribute('position').count).toBe(expectedTopVerts)

    // Sanity: a full prism geometry of the same tile would carry walls
    // on top, so the comparison is meaningful (top-only is strictly
    // smaller).
    const fullPrism = buildPrismGeometry(tiles[0], 3, 0)
    expect(fullPrism.getAttribute('position').count).toBeGreaterThan(topFanVertexCount(tiles[0]))
    fullPrism.dispose()

    handle.dispose()
  })

  it('seeds the per-body uLiquidOpacity uniform from opts.opacity', () => {
    const tiles = tilesAtRadius(2).slice(0, 2)
    const baseElevation = new Map<number, number>()
    for (const tile of tiles) baseElevation.set(tile.id, 0)
    const graphics = gu()

    const handle = buildLiquidShell({
      tiles, baseElevation,
      topElevation:     5,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      opacity:          0.42,
      graphicsUniforms: graphics,
    })
    expect(graphics.uLiquidOpacity.value).toBeCloseTo(0.42, 6)
    const mat = handle.mesh.material as THREE.MeshStandardMaterial
    expect(mat.opacity).toBeCloseTo(0.42, 6)
    expect(mat.transparent).toBe(true)
    handle.dispose()
  })

  it('setOpacity toggles transparent / depthWrite around full opacity', () => {
    const tiles = tilesAtRadius(2).slice(0, 2)
    const baseElevation = new Map<number, number>()
    for (const tile of tiles) baseElevation.set(tile.id, 0)
    const graphics = gu()

    const handle = buildLiquidShell({
      tiles, baseElevation,
      topElevation:     5,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      opacity:          0.5,
      graphicsUniforms: graphics,
    })
    const mat = handle.mesh.material as THREE.MeshStandardMaterial

    handle.setOpacity(0.2)
    expect(mat.opacity).toBeCloseTo(0.2, 6)
    expect(mat.transparent).toBe(true)
    expect(mat.depthWrite).toBe(false)

    handle.setOpacity(1.2) // clamped
    expect(mat.opacity).toBe(1.0)
    expect(mat.transparent).toBe(false)
    expect(mat.depthWrite).toBe(true)
    expect(graphics.uLiquidOpacity.value).toBe(1.0)
    handle.dispose()
  })

  it('setTopElevation rewrites the position buffer when the band moves', () => {
    const tiles = tilesAtRadius(2).slice(0, 4)
    const baseElevation = new Map<number, number>()
    for (const tile of tiles) baseElevation.set(tile.id, 0)

    const handle = buildLiquidShell({
      tiles, baseElevation,
      topElevation:     5,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      graphicsUniforms: gu(),
    })
    const posAttr = handle.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const versionBefore = posAttr.version
    handle.setTopElevation(7)
    expect(posAttr.version).toBeGreaterThan(versionBefore)
    handle.dispose()
  })

  it('setBaseElevation collapses a tile whose new base reaches the top', () => {
    const tiles = tilesAtRadius(2).slice(0, 4)
    const baseElevation = new Map<number, number>()
    for (const tile of tiles) baseElevation.set(tile.id, 0) // submerged

    const handle = buildLiquidShell({
      tiles, baseElevation,
      topElevation:     5,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      graphicsUniforms: gu(),
    })
    const posAttr = handle.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    // Pick the first tile and lift its base above the waterline. The
    // top-only fan should collapse onto the tile centre point — every
    // x of the slot is the same value (centre projection).
    const target  = tiles[0]
    const fanLen  = topFanVertexCount(target)
    const versionBefore = posAttr.version
    handle.setBaseElevation(new Map([[target.id, 5]]))
    expect(posAttr.version).toBeGreaterThan(versionBefore)

    // The fan covers the FIRST `fanLen` vertices of the tile's slot.
    // Tile 0 sits at slot start = 0, so we read positions[0..fanLen*3].
    const x0 = positions[0]
    let collapsed = true
    for (let v = 0; v < fanLen; v++) {
      if (positions[v * 3] !== x0) { collapsed = false; break }
    }
    expect(collapsed).toBe(true)
    handle.dispose()
  })

  it('setBaseElevation re-extrudes a previously-collapsed tile', () => {
    const tiles = tilesAtRadius(2).slice(0, 4)
    // Every tile starts at base 4 with the cap top at 5 — barely
    // extruded but eligible (so the merged buffer carries every slot).
    // Subsequent setTopElevation(7) lifts the waterline; setBaseElevation(0)
    // on tile 0 should produce a tall, fully-extruded prism whose top
    // fan vertices spread across the tile boundary.
    const baseElevation = new Map<number, number>()
    for (const tile of tiles) baseElevation.set(tile.id, 4)

    const handle = buildLiquidShell({
      tiles, baseElevation,
      topElevation:     5,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      graphicsUniforms: gu(),
    })
    handle.setTopElevation(7)
    const posAttr = handle.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    const target = tiles[0]
    const fanLen = topFanVertexCount(target)
    const versionBefore = posAttr.version
    handle.setBaseElevation(new Map([[target.id, 0]]))
    expect(posAttr.version).toBeGreaterThan(versionBefore)

    // A non-degenerate top fan emits triangles `(centre, edge_i, edge_i+1)`,
    // so the boundary vertices spread radially — at least one vertex
    // must hold a position distinct from vertex 0.
    const x0 = positions[0], y0 = positions[1], z0 = positions[2]
    let distinct = false
    for (let v = 1; v < fanLen; v++) {
      const i = v * 3
      const dx = positions[i] - x0, dy = positions[i + 1] - y0, dz = positions[i + 2] - z0
      if (dx * dx + dy * dy + dz * dz > 1e-12) { distinct = true; break }
    }
    expect(distinct).toBe(true)
    handle.dispose()
  })

  it('setBaseElevation skips unknown tile ids without throwing', () => {
    const tiles = tilesAtRadius(2).slice(0, 2)
    const baseElevation = new Map<number, number>()
    for (const tile of tiles) baseElevation.set(tile.id, 0)

    const handle = buildLiquidShell({
      tiles, baseElevation,
      topElevation:     5,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      graphicsUniforms: gu(),
    })
    expect(() => handle.setBaseElevation(new Map([[-99, 0]]))).not.toThrow()
    handle.dispose()
  })

  it('setVisible flips the mesh visibility', () => {
    const tiles = tilesAtRadius(2).slice(0, 2)
    const baseElevation = new Map<number, number>()
    for (const tile of tiles) baseElevation.set(tile.id, 0)

    const handle = buildLiquidShell({
      tiles, baseElevation,
      topElevation:     5,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      graphicsUniforms: gu(),
    })
    handle.setVisible(false)
    expect(handle.mesh.visible).toBe(false)
    handle.setVisible(true)
    expect(handle.mesh.visible).toBe(true)
    handle.dispose()
  })

  it('dispose releases geometry + material without throwing', () => {
    const tiles = tilesAtRadius(2).slice(0, 2)
    const baseElevation = new Map<number, number>()
    for (const tile of tiles) baseElevation.set(tile.id, 0)

    const handle = buildLiquidShell({
      tiles, baseElevation,
      topElevation:     5,
      palette:          syntheticPalette(10),
      bodyRadius:       1,
      coreRadius:       0,
      color:            0x175da1,
      graphicsUniforms: gu(),
    })
    expect(() => handle.dispose()).not.toThrow()
  })
})
