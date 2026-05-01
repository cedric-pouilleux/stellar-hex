import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildHoverCursor, type HoverCursorPorts } from './buildHoverCursor'
import { createHoverChannel } from '../state/hoverState'
import type { Tile } from '../../geometry/hexasphere.types'

/**
 * Minimal tile factory — a planar hex with a centerPoint at radius 1
 * along +X. Sufficient for the cursor's geometry pipeline (it only
 * needs a tile + a centerPoint to scale radially).
 */
function makeTile(id: number): Tile {
  const boundary = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    boundary.push({ x: 1, y: Math.cos(a) * 0.1, z: Math.sin(a) * 0.1 })
  }
  return { id, centerPoint: { x: 1, y: 0, z: 0 }, boundary, isPentagon: false }
}

function makePorts(opts: {
  bodyRadius?: number
  capRadius?:  number
  floorRadius?: number
  liquid?:     boolean
  atmo?:       boolean
  isCoreWindow?: boolean
} = {}): HoverCursorPorts {
  const tile  = makeTile(0)
  const cap   = opts.capRadius   ?? 1.0
  const floor = opts.floorRadius ?? 0.5
  const layer = {
    getTile:        (id: number) => (id === 0 ? tile : null),
    getCapRadius:   () => cap,
    getFloorRadius: () => floor,
  }
  return {
    group:        new THREE.Group(),
    bodyRadius:   opts.bodyRadius ?? 1,
    hoverChannel: createHoverChannel(),
    sol:          layer,
    liquid:       opts.liquid
      ? { ...layer, isCoreWindow: () => opts.isCoreWindow ?? false }
      : null,
    atmo:         opts.atmo ? layer : null,
  }
}

