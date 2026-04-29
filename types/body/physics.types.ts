/**
 * Body physics sub-profiles — radial layering, atmosphere, surface liquid,
 * gas envelope, plus the lightweight star-physics input/output shapes used
 * by `physics/starPhysics.ts`. Pure-logic; no `three` import.
 */

import type { SpectralType } from './identity.types'

/**
 * Physical fields shared by every body type — geometry + motion + optional
 * mass and core split. Backend physics models can compute these and ship
 * them to the frontend as-is.
 *
 * The lib is **chemistry- and climate-agnostic**: it never reads a
 * temperature field to derive a visual or a phase. Callers that want a
 * climate-driven look (lava colour, ocean tint, gas turbulence) compute
 * those values from their own thermal model and push them via the
 * type-specific visual profile and {@link ../body.types#BodyVariation}
 * overrides.
 */
export interface BodyPhysicsCore {
  /** Visual radius in world units. Also drives the terrain band count via {@link resolveTerrainLevelCount}. */
  radius:           number
  /** Self-rotation speed (rad/s). */
  rotationSpeed:    number
  /** Axial tilt from the orbital plane (radians). */
  axialTilt:        number
  /** Body mass in Earth masses. Optional — defaults are derived from type + radius when omitted. */
  mass?:            number
  /**
   * Ratio of solid core radius to the visual surface radius. The core
   * sphere sits at `radius * coreRadiusRatio`; the shell above hosts the
   * sol + atmosphere layers (planets only — stars expose the same field
   * for the inner sphere mesh used by core-shell transparencies).
   *
   * Resolution order when building a body:
   *   1. explicit `coreRadiusRatio` (this field) — user override
   *   2. derivation from `gasMassFraction` + density references (planets only)
   *   3. `DEFAULT_CORE_RADIUS_RATIO` (0.55)
   */
  coreRadiusRatio?: number
}

/**
 * Planet-specific physics — atmosphere shell, surface liquid, gas envelope
 * mass fraction. None of these apply to stars (which expose no atmo halo,
 * no playable atmo layer, no surface liquid).
 */
