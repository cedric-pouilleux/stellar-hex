import type { BodyConfig, SpectralType } from '../types/body.types'

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

// ── Body outer radius ─────────────────────────────────────────────

/**
 * Safe upper bound for terrain extrusion height when no palette is available.
 * terrainPalette.ts reaches 0.060 (absolute world units) for the tallest biomes,
 * so this constant covers every generated palette regardless of planet size.
 */
const MAX_TERRAIN_HEIGHT_FALLBACK = 0.06

/**
 * Returns the outermost terrain radius of a body — the base radius plus the
 * tallest extrusion height declared in its palette (or a safe fallback when no
 * palette is attached, matching the tallest generated biome).
 *
 * Any spherical shell that must visually clear the hexa terrain (atmosphere,
 * clouds, ice) should be anchored to this value.
 */
export function bodyOuterRadius(config: BodyConfig): number {
  const maxTerrainH = config.palette?.length
    ? Math.max(...config.palette.map(l => l.height))
    : MAX_TERRAIN_HEIGHT_FALLBACK
  return config.radius + maxTerrainH
}

// ── Atmosphere radius ─────────────────────────────────────────────

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
  return bodyOuterRadius(config) + config.radius * 0.20
}

// ── Cloud shell radius ────────────────────────────────────────────

/**
 * Returns the radius of the cloud (or ice) shell for a given body config.
 *
 * Mirrors {@link atmosphereRadius} — the shell is anchored to
 * {@link bodyOuterRadius} so tall hex tiles never poke through the layer. The
 * gap above the terrain is tighter than the atmosphere's (clouds hug the
 * surface), smaller for the frozen ice sheet than for animated clouds.
 */
export function cloudShellRadius(config: BodyConfig, frozen: boolean): number {
  const offset = frozen ? config.radius * 0.08 : config.radius * 0.14
  return bodyOuterRadius(config) + offset
}

// ── Aura params ───────────────────────────────────────────────────

/**
 * Aura tuning returned by {@link auraParamsFor} — colour, intensity and
 * fresnel power of the atmospheric glow around a body.
 */
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
 * Known surface-liquid aura palette. Callers using one of these liquid tags
 * get a canonical atmospheric glow; any other (or missing) tag falls back to
 * the generic water-ish blue. Consumers with custom liquid vocabularies can
 * drive a stronger override by supplying an explicit `palette` / shader input.
 */
const LIQUID_AURA_COLOR: Record<string, string> = {
  water:    '#2255ff',  // blue
  ammonia:  '#88aa33',  // olive-green
  methane:  '#aa7730',  // amber
  nitrogen: '#cc99aa',  // pale rose
}

/**
 * Derives atmosphere glow color and intensity from body config.
 *
 * Stars: colour is derived from spectralType when available (same source as
 * the surface shader), guaranteeing that the atmosphere always matches the
 * star's visual colour. Falls back to a temperature-based ramp only when
 * spectralType is absent.
 *
 * Planets: liquid-state + temperature heuristics — the caller declares the
 * surface liquid via `BodyConfig.liquidType` / `liquidState` / `liquidCoverage`,
 * and the aura follows.
 */
export function auraParamsFor(config: BodyConfig): AuraParams {
  // ── Stars: colour from spectral type (consistent with surface shader) ──
  if (config.type === 'star') {
    const avg = (config.temperatureMin + config.temperatureMax) / 2
    const color = config.spectralType
      ? SPECTRAL_AURA_COLOR[config.spectralType]
      : starColorFromTemp(avg)
    return { color, intensity: 1.2, power: 2.5 }
  }

  const avgTemp  = (config.temperatureMin + config.temperatureMax) / 2
  const coverage = config.liquidCoverage ?? 0
  const atmo     = config.atmosphereThickness ?? 0

  // ── Liquid-state surface (caller-declared) ───────────────────────
  if (coverage > 0.1 && config.liquidState === 'liquid') {
    const color = (config.liquidType && LIQUID_AURA_COLOR[config.liquidType]) ?? '#2255ff'
    return { color, intensity: 0.5 + atmo * 0.3, power: 3.5 }
  }

  // ── Frozen world (cold with some ice coverage) ───────────────────
  if (avgTemp <= -10 && coverage > 0.05)
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
