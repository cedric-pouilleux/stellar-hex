/**
 * Top-level body configuration — composed from the orthogonal sub-profiles
 * (identity, physics, noise, visual). Pure-logic; no `three` import.
 *
 * {@link BodyConfig} is a **discriminated union** of two strict shapes —
 * {@link PlanetConfig} (`type: 'planetary'`) and {@link StarConfig}
 * (`type: 'star'`) — so consumers cannot accidentally assign a planet-only
 * field (e.g. `metallicBands`) on a star, or vice-versa. Narrow on
 * `config.type === 'star'` to access the type-specific shape.
 */

import type { PlanetIdentity, StarIdentity } from './identity.types'
import type { PlanetPhysics, StarPhysics }   from './physics.types'
import type { BodyNoiseProfile }             from './noiseProfile.types'
import type { PlanetVisualProfile }          from './visualProfile.types'

/**
 * Full configuration for a planetary body — composed as the intersection
 * of identity, physics, noise and visual sub-profiles. Stars use
 * {@link StarConfig} instead.
 */
export type PlanetConfig =
  & PlanetIdentity
  & PlanetPhysics
  & BodyNoiseProfile
  & PlanetVisualProfile

/**
 * Full configuration for a stellar body. Composed of identity + physics +
 * noise; carries no visual profile (the look is fully derived from
 * {@link SpectralType}).
 */
export type StarConfig =
  & StarIdentity
  & StarPhysics
  & BodyNoiseProfile

/**
 * Discriminated union of the two body shapes. Narrow on
 * `config.type === 'star'` (or `'planetary'`) before reading type-specific
 * fields.
 *
 * The discriminant encodes every structural difference between the two
 * branches at compile time — assigning a planet-only field on a star
 * config (e.g. `metallicBands` next to `type: 'star'`) is rejected by the
 * type-checker, and vice-versa.
 */
export type BodyConfig = PlanetConfig | StarConfig
