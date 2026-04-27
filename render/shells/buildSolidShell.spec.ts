import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { generateHexasphere } from '../../geometry/hexasphere'
import { buildSolidShell } from './buildSolidShell'
import type { TerrainLevel } from '../../types/terrain.types'

// ── Fixtures ──────────────────────────────────────────────────────

/**
 * Synthetic palette — bands are evenly spaced from band 0 (height = 0) to
 * band N-1 (height = N-1). Linear by design so band-space → world-space
 * conversion is trivially testable.
 */
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

// ── Tests ─────────────────────────────────────────────────────────

describe('buildSolidShell', () => {
  it('produces an empty hidden mesh when no tiles qualify', () => {
    const tiles = tilesAtRadius(2)
    // Empty baseElevation map → every tile is skipped.
    const handle = buildSolidShell({
      tiles,
      baseElevation: new Map(),
      topElevation:  5,
      palette:       syntheticPalette(10),
      bodyRadius:    1,
      coreRadius:    0,
      color:         0xffffff,
    })
    expect(handle.mesh.visible).toBe(false)
    // No-op handle does not throw on lowerTile / removeTile
    expect(handle.lowerTile(tiles[0].id, 1)).toBeUndefined()
    expect(() => handle.removeTile(tiles[0].id)).not.toThrow()
    handle.dispose()
  })

  it('skips tiles whose base sits at or above the waterline (no negative-height prism)', () => {
    const tiles    = tilesAtRadius(2).slice(0, 3)
    const baseElev = new Map<number, number>(tiles.map(t => [t.id, 8]))
    const handle   = buildSolidShell({
      tiles,
      baseElevation: baseElev,
      topElevation:  5,                // strictly below the bases
      palette:       syntheticPalette(10),
      bodyRadius:    1,
      coreRadius:    0,
      color:         0xffffff,
    })
    // No qualifying tiles → empty mesh (no-op handle path).
    expect(handle.mesh.visible).toBe(false)
    handle.dispose()
  })

  it('builds a single merged mesh covering every submerged tile', () => {
    const tiles = tilesAtRadius(2)
    const sub   = tiles.slice(0, 12)
    const baseElev = new Map<number, number>(sub.map((t, i) => [t.id, 1 + (i % 3)]))
    const handle = buildSolidShell({
      tiles: sub,
      baseElevation: baseElev,
      topElevation:  6,
      palette:       syntheticPalette(10),
      bodyRadius:    1,
      coreRadius:    0,
      color:         0xc8e8f4,
    })
    expect(handle.mesh.visible).toBe(true)
    expect(handle.mesh.geometry.getAttribute('position').count).toBeGreaterThan(0)
    // Children attached to the group for symmetric `body.group.add(handle.group)` wiring.
    expect(handle.group.children).toContain(handle.mesh)
    handle.dispose()
  })

  it('lowerTile pushes the cap top down by the given band delta', () => {
    const tiles    = tilesAtRadius(2).slice(0, 6)
    const baseElev = new Map<number, number>(tiles.map(t => [t.id, 1]))
    const handle   = buildSolidShell({
      tiles,
      baseElevation: baseElev,
      topElevation:  5,
      palette:       syntheticPalette(10),
      bodyRadius:    1,
      coreRadius:    0,
      color:         0xffffff,
    })
    const targetId = tiles[0].id

    const after1 = handle.lowerTile(targetId, 1)
    expect(after1).toBe(4)

    const after2 = handle.lowerTile(targetId, 2)
    expect(after2).toBe(2)

    // Going past the base clamps at the base band (no negative cap height).
    const after3 = handle.lowerTile(targetId, 10)
    expect(after3).toBe(1)

    // Subsequent calls keep returning the clamped value (idempotent at base).
    const after4 = handle.lowerTile(targetId, 5)
    expect(after4).toBe(1)

    handle.dispose()
  })

  it('lowerTile rejects negative deltas without touching the buffer', () => {
    const tiles    = tilesAtRadius(2).slice(0, 3)
    const baseElev = new Map<number, number>(tiles.map(t => [t.id, 1]))
    const handle   = buildSolidShell({
      tiles,
      baseElevation: baseElev,
      topElevation:  5,
      palette:       syntheticPalette(10),
      bodyRadius:    1,
      coreRadius:    0,
      color:         0xffffff,
    })
    expect(handle.lowerTile(tiles[0].id, -1)).toBeUndefined()
    handle.dispose()
  })

  it('lowerTile silently ignores unknown tile ids', () => {
    const tiles    = tilesAtRadius(2).slice(0, 3)
    const baseElev = new Map<number, number>(tiles.map(t => [t.id, 1]))
    const handle   = buildSolidShell({
      tiles,
      baseElevation: baseElev,
      topElevation:  5,
      palette:       syntheticPalette(10),
      bodyRadius:    1,
      coreRadius:    0,
      color:         0xffffff,
    })
    expect(handle.lowerTile(99999, 1)).toBeUndefined()
    expect(() => handle.removeTile(99999)).not.toThrow()
    handle.dispose()
  })

  it('removeTile collapses every slot vertex onto the base centre — no visible top cap residue', () => {
    // Regression #1: `buildPrismGeometry` skips wall vertices when
    // height === basement, so a naive `positions.set(src, offset)` only
    // overwrites the top cap and leaves the wall-slot bytes intact at
    // their pre-collapse coordinates.
    //
    // Regression #2: even when the wall tail is padded, the top cap that
    // `buildPrismGeometry` emits at base height is still a valid 6-tri
    // hexagon floating at the original sol elevation — the user reads it
    // as "the destroyed tile keeps its top face". The fix is to skip the
    // builder entirely on full collapse and pad the entire slot with the
    // base centre point so every triangle is degenerate.
    const tiles    = tilesAtRadius(2).slice(0, 1)   // one tile keeps the slot bounds simple
    const baseElev = new Map<number, number>(tiles.map(t => [t.id, 1]))
    const handle   = buildSolidShell({
      tiles,
      baseElevation: baseElev,
      topElevation:  6,
      palette:       syntheticPalette(10),
      bodyRadius:    1,
      coreRadius:    0,
      color:         0xffffff,
    })
    const positions = handle.mesh.geometry.getAttribute('position').array as Float32Array

    handle.removeTile(tiles[0].id)

    // Every vertex of the slot must now sit on the same point. Any non-
    // matching vertex would mean a non-degenerate triangle slipped
    // through and would render as a leftover hex.
    const x0 = positions[0], y0 = positions[1], z0 = positions[2]
    for (let i = 0; i < positions.length; i += 3) {
      expect(positions[i]    ).toBeCloseTo(x0, 6)
      expect(positions[i + 1]).toBeCloseTo(y0, 6)
      expect(positions[i + 2]).toBeCloseTo(z0, 6)
    }
    handle.dispose()
  })

  it('returns the ice cap mesh material with the requested color and PBR overrides', () => {
    const tiles    = tilesAtRadius(2).slice(0, 3)
    const baseElev = new Map<number, number>(tiles.map(t => [t.id, 1]))
    const handle   = buildSolidShell({
      tiles,
      baseElevation: baseElev,
      topElevation:  4,
      palette:       syntheticPalette(10),
      bodyRadius:    1,
      coreRadius:    0,
      color:         0xb59670,           // methane solid tint
      roughness:     0.7,
      metalness:     0.05,
    })
    const mat = handle.mesh.material as THREE.MeshStandardMaterial
    expect(mat.color.getHex()).toBe(0xb59670)
    expect(mat.roughness).toBeCloseTo(0.7)
    expect(mat.metalness).toBeCloseTo(0.05)
    handle.dispose()
  })

  it('dispose releases geometry and material', () => {
    const tiles    = tilesAtRadius(2).slice(0, 3)
    const baseElev = new Map<number, number>(tiles.map(t => [t.id, 1]))
    const handle   = buildSolidShell({
      tiles,
      baseElevation: baseElev,
      topElevation:  4,
      palette:       syntheticPalette(10),
      bodyRadius:    1,
      coreRadius:    0,
      color:         0xffffff,
    })
    expect(() => handle.dispose()).not.toThrow()
    // Idempotency requirement is loose: calling dispose twice should not
    // throw for the empty / no-op handle path. We don't enforce it for the
    // populated path because Three.js dispose() is documented as one-shot.
  })
})
