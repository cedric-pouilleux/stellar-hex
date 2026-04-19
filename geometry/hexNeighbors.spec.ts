import { describe, it, expect } from 'vitest'
import { generateHexasphere }    from './hexasphere'
import { buildNeighborMap, getNeighbors } from './hexNeighbors'

describe('buildNeighborMap', () => {
  const { tiles } = generateHexasphere(1, 3)

  it('builds a map entry for every tile', () => {
    const map = buildNeighborMap(tiles)
    expect(map.size).toBe(tiles.length)
  })

  it('hexagonal tiles have exactly 6 neighbours', () => {
    const map     = buildNeighborMap(tiles)
    const hexTile = tiles.find(t => !t.isPentagon)!
    expect(getNeighbors(hexTile.id, map)).toHaveLength(6)
  })

  it('pentagonal tiles have exactly 5 neighbours', () => {
    const map     = buildNeighborMap(tiles)
    const penTile = tiles.find(t => t.isPentagon)!
    expect(getNeighbors(penTile.id, map)).toHaveLength(5)
  })

  it('neighbour relationship is symmetric', () => {
    const map = buildNeighborMap(tiles)
    for (const tile of tiles.slice(0, 20)) {
      for (const neighbourId of getNeighbors(tile.id, map)) {
        expect(getNeighbors(neighbourId, map)).toContain(tile.id)
      }
    }
  })

  it('returns empty array for unknown tileId', () => {
    const map = buildNeighborMap(tiles)
    expect(getNeighbors(999_999, map)).toEqual([])
  })
})
