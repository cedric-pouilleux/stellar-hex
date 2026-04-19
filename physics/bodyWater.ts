import type { BodyConfig, BodyType } from '../types/body.types'
import type { BiomeType, SurfaceLiquidType } from '../types/surface.types'

export interface BodyWaterProfile {
  type: BodyType
  temperatureMin: number
  temperatureMax: number
}

// ── Water (H₂O) temperature bounds ──────────────────────────────
export const LIQUID_WATER_MIN_AVG   = -15
export const LIQUID_WATER_MAX_AVG   = 60
export const FROZEN_WATER_MIN_AVG   = -60
export const ATMOSPHERIC_WATER_MIN_AVG_TEMP = -60
export const ATMOSPHERIC_WATER_MAX_AVG_TEMP = 100

// ── Ammonia (NH₃) temperature bounds ────────────────────────────
export const LIQUID_AMMONIA_MIN_AVG = -78
export const LIQUID_AMMONIA_MAX_AVG = -33
export const FROZEN_AMMONIA_MIN_AVG = -110

// ── Methane (CH₄) temperature bounds ────────────────────────────
export const LIQUID_METHANE_MIN_AVG = -183
export const LIQUID_METHANE_MAX_AVG = -161
export const FROZEN_METHANE_MIN_AVG = -210

// ── Nitrogen (N₂) temperature bounds ────────────────────────────
export const LIQUID_NITROGEN_MIN_AVG = -210
export const LIQUID_NITROGEN_MAX_AVG = -196
export const FROZEN_NITROGEN_MIN_AVG = -230

// ── Legacy aliases (keep imports stable) ─────────────────────────
export const LIQUID_SURFACE_MAX_AVG_TEMP = LIQUID_WATER_MAX_AVG
export const LIQUID_SURFACE_MIN_AVG_TEMP = LIQUID_WATER_MIN_AVG

// ── Helpers ──────────────────────────────────────────────────────

function tempsOf(input: BodyWaterProfile | BodyConfig): BodyWaterProfile {
  return {
    type: input.type,
    temperatureMin: input.temperatureMin,
    temperatureMax: input.temperatureMax,
  }
}

/** Average of the daily temperature extremes. */
export function averageBodyTemperature(input: BodyWaterProfile | BodyConfig): number {
  const { temperatureMin, temperatureMax } = tempsOf(input)
  return (temperatureMin + temperatureMax) / 2
}

// ── Per-liquid eligibility ───────────────────────────────────────

/**
 * True when liquid water (H₂O) can exist on the surface.
 *
 * Conditions:
 *  - Rocky planet
 *  - tempMax > 0 °C (some thawing occurs)
 *  - avg ∈ [-15, 60] °C
 */
export function canHaveLiquidSurfaceWater(input: BodyWaterProfile | BodyConfig): boolean {
  const { type, temperatureMax } = tempsOf(input)
  if (type !== 'rocky') return false
  const avg = averageBodyTemperature(input)
  return temperatureMax > 0
    && avg >= LIQUID_WATER_MIN_AVG
    && avg <= LIQUID_WATER_MAX_AVG
}

/**
 * True when liquid ammonia (NH₃) can exist on the surface.
 *
 * Conditions:
 *  - Rocky planet
 *  - tempMax > -78 °C (some thawing occurs)
 *  - avg ∈ [-78, -33] °C
 */
export function canHaveLiquidAmmonia(input: BodyWaterProfile | BodyConfig): boolean {
  const { type, temperatureMax } = tempsOf(input)
  if (type !== 'rocky') return false
  const avg = averageBodyTemperature(input)
  return temperatureMax > LIQUID_AMMONIA_MIN_AVG
    && avg >= LIQUID_AMMONIA_MIN_AVG
    && avg <= LIQUID_AMMONIA_MAX_AVG
}

/**
 * True when liquid methane (CH₄) can exist on the surface.
 *
 * Conditions:
 *  - Rocky planet
 *  - tempMax > -183 °C (some thawing occurs)
 *  - avg ∈ [-183, -161] °C
 */
export function canHaveLiquidMethane(input: BodyWaterProfile | BodyConfig): boolean {
  const { type, temperatureMax } = tempsOf(input)
  if (type !== 'rocky') return false
  const avg = averageBodyTemperature(input)
  return temperatureMax > LIQUID_METHANE_MIN_AVG
    && avg >= LIQUID_METHANE_MIN_AVG
    && avg <= LIQUID_METHANE_MAX_AVG
}

/**
 * True when liquid nitrogen (N₂) can exist on the surface.
 *
 * Conditions:
 *  - Rocky planet
 *  - tempMax > -210 °C (some thawing occurs)
 *  - avg ∈ [-210, -196] °C
 */
export function canHaveLiquidNitrogen(input: BodyWaterProfile | BodyConfig): boolean {
  const { type, temperatureMax } = tempsOf(input)
  if (type !== 'rocky') return false
  const avg = averageBodyTemperature(input)
  return temperatureMax > LIQUID_NITROGEN_MIN_AVG
    && avg >= LIQUID_NITROGEN_MIN_AVG
    && avg <= LIQUID_NITROGEN_MAX_AVG
}

