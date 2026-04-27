/**
 * Per-body graphics uniform bag — drives the cloud shell, liquid shell and
 * hex terrain shaders.
 *
 * Each body owns its own `GraphicsUniforms` instance: tweaking
 * `uCloudOpacity` on planet A leaves planet B untouched. Callers wanting a
 * single global tuning channel build one bag up-front and feed it to every
 * body via the `graphicsUniforms` option of `useBody`.
 *
 * The values are plain `{ value }` bags (Three's `IUniform` shape) so they
 * can be wired directly into shader uniforms from Vue-free code paths.
 */

import * as THREE from 'three'

/** Plain `{ value: number }` uniform — Three's `IUniform<number>` shape. */
export interface NumberUniform { value: number }
/** Plain `{ value: THREE.Color }` uniform — Three's `IUniform<THREE.Color>` shape. */
export interface ColorUniform  { value: THREE.Color }

/**
 * Aggregate of every shared graphics uniform consumed by a body's
 * cloud / liquid / terrain shaders. The bag is mutable: panels and
 * runtime sliders write into `.value` and the shader picks the change
 * on the next frame.
 */
export interface GraphicsUniforms {
  // ── Toggles (0.0 / 1.0) ─────────────────────────────────────────
  /** Master enable for the liquid shell wave shader. `0` disables wave bump and tinting. */
  uWaterEnabled:        NumberUniform
  /** Master enable for the hex terrain bump-mapping. */
  uTerrainBumpEnabled:  NumberUniform
  /** Master enable for the inter-tile colour edge blend. */
  uEdgeBlendEnabled:    NumberUniform
  /** When `0`, the liquid shell discards every fragment — exposes the sea floor. */
  uLiquidVisible:       NumberUniform

  // ── Cloud-shell uniforms ────────────────────────────────────────
  /** Cloud-shell alpha (multiplied with the per-vertex coverage). */
  uCloudOpacity:        NumberUniform
  /** Cloud drift speed multiplier. */
  uCloudSpeed:          NumberUniform
  /** Cloud tint colour (multiplied with the alpha). */
  uCloudColor:          ColorUniform

  // ── Liquid-shell uniforms ───────────────────────────────────────
  /** Wave bump-mapping amplitude. */
  uWaveStrength:        NumberUniform
  /** Wave animation speed. */
  uWaveSpeed:            NumberUniform
  /** Spatial frequency of the wave noise field — small = ocean swells, large = tight chop. */
  uWaveScale:           NumberUniform
  /** Sun-glint / fresnel intensity multiplier. */
  uSpecularIntensity:   NumberUniform
  /** Phong/Blinn exponent for the sun glint — high = tight specular point, low = diffuse glow. */
  uSpecularSharpness:   NumberUniform
  /** Fresnel power exponent — controls how aggressively the rim brightens at grazing angles. */
  uFresnelPower:        NumberUniform
  /** PBR roughness override for the liquid material — 0 = mirror, 1 = matte. */
  uLiquidRoughness:     NumberUniform
  /** Per-fragment depth-darken factor in `[0, 1]`. */
  uDepthDarken:         NumberUniform
  /** Liquid-shell alpha — overrides the material `opacity` so sliders work without rebuild. */
  uLiquidOpacity:       NumberUniform
  /** Wave-height threshold above which a foam tint kicks in — `1` disables foam entirely. */
  uFoamThreshold:       NumberUniform
  /** Foam tint colour blended on wave crests above {@link uFoamThreshold}. */
  uFoamColor:           ColorUniform

  // ── Terrain shader uniforms ─────────────────────────────────────
  /** Terrain bump-mapping amplitude. */
  uBumpStrength:        NumberUniform
  /** Inter-tile colour blend amplitude. */
  uEdgeBlendStrength:   NumberUniform
}

/**
 * Builds a fresh {@link GraphicsUniforms} bag with the canonical default
 * values. Each call returns an independent instance so multi-body scenes
 * can give every body its own tuning bag:
 *
 * ```ts
 * const uniforms = createGraphicsUniforms()
 * uniforms.uCloudOpacity.value = 0.5  // mutates this body's clouds only
 * ```
 *
 * Callers that want a single shared tuning channel (debug panel, global
 * graphics settings) build one bag up-front and pass it to every body
 * via `useBody(config, tileSize, { graphicsUniforms })`.
 */
export function createGraphicsUniforms(): GraphicsUniforms {
  return {
    // Toggles
    uWaterEnabled:       { value: 1.0 },
    uTerrainBumpEnabled: { value: 1.0 },
    uEdgeBlendEnabled:   { value: 1.0 },
    uLiquidVisible:      { value: 1.0 },
    // Cloud shader params
    uCloudOpacity:       { value: 0.90 },
    uCloudSpeed:         { value: 1.0 },
    uCloudColor:         { value: new THREE.Color(1, 1, 1) },
    // Liquid-shell shader params
    uWaveStrength:       { value: 1.0 },
    uWaveSpeed:          { value: 2.8 },
    uWaveScale:          { value: 5.0 },
    uSpecularIntensity:  { value: 0.9 },
    uSpecularSharpness:  { value: 80.0 },
    uFresnelPower:       { value: 5.0 },
    uLiquidRoughness:    { value: 0.35 },
    uDepthDarken:        { value: 0.50 },
    uLiquidOpacity:      { value: 0.88 },
    uFoamThreshold:      { value: 1.0 },
    uFoamColor:          { value: new THREE.Color(1, 1, 1) },
    // Terrain shader params
    uBumpStrength:       { value: 2.0 },
    uEdgeBlendStrength:  { value: 0.25 },
  }
}
