/**
 * planet-shaders — Procedural shader library for Three.js spheres.
 *
 * Minimal usage:
 *   import { BodyMaterial } from 'features/body/shaders'
 *   const planet = new BodyMaterial('rocky')
 *   sphere.material = planet.material
 *   // render loop:
 *   planet.tick(elapsed)
 *
 * See `BodyMaterial.ts` for the full API.
 */

// Main class
export { BodyMaterial } from './BodyMaterial'
export type {
  BodyMaterialOptions,
  BodyLightUpdate,
  ParamValue,
  ParamMap,
  LiquidMaskOptions,
} from './BodyMaterial'

// Parameter schema (types, defaults). Display labels are caller-owned —
// see the playground's `paramLabels.ts` for a reference dictionary.
export { BODY_PARAMS, getDefaultParams } from './params'
export type { LibBodyType, ParamDef, BodyParamsMap } from './params'

// Shader ranges (numeric slider bounds)
export { SHADER_RANGES } from './shaderRanges'
export type { ParamRange, RangeMap } from './shaderRanges'

// Utilities
export { kelvinToRGB, kelvinToThreeColor, kelvinLabel } from './kelvin'
export type { KelvinRGB } from './kelvin'

// Resolved GLSL sources (advanced use: custom materials, previews…)
export { VERTEX_SHADER, FRAG_SHADERS } from './shaderSources'

// Post-processing shader
export { GodRaysShader } from './godRaysShader'
