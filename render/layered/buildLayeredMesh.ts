import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Tile } from '../../geometry/hexasphere.types'
import { buildLayeredPrismGeometry, type PrismRange } from './buildLayeredPrism'

/**
 * Per-tile vertex range in the merged sol buffer — `[start, count)` in
 * global vertex indices (into the merged mesh) so raycast handlers can
 * map a face → tileId in O(1).
 */
export type LayeredTileRange = PrismRange

/**
 * Callback resolving the initial sol height of a tile in world units.
 * The returned value is clamped into `[0, shellThickness]` by the caller.
 */
export type SolHeightFn = (tile: Tile) => number

/**
 * Output of {@link buildLayeredMergedGeometry}: a single merged non-indexed
 * buffer covering every tile's sol prism.
 */
export interface LayeredMergedGeometry {
  /** Merged geometry with `position`, `normal`, `aSolHeight` attributes. */
  geometry:       THREE.BufferGeometry
  /** Face index (i / 3) → tile id. */
  faceToTileId:   number[]
  /** Per-tile vertex ranges in the merged buffer. */
  tileRange:      Map<number, LayeredTileRange>
  /** `solOuterRadius - coreRadius` — exposed so shaders can normalise heights. */
  shellThickness: number
}

/**
 * Builds the merged single-band hex-prism geometry for every tile.
 *
 * Each tile contributes a sol prism between `coreRadius` and
 * `coreRadius + solHeight` where `solHeight` is produced by
 * `solHeightFn` and clamped into `[0, shellThickness]` (with
 * `shellThickness = solOuterRadius - coreRadius`).
 *
 * @param tiles            - All hexasphere tiles to include.
 * @param coreRadius       - World-space radius of the inner core sphere.
 * @param solOuterRadius   - World-space radius of the sol surface.
 * @param solHeightFn      - Per-tile sol height resolver.
 */
export function buildLayeredMergedGeometry(
  tiles:            readonly Tile[],
  coreRadius:       number,
  solOuterRadius:   number,
  solHeightFn:      SolHeightFn,
): LayeredMergedGeometry {
  const shellThickness = Math.max(0, solOuterRadius - coreRadius)

  const pieces:       THREE.BufferGeometry[] = []
  const faceToTileId: number[]               = []
  const tileRange     = new Map<number, LayeredTileRange>()

  let vertexOffset = 0

  for (const tile of tiles) {
    const rawH = solHeightFn(tile)
    const solH = Math.max(0, Math.min(shellThickness, rawH))
    const { geometry, range } = buildLayeredPrismGeometry(tile, coreRadius, solH, shellThickness)

    const faceCount = range.count / 3
    for (let f = 0; f < faceCount; f++) faceToTileId.push(tile.id)

    tileRange.set(tile.id, { start: vertexOffset + range.start, count: range.count })
    vertexOffset += range.count
    pieces.push(geometry)
  }

  const merged = mergeGeometries(pieces)
  pieces.forEach(g => g.dispose())

  return {
    geometry:       merged,
    faceToTileId,
    tileRange,
    shellThickness,
  }
}
