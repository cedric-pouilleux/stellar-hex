/**
 * Body configuration types.
 *
 * {@link BodyConfig} is deliberately composed as an intersection of four
 * orthogonal sub-profiles, each capturing one concern (identity, physics,
 * noise, visual). Consumers that only need a subset (e.g. a noise-only
 * sandbox) can type their signatures against the relevant sub-profile
 * instead of the full `BodyConfig`.
 *
 * This file is pure-logic: it does not import `three` and is safe to load
 * from the headless `sim` entry point. Render-only overrides (palette,
 * anchor colours…) live in {@link BodyRenderOptions}.
 */

import type { BodyType } from './surface.types'

export type { BodyType } from './surface.types'

// ── Spectral classification ───────────────────────────────────────
// Kept here so render code and star physics share one source.
export type SpectralType = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M'

/**
 * Portable colour input accepted by visual override fields. Deliberately a
 * subset of `THREE.ColorRepresentation` (drops the `THREE.Color` instance
 * variant) so this module stays free of any `three` type dependency —
 * consumers of the headless `sim` entry point do not need `@types/three`
 * to typecheck.
 *
 * Render-side code resolves the value via `new THREE.Color(value)` at the
 * moment it builds materials; both `string` (`'#ffaa00'`, `'red'`) and
 * `number` (`0xffaa00`) inputs are accepted by the Three.js constructor.
 */
export type ColorInput = string | number

// ── BodyIdentity ──────────────────────────────────────────────────

/**
 * Identifies the body and its taxonomy. The `name` also feeds the
 * deterministic seed used by every generation step, so two bodies with
 * the same name produce identical tiles and elevations.
 */
export interface BodyIdentity {
  type: BodyType
  name: string
}

// ── BodyPhysics ───────────────────────────────────────────────────

/**
 * Physical parameters — geometry, motion, surface liquid, and
 * type-specific composition. Every field here can in principle be computed
 * by a backend physics model and shipped to the frontend as-is.
 *
 * The lib is **chemistry- and climate-agnostic**: it never reads a
 * temperature field to derive a visual or a phase. Callers that want a
 * climate-driven look (lava colour, ocean tint, gas turbulence) compute
 * those values from their own thermal model and push them via
 * {@link BodyVisualProfile} fields and {@link BodyVariation} overrides.
 */
export interface BodyPhysics {
  /** Visual radius in world units. Also drives the terrain band count via {@link resolveTerrainLevelCount}. */
  radius:         number
  /** Self-rotation speed (rad/s). */
  rotationSpeed:  number
  /** Axial tilt from the orbital plane (radians). */
  axialTilt:      number
  /** Body mass in Earth masses. Optional — defaults are derived from type + radius when omitted. */
  mass?:                number
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
   * for the atmo layer; the sol band is squeezed into the remaining `1 −
   * atmosphereThickness − coreRadiusRatio`. The lib clamps `coreRadiusRatio`
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
   * When omitted, defaults to the body type's table value (rocky ≈ 0.45,
   * gaseous = 1.0, metallic = 0, star = 0).
   */
  atmosphereOpacity?:   number
  /**
   * Ratio of solid core radius to the visual surface radius, applied to all
   * non-stellar bodies (rocky / metallic / icy / gaseous). The core sphere
   * sits at `radius * coreRadiusRatio`; the shell above hosts the sol +
   * atmosphere layers.
   *
   * Resolution order when building a body:
   *   1. explicit `coreRadiusRatio` (this field) — user override
   *   2. derivation from `gasMassFraction` + density references
   *   3. `DEFAULT_CORE_RADIUS_RATIO` (0.55)
   */
  coreRadiusRatio?:     number
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
   * only as a colour via {@link BodyVisualProfile.liquidColor}.
   *
   *   - `'liquid'` — the lib renders an animated liquid shell at sea
   *     level via `buildLiquidSphere`.
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
  /** Spectral classification (star bodies only). */
  spectralType?:    SpectralType
}

