import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildLayeredInteractiveMesh, resolveSolHeight } from './buildLayeredInteractiveMesh'
import { generateHexasphere } from '../../geometry/hexasphere'
import { initBodySimulation } from '../../sim/BodySimulation'
import { generateBodyVariation } from '../body/bodyVariation'
import { generateTerrainPalette } from '../../terrain/terrainPalette'
import { DEFAULT_CORE_RADIUS_RATIO, resolveAtmosphereThickness } from '../../physics/body'
import { createHoverChannel } from '../state/hoverState'
import { createGraphicsUniforms } from '../hex/hexGraphicsUniforms'
import type { BodyConfig } from '../../types/body.types'
import type { Tile } from '../../geometry/hexasphere.types'

/**
 * Builds the per-test options bundle expected by `buildLayeredInteractiveMesh`.
 * Each call returns a fresh hover channel + graphics uniform bag so the tests
 * stay independent (cf. the multi-body isolation contract enforced by the
 * factories).
 */
function testOptions() {
  return { hoverChannel: createHoverChannel(), graphicsUniforms: createGraphicsUniforms() }
}

// ── Fixtures ──────────────────────────────────────────────────────

function rockyConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'test-layered',
    type: 'rocky',
    radius: 1,
    rotationSpeed: 0.05,
    axialTilt: 0,
    atmosphereThickness: 0.4,
    liquidType: 'water',
    liquidState: 'liquid',
    ...overrides,
  }
}

function buildFromConfig(config: BodyConfig) {
  const data      = generateHexasphere(config.radius, 2) // low-res for tests
  const sim       = initBodySimulation(data.tiles, config)
  const variation = generateBodyVariation(config)
  const palette   = generateTerrainPalette(20, config.radius, DEFAULT_CORE_RADIUS_RATIO)
  return { data, sim, variation, palette }
}

// ── resolveSolHeight ─────────────────────────────────────────────

describe('resolveSolHeight', () => {
  it('clamps the result into [0, maxHeight]', () => {
    const { data, sim, palette } = buildFromConfig(rockyConfig())
    const tile = data.tiles[0]

    const loose = resolveSolHeight(tile, sim, palette, 1.0)
    expect(loose).toBeGreaterThanOrEqual(0)
    expect(loose).toBeLessThanOrEqual(1.0)
  })

  it('falls back to the deepest palette level when the tile state is missing', () => {
    // Tile not registered in the sim — the function should not throw.
    const { sim, palette } = buildFromConfig(rockyConfig())
    const orphan: Tile = { id: 99999, centerPoint: { x: 0, y: 1, z: 0 }, boundary: [], isPentagon: false }
    const h = resolveSolHeight(orphan, sim, palette, 1.0)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(1.0)
  })
})

// ── Silhouette invariance ────────────────────────────────────────

describe('buildLayeredInteractiveMesh silhouette invariance', () => {
  /**
   * Read the outer visible radius — i.e. the atmo-shell top — through the
   * public `getTilePosition` API, which projects a tile centre onto the
   * atmo outer radius. The mesh exposes no `atmoOuterRadius` getter, so we
   * rely on this indirect probe.
   */
  function outerRadius(config: BodyConfig): number {
    const { sim, palette, variation } = buildFromConfig(config)
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const tileId = sim.tiles[0].id
    const pos = mesh.getTilePosition(tileId, 'atmo')!
    const r   = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z)
    mesh.dispose()
    return r
  }

  it('outer silhouette does not depend on coreRadiusRatio', () => {
    // Contract: swapping `coreRadiusRatio` only reshapes the interior
    // (hex column length, core visibility). The visible outer radius that
    // the user sees in the hex / shader views must stay identical.
    const base    = rockyConfig({ radius: 1 })
    const refR    = outerRadius(base)
    for (const coreRatio of [0.1, 0.3, 0.55, 0.8]) {
      const r = outerRadius({ ...base, coreRadiusRatio: coreRatio })
      expect(r).toBeCloseTo(refR, 6)
    }
  })

  it('outer silhouette does not depend on any noise knob', () => {
    const base = rockyConfig({ radius: 1 })
    const refR = outerRadius(base)
    const cases: Partial<BodyConfig>[] = [
      { noiseScale:       4.0 },
      { noiseOctaves:     6 },
      { noisePersistence: 0.3 },
      { noiseLacunarity:  2.5 },
      { noisePower:       2.5 },
      { noiseRidge:       0.8 },
    ]
    for (const overrides of cases) {
      const r = outerRadius({ ...base, ...overrides })
      expect(r).toBeCloseTo(refR, 6)
    }
  })

  it('outer silhouette scales strictly with `radius` alone (no other terrain input)', () => {
    const ref = outerRadius(rockyConfig({ radius: 1, coreRadiusRatio: 0.55 }))
    const big = outerRadius(rockyConfig({ radius: 3, coreRadiusRatio: 0.55 }))
    expect(big / ref).toBeCloseTo(3, 6)
  })

  it('outer silhouette stays at `config.radius` regardless of atmosphereThickness', () => {
    // Strict invariance: the silhouette is exactly `config.radius` no matter
    // how thick the atmosphere is. The atmo grows inward (carving out of
    // the sol band) instead of pushing the outer rim outward — this is the
    // partition contract `[core | sol | atmo]` the layered mesh enforces.
    const thin  = outerRadius(rockyConfig({ atmosphereThickness: 0,    radius: 1 }))
    const thick = outerRadius(rockyConfig({ atmosphereThickness: 0.7,  radius: 1 }))
    expect(thin).toBeCloseTo(1, 5)
    expect(thick).toBeCloseTo(1, 5)
  })
})

