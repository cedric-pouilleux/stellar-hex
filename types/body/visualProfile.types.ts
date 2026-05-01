/**
 * Body visual profile — caller-supplied palette anchors and band stops.
 * Pure-logic; no `three` import. The render layer resolves `ColorInput`
 * values into `THREE.Color` at material-build time.
 */

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

/**
 * One band of a metallic terrain palette. Only `color` is required; every
 * material / geometry field is optional and falls back to the lib's neutral
 * defaults (see `buildMetallicPalette`). Callers that want a fully
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
 * Visual tunables kept inline on `PlanetConfig` — these are read by the
 * render layer when building palettes and decorative features but have no
 * effect on the simulation itself. Full palette overrides live separately
 * in `BodyRenderOptions` (render-only, coupled to `THREE.Color`).
 *
 * Stars do not carry a visual profile: their look is fully driven by
 * {@link SpectralType} — every visible knob (palette,
 * granulation, corona, godrays) derives from it.
 */
export interface PlanetVisualProfile {
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
  /** When true, a decorative ring system is generated around this body (visual only). */
  hasRings?:        boolean
}

// Note: cracks and lava are pure visual effects. The intensity / colour /
// scale knobs live on `BodyVariation` (`crackIntensity`, `lavaIntensity`,
// `lavaColor`, …); a value of `0` for either intensity disables the
// effect. The caller (game logic) decides when to push a non-zero value.
