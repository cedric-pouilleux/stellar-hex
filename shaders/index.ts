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
export type { BodyMaterialOptions, BodyLightUpdate, ParamValue, ParamMap } from './BodyMaterial'

// Parameter defs (types, defaults, UI groups)
export { BODY_TYPES, BODY_PARAMS, BODY_GROUPS, getDefaultParams } from './params'
export type { LibBodyType, ParamDef, BodyParamsMap } from './params'

// Shader ranges (numeric slider bounds)
export { SHADER_RANGES } from './shaderRanges'
export type { ParamRange } from './shaderRanges'

// Utilities
export { kelvinToRGB, kelvinToThreeColor, kelvinLabel } from './kelvin'

// Resolved GLSL sources (advanced use: custom materials, previews…)
export { VERTEX_SHADER, FRAG_SHADERS } from './shaderSources'

// Post-processing shader
export { GodRaysShader } from './godRaysShader'
