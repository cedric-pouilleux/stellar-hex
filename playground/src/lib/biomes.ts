import { DEFAULT_CORE_RADIUS_RATIO, resolveTerrainLevelCount, resolveAtmosphereThickness, type BodyConfig } from '@lib'

/**
 * Playground-local biome classification. The `@lib` layer is biome-free
 * by design (pure geometry + elevation) — any semantic labelling lives
 * in consuming apps. The demo uses biomes to seed cluster-based resources
 * and render a human-friendly tooltip.
 */
export type RockyBiomeType =
  | 'ocean'
  | 'ocean_deep'
  | 'ice_sheet'
  | 'plains'
  | 'forest'
  | 'desert'
  | 'mountain'
  | 'volcanic'
  | 'ice_peak'

export type BiomeType = 'star' | RockyBiomeType

/** Lowland/plain band ceiling (30 % of land range). */
const LOW_FRAC   = 0.30
/** Midland/highland band ceiling (65 % of land range). */
const MID_FRAC   = 0.65
/** Minimum vegetation potential required for a tile to classify as forest. */
const FOREST_VEGETATION_THRESH = 0.30

/**
 * Classify a single tile into a named biome.
 *
 * Only rocky planets and stars produce a biome. Gaseous and metallic
 * planets return undefined — the demo distributor never runs on them
 * anyway, but the `undefined` branch keeps the signature total.
 */
export function classifyBiome(
  elevation:     number,
  seaLevelElev:  number,
  config:        BodyConfig,
  temperature:   { min: number; max: number },
): BiomeType | undefined {
  if (config.type === 'star')                  return 'star'
  if (config.surfaceLook === 'bands')          return undefined
  if (config.surfaceLook === 'metallic')       return undefined
  const atmosphereThickness = config.atmosphereThickness

  const avg       = (temperature.min + temperature.max) / 2
  const atmo      = atmosphereThickness ?? 0
  const isFrozen  = temperature.max <= 0
  const isVolcanic = avg > 200
  const hasSurface    = (config.liquidState ?? 'none') !== 'none'
  const surfaceLiquid = config.liquidState === 'liquid'

  // Band-space semantics (new elevation model):
  //   elevation    ∈ [0, levelCount - 1]   — integer band index from the core.
  //   seaLevelElev ∈ [0, levelCount]       — fractional waterline. `-1` on dry bodies.
  const levelCount = resolveTerrainLevelCount(
    config.radius,
    config.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO,
    resolveAtmosphereThickness(config),
  )
  void atmosphereThickness // kept in destructure for future climate hooks

  // ── Below sea level → ocean / ocean_deep / ice_sheet ──────────
  if (hasSurface && seaLevelElev >= 0 && elevation < seaLevelElev) {
    if (!surfaceLiquid) return 'ice_sheet'
    // Top ocean band = the band immediately below the waterline. Anything
    // deeper counts as the abyssal tier. Works whether the waterline sits
    // between bands or exactly on a boundary.
    const topOceanBand = Math.max(0, Math.floor(seaLevelElev) - 1)
    return elevation >= topOceanBand ? 'ocean' : 'ocean_deep'
  }

  // ── Above sea level ───────────────────────────────────────────
  // Dry bodies keep the full band range; wet bodies measure progress from
  // the waterline up to the topmost band.
  const landFloor = seaLevelElev >= 0 ? seaLevelElev : 0
  const landRange = Math.max(1, levelCount - 1 - landFloor)
  const landPos   = Math.max(0, (elevation - landFloor) / landRange)

  if (landPos < LOW_FRAC) {
    if (isFrozen || avg < -20)  return 'plains'
    if (isVolcanic)             return 'volcanic'
    const tempFactor = Math.max(0, 1 - Math.abs(avg - 15) / 55)
    const vegetation = atmo * tempFactor
    if (vegetation > FOREST_VEGETATION_THRESH) return 'forest'
    if (atmo < 0.15 || avg > 60)               return 'desert'
    return 'plains'
  }

  if (landPos < MID_FRAC) {
    if (isFrozen || avg < -20)  return 'plains'
    if (isVolcanic)             return 'volcanic'
    const tempFactor = Math.max(0, 1 - Math.abs(avg - 15) / 55)
    const vegetation = atmo * tempFactor
    if (vegetation > FOREST_VEGETATION_THRESH) return 'forest'
    return 'mountain'
  }

  if (isFrozen || avg < 5) return 'ice_peak'
  if (isVolcanic)          return 'volcanic'
  return 'mountain'
}

/** Human-readable label for tooltip display. */
export const BIOME_LABELS: Partial<Record<BiomeType, string>> = {
  ocean:      'Ocean',
  ocean_deep: 'Deep ocean',
  ice_sheet:  'Ice sheet',
  ice_peak:   'Ice peak',
  plains:     'Plains',
  forest:     'Forest',
  desert:     'Desert',
  mountain:   'Mountain',
  volcanic:   'Volcanic',
  star:       'Stellar surface',
}

/** Returns a user-facing label for a biome, falling back to the raw tag. */
export function biomeLabel(biome: BiomeType | undefined): string | undefined {
  if (!biome) return undefined
  return BIOME_LABELS[biome] ?? String(biome)
}
