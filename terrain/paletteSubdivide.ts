import * as THREE from 'three'
import type { TerrainLevel } from '../types/terrain.types'

/**
 * Densify a terrain palette to `targetCount` levels by linearly interpolating
 * thresholds, heights, colours, metalness and roughness between consecutive
 * anchors of the source palette.
 *
 * The last anchor's threshold is preserved as `Infinity` so the catch-all
 * semantic stays intact. Returns the palette unchanged when `targetCount`
 * is smaller than or equal to the source length, or when the source has
 * fewer than two anchors.
 *
 * @param palette     - Source palette (≥ 2 anchors, sorted ascending by threshold).
 * @param targetCount - Desired total level count (≥ palette.length).
 * @returns Expanded palette with exactly `targetCount` levels.
 */
export function subdividePalette(
  palette:     TerrainLevel[],
  targetCount: number,
): TerrainLevel[] {
  if (palette.length < 2 || targetCount <= palette.length) return palette
  const last   = palette.length - 1
  const result: TerrainLevel[] = []

  // When the top anchor is Infinity, extrapolate the "peak" band using the
  // previous finite gap as step — otherwise all subdivided peak levels would
  // collapse onto the last finite threshold and break bin distribution.
  const lastFinite = palette[last - 1].threshold
  const prevFinite = palette[last - 2]?.threshold ?? lastFinite - 1
  const infinityStep = Math.max(1e-6, lastFinite - prevFinite)

  for (let j = 0; j < targetCount; j++) {
    const pos = (j / (targetCount - 1)) * last
    const i   = Math.min(last - 1, Math.floor(pos))
    const t   = pos - i
    const A   = palette[i]
    const B   = palette[i + 1]

    const isLast = j === targetCount - 1
    const threshold = isLast
      ? Infinity
      : isFinite(A.threshold) && isFinite(B.threshold)
        ? A.threshold * (1 - t) + B.threshold * t
        : A.threshold + infinityStep * t

    const level: TerrainLevel = {
      threshold,
      height: A.height * (1 - t) + B.height * t,
      color:  A.color.clone().lerp(B.color, t),
    }
    if (A.metalness !== undefined || B.metalness !== undefined) {
      level.metalness = (A.metalness ?? 0) * (1 - t) + (B.metalness ?? 0) * t
    }
    if (A.roughness !== undefined || B.roughness !== undefined) {
      level.roughness = (A.roughness ?? 0) * (1 - t) + (B.roughness ?? 0) * t
    }
    if (A.emissive || B.emissive) {
      const zero = new THREE.Color(0)
      level.emissive = (A.emissive ?? zero).clone().lerp(B.emissive ?? zero, t)
      if (A.emissiveIntensity !== undefined || B.emissiveIntensity !== undefined) {
        level.emissiveIntensity =
          (A.emissiveIntensity ?? 0) * (1 - t) + (B.emissiveIntensity ?? 0) * t
      }
    }
    result.push(level)
  }
  return result
}