// ── BodyNoiseProfile ──────────────────────────────────────────────

/**
 * Parameters of the fBm noise field used to derive tile elevations. All
 * fields are optional — omitting the whole profile reproduces the default
 * simplex sampling (`noiseScale = 1.4`, single octave, no reshaping).
 */
export interface BodyNoiseProfile {
  /** Base simplex frequency. Default `1.4`. */
  noiseScale?:          number
  /**
   * Number of fBm octaves summed to build the terrain noise field.
   * `1` reproduces a single simplex sample (legacy behaviour); higher values
   * stack detail at increasing frequencies. Defaults to `1`.
   */
  noiseOctaves?:        number
  /**
   * Amplitude decay applied at each subsequent fBm octave, in `(0, 1]`.
   * Standard fractal noise uses `0.5`: octave `k` contributes `persistence^k`
   * of octave 0's amplitude. Lower values mute high-frequency octaves,
   * higher values keep them louder. Defaults to `0.5`.
   */
  noisePersistence?:    number
  /**
   * Frequency multiplier between successive fBm octaves. `2` doubles the
   * frequency per octave (classic Mandelbrot-style fractal). Defaults to `2`.
   */
  noiseLacunarity?:     number
  /**
   * Exponent applied to the (signed) noise value for distribution reshaping:
   * `sign(n) * |n|^p`. Defaults to `1`.
   *
   * NOTE: hex tile elevations use equal-frequency quantisation so are
   * invariant to any monotone transform of the noise — this knob therefore
   * leaves per-tile bands unchanged. Its observable effect is on raw noise
   * readers such as the smooth-sphere ocean-mask shader, where the value
   * at each band's upper edge (see `bandToNoiseThreshold`) is reshaped.
   */
  noisePower?:          number
  /**
   * Mix towards a ridge-multifractal transform in `[0, 1]`. `0` keeps the
   * plain fBm; `1` replaces it with `1 - 2 * |n|`, which turns the crests
   * of the noise into sharp mountain ridges. Defaults to `0`.
   */
  noiseRidge?:          number
  /**
   * Post-quantisation bias that contracts the rank-based band distribution
   * towards the top band `N - 1`, in `[0, 1]`. Defaults to `0`.
   *
   * The terrain simulator derives integer elevations via equal-frequency
   * banding (every band receives roughly the same tile count), which makes
   * the full staircase visible no matter how the noise is shaped. This knob
   * post-processes each assigned band as:
   *
   *   `b' = round((N - 1) - (1 - reliefFlatness) * (N - 1 - b))`
   *
   * At `0` the mapping is identity (current behaviour). At `1` every tile
   * collapses onto band `N - 1` and the planet is perfectly flat at `radius`.
   * Intermediate values flatten the relief while leaving the full extraction
   * depth (`N` bands) available — digging still descends all the way to the
   * core, revealing the shell that was hidden under the plateau.
   */
  reliefFlatness?:      number
}

// ── BodyVisualProfile ─────────────────────────────────────────────

/**
 * One band of a metallic terrain palette. Only `color` is required; every
 * material / geometry field is optional and falls back to the lib's neutral
 * defaults (see {@link buildMetallicPalette}). Callers that want a fully
 * caller-owned look set every field explicitly.
 */
export interface MetallicBand {
  /** Band base colour (hex string or `0xRRGGBB`). */
  color:              ColorInput
  /** PBR metalness in `[0, 1]`. Defaults to a per-slot neutral ladder. */
  metalness?:         number
  /** PBR roughness in `[0, 1]`. Defaults to a per-slot neutral ladder. */
  roughness?:         number
  /** World-space height above the core radius. Defaults to a per-slot neutral schedule. */
  height?:            number
  /** Emissive colour for the band (useful for self-lit peaks). */
  emissive?:          ColorInput
  /** Emissive intensity in `[0, 1]`. Ignored when {@link emissive} is omitted. */
  emissiveIntensity?: number
}

