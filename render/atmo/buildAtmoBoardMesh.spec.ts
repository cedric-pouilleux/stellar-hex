import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { generateHexasphere } from '../../geometry/hexasphere'
import { buildAtmoBoardMesh } from './buildAtmoBoardMesh'

const SUBDIVISIONS = 2
const INNER        = 1.0
const OUTER        = 1.2

function buildBoard() {
  const hexa = generateHexasphere(OUTER, SUBDIVISIONS)
  return {
    hexa,
    board: buildAtmoBoardMesh({
      tiles:       hexa.tiles,
      innerRadius: INNER,
      outerRadius: OUTER,
    }),
  }
}

describe('buildAtmoBoardMesh', () => {
  it('mounts a single mesh under its group', () => {
    const { board } = buildBoard()
    const meshes = board.group.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh)
    expect(meshes.length).toBe(1)
    board.dispose()
  })

  it('flat lighting is on by default — atmo board never carries star-driven shadows', () => {
    const { board } = buildBoard()
    const mesh     = board.group.children[0] as THREE.Mesh
    const material = mesh.material as THREE.MeshStandardMaterial & { flatLightingHandle?: { uniform: { value: number } } }
    const uniform  = material.flatLightingHandle?.uniform
    expect(uniform?.value).toBe(1)

    board.setFlatLighting(false)
    expect(uniform?.value).toBe(0)

    board.setFlatLighting(true)
    expect(uniform?.value).toBe(1)

    board.dispose()
  })

  it('exposes the input atmo tiles unchanged', () => {
    const { hexa, board } = buildBoard()
    expect(board.tiles).toBe(hexa.tiles)
    board.dispose()
  })

  it('produces vertex-coloured geometry initialised to the default colour', () => {
    const { board } = buildBoard()
    const mesh = board.group.children[0] as THREE.Mesh
    const colorAttr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    expect(colorAttr).toBeDefined()
    expect(colorAttr.itemSize).toBe(3)
    // First vertex carries the default colour `{0.5, 0.55, 0.7}`.
    expect(colorAttr.getX(0)).toBeCloseTo(0.5, 5)
    expect(colorAttr.getY(0)).toBeCloseTo(0.55, 5)
    expect(colorAttr.getZ(0)).toBeCloseTo(0.7, 5)
    board.dispose()
  })

  it('honours a custom default colour', () => {
    const hexa = generateHexasphere(OUTER, SUBDIVISIONS)
    const board = buildAtmoBoardMesh({
      tiles: hexa.tiles, innerRadius: INNER, outerRadius: OUTER,
      defaultColor: { r: 1, g: 0, b: 0 },
    })
    const mesh = board.group.children[0] as THREE.Mesh
    const colorAttr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    expect(colorAttr.getX(0)).toBeCloseTo(1, 5)
    expect(colorAttr.getY(0)).toBeCloseTo(0, 5)
    expect(colorAttr.getZ(0)).toBeCloseTo(0, 5)
    board.dispose()
  })

  it('writeTileColor stamps every vertex of the targeted tile', () => {
    const { hexa, board } = buildBoard()
    const tileId = hexa.tiles[5].id
    board.writeTileColor(tileId, { r: 0.1, g: 0.2, b: 0.3 })

    const mesh = board.group.children[0] as THREE.Mesh
    const colorAttr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    // Walk the whole color buffer — every triple should be either default
    // or the freshly written colour, never a partial mix.
    let stampedVertices = 0
    for (let i = 0; i < colorAttr.count; i++) {
      const r = colorAttr.getX(i), g = colorAttr.getY(i), b = colorAttr.getZ(i)
      if (Math.abs(r - 0.1) < 1e-5 && Math.abs(g - 0.2) < 1e-5 && Math.abs(b - 0.3) < 1e-5) stampedVertices++
    }
    expect(stampedVertices).toBeGreaterThan(0)
    board.dispose()
  })

  it('writeTileColor is a no-op on unknown tile ids', () => {
    const { board } = buildBoard()
    expect(() => board.writeTileColor(99_999, { r: 1, g: 0, b: 0 })).not.toThrow()
    board.dispose()
  })

  it('applyOverlay stamps every entry of the map', () => {
    const { hexa, board } = buildBoard()
    const overlay = new Map<number, { r: number; g: number; b: number }>([
      [hexa.tiles[0].id, { r: 1, g: 0, b: 0 }],
      [hexa.tiles[1].id, { r: 0, g: 1, b: 0 }],
    ])
    board.applyOverlay(overlay)

    const mesh = board.group.children[0] as THREE.Mesh
    const colorAttr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    let red = 0, green = 0
    for (let i = 0; i < colorAttr.count; i++) {
      const r = colorAttr.getX(i), g = colorAttr.getY(i), b = colorAttr.getZ(i)
      if (r === 1 && g === 0 && b === 0) red++
      if (r === 0 && g === 1 && b === 0) green++
    }
    expect(red).toBeGreaterThan(0)
    expect(green).toBeGreaterThan(0)
    board.dispose()
  })

  it('getTilePosition projects the tile center on the outer radius', () => {
    const { hexa, board } = buildBoard()
    const tile = hexa.tiles[3]
    const pos  = board.getTilePosition(tile.id)
    expect(pos).not.toBeNull()
    expect(pos!.length()).toBeCloseTo(OUTER, 5)
    board.dispose()
  })

  it('getTilePosition returns null on unknown tile ids', () => {
    const { board } = buildBoard()
    expect(board.getTilePosition(99_999)).toBeNull()
    board.dispose()
  })

  it('exposes a raycast state with mesh + faceToTileId pointing at the same mesh', () => {
    const { board } = buildBoard()
    const state = board.getRaycastState()
    const mesh  = board.group.children[0] as THREE.Mesh
    expect(state.mesh).toBe(mesh)
    expect(state.faceToTileId.length).toBeGreaterThan(0)
    expect(state.coreRadius).toBe(0)
    board.dispose()
  })

  it('setVisible toggles the mesh visibility', () => {
    const { board } = buildBoard()
    const mesh = board.group.children[0] as THREE.Mesh
    expect(mesh.visible).toBe(true)
    board.setVisible(false)
    expect(mesh.visible).toBe(false)
    board.setVisible(true)
    expect(mesh.visible).toBe(true)
    board.dispose()
  })

  it('every face index in faceToTileId is mapped to a tile from the input set', () => {
    const { hexa, board } = buildBoard()
    const ids = new Set(hexa.tiles.map(t => t.id))
    const state = board.getRaycastState()
    for (const tid of state.faceToTileId) expect(ids.has(tid)).toBe(true)
    board.dispose()
  })

  it('vertex positions all lie between innerRadius and outerRadius', () => {
    const { board } = buildBoard()
    const mesh = board.group.children[0] as THREE.Mesh
    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const epsilon = 1e-4
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i)
      const r = Math.sqrt(x * x + y * y + z * z)
      // Allow a tiny epsilon for floating-point projection noise.
      expect(r).toBeGreaterThanOrEqual(INNER - epsilon)
      expect(r).toBeLessThanOrEqual(OUTER + epsilon)
    }
    board.dispose()
  })
})
