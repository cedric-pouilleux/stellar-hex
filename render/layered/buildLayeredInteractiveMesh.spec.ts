import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildLayeredInteractiveMesh, resolveSolHeight } from './buildLayeredInteractiveMesh'
import { generateHexasphere } from '../../geometry/hexasphere'
import { initBodySimulation } from '../../sim/BodySimulation'
import { generateBodyVariation } from '../body/bodyVariation'
import { generateTerrainPalette } from '../palettes/terrainPalette'
import { DEFAULT_CORE_RADIUS_RATIO, resolveAtmosphereThickness } from '../../physics/body'
import { computeLayeredShellMetrics } from './layeredShellMetrics'
import { createHoverChannel } from '../state/hoverState'
import { createGraphicsUniforms } from '../hex/hexGraphicsUniforms'
import type { BodyConfig } from '../../types/body.types'
import type { Tile } from '../../geometry/hexasphere.types'

/** Per-test options bundle expected by `buildLayeredInteractiveMesh`. */
function testOptions() {
  return { hoverChannel: createHoverChannel(), graphicsUniforms: createGraphicsUniforms() }
}

// ── Fixtures ─────────────────────────────────────────────────────────

function rockyConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'test-layered',
    type: 'planetary', surfaceLook: 'terrain',
    radius: 1,
    rotationSpeed: 0.05,
    axialTilt: 0,
    atmosphereThickness: 0.4,
    liquidState: 'liquid',
    ...overrides,
  }
}

function buildFromConfig(config: BodyConfig) {
  const data       = generateHexasphere(config.radius, 2) // low-res for tests
  const sim        = initBodySimulation(data.tiles, config)
  const variation  = generateBodyVariation(config)
  const palette    = generateTerrainPalette(20, config.radius, DEFAULT_CORE_RADIUS_RATIO)
  // Source the same metrics the production builder uses so band-space ↔
  // world-radius conversions match exactly (the spec needs to compute
  // the world radius equivalent of `sim.seaLevelElevation`).
  const { coreRadius, bandUnit } = computeLayeredShellMetrics(sim)
  return { data, sim, variation, palette, coreRadius, bandUnit }
}

// ── resolveSolHeight ─────────────────────────────────────────────────

describe('resolveSolHeight', () => {
  it('clamps the result into [0, maxHeight]', () => {
    const { data, sim, palette } = buildFromConfig(rockyConfig())
    const tile = data.tiles[0]

    const loose = resolveSolHeight(tile, sim, palette, 1.0)
    expect(loose).toBeGreaterThanOrEqual(0)
    expect(loose).toBeLessThanOrEqual(1.0)
  })

  it('falls back to the deepest palette level when the tile state is missing', () => {
    const { sim, palette } = buildFromConfig(rockyConfig())
    const orphan: Tile = { id: 99999, centerPoint: { x: 0, y: 1, z: 0 }, boundary: [], isPentagon: false }
    const h = resolveSolHeight(orphan, sim, palette, 1.0)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(1.0)
  })
})

// ── buildLayeredInteractiveMesh — public surface (sol-only) ──────────

