/**
 * Shared types + lookup helpers for the hex-mesh modules.
 *
 * Kept as a small leaf module so every hex-mesh builder can depend on it
 * without pulling the full `useHexasphereMesh` stack.
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import type { TerrainLevel } from '../types/terrain.types'

/** Subset of tile geometry metadata exposed to external overlay renderers. */
export interface TileGeometryInfo {
  tile:  Tile
  level: TerrainLevel
}

/** Listener notified when the hovered tile id changes. Null = no tile. */
export type HoverListener = (tileId: number | null) => void

/** Shadow cast by an orbiting child onto this planet's surface. */
export type ShadowUniforms   = { pos: { value: THREE.Vector3 }; radius: { value: number } }

/** Parent body occluding sunlight from reaching this surface. */
export type OccluderUniforms = { pos: { value: THREE.Vector3 }; radius: { value: number } }

/** Returns the TerrainLevel matching the given elevation in a sorted palette. */
export function getTileLevel(elevation: number, levels: TerrainLevel[]): TerrainLevel {
  return levels.find(l => elevation < l.threshold) ?? levels[levels.length - 1]
}

/** Sugar: `new THREE.Vector3(x, y, z)` — scratch builder for per-tile geometry. */
export function v(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z)
}

/** Pushes the `(x, y, z)` components of a vector into a flat number buffer. */
export function pushVec(arr: number[], vec: THREE.Vector3): void {
  arr.push(vec.x, vec.y, vec.z)
}
