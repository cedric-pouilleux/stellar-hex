/**
 * Body defaults — physics rules and body-level constants.
 * Pure domain data: no runtime dependency on other features, so the body
 * module can be consumed standalone (playground, shader scenes, etc.).
 */

// ── Tile geometry ─────────────────────────────────────────────────────────────
/**
 * Target physical size (world units) for a single hexasphere tile.
 * All bodies derive their subdivision count from this value via
 * `tileSizeToSubdivisions(radius, DEFAULT_TILE_SIZE)`, ensuring every tile
 * across stars, planets and moons has the same surface footprint.
 */
export const DEFAULT_TILE_SIZE = 0.15

// ── Star reference frame ──────────────────────────────────────────────────────
// G-type baseline values used by body's own star physics (luminosity, colour).
export const REF_STAR_RADIUS = 3       // world units (G-type reference)
export const REF_STAR_TEMP   = 5_500   // K  (close to Sun's 5778 K)

// ── Terrain elevation thresholds (rocky planets) ─────────────────────────────
// Normalised land-position fractions (0 = sea level, 1 = highest peak).
// Shared between BiomeClassifier and terrainPalette — must stay in sync.

/** Narrow coastal band just above sea level (0–9 % of land range). */
export const SHORE_FRAC = 0.09

/** Lowland/plain band (9–30 % of land range). */
export const LOW_FRAC   = 0.30

/** Midland/highland band (30–65 % of land range). */
export const MID_FRAC   = 0.65

/**
 * Canonical terrain subdivision count. Used when a BodyConfig omits an
 * explicit `terrainLevelCount`. Split evenly between ocean and land
 * (N/2 = 10 ocean levels, 10 land levels), so each rocky planet has the
 * same palette resolution by default.
 */
export const DEFAULT_TERRAIN_LEVEL_COUNT = 20

/**
 * Per-level elevation step expressed as a fraction of the body radius.
 * The palette spans ±(N/2 * STEP) around the planet surface, so the total
 * relief amplitude scales with the body (Earth = huge mountains, moonlet =
 * flat) while keeping visual ratios constant across sizes.
 */
export const TERRAIN_LEVEL_STEP_PER_RADIUS = 0.012

/**
 * Default surface-liquid coverage ranges, per liquid type, used when a
 * `BodyConfig.waterCoverage` value is not explicitly provided.
 *
 * Water worlds can have oceans covering a wide fraction of the surface
 * (Earth ≈ 70 %). Exotic cryogenic liquids — ammonia, methane, nitrogen —
 * are far more confined in nature (Titan's methane lakes cover ~2 % of the
 * surface), so their default range is much narrower.
 *
 * Each entry is a `[min, max]` tuple in [0, 1].
 */
export const WATER_COVERAGE_RANGE = {
  water:    [0.10, 0.80],
  ammonia:  [0.02, 0.20],
  methane:  [0.01, 0.15],
  nitrogen: [0.01, 0.10],
} as const

/**
 * Minimum vegetation potential required for a tile to classify as forest.
 * Derived from atmosphere density and temperate-zone proximity — a purely
 * climate-driven score, independent of any consumer-level habitability logic.
 *   vegetation = atmosphereThickness × max(0, 1 - |avg - 15°C| / 55)
 */
export const FOREST_VEGETATION_THRESH = 0.30

// ── Metallic planet elevation thresholds ─────────────────────────────────────
// Raw noise elevation values (not normalised land-position fractions).

/** Crater floor / depression band: elevation below this → metallic_plain. */
export const METALLIC_PLAIN_THRESH = 0.20

/** Peak band: elevation above this → metallic_peak. */
export const METALLIC_PEAK_THRESH  = 0.80

// ── Spectral type → surface temperature ──────────────────────────────────────
export const SPECTRAL_KELVIN: Record<string, number> = {
  O: 30_000,
  B: 20_000,
  A:  9_000,
  F:  7_000,
  G:  5_778,
  K:  4_500,
  M:  3_000,
}
