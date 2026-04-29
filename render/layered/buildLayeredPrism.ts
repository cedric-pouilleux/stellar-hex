/**
 * Single-band hex prism geometry — one closed prism per tile, spanning the
 * radial slice `[coreRadius, coreRadius + solHeight]`.
 *
 * The atmosphere shell used to ride above the sol prism in the same merged
 * geometry; that legacy two-band layout has been replaced by a dedicated
 * atmosphere board mesh built from its own hexasphere (see
 * {@link buildAtmoBoardMesh}). The sol mesh is now strictly one band per
 * tile — sol heights from `0` (collapsed prism, core visible) to
 * `shellThickness` (peak, top sits at `solOuterRadius`).
 *
 * Walls and bottom fan are **always emitted**, even when the prism collapses
 * (`solHeight === 0`). The triangles are degenerate in that case (zero-area)
 * and the GPU silently discards them. Stable vertex counts are a prerequisite
 * for live mutation (e.g. `updateTileSolHeight` after a dig) — the merged
 * buffer layout never has to be reallocated.
 */

import * as THREE from 'three'
import type { Tile, Point3D } from '../../geometry/hexasphere.types'

/**
 * Vertex range produced by {@link buildLayeredPrismGeometry}: `[start, count)`
 * — `start` is the index of the first vertex and `count` is the number of
 * consecutive vertices in the prism.
 */
export interface PrismRange {
  start: number
  count: number
}

/**
 * Single-prism output bundle. The `geometry` is a non-indexed
 * `BufferGeometry` containing the tile's prism, the `range` describes the
 * vertex span (always starts at 0 for a single prism, but the type is kept
 * so the merged-mesh builder can cache it directly).
 *
 * Attributes set on the geometry:
 *  - `position`   (vec3)  — world-space vertex positions.
 *  - `normal`     (vec3)  — face normals (outward for top + walls, inward for bottom).
 *  - `aSolHeight` (float) — sol band height used to build this tile, broadcast
 *    to every vertex so the sol shader can derive a normalised height.
 */
export interface LayeredPrismGeometry {
  geometry: THREE.BufferGeometry
  range:    PrismRange
}

/** Projects a point on a sphere of radius `r` centred at the origin. */
function project(p: Point3D, r: number): THREE.Vector3 {
  const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
  const s   = r / len
  return new THREE.Vector3(p.x * s, p.y * s, p.z * s)
}

function pushVec(arr: number[], v: THREE.Vector3): void {
  arr.push(v.x, v.y, v.z)
}

/**
 * Writes a single closed prism (top cap + walls + bottom cap) into the
 * shared attribute buffers. Returns the number of vertices emitted.
 *
 * The bottom fan uses reversed winding so its outward face points inward
 * (toward the sphere centre); seen from outside the sphere it is always
 * back-face-culled, never paints over the core mesh. The top fan collapses
 * to degenerate triangles when `top === bottom` (sol collapsed to zero
 * height); the GPU drops them, exposing the core mesh underneath.
 */
function emitPrism(
  tile:     Tile,
  bottom:   number,
  top:      number,
  solH:     number,
  positions: number[],
  normals:   number[],
  solHs:     number[],
): number {
  const { centerPoint, boundary } = tile
  const n         = boundary.length
  const topNormal = new THREE.Vector3(centerPoint.x, centerPoint.y, centerPoint.z).normalize()
  const botNormal = topNormal.clone().negate()

  const topCenter   = project(centerPoint, top)
  const botCenter   = project(centerPoint, bottom)
  const topRing     = boundary.map(p => project(p, top))
  const botRing     = boundary.map(p => project(p, bottom))
  const degenerate  = top === bottom

  let written = 0

  // Top fan — collapsed to degenerate triangles when `top === bottom`.
  for (let i = 0; i < n; i++) {
    if (degenerate) {
      pushVec(positions, topCenter)
      pushVec(positions, topCenter)
      pushVec(positions, topCenter)
    } else {
      pushVec(positions, topCenter)
      pushVec(positions, topRing[i])
      pushVec(positions, topRing[(i + 1) % n])
    }
    for (let k = 0; k < 3; k++) {
      pushVec(normals, topNormal)
      solHs.push(solH)
    }
    written += 3
  }

  // Walls — CCW winding from outside so geometric normal points outward.
  for (let i = 0; i < n; i++) {
    const tA = topRing[i],     tB = topRing[(i + 1) % n]
    const bA = botRing[i],     bB = botRing[(i + 1) % n]
    const sideNormal = degenerate
      ? topNormal
      : new THREE.Vector3()
        .crossVectors(
          new THREE.Vector3().subVectors(bA, tA),
          new THREE.Vector3().subVectors(bB, tA),
        )
        .normalize()
    pushVec(positions, tA); pushVec(positions, bA); pushVec(positions, bB)
    pushVec(positions, tA); pushVec(positions, bB); pushVec(positions, tB)
    for (let k = 0; k < 6; k++) {
      pushVec(normals, sideNormal)
      solHs.push(solH)
    }
    written += 6
  }

  // Bottom fan — reversed winding so outward face points inward.
  for (let i = 0; i < n; i++) {
    pushVec(positions, botCenter)
    pushVec(positions, botRing[(i + 1) % n])
    pushVec(positions, botRing[i])
    for (let k = 0; k < 3; k++) {
      pushVec(normals, botNormal)
      solHs.push(solH)
    }
    written += 3
  }

  return written
}

/**
 * Builds the single-band hex prism for a tile — spans `[coreRadius,
 * coreRadius + solHeight]`, capped at the sol surface.
 *
 * `solHeight` is clamped to `[0, shellThickness]`. Callers pass the clamped
 * value — this function is the authority on the geometry layout, not on
 * the game rules that drive `solHeight`.
 *
 * The returned geometry is non-indexed (one triangle per 3 vertices), so
 * `mergeGeometries` can batch it across tiles without index shifts.
 *
 * @param tile           - Hex/pentagon tile on the hexasphere.
 * @param coreRadius     - World-space radius of the inner core sphere.
 * @param solHeight      - World-space height of the sol band (`[0, shellThickness]`).
 * @param shellThickness - World-space radial span of the sol band, i.e.
 *                         `solOuterRadius - coreRadius`.
 */
export function buildLayeredPrismGeometry(
  tile:           Tile,
  coreRadius:     number,
  solHeight:      number,
  shellThickness: number,
): LayeredPrismGeometry {
  const solH    = Math.max(0, Math.min(shellThickness, solHeight))
  const solTop  = coreRadius + solH
  const solBot  = coreRadius

  const positions: number[] = []
  const normals:   number[] = []
  const solHs:     number[] = []

  const count = emitPrism(tile, solBot, solTop, solH, positions, normals, solHs)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position',   new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal',     new THREE.Float32BufferAttribute(normals,   3))
  geometry.setAttribute('aSolHeight', new THREE.Float32BufferAttribute(solHs,     1))

  return {
    geometry,
    range: { start: 0, count },
  }
}
