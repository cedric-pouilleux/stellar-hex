import type { BodyConfig } from '../types/body.types'
import type { BiomeType } from '../types/surface.types'
import { LOW_FRAC, MID_FRAC, FOREST_VEGETATION_THRESH, DEFAULT_TERRAIN_LEVEL_COUNT } from '../config/defaults'

/**
 * Classify a single tile into a named biome.
 *
 * Only rocky planets and stars produce a biome.
 * Gaseous and metallic planets return undefined — resources on
 * those bodies are distributed via physics compatibility only.
 *
 * Inputs:
 *   elevation    — raw noise value (-1..1)
 *   seaLevelElev — the elevation threshold for the water-line
 *   config       — planet configuration (type, temperatures, atmosphere)
 */
export function classifyBiome(
  elevation:     number,
  seaLevelElev:  number,
  config:        BodyConfig,
): BiomeType | undefined {
  const { type, temperatureMax, atmosphereThickness } = config

  if (type === 'star')    return 'star'
  if (type === 'gaseous') return undefined
  if (type === 'metallic') return undefined

  // Rocky planet
  const avg       = (config.temperatureMin + config.temperatureMax) / 2
  const atmo      = atmosphereThickness ?? 0
  const isFrozen  = temperatureMax <= 0
  const isVolcanic = avg > 200
  // Caller-decided: does this body expose any surface liquid body at all?
  const hasSurface = config.liquidType !== undefined && config.liquidState !== 'none'
  // Caller-decided: is that body in a flowing liquid state (vs frozen)?
  const surfaceLiquid = config.liquidState === 'liquid'

  // ── Below sea level → ocean / ocean_deep / ice_sheet ──────────
  // The ocean elevation range [-1, seaLevel] is split into N/2 bands matching
  // the terrain palette: the topmost band = 'ocean' (navigable surface), all
  // bands beneath = 'ocean_deep' (impassable trench). Ice sheets keep a single
  // 'ice_sheet' biome — frozen glaciers render as a flat continuous cap.
  if (hasSurface && elevation < seaLevelElev) {
    if (!surfaceLiquid) return 'ice_sheet'
    const levelCount  = config.terrainLevelCount ?? DEFAULT_TERRAIN_LEVEL_COUNT
    const oceanLevels = Math.max(1, Math.floor(levelCount / 2))
    const oceanRange  = seaLevelElev - (-1)
    const bandSize    = oceanRange / oceanLevels
    const surfaceBand = seaLevelElev - bandSize
    return elevation >= surfaceBand ? 'ocean' : 'ocean_deep'
  }

  // ── Above sea level: compute normalised land position ─────────
  const landRange = 1.0 - seaLevelElev
  const landPos   = (elevation - seaLevelElev) / landRange  // 0..1

  // ── Lowlands (includes former shore band) ─────────────────────
  if (landPos < LOW_FRAC) {
    if (isFrozen || avg < -20)  return 'plains'
    if (isVolcanic)             return 'volcanic'
    const tempFactor = Math.max(0, 1 - Math.abs(avg - 15) / 55)
    const vegetation = atmo * tempFactor
    if (vegetation > FOREST_VEGETATION_THRESH) return 'forest'
    if (atmo < 0.15 || avg > 60)               return 'desert'
    return 'plains'
  }

  // ── Midlands ──────────────────────────────────────────────────
  if (landPos < MID_FRAC) {
    if (isFrozen || avg < -20)  return 'plains'
    if (isVolcanic)             return 'volcanic'
    const tempFactor = Math.max(0, 1 - Math.abs(avg - 15) / 55)
    const vegetation = atmo * tempFactor
    if (vegetation > FOREST_VEGETATION_THRESH) return 'forest'
    return 'mountain'
  }

  // ── Peaks ─────────────────────────────────────────────────────
  if (isFrozen || avg < 5) return 'ice_peak'
  if (isVolcanic)          return 'volcanic'
  return 'mountain'
}