describe('buildHoverCursor', () => {
  it('mounts cap + floor rings + the emissive light by default', () => {
    const ports  = makePorts()
    const cursor = buildHoverCursor(undefined, ports)
    // Two ring meshes (cap + seabed twin) + the emissive light.
    const meshCount  = ports.group.children.filter(o => o.type === 'Mesh').length
    const lightCount = ports.group.children.filter(o => o.type === 'PointLight').length
    expect(meshCount).toBe(2)
    expect(lightCount).toBe(1)
    cursor.dispose()
  })

  it('config: ring/floorRing/emissive=false skip their primitives entirely', () => {
    const ports = makePorts()
    buildHoverCursor(
      { ring: false, floorRing: false, emissive: false },
      ports,
    )
    expect(ports.group.children.find(o => o.type === 'Mesh')).toBeUndefined()
    expect(ports.group.children.find(o => o.type === 'PointLight')).toBeUndefined()
  })

  it('setBoardTile(sol) shows cap ring + hides the floor ring + keeps the emissive halo dark', () => {
    const ports  = makePorts({ capRadius: 0.8 })
    const cursor = buildHoverCursor(undefined, ports)
    cursor.setBoardTile({ layer: 'sol', tileId: 0 })
    const rings = ports.group.children.filter(o => o.type === 'Mesh') as THREE.Mesh[]
    const light = ports.group.children.find(o => o.type === 'PointLight') as THREE.PointLight
    const visible = rings.filter(r => r.visible)
    expect(visible.length).toBe(1) // cap only — sol has no floor twin
    // Sol hovers don't bleed an emissive halo onto neighbour terrain —
    // playable surface view is already flat-lit.
    expect(light.visible).toBe(false)
    cursor.dispose()
  })

  it('setBoardTile(liquid) shows BOTH rings (waterline cap + seabed twin)', () => {
    const ports  = makePorts({ capRadius: 1.2, floorRadius: 0.7, liquid: true })
    const cursor = buildHoverCursor(undefined, ports)
    cursor.setBoardTile({ layer: 'liquid', tileId: 0 })
    const rings = ports.group.children.filter(o => o.type === 'Mesh') as THREE.Mesh[]
    expect(rings.length).toBe(2)
    expect(rings.filter(r => r.visible).length).toBe(2)
    cursor.dispose()
  })

  it('setBoardTile(liquid) dims the FLOOR ring opacity to 0.20 (seabed reads as a hint)', () => {
    const ports  = makePorts({ liquid: true })
    const cursor = buildHoverCursor(undefined, ports)
    cursor.setBoardTile({ layer: 'liquid', tileId: 0 })
    const rings = ports.group.children.filter(o => o.type === 'Mesh') as THREE.Mesh[]
    // Cap ring is constructed first — floor ring is the second mesh.
    const floorRing = rings[1]
    const mat = floorRing.material as THREE.MeshBasicMaterial
    expect(mat.opacity).toBeCloseTo(0.20, 5)
    cursor.dispose()
  })

  it('setBoardTile(liquid) keeps the cap ring at the configured opacity / colour', () => {
    const ports  = makePorts({ liquid: true })
    const cursor = buildHoverCursor(
      { ring: { color: 0x00ff88, opacity: 0.9 } },
      ports,
    )
    cursor.setBoardTile({ layer: 'liquid', tileId: 0 })
    const rings = ports.group.children.filter(o => o.type === 'Mesh') as THREE.Mesh[]
    const capMat = rings[0].material as THREE.MeshBasicMaterial
    // Cap ring is never auto-overridden by the liquid layer — only the
    // seabed twin (floorRing) carries the runtime override.
    expect(capMat.opacity).toBeCloseTo(0.9, 5)
    expect(capMat.color.getHex()).toBe(0x00ff88)
    cursor.dispose()
  })

  it('setBoardTile(liquid) on a core window paints the FLOOR ring red as a no-floor warning', () => {
    const ports  = makePorts({ liquid: true, isCoreWindow: true })
    const cursor = buildHoverCursor(undefined, ports)
    cursor.setBoardTile({ layer: 'liquid', tileId: 0 })
    const rings = ports.group.children.filter(o => o.type === 'Mesh') as THREE.Mesh[]
    const floorRing = rings[1]
    const mat = floorRing.material as THREE.MeshBasicMaterial
    // Red warning tint — same value as CORE_WINDOW_FLOOR_RING_COLOR.
    expect(mat.color.getHex()).toBe(0xff2200)
    cursor.dispose()
  })

  it('setBoardTile(null) hides every ring and the light', () => {
    const ports  = makePorts({ liquid: true })
    const cursor = buildHoverCursor(undefined, ports)
    cursor.setBoardTile({ layer: 'liquid', tileId: 0 })
    cursor.setBoardTile(null)
    const rings = ports.group.children.filter(o => o.type === 'Mesh') as THREE.Mesh[]
    const light = ports.group.children.find(o => o.type === 'PointLight') as THREE.PointLight
    expect(rings.every(r => !r.visible)).toBe(true)
    expect(light.visible).toBe(false)
    expect(rings.length).toBe(2)
    cursor.dispose()
  })

  it('onHoverChange fires only on sol-tile id changes', () => {
    const ports  = makePorts({ liquid: true })
    const cursor = buildHoverCursor(undefined, ports)
    const seen: (number | null)[] = []
    cursor.onHoverChange(id => seen.push(id))

    cursor.setBoardTile({ layer: 'sol', tileId: 0 })
    cursor.setBoardTile({ layer: 'liquid', tileId: 0 }) // sol id changes to null
    cursor.setBoardTile({ layer: 'sol', tileId: 0 })    // back to sol
    cursor.setBoardTile(null)                            // clear

    expect(seen).toEqual([0, null, 0, null])
    cursor.dispose()
  })

  it('ring color reflects the resolved config', () => {
    const ports  = makePorts()
    buildHoverCursor({ ring: { color: 0xff0000 } }, ports)
    const ring = ports.group.children.find(o => o.type === 'Mesh') as THREE.Mesh
    const mat  = ring.material as THREE.MeshBasicMaterial
    expect(mat.color.r).toBeCloseTo(1, 5)
    expect(mat.color.g).toBeCloseTo(0, 5)
    expect(mat.color.b).toBeCloseTo(0, 5)
  })

  it('emissive intensity / color / size flow into the PointLight', () => {
    const ports  = makePorts({ bodyRadius: 2 })
    buildHoverCursor({
      emissive: { color: 0x00ff00, intensity: 5, size: 1.2 },
    }, ports)
    const light = ports.group.children.find(o => o.type === 'PointLight') as THREE.PointLight
    expect(light.intensity).toBe(5)
    expect(light.distance).toBeCloseTo(1.2, 5)
    expect(light.color.g).toBeCloseTo(1, 5)
  })
})
