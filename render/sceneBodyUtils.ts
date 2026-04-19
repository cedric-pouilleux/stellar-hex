import type { BodyConfig, SpectralType } from '../types/body.types'
import {
  averageBodyTemperature,
  canHaveAtmosphericWater,
  canHaveLiquidSurfaceWater,
  canHaveLiquidAmmonia,
  canHaveLiquidMethane,
  canHaveLiquidNitrogen,
  getSurfaceLiquidType,
} from '../physics/bodyWater'

// ── Display labels & colors ──────────────────────────────────────

/** French labels for body types (used in HUD overlays and top-down labels). */
export const BODY_TYPE_LABEL: Record<string, string> = {
  rocky:    'Rocheuse',
  gaseous:  'Gazeuse',
  metallic: 'Métallique',
}

/** Accent colors for body type badges in the HUD. */
export const BODY_TYPE_COLOR: Record<string, string> = {
  rocky:    'rgba(200, 140, 75, 0.9)',
  gaseous:  'rgba(110, 175, 245, 0.9)',
  metallic: 'rgba(160, 215, 230, 0.9)',
  star:     'rgba(255, 205, 80, 0.9)',
}

// ── Atmosphere radius ─────────────────────────────────────────────

/**
 * Safe upper bound for terrain extrusion height when no palette is available.
 * terrainPalette.ts reaches 0.060 (absolute world units) for the tallest biomes,
 * so this constant covers every generated palette regardless of planet size.
 */
const MAX_TERRAIN_HEIGHT_FALLBACK = 0.06

/**
 * Returns the radius of the atmosphere shell for a given body config.
 *
 * Two guarantees — regardless of planet size:
 *  1. The shell always clears the tallest terrain (palette max height, or the
 *     0.06-unit fallback when config.palette is not provided, e.g. for dynamically
 *     generated palettes that are never stored back in config).
 *  2. There is a clearly visible gap of ≥ 20 % of baseRadius above the terrain top.
 */
export function atmosphereRadius(config: BodyConfig): number {
  const maxTerrainH = config.palette?.length
    ? Math.max(...config.palette.map(l => l.height))
    : MAX_TERRAIN_HEIGHT_FALLBACK
  return config.radius + maxTerrainH + config.radius * 0.20
}

// ── Cloud coverage ────────────────────────────────────────────────

/**
 * Computes the cloud coverage ratio [0..1] for a rocky planet config.
 * Returns null if the body should not render clouds.
 *
 * Any liquid surface (water, ammonia, methane, nitrogen) produces a
 * decorative cloud layer representing vapour of the dominant substance.
 * Atmospheric water (no surface body) uses a formula-driven coverage.
 * Frozen worlds → locked in tiles → no clouds.
 */
export function cloudCoverageFor(config: BodyConfig): number | null {
  if (config.type !== 'rocky') return null
  const atmo  = config.atmosphereThickness ?? 0
  const water = config.waterCoverage       ?? 0
  if (atmo  < 0.15) return null
  if (water < 0.10) return null

  // Any liquid-state surface (water, ammonia, methane, nitrogen): decorative cloud layer.
  // Frozen surfaces don't produce vapour, so check per-liquid eligibility.
  const hasLiquid = canHaveLiquidSurfaceWater(config)
    || canHaveLiquidAmmonia(config)
    || canHaveLiquidMethane(config)
    || canHaveLiquidNitrogen(config)
  if (hasLiquid) return 0.35

  // Atmospheric water (vapour but no liquid on the surface):
  // scale clouds by atmospheric composition — the denser, the more vapour.
  if (canHaveAtmosphericWater(config)) {
    const coverage = Math.min(0.75, water * 0.55 + atmo * 0.20)
    return coverage > 0.05 ? coverage : null
  }

  return null
}

// ── Atmosphere presence ───────────────────────────────────────────

/**
 * Returns true if the body should render an atmosphere shell.
 */
export function hasAtmosphere(config: BodyConfig): boolean {
  if (config.type === 'star') return true
  return (config.atmosphereThickness ?? 0) >= 0.05
}

