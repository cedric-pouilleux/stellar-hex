import * as THREE from 'three'
import type { Tile, Point3D } from '../../geometry/hexasphere.types'

/**
 * Layer tag written to {@link LayeredPrismGeometry.aLayer}. `0` marks sol
 * vertices (solid crust), `1` marks atmosphere vertices. Exported as a named
 * union so consumers of the shader or raycast pipeline can branch on layer
 * without re-deriving the convention.
 */
export type LayerTag = 0 | 1

export const LAYER_SOL:  LayerTag = 0
export const LAYER_ATMO: LayerTag = 1

/**
 * Vertex ranges produced by {@link buildLayeredPrismGeometry}. Each range is
 * `[start, count)` — i.e. `start` is the index of the first vertex and
 * `count` the number of consecutive vertices in that layer.
 *
 * Used by the merged mesh builder to build per-layer face→tile maps without
 * re-scanning the geometry attributes.
 */
export interface LayerRanges {
  sol:  { start: number; count: number }
  atmo: { start: number; count: number }
}

/**
 * Layered-prism output bundle. The `geometry` contains both prisms merged
 * into a single non-indexed BufferGeometry, the `ranges` describe how the
 * vertices are split between the two layers.
 *
 * Attributes set on the geometry:
 * - `position` (vec3) — world-space vertex positions.
 * - `normal`   (vec3) — face normals.
 * - `aLayer`   (float) — layer tag (0 sol, 1 atmo). See {@link LayerTag}.
 * - `aSolHeight` (float) — height of the sol band used to build this tile.
 *   All vertices (sol and atmo) carry the same value so the shader can derive
 *   the atmo band thickness via `totalThickness - aSolHeight` without a
 *   second attribute.
 */
export interface LayeredPrismGeometry {
  geometry: THREE.BufferGeometry
  ranges:   LayerRanges
}

/**
 * Projects a point `p` onto a sphere of radius `r` centred at the origin.
 * Preserves direction, overwrites magnitude.
 */
function project(p: Point3D, r: number): THREE.Vector3 {
  const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
  const s   = r / len
  return new THREE.Vector3(p.x * s, p.y * s, p.z * s)
}

function pushVec(arr: number[], v: THREE.Vector3): void {
  arr.push(v.x, v.y, v.z)
}

/**
 * Writes one closed prism (top cap + vertical walls + bottom cap) into
 * the shared attribute buffers.
 *
 * Walls and bottom fan are **always** emitted — when `bottom === top` the
 * triangles are degenerate (zero-area) and the GPU silently discards them.
 * This keeps the per-layer vertex count stable across any `solHeight` in
 * `[0, totalThickness]`, which is a prerequisite for live mutation
 * (e.g. {@link buildLayeredInteractiveMesh}'s `updateTileSolHeight`).
 *
 * The bottom fan uses the reverse winding of the top, so its normal points
 * inward (toward the sphere centre). From outside the sphere it is always a
 * back face — culled, never drawn, no z-fight with the core mesh or with an
 * adjacent layer sharing the same boundary. Its purpose is to close the
 * tile volume so grazing rays that slip past the walls can no longer see
 * straight through the prism to the starry sky on the other side.
 */
function emitPrism(
  tile:     Tile,
  bottom:   number,
  top:      number,
  layer:    LayerTag,
  solH:     number,
  positions: number[],
  normals:   number[],
  layers:    number[],
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

  // Top fan — vertex count stays stable so the merged buffer layout is
  // identical regardless of `solHeight`, but when the layer collapses
  // (`top === bottom`) we collapse the fan into degenerate triangles
  // (3× the same point). The GPU drops zero-area triangles, so the cap
  // disappears entirely and whatever sits underneath (typically the core
  // mesh once a sol tile is fully mined out) is revealed.
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
      layers.push(layer)
      solHs.push(solH)
    }
    written += 3
  }

  // Walls — always emitted. Degenerate when `top === bottom`; the GPU
  // discards zero-area triangles so they're invisible at no shader cost.
  // Winding is (tA, bA, bB) + (tA, bB, tB), i.e. CCW when viewed from outside
  // the prism, so the geometric face normal (by right-hand rule) points
  // outward. A previous implementation used the reverse winding, producing
  // inward-pointing normals that were silently back-face-culled from outside
  // — the visible symptom was hollow-looking hex prisms whose walls could be
  // seen through from grazing angles.
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
      layers.push(layer)
      solHs.push(solH)
    }
    written += 6
  }

  // Bottom fan — reversed winding so the cap's outward face points inward
  // (toward the sphere centre). Always back-face-culled from outside the
  // sphere, so it closes the volume without ever painting over the core
  // or the layer below.
  for (let i = 0; i < n; i++) {
    pushVec(positions, botCenter)
    pushVec(positions, botRing[(i + 1) % n])
    pushVec(positions, botRing[i])
    for (let k = 0; k < 3; k++) {
      pushVec(normals, botNormal)
      layers.push(layer)
      solHs.push(solH)
    }
    written += 3
  }

  return written
}

/**
 * Builds the dual-layer hex prism for a single tile — one sol prism between
 * `coreRadius` and `coreRadius + solHeight`, stacked with one atmo prism
 * between `coreRadius + solHeight` and `coreRadius + totalThickness`.
 *
 * The invariant `solHeight + atmoHeight = totalThickness` is enforced by
 * clamping `solHeight` to `[0, totalThickness]`. Callers are expected to
 * pass the clamped value — this function is the authority on the geometry
 * layout, not on the game rules that drive `solHeight`.
 *
 * The returned geometry is non-indexed (one triangle per 3 vertices), so
 * `mergeGeometries` can batch it across tiles without index shifts. The
 * `ranges` structure tells callers which vertex span belongs to which
 * layer, so they can stamp per-layer colours or raycast lookups.
 *
 * @param tile           - Hex/pentagon tile on the hexasphere.
 * @param coreRadius     - World-space radius of the inner core sphere.
 * @param solHeight      - World-space height of the sol band (0..totalThickness).
 * @param totalThickness - World-space radial span of the shell, i.e.
 *                         `surfaceRadius - coreRadius`.
 */
export function buildLayeredPrismGeometry(
  tile:           Tile,
  coreRadius:     number,
  solHeight:      number,
  totalThickness: number,
): LayeredPrismGeometry {
  const solH    = Math.max(0, Math.min(totalThickness, solHeight))
  const solTop  = coreRadius + solH
  const atmoTop = coreRadius + totalThickness
  const solBot  = coreRadius

  const positions: number[] = []
  const normals:   number[] = []
  const layers:    number[] = []
  const solHs:     number[] = []

  const solCount  = emitPrism(tile, solBot,  solTop, LAYER_SOL,  solH, positions, normals, layers, solHs)
  const atmoCount = emitPrism(tile, solTop,  atmoTop, LAYER_ATMO, solH, positions, normals, layers, solHs)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position',   new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal',     new THREE.Float32BufferAttribute(normals,   3))
  geometry.setAttribute('aLayer',     new THREE.Float32BufferAttribute(layers,    1))
  geometry.setAttribute('aSolHeight', new THREE.Float32BufferAttribute(solHs,     1))

  return {
    geometry,
    ranges: {
      sol:  { start: 0,        count: solCount  },
      atmo: { start: solCount, count: atmoCount },
    },
  }
}
