/**
 * Tile-level geometry primitives used by hover overlays and external
 * overlay renderers. Pure builders — no THREE.Mesh allocation, only
 * ready-to-upload `Float32Array` position buffers.
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import { v, pushVec } from './hexMeshShared'

/**
 * Computes the expanded top-face ring for a hovered tile.
 *
 * The ring is slightly lifted above the tile surface (`surfaceOffset`)
 * and expanded outward (`ringExpand`) so it visually frames the tile.
 */
export function buildTileRing(
  tile:          Tile,
  height:        number,
  surfaceOffset: number,
  ringExpand:    number,
): { center: THREE.Vector3; ring: THREE.Vector3[]; avgRadius: number } {
  const { centerPoint, boundary } = tile
  const len    = Math.sqrt(centerPoint.x ** 2 + centerPoint.y ** 2 + centerPoint.z ** 2)
  const scale  = (len + height) / len + surfaceOffset
  const center = v(centerPoint.x * scale, centerPoint.y * scale, centerPoint.z * scale)

  const baseCenter = v(centerPoint.x, centerPoint.y, centerPoint.z)
  const avgRadius  = boundary.reduce(
    (sum, p) => sum + v(p.x, p.y, p.z).distanceTo(baseCenter), 0,
  ) / boundary.length
  const expand = avgRadius * ringExpand

  const ring = boundary.map(p => {
    const bp  = v(p.x * scale, p.y * scale, p.z * scale)
    const dir = bp.clone().sub(center).normalize()
    return bp.addScaledVector(dir, expand)
  })

  return { center, ring, avgRadius }
}

/**
 * Builds the fill fan geometry: triangles from center to each boundary edge.
 * Used with additive blending for a soft glow overlay on the tile top face.
 */
export function buildFillPositions(center: THREE.Vector3, ring: THREE.Vector3[]): Float32Array {
  const out: number[] = []
  for (let i = 0; i < ring.length; i++) {
    pushVec(out, center)
    pushVec(out, ring[i])
    pushVec(out, ring[(i + 1) % ring.length])
  }
  return new Float32Array(out)
}

/**
 * Builds the border quad-strip geometry: a thin perimeter band inset from
 * the outer ring toward the tile center by `borderWidth` fraction of
 * `avgRadius`. Each edge becomes two triangles (one quad).
 */
export function buildBorderPositions(
  center:      THREE.Vector3,
  ring:        THREE.Vector3[],
  avgRadius:   number,
  borderWidth: number,
): Float32Array {
  const borderSize = avgRadius * borderWidth
  const n          = ring.length

  // Each outer vertex is pulled inward by borderSize to form the inner ring
  const innerRing = ring.map(op => {
    const toCenter = center.clone().sub(op).normalize()
    return op.clone().addScaledVector(toCenter, borderSize)
  })

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a = ring[i],      b = ring[(i + 1) % n]
    const c = innerRing[(i + 1) % n], d = innerRing[i]
    pushVec(out, a); pushVec(out, b); pushVec(out, c)
    pushVec(out, a); pushVec(out, c); pushVec(out, d)
  }
  return new Float32Array(out)
}

/**
 * Builds a vertical quad-strip running along the outside wall of the tile
 * from the top edge down to `depthWorld` below (in world units). Produces
 * one quad per boundary edge, so the strip wraps all 6 wall faces of the
 * hex prism.
 *
 * Used to continue the top-face border over the hex walls so the outline
 * stays visible when the tile is viewed from a grazing angle.
 */
export function buildSideBorderPositions(
  tile:          Tile,
  height:        number,
  surfaceOffset: number,
  depthWorld:    number,
): Float32Array {
  const { boundary } = tile
  const depth = depthWorld
  const n     = boundary.length

  const topRing: THREE.Vector3[] = []
  const lowRing: THREE.Vector3[] = []
  for (const p of boundary) {
    const len      = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
    const topScale = (len + height) / len + surfaceOffset
    const lowScale = topScale - depth / len
    topRing.push(v(p.x * topScale, p.y * topScale, p.z * topScale))
    lowRing.push(v(p.x * lowScale, p.y * lowScale, p.z * lowScale))
  }

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a = topRing[i],      b = topRing[(i + 1) % n]
    const c = lowRing[(i + 1) % n], d = lowRing[i]
    pushVec(out, a); pushVec(out, b); pushVec(out, c)
    pushVec(out, a); pushVec(out, c); pushVec(out, d)
  }
  return new Float32Array(out)
}

/**
 * Creates the border overlay material for the hovered tile.
 * Additive blending with high brightness seeds the bloom / hover rays pass.
 */
export function makeBorderMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color:       0xffffff,
    transparent: true,
    opacity:     1.0,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    depthTest:   false,
    side:        THREE.DoubleSide,
  })
}
