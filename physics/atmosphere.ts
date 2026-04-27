/**
 * Atmosphere thickness rules — per-type caps + resolver.
 *
 * Pure-logic helpers, no `three` import. Consumed by both the sim layer
 * (terrain band count derivation) and the render layer (sol / atmo radial
 * partition).
 */

import type { BodyType } from '../types/surface.types'

/**
 * Per-type cap for `BodyConfig.atmosphereThickness`, in `[0, 1]`. Clamps the
 * raw config field at read time so a careless caller cannot collapse the
 * sol band of a rocky planet by setting an gas-giant-sized atmosphere on
 * it. Use {@link resolveAtmosphereThickness} to apply the cap.
 *
 *   - rocky    : `0.20` — the planet must remain dominantly rocky
 *   - gaseous  : `0.80` — atmo dominates; sol band stays slim
 *   - metallic : `0.05` — barely an exosphere
 *   - star     : `0`    — stars never carry an atmo shell
 */
export const MAX_ATMOSPHERE_THICKNESS_BY_TYPE: Record<BodyType, number> = {
  rocky:    0.20,
  gaseous:  0.80,
  metallic: 0.05,
  star:     0,
}

/**
 * Resolves the **effective** atmosphere thickness for a body — clamps the
 * raw config field to `[0, MAX_ATMOSPHERE_THICKNESS_BY_TYPE[type]]`. Use
 * this helper everywhere `config.atmosphereThickness` is read so per-type
 * caps are enforced lib-side.
 */
export function resolveAtmosphereThickness(config: {
  type: BodyType
  atmosphereThickness?: number
}): number {
  const raw = Math.max(0, Math.min(1, config.atmosphereThickness ?? 0))
  const max = MAX_ATMOSPHERE_THICKNESS_BY_TYPE[config.type] ?? 1
  return Math.min(raw, max)
}
