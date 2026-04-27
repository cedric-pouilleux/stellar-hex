/**
 * Render-scoped terrain types.
 *
 * Lives outside `body.types.ts` so the headless `sim` surface stays free of
 * any `three` type dependency. Palette entries reference `THREE.Color`
 * directly because they are built and consumed exclusively by the render
 * layer (`core.ts` entry point).
 */

import type * as THREE from 'three'

/**
 * Single band of a terrain palette — threshold + world-height + material
 * appearance. A palette is an ordered array of {@link TerrainLevel}; the
 * band for a tile is resolved by `elevation < threshold`.
 */
export interface TerrainLevel {
  threshold:          number
  height:             number
  color:              THREE.Color
  emissive?:          THREE.Color
  emissiveIntensity?: number
  metalness?:         number
  roughness?:         number
}