// ── Aura params ───────────────────────────────────────────────────

export interface AuraParams { color: string; intensity: number; power: number }

/** Fallback star aura colour when spectralType is not set, derived from °C. */
function starColorFromTemp(avgCelsius: number): string {
  if (avgCelsius < 3500)  return '#ff2200'
  if (avgCelsius < 5000)  return '#ff6600'
  if (avgCelsius < 7000)  return '#ff9900'
  if (avgCelsius < 12000) return '#ff8800'
  return '#aaddff'
}

// ── Star aura colors keyed by spectral type ───────────────────────
// Must match the dominant visual color of buildStarPalette (starPalette.ts)
// so the atmosphere glow is always consistent with the star surface.
// O/B/A → blue-white hot stars; F → warm white; G/K/M → warm orange/red.
const SPECTRAL_AURA_COLOR: Record<SpectralType, string> = {
  O: '#aaddff',  // blue-white (> 30 000 K)
  B: '#bbccff',  // blue-white (10 000–30 000 K)
  A: '#ddeeff',  // pale blue  (7 500–10 000 K)
  F: '#ffe8a0',  // warm white / gold (6 000–7 500 K)
  G: '#ff9900',  // orange-gold — Sun-like (5 200–6 000 K)
  K: '#ff6600',  // orange (3 700–5 200 K)
  M: '#ff2200',  // red giant (< 3 700 K)
}

/**
 * Derives atmosphere glow color and intensity from body config.
 *
 * Stars: colour is derived from spectralType when available (same source as
 * the surface shader), guaranteeing that the atmosphere always matches the
 * star's visual colour. Falls back to averageBodyTemperature only when
 * spectralType is absent.
 *
 * Planets: water/temperature heuristics.
 */
export function auraParamsFor(config: BodyConfig): AuraParams {
  // ── Stars: colour from spectral type (consistent with surface shader) ──
  if (config.type === 'star') {
    const color = config.spectralType
      ? SPECTRAL_AURA_COLOR[config.spectralType]
      : starColorFromTemp(averageBodyTemperature(config))
    return { color, intensity: 1.2, power: 2.5 }
  }

  const avgTemp = averageBodyTemperature(config)
  const water   = config.waterCoverage ?? 0
  const atmo    = config.atmosphereThickness ?? 0

  // ── Liquid-state surface (water, ammonia, methane, nitrogen) ──────
  const hasLiquid = canHaveLiquidSurfaceWater(config)
    || canHaveLiquidAmmonia(config)
    || canHaveLiquidMethane(config)
    || canHaveLiquidNitrogen(config)
  if (water > 0.1 && hasLiquid) {
    const liquid = getSurfaceLiquidType(config)
    const auraColor = liquid === 'ammonia'  ? '#88aa33'   // olive-green
      : liquid === 'methane'                ? '#aa7730'   // amber
      : liquid === 'nitrogen'               ? '#cc99aa'   // pale rose
      :                                       '#2255ff'   // blue (water)
    return { color: auraColor, intensity: 0.5 + atmo * 0.3, power: 3.5 }
  }

  // ── Frozen world (cold with some water/ice) ──────────────────────
  if (avgTemp <= -10 && water > 0.05)
    return { color: '#99ddff', intensity: 0.4 + atmo * 0.2, power: 3.5 }

  // ── Hot / arid (Venus-like, runaway greenhouse) ──────────────────
  if (avgTemp > 100)
    return { color: '#ff6622', intensity: 0.5 + atmo * 0.4, power: 3.0 }

  // ── Gaseous planets ──────────────────────────────────────────────
  if (config.type === 'gaseous') {
    const color = avgTemp > 0 ? '#ddaa66' : '#aabbdd'
    return { color, intensity: 0.6, power: 2.8 }
  }

  // ── Dry rocky with thin atmosphere ──────────────────────────────
  return { color: '#7799bb', intensity: 0.35 + atmo * 0.2, power: 4.0 }
}
