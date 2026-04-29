/**
 * Star reference frame — G-type baseline + spectral kelvin lookup.
 *
 * Pure-logic constants, no `three` import. Used by the star physics
 * module (luminosity, colour) and by the body's render layer when
 * deriving a star's surface temperature from its spectral type.
 */

/**
 * Reference stellar radius (world units) for a G-type star.
 * Other stars are sized relative to this baseline via `resolveStarData`.
 */
export const REF_STAR_RADIUS = 3       // world units (G-type reference)

/**
 * Reference stellar surface temperature in Kelvin (G-type baseline — Sun's
 * effective surface temperature). Used by `toStarParams` to normalise luminosity.
 */
export const REF_STAR_TEMP   = 5_778   // K  (Sun)

/**
 * Canonical surface temperature (K) per Morgan–Keenan spectral class.
 * Used as a fallback when a star config does not specify an explicit
 * temperature. Keys are single-letter spectral types (O, B, A, F, G, K, M).
 */
export const SPECTRAL_KELVIN: Record<string, number> = {
  O: 30_000,
  B: 20_000,
  A:  9_000,
  F:  7_000,
  G:  5_778,
  K:  4_500,
  M:  3_000,
}

/**
 * Tile-reference radius per spectral class — feeds the hexasphere
 * subdivision count so tile counts stay stable across spectral types
 * regardless of the (much larger) display sphere. Consumed by the star
 * strategy in `bodyTypeStrategy.ts`.
 */
export const STAR_TILE_REF: Record<string, number> = { M: 2.0, K: 2.5, G: 3.0, F: 3.5 }
