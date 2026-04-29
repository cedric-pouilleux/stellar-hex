/**
 * Atmosphere thickness resolver.
 *
 * Pure-logic helper, no `three` import. The lib stays agnostic of body
 * "archetypes" (rocky, gaseous…) — the only hard constraint enforced
 * here is the `[0, 1]` interval. The geometric guard against a collapsed
 * sol band lives in `resolveCoreRadiusRatio` via `MIN_SOL_BAND_FRACTION`.
 *
 * Stars never carry an atmo shell — the render pipeline filters that
 * case at construction (no `<atmoShell>` is mounted) without needing a
 * per-type cap here.
 */

import type { BodyType } from '../types/surface.types'

/**
 * Resolves the **effective** atmosphere thickness for a body — clamps the
 * raw config field to `[0, 1]`. Use this helper everywhere
 * `config.atmosphereThickness` is read so the same value flows into both
 * the sim layer (terrain band count) and the render layer (radial
 * partition).
 *
 * `config.type` is accepted on the input shape for forward-compat (a future
 * type might need its own clamp) but is not currently read.
 */
export function resolveAtmosphereThickness(config: {
  type: BodyType
  atmosphereThickness?: number
}): number {
  return Math.max(0, Math.min(1, config.atmosphereThickness ?? 0))
}

/**
 * Single source of truth for "does this body carry an atmosphere?".
 *
 * Stars never carry an atmosphere. Every other body type honours
 * `atmosphereThickness` — a value of `0` (or omitted) means the body is
 * configured without atmosphere and the render layer must skip the
 * playable atmo layer (hex prisms collapse to zero thickness) and the
 * shader-view halo (no atmo shell mounted).
 *
 * Mirror helper to {@link hasSurfaceLiquid} so the lib exposes a
 * consistent vocabulary for "this body has feature X" predicates.
 */
export function hasAtmosphere(config: {
  type:                 BodyType
  atmosphereThickness?: number
}): boolean {
  if (config.type === 'star') return false
  return (config.atmosphereThickness ?? 0) > 0
}
