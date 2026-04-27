import {
  buildNeighborMap,
  type BodyConfig,
  type Tile,
} from '@lib'

/** Inputs for a single dig action. */
export interface DigOptions {
  /** Bands removed from the central tile. Adjacent rings drop linearly. */
  centerDrop: number
  /**
   * Reach of the effect in neighbour-rings. `0` only mutates the central
   * tile, `1` adds direct neighbours, `2` adds the next ring, etc.
   */
  radius:     number
}

/**
 * Minimal adapter required by the digger — reads the current elevation of
 * a tile and writes the new one.
 *
 * The digger used to mutate `sim.tileStates` in place and call
 * `updateTileSolHeight` itself; responsibility now sits with a gameplay
 * state layer (e.g. `GameBodyState`) that owns the mutable current
 * elevation and forwards changes to the mesh. This keeps the digger free
 * of persistence / override concerns.
 */
export interface DigBodyHandle {
  config: BodyConfig
  sim:    {
    tiles: readonly Tile[]
  }
  /** Returns the current elevation band of a tile, or undefined for unknown ids. */
  getElevation: (tileId: number) => number | undefined
  /** Writes the new elevation band; the adapter is responsible for mesh propagation. */
  setElevation: (tileId: number, newElevation: number) => void
}

/**
 * Turns a tile pick into a localised height drop. The effect is shaped as
 * a cone — the deepest cell is the one the user clicked, and adjacent
 * rings lose progressively less, following:
 *
 *   `drop(ring) = max(0, centerDrop - ring)`
 *
 * BFS walks the neighbour graph ring by ring. Each touched tile has its
 * elevation lowered via the injected adapter (clamped to band 0); the
 * adapter is in charge of GPU upload batching if any — a well-written
 * `setElevation` collects updates per frame rather than firing one
 * `updateTileSolHeight` per tile.
 *
 * @param body - Adapter exposing the simulation tiles and the
 *               `getElevation` / `setElevation` access to the current state.
 * @returns `dig(tileId, options)`. Returns the set of tile ids whose
 *          elevation actually changed (so callers can refresh derived
 *          state — tooltips, biome panels…).
 */
export function useTileDig(body: DigBodyHandle): {
  dig: (tileId: number, options: DigOptions) => Set<number>
} {
  const neighborMap = buildNeighborMap(body.sim.tiles)

  function dig(tileId: number, options: DigOptions): Set<number> {
    const touched = new Set<number>()
    if (body.getElevation(tileId) === undefined) return touched
    if (options.radius < 0)                       return touched

    const visited = new Set<number>([tileId])
    let frontier: number[] = [tileId]

    for (let ring = 0; ring <= options.radius; ring++) {
      const drop = options.centerDrop - ring
      if (drop <= 0) break

      for (const id of frontier) {
        const current = body.getElevation(id)
        if (current === undefined) continue
        const newElev = Math.max(0, current - drop)
        if (newElev === current) continue
        body.setElevation(id, newElev)
        touched.add(id)
      }

      if (ring === options.radius) break
      const next: number[] = []
      for (const id of frontier) {
        for (const peer of neighborMap.get(id) ?? []) {
          if (visited.has(peer)) continue
          visited.add(peer)
          next.push(peer)
        }
      }
      frontier = next
    }

    return touched
  }

  return { dig }
}
