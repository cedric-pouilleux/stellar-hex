import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Tile } from '../../geometry/hexasphere.types'
import { buildLayeredPrismGeometry } from './buildLayeredPrism'

/**
 * Per-tile vertex range in the merged layered buffer. Mirrors the
 * {@link LayerRanges} produced by {@link buildLayeredPrismGeometry}, but
 * expressed in global vertex indices (into the merged mesh) so raycast
 * handlers can map a face → (tileId, layer) in O(1).
 */
export interface LayeredTileRange {
  sol:  { start: number; count: number }
  atmo: { start: number; count: number }
}

/**
 * Callback resolving the initial sol height of a tile in world units.
 * Callers may hand-craft this from a palette elevation, a physics model or
 * any caller-side data — the mesh builder is agnostic of the source, it
 * only clamps the returned value into `[0, totalThickness]`.
 */
export type SolHeightFn = (tile: Tile) => number

/**
 * Output of {@link buildLayeredMergedGeometry}: a single merged
 * non-indexed buffer covering every tile's two-layer prism stack.
 */
export interface LayeredMergedGeometry {
  /** Merged geometry with `position`, `normal`, `aLayer`, `aSolHeight` attributes. */
  geometry:     THREE.BufferGeometry
  /** Face index (i / 3) → tile id. Covers both layers. */
  faceToTileId: number[]
  /** Face index (i / 3) → layer tag (0 sol, 1 atmo). Pairs with `faceToTileId`. */
  faceToLayer:  (0 | 1)[]
  /** Per-tile vertex ranges in the merged buffer. */
  tileRange:    Map<number, LayeredTileRange>
  /** `surfaceRadius - coreRadius` — exposed so shaders can derive atmo thickness from `aSolHeight`. */
  totalThickness: number
}

/**
 * Builds the merged two-layer hex-prism geometry for every tile.
 *
 * Each tile contributes a sol prism (between `coreRadius` and
 * `coreRadius + solHeight`) plus an atmo prism (between
 * `coreRadius + solHeight` and `surfaceRadius`). The per-tile
 * `solHeight` is produced by `solHeightFn` and clamped into
 * `[0, totalThickness]` where `totalThickness = surfaceRadius - coreRadius`.
 *
 * The returned `faceToTileId` / `faceToLayer` pair lets a raycast handler
 * resolve `(tileId, layer)` from a face index in O(1). Callers that want
 * to raycast a single layer can build two sub-meshes by slicing the shared
 * geometry with the per-tile ranges.
 *
 * @param tiles         - All hexasphere tiles to include in the merge.
 * @param coreRadius    - World-space radius of the inner core sphere.
 * @param surfaceRadius - World-space radius of the outer shell surface.
 * @param solHeightFn   - Callback producing the initial sol height per tile.
 */
export function buildLayeredMergedGeometry(
  tiles:         readonly Tile[],
  coreRadius:    number,
  surfaceRadius: number,
  solHeightFn:   SolHeightFn,
): LayeredMergedGeometry {
  const totalThickness = Math.max(0, surfaceRadius - coreRadius)

  const pieces:       THREE.BufferGeometry[] = []
  const faceToTileId: number[]               = []
  const faceToLayer:  (0 | 1)[]              = []
  const tileRange     = new Map<number, LayeredTileRange>()

  let vertexOffset = 0

  for (const tile of tiles) {
    const rawH = solHeightFn(tile)
    const solH = Math.max(0, Math.min(totalThickness, rawH))
    const { geometry, ranges } = buildLayeredPrismGeometry(tile, coreRadius, solH, totalThickness)

    // Record per-layer face contributions *before* merging — faces stay
    // contiguous per-tile-per-layer in the merged buffer, so we only need to
    // count them here and append tile ids / layer tags in order.
    const solFaces  = ranges.sol.count  / 3
    const atmoFaces = ranges.atmo.count / 3
    for (let f = 0; f < solFaces;  f++) { faceToTileId.push(tile.id); faceToLayer.push(0) }
    for (let f = 0; f < atmoFaces; f++) { faceToTileId.push(tile.id); faceToLayer.push(1) }

    tileRange.set(tile.id, {
      sol:  { start: vertexOffset + ranges.sol.start,  count: ranges.sol.count  },
      atmo: { start: vertexOffset + ranges.atmo.start, count: ranges.atmo.count },
    })
    vertexOffset += ranges.sol.count + ranges.atmo.count
    pieces.push(geometry)
  }

  const merged = mergeGeometries(pieces)
  pieces.forEach(g => g.dispose())

  return {
    geometry:       merged,
    faceToTileId,
    faceToLayer,
    tileRange,
    totalThickness,
  }
}
