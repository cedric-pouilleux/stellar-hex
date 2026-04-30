import type { BodyConfig } from '../../types/body.types'
import type { TerrainLevel } from '../types/terrain.types'

// ── Body outer radius ─────────────────────────────────────────────

/**
 * Safe upper bound for terrain extrusion height when no palette is available.
 * terrainPalette.ts reaches 0.060 (absolute world units) for the tallest band,
 * so this constant covers every generated palette regardless of planet size.
 */
const MAX_TERRAIN_HEIGHT_FALLBACK = 0.06

/**
 * Returns the outermost terrain radius of a body — the base radius plus the
 * tallest extrusion height declared in its palette (or a safe fallback when no
 * palette is attached, matching the tallest generated band).
 *
 * Any spherical shell that must visually clear the hexa terrain (atmosphere,
 * ice) should be anchored to this value.
 *
 * @param config  - Body configuration — supplies the base radius.
 * @param palette - Effective palette used by the body (e.g. `body.palette`).
 *                  When omitted, a safe fallback (`0.06`) is used as an upper
 *                  bound.
 */
export function bodyOuterRadius(config: BodyConfig, palette?: TerrainLevel[]): number {
  const maxTerrainH = palette?.length
    ? Math.max(...palette.map(l => l.height))
    : MAX_TERRAIN_HEIGHT_FALLBACK
  return config.radius + maxTerrainH
}
