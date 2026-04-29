import { describe, it, expect } from 'vitest'
import { buildLayeredMergedGeometry } from './buildLayeredMesh'
import { generateHexasphere } from '../../geometry/hexasphere'

const SUBDIVISIONS = 2
const RADIUS       = 1.2
const CORE_RADIUS  = 0.6

describe('buildLayeredMergedGeometry', () => {
  it('emits one face → tile mapping per merged triangle', () => {
    const hexa = generateHexasphere(RADIUS, SUBDIVISIONS)
    const merged = buildLayeredMergedGeometry(hexa.tiles, CORE_RADIUS, RADIUS, () => 0.3)
    const faceCount = merged.geometry.getAttribute('position').count / 3
    expect(merged.faceToTileId.length).toBe(faceCount)
    merged.geometry.dispose()
  })

  it('every face maps to a tile from the input set', () => {
    const hexa = generateHexasphere(RADIUS, SUBDIVISIONS)
    const ids = new Set(hexa.tiles.map(t => t.id))
    const merged = buildLayeredMergedGeometry(hexa.tiles, CORE_RADIUS, RADIUS, () => 0.3)
    for (const tid of merged.faceToTileId) expect(ids.has(tid)).toBe(true)
    merged.geometry.dispose()
  })

  it('tileRange covers every tile and the spans are non-overlapping', () => {
    const hexa = generateHexasphere(RADIUS, SUBDIVISIONS)
    const merged = buildLayeredMergedGeometry(hexa.tiles, CORE_RADIUS, RADIUS, () => 0.3)
    const ranges = Array.from(merged.tileRange.values()).sort((a, b) => a.start - b.start)
    expect(ranges.length).toBe(hexa.tiles.length)
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].start).toBe(ranges[i - 1].start + ranges[i - 1].count)
    }
    const totalVerts = ranges.reduce((s, r) => s + r.count, 0)
    expect(totalVerts).toBe(merged.geometry.getAttribute('position').count)
    merged.geometry.dispose()
  })

  it('shellThickness equals solOuterRadius - coreRadius', () => {
    const hexa = generateHexasphere(RADIUS, SUBDIVISIONS)
    const merged = buildLayeredMergedGeometry(hexa.tiles, CORE_RADIUS, RADIUS, () => 0.3)
    expect(merged.shellThickness).toBeCloseTo(RADIUS - CORE_RADIUS, 6)
    merged.geometry.dispose()
  })

  it('clamps tile sol heights via the shellThickness ceiling', () => {
    const hexa = generateHexasphere(RADIUS, SUBDIVISIONS)
    // Request height way above the shell — geometry must still cap at
    // `coreRadius + shellThickness = solOuterRadius`.
    const merged = buildLayeredMergedGeometry(hexa.tiles, CORE_RADIUS, RADIUS, () => 999)
    const pos = merged.geometry.getAttribute('position').array as Float32Array
    const epsilon = 1e-4
    let maxR = 0
    for (let v = 0; v < pos.length / 3; v++) {
      const i = v * 3
      const r = Math.sqrt(pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2)
      if (r > maxR) maxR = r
    }
    expect(maxR).toBeLessThanOrEqual(RADIUS + epsilon)
    merged.geometry.dispose()
  })
})