// ── buildLayeredInteractiveMesh — public surface ──────────────────

describe('buildLayeredInteractiveMesh', () => {
  it('builds a non-indexed layered geometry with two material groups (sol + atmo)', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    expect(hexMesh.isMesh).toBe(true)
    expect(Array.isArray(hexMesh.material)).toBe(true)
    expect((hexMesh.material as THREE.Material[]).length).toBe(2)

    const groups = hexMesh.geometry.groups
    expect(groups.length).toBeGreaterThan(0)
    // Each group targets either material index 0 (sol) or 1 (atmo).
    for (const g of groups) {
      expect(g.materialIndex === 0 || g.materialIndex === 1).toBe(true)
    }

    mesh.dispose()
  })

  it('emits a faceToTileId map aligned with the merged geometry', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const faceCount = hexMesh.geometry.getAttribute('position').count / 3
    expect(mesh.faceToTileId.length).toBe(faceCount)
    mesh.dispose()
  })

  it('attaches a per-vertex color attribute the tile overlays can paint into', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    expect(hexMesh.geometry.getAttribute('color')).toBeDefined()

    // writeTileColor stamps sol + atmo ranges in one go — the buffer version
    // bumps so the renderer uploads the updated colours, and the first tile's
    // sol vertex at offset 0 carries the painted RGB.
    const tileId    = sim.tiles[0].id
    const colorAttr = hexMesh.geometry.getAttribute('color') as THREE.BufferAttribute
    const v0        = colorAttr.version
    mesh.writeTileColor(tileId, { r: 1, g: 0, b: 0 })
    expect(colorAttr.version).toBeGreaterThan(v0)
    expect(colorAttr.getX(0)).toBeCloseTo(1, 5)
    expect(colorAttr.getY(0)).toBeCloseTo(0, 5)
    expect(colorAttr.getZ(0)).toBeCloseTo(0, 5)
    mesh.dispose()
  })

  it('tileGeometry returns null for unknown ids and a tile+level pair otherwise', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    expect(mesh.tileGeometry(-1)).toBeNull()
    const info = mesh.tileGeometry(sim.tiles[0].id)
    expect(info).not.toBeNull()
    expect(info!.tile.id).toBe(sim.tiles[0].id)
    expect(typeof info!.level.height).toBe('number')
    mesh.dispose()
  })

  it('onHoverChange notifies listeners when the hover target changes', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const seen: (number | null)[] = []
    const off = mesh.onHoverChange(id => seen.push(id))
    const id  = sim.tiles[0].id
    mesh.setHover(id)
    mesh.setHover(id)      // same id — debounced, no extra event
    mesh.setHover(null)
    off()
    mesh.setHover(id)      // listener removed → ignored
    expect(seen).toEqual([id, null])
    mesh.dispose()
  })

  it('dispose releases geometry + materials without throwing', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    expect(() => mesh.dispose()).not.toThrow()
  })

  it('sol sub-material is a vanilla MeshStandardMaterial reading per-tile vertex colours', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const mats    = hexMesh.material as THREE.Material[]
    const sol     = mats[0] as THREE.MeshStandardMaterial
    expect(sol).toBeInstanceOf(THREE.MeshStandardMaterial)
    // The procedural sol shader was retired — the sol cells must render
    // as flat hex cells coloured by the per-vertex palette stamp.
    expect(sol.vertexColors).toBe(true)
    mesh.dispose()
  })

  // ── Mutation API (step 5) ───────────────────────────────────────

  it('updateTileSolHeight rewrites position / normal / aSolHeight in place', () => {
    // Drop the atmo so `mesh.totalThickness` equals the sol band length —
    // the test asserts a precise per-vertex radius and would otherwise hit
    // the sol-band clamp the moment `atmosphereThickness > 0`.
    const { sim, palette, variation } = buildFromConfig(rockyConfig({ atmosphereThickness: 0 }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const posAttr = hexMesh.geometry.getAttribute('position')   as THREE.BufferAttribute
    const solAttr = hexMesh.geometry.getAttribute('aSolHeight') as THREE.BufferAttribute
    const pv0 = posAttr.version
    const sv0 = solAttr.version
    const vertCountBefore = posAttr.count

    const tileId = sim.tiles[0].id
    const newH   = mesh.totalThickness * 0.25
    mesh.updateTileSolHeight(new Map([[tileId, newH]]))

    // Buffer versions bumped — renderer will re-upload. Vertex count unchanged.
    expect(posAttr.version).toBeGreaterThan(pv0)
    expect(solAttr.version).toBeGreaterThan(sv0)
    expect(posAttr.count).toBe(vertCountBefore)

    // aSolHeight reflects the new value on every vertex of the tile.
    const info = mesh.tileGeometry(tileId)!
    void info
    // Walk a handful of vertices at the sol top cap — they should live at
    // coreRadius + newH.
    const surfaceRadius = sim.config.radius
    const coreRadius    = surfaceRadius * 0.55 // DEFAULT_CORE_RADIUS_RATIO
    const expectedR     = coreRadius + newH
    // The sol top fan for tile 0 starts at range.sol.start. Here we just
    // sample the `aSolHeight` buffer (all vertices of the tile carry it).
    // Note: vertex order follows the merged geometry layout — sampling
    // vertex 0 is enough since tile 0 is first.
    expect(solAttr.getX(0)).toBeCloseTo(newH, 5)
    const x0 = posAttr.getX(0), y0 = posAttr.getY(0), z0 = posAttr.getZ(0)
    expect(Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0)).toBeCloseTo(expectedR, 4)
    mesh.dispose()
  })

  it('updateTileSolHeight clamps requested heights to the sol band height and skips unknown ids', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const solAttr = hexMesh.geometry.getAttribute('aSolHeight') as THREE.BufferAttribute

    // Clamp ceiling is the **sol band** height
    // `(1 − coreRatio − atmosphereThickness) × radius` — the staircase tops
    // out at `solOuterRadius`, never inside the atmo shell. The atmo
    // thickness goes through the body-type cap (rocky ≤ 0.20) so the test
    // reads the same effective value the mesh used.
    const coreRatio        = sim.config.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO
    const atmoThick        = resolveAtmosphereThickness(sim.config)
    const solBandHeight    = Math.max(0, (1 - coreRatio - atmoThick) * sim.config.radius)
    const maxTerrainHeight = solBandHeight
    const tileId = sim.tiles[0].id
    mesh.updateTileSolHeight(new Map([
      [tileId,     999],        // clamped to maxTerrainHeight
      [-42,        0.1],        // unknown — silently ignored
    ]))
    expect(solAttr.getX(0)).toBeCloseTo(maxTerrainHeight, 5)

    mesh.updateTileSolHeight(new Map([[tileId, -5]]))
    expect(solAttr.getX(0)).toBeCloseTo(0, 5)
    mesh.dispose()
  })

  it('getTilePosition projects onto the sol top for "sol" and the silhouette for "atmo"', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({ radius: 2, coreRadiusRatio: 0.5, atmosphereThickness: 0 }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const tileId = sim.tiles[0].id
    mesh.updateTileSolHeight(new Map([[tileId, 0.3]]))

    const coreRadius = 1.0 // radius * 0.5
    const atmoPos    = mesh.getTilePosition(tileId, 'atmo')!
    const solPos     = mesh.getTilePosition(tileId, 'sol')!
    // With strict silhouette invariance, the atmo outer shell sits at
    // exactly `config.radius` (atmoOuterRadius = solSurfaceRadius).
    expect(atmoPos.length()).toBeCloseTo(sim.config.radius, 5)
    expect(solPos.length()).toBeCloseTo(coreRadius + 0.3, 5)

    expect(mesh.getTilePosition(-1, 'sol')).toBeNull()
    mesh.dispose()
  })

  it('applyTileOverlay stamps a single layer only — the other layer stays untouched', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh   = mesh.group.children[0] as THREE.Mesh
    const colorAttr = hexMesh.geometry.getAttribute('color') as THREE.BufferAttribute
    const tileId    = sim.tiles[0].id

    // Sample the atmo first vertex offset — the merged layout is [sol | atmo]
    // per tile, so atmo for tile 0 sits just past sol.count.
    const solVertCount = 72 // hex: 18 top + 36 walls + 18 bottom verts per layer
    const before = {
      r: colorAttr.getX(solVertCount),
      g: colorAttr.getY(solVertCount),
      b: colorAttr.getZ(solVertCount),
    }

    mesh.applyTileOverlay('sol', new Map([[tileId, { r: 0, g: 1, b: 0 }]]))

    // Sol vertex 0 now green.
    expect(colorAttr.getX(0)).toBeCloseTo(0, 5)
    expect(colorAttr.getY(0)).toBeCloseTo(1, 5)
    expect(colorAttr.getZ(0)).toBeCloseTo(0, 5)
    // Atmo vertex untouched.
    expect(colorAttr.getX(solVertCount)).toBeCloseTo(before.r, 5)
    expect(colorAttr.getY(solVertCount)).toBeCloseTo(before.g, 5)
    expect(colorAttr.getZ(solVertCount)).toBeCloseTo(before.b, 5)

    // Reverse: atmo-only overlay doesn't touch sol.
    const solBefore = { r: colorAttr.getX(0), g: colorAttr.getY(0), b: colorAttr.getZ(0) }
    mesh.applyTileOverlay('atmo', new Map([[tileId, { r: 1, g: 0, b: 1 }]]))
    expect(colorAttr.getX(solVertCount)).toBeCloseTo(1, 5)
    expect(colorAttr.getX(0)).toBeCloseTo(solBefore.r, 5)
    mesh.dispose()
  })

  // ── Liquid surface ──────────────────────────────────────────────

  it('adds a liquid sphere to the group when the body holds a liquid', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      liquidType: 'water', liquidState: 'liquid',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    // Group children: [hexMesh, liquidMesh, borderMesh].
    expect(mesh.group.children.length).toBe(3)
    const liquidMesh = mesh.group.children[1] as THREE.Mesh
    // Indexed sphere geometry (icosphere reindexed via mergeVertices).
    expect(liquidMesh.geometry.index).not.toBeNull()
    mesh.dispose()
  })

  it('skips the liquid sphere for dry bodies (no group bloat, setters are no-ops)', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      liquidState: 'none',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    // Group children: [hexMesh, borderMesh] only.
    expect(mesh.group.children.length).toBe(2)
    expect(() => mesh.setSeaLevel(1.2)).not.toThrow()
    expect(() => mesh.setLiquidVisible(true)).not.toThrow()
    expect(() => mesh.setLiquidOpacity(0.5)).not.toThrow()
    mesh.dispose()
  })

  it('setSeaLevel / setLiquidOpacity / setLiquidVisible drive the liquid sphere state', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      liquidType: 'water', liquidState: 'liquid',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const liquidMesh = mesh.group.children[1] as THREE.Mesh
    const liqMat     = liquidMesh.material as THREE.MeshStandardMaterial

    // Liquid sphere is biased outward by ~0.08% of the waterline radius to
    // break coplanarity with shore-band hex caps — so `scale.x` sits a hair
    // above the requested world radius, not exactly on it.
    mesh.setSeaLevel(0.9)
    expect(liquidMesh.scale.x).toBeGreaterThan(0.9)
    expect(liquidMesh.scale.x).toBeCloseTo(0.9, 2)

    mesh.setLiquidOpacity(0.3)
    expect(liqMat.opacity).toBeCloseTo(0.3, 5)

    mesh.setLiquidVisible(false)
    expect(liquidMesh.visible).toBe(false)
    mesh.setLiquidVisible(true)
    expect(liquidMesh.visible).toBe(true)
    mesh.dispose()
  })

  it('hides the liquid sphere when the waterline drops to the inner core (avoids wrapping the molten core)', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      coreRadiusRatio: 0.5, liquidType: 'water', liquidState: 'liquid',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const liquidMesh = mesh.group.children[1] as THREE.Mesh
    const coreRadius = sim.config.radius * 0.5

    // Above the core → visible, scaled a hair above the requested radius
    // (z-fight bias; see LIQUID_Z_BIAS in buildLayeredInteractiveMesh.ts).
    mesh.setSeaLevel(coreRadius + 0.1)
    expect(liquidMesh.visible).toBe(true)
    expect(liquidMesh.scale.x).toBeGreaterThan(coreRadius + 0.1)
    expect(liquidMesh.scale.x).toBeCloseTo(coreRadius + 0.1, 2)

    // At the core → no basin to fill, hide so the inner core's glow escapes.
    mesh.setSeaLevel(coreRadius)
    expect(liquidMesh.visible).toBe(false)

    // Below the core → still hidden.
    mesh.setSeaLevel(coreRadius - 0.05)
    expect(liquidMesh.visible).toBe(false)

    // Raising the waterline back up makes it reappear.
    mesh.setSeaLevel(coreRadius + 0.2)
    expect(liquidMesh.visible).toBe(true)
    mesh.dispose()
  })


  it('setSeaLevel is a no-op (no buffer upload) when the waterline does not move', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      liquidType: 'water', liquidState: 'liquid',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const colorAttr = hexMesh.geometry.getAttribute('color') as THREE.BufferAttribute
    const liquid = mesh.group.children[1] as THREE.Mesh
    const initialRadius = liquid.scale.x

    const versionBefore = colorAttr.version
    // Same waterline → early return, no GPU upload.
    mesh.setSeaLevel(initialRadius)
    expect(colorAttr.version).toBe(versionBefore)
    mesh.dispose()
  })

  it('setSeaLevel round-trip restores the exact same colour buffer (dirty tracking is reversible)', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      liquidType: 'water', liquidState: 'liquid',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const colorAttr = hexMesh.geometry.getAttribute('color') as THREE.BufferAttribute
    const liquid = mesh.group.children[1] as THREE.Mesh
    const initialRadius = liquid.scale.x

    // Snapshot the initial colour state.
    const initial = Float32Array.from(colorAttr.array as Float32Array)

    // Move the waterline far enough to cross several bands in both directions.
    mesh.setSeaLevel(initialRadius + 0.3)
    mesh.setSeaLevel(initialRadius - 0.2)
    mesh.setSeaLevel(initialRadius)

    const after = colorAttr.array as Float32Array
    expect(after.length).toBe(initial.length)
    for (let i = 0; i < initial.length; i++) {
      expect(after[i]).toBeCloseTo(initial[i], 6)
    }
    mesh.dispose()
  })

  it('honours coreRadiusRatio — the sol draw call stays inside the shell thickness', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({ coreRadiusRatio: 0.5 }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const pos     = hexMesh.geometry.getAttribute('position').array as Float32Array
    const groups  = hexMesh.geometry.groups
    const surfaceRadius = sim.config.radius
    const coreRadius    = surfaceRadius * 0.5
    // Sol spans `[coreRadius, surfaceRadius]` — caps clamp at the nominal
    // surface, so the tallest mountains stop there. The atmo shell extends
    // above the surface via the headroom, but sol vertices never reach it.
    const shellCeiling  = surfaceRadius

    // Scope the radius check to sol vertices only — atmo sits ABOVE
    // `surfaceRadius` as a separate outer shell, so walking every vertex
    // would mix in atmo samples.
    let minR = Infinity, maxR = 0
    for (const g of groups) {
      if (g.materialIndex !== 0) continue
      const end = g.start + g.count
      for (let v = g.start; v < end; v++) {
        const i = v * 3
        const r = Math.sqrt(pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2)
        if (r < minR) minR = r
        if (r > maxR) maxR = r
      }
    }
    expect(minR).toBeGreaterThanOrEqual(coreRadius - 1e-4)
    expect(maxR).toBeLessThanOrEqual(shellCeiling + 1e-4)
    mesh.dispose()
  })
})
