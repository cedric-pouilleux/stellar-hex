/**
 * Body radial layering — core / shell split.
 *
 * Pure-logic helpers, no `three` import. Defines the densities used to
 * derive a core/shell volume split from a gas-mass fraction, plus the
 * resolver that combines explicit overrides, derived ratios and the
 * sol-band guard.
 */

import type { BodyType } from '../types/surface.types'

/**
 * Default ratio of the solid core radius to the visual surface radius.
 * Used by all non-stellar bodies (rocky / metallic / icy / gaseous) when
 * neither `BodyConfig.coreRadiusRatio` nor `BodyConfig.gasMassFraction` is
 * supplied. The core occupies the sphere of radius
 * `config.radius * DEFAULT_CORE_RADIUS_RATIO`; the remaining shell
 * `[coreRadius, radius]` is shared by the sol + atmosphere layers.
 */
export const DEFAULT_CORE_RADIUS_RATIO = 0.55

/**
 * Reference density of the solid component (kg/m³) — a rough average for
 * rock + iron under planetary compression. Used by
 * {@link deriveCoreRadiusRatio} to translate a gas-mass fraction into a
 * core/shell volume split.
 */
export const REF_SOLID_DENSITY = 5_500

/**
 * Column-integrated effective density of the gas envelope (kg/m³).
 *
 * Physically the envelope density varies with altitude (scale-height
 * collapse near the surface, near-vacuum at the top). The lib treats the
 * envelope as a single equivalent volume for the core/shell split, so this
 * constant captures the "average density that would fill the same volume
 * with the same mass". Tuned so Jupiter-like bodies
 * (`gasMassFraction ≈ 0.93`) land near `coreRadiusRatio ≈ 0.2`.
 */
export const REF_GAS_DENSITY = 100

/**
 * Derives the core/shell split from a body's gas-mass fraction using the
 * solid + gas density references. Assumes a two-phase body:
 *
 *   `V_solid / V_total = (1 - f) / ((1 - f) + f · ρ_solid / ρ_gas)`
 *   `coreRadiusRatio   = ∛(V_solid / V_total)`
 *
 * Boundary behaviour:
 *   - `f = 0` → `1.0` (fully solid body, no atmosphere shell)
 *   - `f = 1` → `0.0` (pure gas ball, no core — render code must handle
 *                      `coreRadius = 0` by hiding the core mesh)
 *   - monotonically decreasing in `f` on `[0, 1]`.
 *
 * @param gasMassFraction - Fraction of the body's total mass carried by
 *                          its gas envelope, clamped to `[0, 1]`.
 */
export function deriveCoreRadiusRatio(gasMassFraction: number): number {
  const f = Math.max(0, Math.min(1, gasMassFraction))
  if (f <= 0) return 1
  if (f >= 1) return 0
  const rhoRatio    = REF_SOLID_DENSITY / REF_GAS_DENSITY
  const volumeRatio = (1 - f) / ((1 - f) + f * rhoRatio)
  return Math.cbrt(volumeRatio)
}

/**
 * Minimum fraction of the radius reserved for the sol band — guards against
 * pathological configs where `coreRadiusRatio + atmosphereThickness ≥ 1`.
 * The sol band always carries at least 5 % of the radius so the layered
 * mesh keeps a non-degenerate prism for every tile.
 */
export const MIN_SOL_BAND_FRACTION = 0.05

/**
 * Resolves the effective `coreRadiusRatio` for a body, in priority order:
 *
 *   1. explicit `coreRadiusRatio` on the config — user opt-in override
 *   2. derivation from `gasMassFraction` via {@link deriveCoreRadiusRatio}
 *   3. {@link DEFAULT_CORE_RADIUS_RATIO}
 *
 * The result is then clamped so that
 * `coreRatio + atmosphereThickness ≤ 1 − MIN_SOL_BAND_FRACTION`.
 * The sol band is the part of the radius that
 * carries the playable terrain prisms; collapsing it to zero (or worse,
 * negative) would leave the layered mesh with no room for the sol layer
 * — this clamp keeps the radial partition `[core | sol | atmo]` valid.
 */
export function resolveCoreRadiusRatio(config: {
  type?:                BodyType
  coreRadiusRatio?:     number
  gasMassFraction?:     number
  atmosphereThickness?: number
}): number {
  let raw: number
  if (typeof config.coreRadiusRatio === 'number') {
    raw = config.coreRadiusRatio
  } else if (typeof config.gasMassFraction === 'number') {
    raw = deriveCoreRadiusRatio(config.gasMassFraction)
  } else {
    raw = DEFAULT_CORE_RADIUS_RATIO
  }
  // Sol-band guard: whatever the caller asked for, the radial partition
  // `[core | sol | atmo]` must keep at least `MIN_SOL_BAND_FRACTION` for
  // the sol layer so the layered prism mesh stays non-degenerate.
  const atmo    = Math.max(0, Math.min(1, config.atmosphereThickness ?? 0))
  const maxCore = Math.max(0, 1 - atmo - MIN_SOL_BAND_FRACTION)
  return Math.max(0, Math.min(raw, maxCore))
}