export interface PlanetPhysics extends BodyPhysicsCore {
  /**
   * Atmosphere thickness as a **strict radial fraction** of `radius`, in
   * `[0, 1]`. `0` disables the atmo shell entirely.
   *
   * The body's silhouette stays exactly at `radius`. The shell `[0, radius]`
   * is partitioned radially as:
   *
   *   - core      : `[0, radius × coreRadiusRatio]`
   *   - sol       : `[coreRadius, radius × (1 − atmosphereThickness)]`
   *   - atmosphere: `[solOuterRadius, radius]`
   *
   * So `atmosphereThickness = 0.6` on a gas giant carves 60 % of the radius
   * for the atmo layer; the sol band is squeezed into the remaining
   * `1 − atmosphereThickness − coreRadiusRatio`. The lib clamps `coreRadiusRatio`
   * so at least 5 % of the radius stays available for the sol band, even
   * when both knobs request more than 100 % combined.
   */
  atmosphereThickness?: number
  /**
   * Atmosphere opacity for the **shader / overview view** (non-interactive
   * render), in `[0, 1]`. The interactive `'atmosphere'` view always uses
   * full opacity so playable atmo tiles read as a solid colour.
   *
   *   - `0`   → atmo skipped in shader view (smooth sphere alone)
   *   - `<1`  → translucent halo (rim fresnel + vertical gradient)
   *   - `1`   → fully opaque shell (smooth sphere skipped under it for perf)
   *
   * When omitted, defaults to the surface-look's table value (terrain ≈ 0.45,
   * bands = 1.0, metallic = 0).
   */
  atmosphereOpacity?:   number
  /**
   * Fraction of the body's total mass carried by its gas envelope, in
   * `[0, 1]`. When set and `coreRadiusRatio` is omitted, the lib derives
   * the core/shell split via `deriveCoreRadiusRatio(gasMassFraction)`
   * using the `REF_SOLID_DENSITY` / `REF_GAS_DENSITY` references.
   *
   *   - `0`   → fully solid world (core fills the whole body)
   *   - `~0.05` → Earth-like (thin atmosphere over a dense core)
   *   - `~0.5` → sub-Neptune
   *   - `~0.9` → Jupiter-class gas giant (small rocky core)
   *   - `1`   → pure gas ball (no core, no sol relief)
   *
   * Leaving this and `coreRadiusRatio` both undefined falls back to
   * `DEFAULT_CORE_RADIUS_RATIO`.
   */
  gasMassFraction?:     number
  /**
   * Physical state of the surface liquid body. Defaults to `'none'`.
   * Presence is encoded by `liquidState !== 'none'`; the substance
   * identity (water, methane, …) is entirely caller-owned and surfaced
   * only as a colour via {@link ../body.types#PlanetVisualProfile.liquidColor}.
   *
   *   - `'liquid'` — the lib stacks an animated hex liquid shell on
   *     submerged tiles via `buildLiquidShell` (top fan animated with
   *     waves / foam / caustics, walls plain translucent).
   *   - `'frozen'` — no liquid shell is rendered. Frozen surfaces are a
   *     caller concern: the recommended pattern is to stack a hex ice
   *     cap on submerged tiles (top at `seaLevelElevation`) using
   *     {@link buildSolidShell}, painted with the substance's
   *     solid-phase tint. The cap is mineable as a separate hex column
   *     above the underlying mineral tile.
   *   - `'none'` — dry surface, no shell rendered.
   *
   * The lib never derives this value from temperature — the caller's
   * chemistry model decides and pushes the resolved state.
   */
  liquidState?:         'liquid' | 'frozen' | 'none'
  /**
   * Initial waterline as a coverage fraction in `[0, 1]` — the
   * proportion of tiles that should sit below sea level at body birth.
   *
   * The simulation resolves it to an integer `seaLevelElevation` band by
   * matching the percentile in the noise distribution. Defaults to
   * `0.5` (half-submerged), preserving the legacy behaviour for callers
   * that do not opt in.
   *
   * Ignored when `liquidState === 'none'`. Runtime moves go through
   * `body.liquid.setSeaLevel(elevation)` which operates in band space,
   * not coverage space.
   */
  liquidCoverage?:      number
}

/**
 * Star-specific physics. Stars carry no atmo halo, no surface liquid and
 * no gas envelope mass fraction — every planet-only field is absent here
 * by construction so it cannot accidentally land on a star config.
 */
export type StarPhysics = BodyPhysicsCore

/**
 * Discriminated union of physics shapes. Kept as a union so callers that
 * narrow on `config.type` get the type-specific fields revealed.
 */
export type BodyPhysics = PlanetPhysics | StarPhysics

// ── Star physics input/output (used by physics/starPhysics.ts) ────
// Minimal struct: spectral type + optional overrides. Distinct from
// `StarConfig` (the body-side variant of `BodyConfig`) because the
// physics calculators (`resolveStarData`, `toStarParams`) only need these
// three fields — callers don't have to construct a full `BodyConfig` to
// query star lookup tables.

/**
 * Inputs accepted by the star physics calculators (`resolveStarData`,
 * `toStarParams`). Spectral type + optional radius / temperature
 * overrides — sufficient for the lookup-table-driven star derivations
 * without requiring a full {@link ../body.types#StarConfig}.
 */
export interface StarPhysicsInput {
  spectralType: SpectralType
  /** Optional override of the spectral default radius (world units). */
  radius?:      number
  /** Optional override of the spectral default temperature (Kelvin). */
  tempK?:       number
}

/** Resolved star physics data — output of `resolveStarData`. */
export interface ResolvedStarData {
  /** Surface temperature in Kelvin. */
  tempK:      number
  /** Visual radius in world units. */
  radius:     number
  /** Luminosity relative to the G-type reference (`L_G = 1`). */
  luminosity: number
  /** Representative CSS hex colour for the spectral class. */
  color:      string
}
