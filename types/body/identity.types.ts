/**
 * Body identity sub-profile — `name` + classification fields. Pure-logic;
 * imports no `three` types. Re-exported through the {@link ../body.types}
 * barrel so existing import paths keep working.
 */

import type { BodyType, SurfaceLook } from '../surface.types'

/**
 * Spectral classification for stellar bodies — Morgan–Keenan single-letter
 * codes. Drives every star-specific derivation (palette, granulation,
 * godrays, tile-reference radius). Lives here because {@link StarIdentity}
 * is the canonical user; the physics layer also reads it via
 * {@link StarPhysicsInput}.
 */
export type SpectralType = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M'

/**
 * Identity for a planetary body. The `name` feeds the deterministic seed
 * used by every generation step, so two bodies with the same name produce
 * identical tiles and elevations. `surfaceLook` selects the visual archetype
 * (terrain / bands / metallic), defaulting to `'terrain'`.
 */
export interface PlanetIdentity {
  type:         'planetary'
  name:         string
  surfaceLook?: SurfaceLook
}

/**
 * Identity for a stellar body. `spectralType` is required — it drives every
 * star-specific derivation (palette, granulation, godrays, tile-reference
 * radius). Stars ignore {@link SurfaceLook}; their pipeline is fixed.
 */
export interface StarIdentity {
  type:         'star'
  name:         string
  spectralType: SpectralType
}

/**
 * Discriminated union of identity shapes. Kept as a union (not an
 * intersection) so the discriminant `type` narrows accesses to the
 * type-specific fields (`surfaceLook` / `spectralType`).
 */
export type BodyIdentity = PlanetIdentity | StarIdentity

export type { BodyType, SurfaceLook }
