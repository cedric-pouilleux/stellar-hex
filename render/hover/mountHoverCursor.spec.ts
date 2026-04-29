import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { mountHoverCursor } from './mountHoverCursor'
import type { HoverCursorPorts } from './buildHoverCursor'
import { createHoverChannel } from '../state/hoverState'
import type { Tile } from '../../geometry/hexasphere.types'

function makeTile(id: number): Tile {
  const boundary = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    boundary.push({ x: 1, y: Math.cos(a) * 0.1, z: Math.sin(a) * 0.1 })
  }
  return { id, centerPoint: { x: 1, y: 0, z: 0 }, boundary, isPentagon: false }
}

function makePorts(): HoverCursorPorts {
  const tile = makeTile(0)
  const layer = {
    getTile:        (id: number) => (id === 0 ? tile : null),
    getCapRadius:   () => 1,
    getFloorRadius: () => 0.5,
  }
  return {
    group:        new THREE.Group(),
    bodyRadius:   1,
    hoverChannel: createHoverChannel(),
    sol:          layer,
    liquid:       { ...layer, isCoreWindow: () => false },
    atmo:         null,
  }
}

describe('mountHoverCursor', () => {
  it('back-compat: a single `hoverCursor` is wrapped into a default preset', () => {
    const ports = makePorts()
    const m = mountHoverCursor(
      { hoverCursor: { ring: { color: 0xff0000 } } },
      ports,
    )
    // The default preset is applied at construction — the ring material
    // carries the configured color.
    const ring = ports.group.children.find(o => o.type === 'Mesh') as THREE.Mesh
    const mat  = ring.material as THREE.MeshBasicMaterial
    expect(mat.color.r).toBeCloseTo(1, 5)
    // Calling `useCursor('default')` is valid and a no-op visually.
    expect(() => m.useCursor('default')).not.toThrow()
  })

  it('hoverCursors registers multiple presets, useCursor swaps live', () => {
    const ports = makePorts()
    const m = mountHoverCursor({
      hoverCursors: {
        peace:  { ring: { color: 0xffffff } },
        attack: { ring: { color: 0xff0000 } },
      },
    }, ports)

    const ring = ports.group.children.find(o => o.type === 'Mesh') as THREE.Mesh
    const mat  = ring.material as THREE.MeshBasicMaterial
    // First key wins by default — `peace` is white.
    expect(mat.color.r).toBeCloseTo(1, 5)
    expect(mat.color.g).toBeCloseTo(1, 5)

    m.useCursor('attack')
    expect(mat.color.r).toBeCloseTo(1, 5)
    expect(mat.color.g).toBeCloseTo(0, 5)
  })

  it('defaultCursor selects the initial preset by name', () => {
    const ports = makePorts()
    mountHoverCursor({
      hoverCursors: {
        peace:  { ring: { color: 0xffffff } },
        attack: { ring: { color: 0xff0000 } },
      },
      defaultCursor: 'attack',
    }, ports)

    const ring = ports.group.children.find(o => o.type === 'Mesh') as THREE.Mesh
    const mat  = ring.material as THREE.MeshBasicMaterial
    expect(mat.color.r).toBeCloseTo(1, 5)
    expect(mat.color.g).toBeCloseTo(0, 5)
  })

  it('union allocates every primitive used by any preset', () => {
    const ports = makePorts()
    // `peace` doesn't mention column. `build` does. The union builds the
    // column resource so `useCursor('build')` can show it.
    const m = mountHoverCursor({
      hoverCursors: {
        peace: { column: false },
        build: { column: { color: 0x00ff00 } },
      },
    }, ports)

    // Switch to `build` and trigger a liquid hover — column should mount.
    m.cursor.setBoardTile({ layer: 'liquid', tileId: 0 })
    let meshes = ports.group.children.filter(o => o.type === 'Mesh')
    expect(meshes.length).toBe(2) // 2 rings, no column (peace is active by default)

    m.useCursor('build')
    m.cursor.refresh()
    meshes = ports.group.children.filter(o => o.type === 'Mesh')
    expect(meshes.length).toBe(3) // 2 rings + column
  })

  it('useCursor throws on unknown preset names', () => {
    const ports = makePorts()
    const m = mountHoverCursor({
      hoverCursors: { peace: {} },
    }, ports)
    expect(() => m.useCursor('attack')).toThrow(/Unknown hover cursor preset/)
  })

  it('throws when defaultCursor names an unregistered preset', () => {
    const ports = makePorts()
    expect(() => mountHoverCursor({
      hoverCursors: { peace: {} },
      defaultCursor: 'attack',
    }, ports)).toThrow(/Unknown defaultCursor/)
  })
})
