import type { Tile } from './hexasphere.types'

// ── Point key helper ──────────────────────────────────────────────

/**
 * Stable string key for a boundary point.
 * Matches the precision used in hexasphere.ts pointKey().
 */
function boundaryKey(x: number, y: number, z: number): string {
  return `${Math.round(x * 1_000_000)},${Math.round(y * 1_000_000)},${Math.round(z * 1_000_000)}`
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Pre-computes a neighbour map for all tiles on a hexasphere.
 *
 * Two tiles are neighbours if they share an edge, i.e. at least 2 boundary
 * points with identical coordinates (within 1e-6 precision). This works
 * natively with pentagon tiles (5 edges) and avoids any icosahedron-face
 * bookkeeping.
 *
 * Call once per planet load — O(n * avg_boundary) where n = tile count.
 *
 * @param tiles - All tiles from HexasphereData.
 * @returns Map from tileId to the array of neighbour tileIds.
 */
export function buildNeighborMap(tiles: readonly Tile[]): Map<number, number[]> {
  // Step 1 : index every boundary point → [tileId, ...]
  const pointToTiles = new Map<string, number[]>()

  for (const tile of tiles) {
    for (const p of tile.boundary) {
      const key = boundaryKey(p.x, p.y, p.z)
      let list = pointToTiles.get(key)
      if (!list) {
        list = []
        pointToTiles.set(key, list)
      }
      list.push(tile.id)
    }
  }

  // Step 2 : for each tile, collect tiles sharing ≥ 2 boundary points
  const neighborMap = new Map<number, number[]>()

  for (const tile of tiles) {
    // Count shared boundary points per candidate neighbour
    const sharedCount = new Map<number, number>()

    for (const p of tile.boundary) {
      const key   = boundaryKey(p.x, p.y, p.z)
      const peers = pointToTiles.get(key) ?? []
      for (const peerId of peers) {
        if (peerId === tile.id) continue
        sharedCount.set(peerId, (sharedCount.get(peerId) ?? 0) + 1)
      }
    }

    // A shared edge = 2 identical boundary points
    const neighbours: number[] = []
    for (const [peerId, count] of sharedCount) {
      if (count >= 2) neighbours.push(peerId)
    }

    neighborMap.set(tile.id, neighbours)
  }

  return neighborMap
}

/**
 * Returns the direct neighbour tile ids for a given tile.
 *
 * @param tileId      - Source tile id.
 * @param neighborMap - Pre-computed map from buildNeighborMap().
 * @returns Array of neighbour tile ids (5 for pentagons, 6 for hexagons).
 */
export function getNeighbors(tileId: number, neighborMap: Map<number, number[]>): number[] {
  return neighborMap.get(tileId) ?? []
}