// ── Frozen surface eligibility ───────────────────────────────────

/**
 * Frozen water ice sheets: temperatureMax ≤ 0 °C.
 * Ice exists at any temperature below freezing — no lower bound.
 */
export function canHaveFrozenSurface(input: BodyWaterProfile | BodyConfig): boolean {
  const { type, temperatureMax } = tempsOf(input)
  if (type !== 'rocky') return false
  return temperatureMax <= 0
}

/**
 * Frozen ammonia surface: temperatureMax ≤ -78 °C, avg ∈ [-110, -78).
 */
export function canHaveFrozenAmmonia(input: BodyWaterProfile | BodyConfig): boolean {
  const { type, temperatureMax } = tempsOf(input)
  if (type !== 'rocky') return false
  const avg = averageBodyTemperature(input)
  return temperatureMax <= LIQUID_AMMONIA_MIN_AVG
    && avg >= FROZEN_AMMONIA_MIN_AVG
    && avg < LIQUID_AMMONIA_MIN_AVG
}

/**
 * Frozen methane surface: temperatureMax ≤ -183 °C, avg ∈ [-210, -183).
 */
export function canHaveFrozenMethane(input: BodyWaterProfile | BodyConfig): boolean {
  const { type, temperatureMax } = tempsOf(input)
  if (type !== 'rocky') return false
  const avg = averageBodyTemperature(input)
  return temperatureMax <= LIQUID_METHANE_MIN_AVG
    && avg >= FROZEN_METHANE_MIN_AVG
    && avg < LIQUID_METHANE_MIN_AVG
}

/**
 * Frozen nitrogen surface: temperatureMax ≤ -210 °C, avg ∈ [-230, -210).
 */
export function canHaveFrozenNitrogen(input: BodyWaterProfile | BodyConfig): boolean {
  const { type, temperatureMax } = tempsOf(input)
  if (type !== 'rocky') return false
  const avg = averageBodyTemperature(input)
  return temperatureMax <= LIQUID_NITROGEN_MIN_AVG
    && avg >= FROZEN_NITROGEN_MIN_AVG
    && avg < LIQUID_NITROGEN_MIN_AVG
}

// ── Composite queries ────────────────────────────────────────────

/** True when atmospheric water vapour can be present given the body's average temperature. */
export function canHaveAtmosphericWater(input: BodyWaterProfile | BodyConfig): boolean {
  const { type } = tempsOf(input)
  if (type !== 'rocky') return false
  const avg = averageBodyTemperature(input)
  return avg >= ATMOSPHERIC_WATER_MIN_AVG_TEMP && avg <= ATMOSPHERIC_WATER_MAX_AVG_TEMP
}

/** True when the biome represents a surface liquid body (shallow or deep ocean tile). */
export function isSurfaceWaterBiome(biome: BiomeType | undefined): boolean {
  return biome === 'ocean' || biome === 'ocean_deep'
}

/**
 * Determine the dominant surface liquid for a rocky planet.
 *
 * Selection strategy:
 *  1. If any substance can exist as a LIQUID on the surface, pick it
 *     (priority: water > ammonia > methane > nitrogen).
 *  2. Otherwise, pick the substance whose frozen range best matches the
 *     planet's average temperature (warmest applicable frozen type first).
 *
 * Returns `undefined` for dry worlds where no liquid or ice can form.
 */
export function getSurfaceLiquidType(
  input: BodyWaterProfile | BodyConfig,
): SurfaceLiquidType | undefined {
  // Prefer any liquid state over frozen-only candidates.
  if (canHaveLiquidSurfaceWater(input)) return 'water'
  if (canHaveLiquidAmmonia(input))      return 'ammonia'
  if (canHaveLiquidMethane(input))      return 'methane'
  if (canHaveLiquidNitrogen(input))     return 'nitrogen'

  // Frozen state — pick by temperature (warmest applicable first)
  // Water ice exists at any T ≤ 0 °C, but colder worlds should prefer
  // the exotic ice whose frozen range actually contains their avg temp.
  if (canHaveFrozenNitrogen(input))     return 'nitrogen'
  if (canHaveFrozenMethane(input))      return 'methane'
  if (canHaveFrozenAmmonia(input))      return 'ammonia'
  if (canHaveFrozenSurface(input))      return 'water'

  return undefined
}

/**
 * True when the planet can have any surface liquid body —
 * liquid ocean OR frozen sheet of any substance.
 */
export function canHaveSurfaceWaterBody(input: BodyWaterProfile | BodyConfig): boolean {
  return getSurfaceLiquidType(input) !== undefined
}

/**
 * True when the dominant surface body is in liquid state
 * (water, ammonia, methane or nitrogen ocean).
 * Returns false for frozen sheets, dry worlds, and non-rocky bodies.
 *
 * Used by renderers to decide whether ocean tiles should animate as
 * flowing liquid or stay static (ice).
 */
export function hasLiquidSurface(input: BodyWaterProfile | BodyConfig): boolean {
  return canHaveLiquidSurfaceWater(input)
    || canHaveLiquidAmmonia(input)
    || canHaveLiquidMethane(input)
    || canHaveLiquidNitrogen(input)
}

