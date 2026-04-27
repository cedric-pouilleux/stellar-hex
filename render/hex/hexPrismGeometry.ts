/**
 * Per-tile prism geometry — the building block of the merged hex mesh.
 *
 * Each vertex is extruded along its own radial direction (normalized per
 * vertex). This keeps the top face flat and produces perfectly-matched
 * edges between neighbouring tiles — essential for the hex mesh to seal
 * without seams.
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import { v, pushVec } from './hexMeshShared'

/**
 * Builds a single-tile hex prism. Top cap sits at `+height` above the
 * sphere surface; the walls can start below via a negative `basement`
 * (used to reach a common sea-floor level so the hex grid seals the
 * shoreline even when the ocean layer is hidden).
 */
export function buildPrismGeometry(
  tile:     Tile,
  height:   number,
  basement: number = 0,
): THREE.BufferGeometry {
  const { centerPoint, boundary } = tile
  // Extrude each vertex along its own radial direction (normalize per vertex).
  // This ensures the extruded vertex sits at radius (len + delta) from the sphere
  // centre, producing a flat top face and perfectly matching edges with neighbours.
  const extrudeRadial = (
    p: { x: number; y: number; z: number },
    delta: number,
  ): THREE.Vector3 => {
    const len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
    const scale = (len + delta) / len
    return v(p.x * scale, p.y * scale, p.z * scale)
  }

  const topCenter   = extrudeRadial(centerPoint, height)
  const topBoundary = boundary.map(p => extrudeRadial(p, height))
  // Walls can start below the sphere surface when `basement` is negative —
  // used to reach a common sea-floor level so the hex grid seals the
  // shoreline even when the ocean layer is hidden.
  const botBoundary = boundary.map(p => extrudeRadial(p, basement))

  const positions: number[] = []
  const normals:   number[] = []
  const n = boundary.length

  const topNormal = new THREE.Vector3(centerPoint.x, centerPoint.y, centerPoint.z).normalize()
  for (let i = 0; i < n; i++) {
    pushVec(positions, topCenter)
    pushVec(positions, topBoundary[i])
    pushVec(positions, topBoundary[(i + 1) % n])
    for (let k = 0; k < 3; k++) pushVec(normals, topNormal)
  }

  if (height > basement) {
    for (let i = 0; i < n; i++) {
      const tA = topBoundary[i],  tB = topBoundary[(i + 1) % n]
      const bA = botBoundary[i],  bB = botBoundary[(i + 1) % n]
      // Winding is CCW from outside the prism so the geometric normal points
      // outward and the wall is front-facing to the viewer.
      const sideNormal = new THREE.Vector3()
        .crossVectors(new THREE.Vector3().subVectors(bA, tA), new THREE.Vector3().subVectors(bB, tA))
        .normalize()
      pushVec(positions, tA); pushVec(positions, bA); pushVec(positions, bB)
      for (let k = 0; k < 3; k++) pushVec(normals, sideNormal)
      pushVec(positions, tA); pushVec(positions, bB); pushVec(positions, tB)
      for (let k = 0; k < 3; k++) pushVec(normals, sideNormal)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3))
  return geo
}