/**
 * Visual tunables kept inline on {@link BodyConfig} — these are read by the
 * render layer when building palettes and decorative features but have no
 * effect on the simulation itself. Full palette overrides live separately
 * in {@link BodyRenderOptions} (render-only, coupled to `THREE.Color`).
 */
export interface BodyVisualProfile {
  /**
   * Liquid-surface colour. Required when `liquidState !== 'none'` — the lib
   * no longer ships a fallback keyed on chemistry names, so the caller owns
   * the substance→colour catalogue entirely. Frozen sheets use this value
   * as the liquid-side anchor; the frozen tint is then derived by desaturation.
   */
  liquidColor?:         ColorInput
  /**
   * Four-stop band palette for gas giants — ordered light → dark → accent →
   * secondary. Consumed by the gas terrain palette and the shader's band
   * uniforms. When omitted, a neutral default is used; callers that want
   * molecule-accurate hues (Jupiter, Neptune, Titan…) compute the stops
   * from their own gas catalogue and pass them in here.
   */
  bandColors?: {
    colorA: ColorInput
    colorB: ColorInput
    colorC: ColorInput
    colorD: ColorInput
  }
  /**
   * Low anchor colour of the default rocky terrain ramp — assigned to the
   * shortest band (elevation `1`). Ignored when a palette override is
   * supplied at render time. Defaults to `DEFAULT_TERRAIN_LOW_COLOR`.
   */
  terrainColorLow?:     ColorInput
  /**
   * High anchor colour of the default rocky terrain ramp — assigned to the
   * tallest band (elevation `N`). Ignored when a palette override is
   * supplied at render time. Defaults to `DEFAULT_TERRAIN_HIGH_COLOR`.
   */
  terrainColorHigh?:    ColorInput
  /**
   * Four-band palette for metallic bodies — ordered crater floor → plains →
   * highlands → peaks. Consumed by the metallic terrain palette and the
   * procedural shader (base + accent are read from the first and last
   * bands). When omitted, the lib falls back to a neutral grey ladder;
   * callers wire their own composition catalogue (see the playground for
   * a reference implementation) and pass the result in here.
   */
  metallicBands?: readonly [
    MetallicBand,
    MetallicBand,
    MetallicBand,
    MetallicBand,
  ]
  /** When true, rocky bodies display procedural crust fractures. */
  hasCracks?:       boolean
  /** When true, rocky bodies display lava flows in low bands. */
  hasLava?:         boolean
  /**
   * Optional override for the lava colour on rocky bodies. The lib no longer
   * ships a temperature → lava-tone map; the caller picks the value and
   * writes it back here (the playground's `deriveLavaColor` helper is one
   * such reference implementation). When omitted, a neutral dark red is used.
   */
  lavaColor?:       ColorInput
  /** When true, a decorative ring system is generated around this body (visual only). */
  hasRings?:        boolean
}

// ── BodyConfig (composed) ─────────────────────────────────────────

/**
 * Full body configuration. Composed as the intersection of the four
 * orthogonal sub-profiles so consumers can depend on a narrower slice
 * when needed — e.g. a noise sandbox can type against
 * `BodyIdentity` + `BodyPhysics` + `BodyNoiseProfile` and ignore the
 * visual fields.
 */
export type BodyConfig =
  & BodyIdentity
  & BodyPhysics
  & BodyNoiseProfile
  & BodyVisualProfile

// ── Star physics input (used by starPhysics.ts calculations) ─────
// Minimal struct: spectral type + optional overrides. Distinct from
// `BodyConfig` because the physics calculators (`resolveStarData`,
// `toStarParams`) only need these three fields — callers don't have to
// construct a full `BodyConfig` to query star lookup tables.
export interface StarConfig {
  spectralType: SpectralType
  radius?:      number   // world units override
  tempK?:       number   // Kelvin override
}

export interface ResolvedStarData {
  tempK:      number   // surface temperature in Kelvin
  radius:     number   // world units
  luminosity: number   // relative to G-type reference (L_G = 1)
  color:      string   // representative CSS hex color
}