describe('buildLayeredInteractiveMesh', () => {
  it('builds a single-material non-indexed mesh', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    expect(hexMesh.isMesh).toBe(true)
    // Mono-band sol mesh — single MeshStandardMaterial, no array.
    expect(Array.isArray(hexMesh.material)).toBe(false)
    expect(hexMesh.material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(hexMesh.geometry.index).toBeNull()
    mesh.dispose()
  })

  it('sol mesh tops out at solOuterRadius (silhouette = config.radius - atmoFraction)', () => {
    // Sol vertices stay within `[coreRadius, solOuterRadius]`. The
    // atmospheric headroom above sits on the dedicated atmo board mesh
    // (see `buildAtmoBoardMesh`), not here.
    const config = rockyConfig({ coreRadiusRatio: 0.5, atmosphereThickness: 0 })
    const { sim, palette, variation } = buildFromConfig(config)
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const pos     = hexMesh.geometry.getAttribute('position').array as Float32Array
    const coreRadius     = sim.config.radius * 0.5
    const solOuterRadius = sim.config.radius // atmoThickness = 0 → sol = full

    let minR = Infinity, maxR = 0
    for (let v = 0; v < pos.length / 3; v++) {
      const i = v * 3
      const r = Math.sqrt(pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2)
      if (r < minR) minR = r
      if (r > maxR) maxR = r
    }
    expect(minR).toBeGreaterThanOrEqual(coreRadius - 1e-4)
    expect(maxR).toBeLessThanOrEqual(solOuterRadius + 1e-4)
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

  it('sol material reads per-vertex colours (vertexColors = true)', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const sol     = hexMesh.material as THREE.MeshStandardMaterial
    expect(sol).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(sol.vertexColors).toBe(true)
    mesh.dispose()
  })

  it('writeTileColor stamps per-vertex RGB and bumps the version', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const colorAttr = hexMesh.geometry.getAttribute('color') as THREE.BufferAttribute
    const v0 = colorAttr.version

    const tileId = sim.tiles[0].id
    mesh.writeTileColor(tileId, { r: 1, g: 0, b: 0 })
    expect(colorAttr.version).toBeGreaterThan(v0)
    expect(colorAttr.getX(0)).toBeCloseTo(1, 5)
    expect(colorAttr.getY(0)).toBeCloseTo(0, 5)
    expect(colorAttr.getZ(0)).toBeCloseTo(0, 5)
    mesh.dispose()
  })

  it('applyTileOverlay stamps the sol vertices of every entry', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const hexMesh   = mesh.group.children[0] as THREE.Mesh
    const colorAttr = hexMesh.geometry.getAttribute('color') as THREE.BufferAttribute
    const tileId    = sim.tiles[0].id

    mesh.applyTileOverlay(new Map([[tileId, { r: 0, g: 1, b: 0 }]]))
    expect(colorAttr.getX(0)).toBeCloseTo(0, 5)
    expect(colorAttr.getY(0)).toBeCloseTo(1, 5)
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

  it('dispose releases geometry + materials without throwing', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    expect(() => mesh.dispose()).not.toThrow()
  })

  // ── Mutation API ────────────────────────────────────────────────

  it('updateTileSolHeight rewrites position / normal / aSolHeight in place', () => {
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

    expect(posAttr.version).toBeGreaterThan(pv0)
    expect(solAttr.version).toBeGreaterThan(sv0)
    expect(posAttr.count).toBe(vertCountBefore)

    const surfaceRadius = sim.config.radius
    const coreRadius    = surfaceRadius * 0.55 // DEFAULT_CORE_RADIUS_RATIO
    const expectedR     = coreRadius + newH
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

    const coreRatio        = sim.config.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO
    const atmoThick        = resolveAtmosphereThickness(sim.config)
    const solBandHeight    = Math.max(0, (1 - coreRatio - atmoThick) * sim.config.radius)
    const maxTerrainHeight = solBandHeight
    const tileId = sim.tiles[0].id
    mesh.updateTileSolHeight(new Map([
      [tileId,     999],
      [-42,        0.1],
    ]))
    expect(solAttr.getX(0)).toBeCloseTo(maxTerrainHeight, 5)

    mesh.updateTileSolHeight(new Map([[tileId, -5]]))
    expect(solAttr.getX(0)).toBeCloseTo(0, 5)
    mesh.dispose()
  })

  it('getTilePosition projects the tile centre onto the sol cap', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({ radius: 2, coreRadiusRatio: 0.5, atmosphereThickness: 0 }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())

    const tileId = sim.tiles[0].id
    mesh.updateTileSolHeight(new Map([[tileId, 0.3]]))

    const coreRadius = 1.0 // radius * 0.5
    const solPos     = mesh.getTilePosition(tileId)!
    expect(solPos.length()).toBeCloseTo(coreRadius + 0.3, 5)

    expect(mesh.getTilePosition(-1)).toBeNull()
    mesh.dispose()
  })

  // ── Liquid surface ───────────────────────────────────────────────

  it('adds a liquid shell group to the body group when the body holds a liquid', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      liquidState: 'liquid',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    expect(mesh.group.children.length).toBe(2)
    const liquidGroup = mesh.group.children[1] as THREE.Group
    expect((liquidGroup as THREE.Object3D).type).toBe('Group')
    // The shell group holds exactly one merged hex-shell mesh.
    expect(liquidGroup.children.length).toBe(1)
    const liquidMesh = liquidGroup.children[0] as THREE.Mesh
    expect(liquidMesh).toBeInstanceOf(THREE.Mesh)
    // The shell carries position + normal — top-fan only, no walls.
    expect(liquidMesh.geometry.getAttribute('position')).toBeDefined()
    expect(liquidMesh.geometry.getAttribute('normal')).toBeDefined()
    mesh.dispose()
  })

  it('skips the liquid shell for dry bodies', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      liquidState: 'none',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    expect(mesh.group.children.length).toBe(1)
    expect(() => mesh.setSeaLevel(1.2)).not.toThrow()
    expect(() => mesh.setLiquidVisible(true)).not.toThrow()
    expect(() => mesh.setLiquidOpacity(0.5)).not.toThrow()
    mesh.dispose()
  })

  it('setLiquidOpacity / setLiquidVisible drive the liquid shell state', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      liquidState: 'liquid',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const liquidGroup = mesh.group.children[1] as THREE.Group
    const liquidMesh  = liquidGroup.children[0] as THREE.Mesh
    const liqMat      = liquidMesh.material as THREE.MeshStandardMaterial

    mesh.setLiquidOpacity(0.3)
    expect(liqMat.opacity).toBeCloseTo(0.3, 5)

    mesh.setLiquidVisible(false)
    expect(liquidMesh.visible).toBe(false)
    mesh.setLiquidVisible(true)
    expect(liquidMesh.visible).toBe(true)
    mesh.dispose()
  })

  it('updateTileSolHeight propagates the new base to the liquid shell', () => {
    // Digging a tile must move its liquid-shell wall start so the cap
    // surface follows: a tile dug below the waterline gains a liquid
    // hex (its previously-collapsed prism re-extrudes), while a tile
    // lifted above it loses the hex. We probe the side effect by
    // watching the liquid mesh's position-buffer version, which only
    // bumps when `setBaseElevation` actually rewrote a slot.
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      liquidState: 'liquid',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const liquidMesh = (mesh.group.children[1] as THREE.Group).children[0] as THREE.Mesh
    const liqPos     = liquidMesh.geometry.getAttribute('position') as THREE.BufferAttribute

    // Find a tile whose current elevation is non-zero so the dig produces
    // a real band-space change (otherwise `setBaseElevation` skips the slot).
    const candidate = sim.tiles.find(t => (sim.tileStates.get(t.id)?.elevation ?? 0) > 0)
    expect(candidate).toBeDefined()

    const versionBefore = liqPos.version
    mesh.updateTileSolHeight(new Map([[candidate!.id, 0]]))
    expect(liqPos.version).toBeGreaterThan(versionBefore)
    mesh.dispose()
  })

  it('setSeaLevel is a no-op (no buffer upload) when the waterline does not move', () => {
    const { sim, palette, variation, coreRadius, bandUnit } = buildFromConfig(rockyConfig({
      liquidState: 'liquid',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const colorAttr = hexMesh.geometry.getAttribute('color') as THREE.BufferAttribute

    // The shell built itself with `topElevation = sim.seaLevelElevation`,
    // so calling setSeaLevel with the matching world radius must not flip
    // any tile and must not bump the colour buffer version.
    const equivalentRadius = coreRadius + sim.seaLevelElevation * bandUnit
    const versionBefore = colorAttr.version
    mesh.setSeaLevel(equivalentRadius)
    expect(colorAttr.version).toBe(versionBefore)
    mesh.dispose()
  })

  it('setSeaLevel round-trip restores the exact same colour buffer', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({
      liquidState: 'liquid',
    }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const hexMesh = mesh.group.children[0] as THREE.Mesh
    const colorAttr = hexMesh.geometry.getAttribute('color') as THREE.BufferAttribute
    const liquid = mesh.group.children[1] as THREE.Mesh
    const initialRadius = liquid.scale.x

    const initial = Float32Array.from(colorAttr.array as Float32Array)

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

  it('setVisible toggles the entire mesh group on and off', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig())
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const hexMesh = mesh.group.children[0] as THREE.Mesh
    expect(hexMesh.visible).toBe(true)
    mesh.setVisible(false)
    expect(hexMesh.visible).toBe(false)
    mesh.setVisible(true)
    expect(hexMesh.visible).toBe(true)
    mesh.dispose()
  })

  it('getRaycastState returns the mesh + faceToTileId + coreRadius', () => {
    const { sim, palette, variation } = buildFromConfig(rockyConfig({ coreRadiusRatio: 0.4 }))
    const mesh = buildLayeredInteractiveMesh(sim, palette, variation, testOptions())
    const state = mesh.getRaycastState()
    expect(state.mesh).toBe(mesh.group.children[0])
    expect(state.faceToTileId).toBe(mesh.faceToTileId)
    expect(state.coreRadius).toBeCloseTo(sim.config.radius * 0.4, 5)
    mesh.dispose()
  })
})
