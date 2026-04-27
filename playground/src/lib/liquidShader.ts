/**
 * Reactive bridge between the playground UI and the lib's live
 * `hexGraphicsUniforms` bag for every hex liquid-shell shader uniform.
 *
 * The lib exposes `hexGraphicsUniforms` as a plain `{ value }` object that
 * Three.js reads on every frame. Vue cannot observe mutations on a plain
 * object, so we keep a reactive mirror (`liquidShaderParams`) and push any
 * change into the uniform bag via a single watcher.
 *
 * The ranges + defaults live here so the panel and any TU share one source
 * of truth without depending on the lib's internal numbers.
 */

import { reactive, watch } from 'vue'
import { playgroundGraphicsUniforms as hexGraphicsUniforms } from './playgroundUniforms'

/** One tunable uniform row — bool via checkbox or number via slider. */
export interface LiquidShaderParams {
  /** Master liquid toggle — `uWaterEnabled`. */
  enabled:           boolean
  /** Liquid shell visibility — `uLiquidVisible`; off exposes the hex sea floor. */
  liquidVisible:     boolean
  /** Bump-mapping amplitude — `uWaveStrength`. */
  waveStrength:      number
  /** Animation speed driving both bump + hue drift — `uWaveSpeed`. */
  waveSpeed:         number
  /** Wave noise spatial frequency — small ⇒ ocean swells, large ⇒ tight chop. */
  waveScale:         number
  /** Sun glint + fresnel strength — `uSpecularIntensity`. */
  specularIntensity: number
  /** Sun-glint Phong exponent — high ⇒ tight specular point, low ⇒ diffuse glow. */
  specularSharpness: number
  /** Fresnel power exponent — controls grazing-angle rim brightness. */
  fresnelPower:      number
  /** PBR roughness override for the liquid material — 0 = mirror, 1 = matte. */
  liquidRoughness:   number
  /** Depth darkening baseline — `uDepthDarken`. */
  depthDarken:       number
  /** Surface transparency — `uLiquidOpacity`. */
  liquidOpacity:     number
  /** Wave-height threshold above which a foam tint kicks in — `1` disables foam. */
  foamThreshold:     number
  /** Foam tint colour blended on wave crests, `#rrggbb`. */
  foamColor:         string
}

/** Canonical defaults — mirrors the shipped `hexGraphicsUniforms` values. */
export const LIQUID_SHADER_DEFAULTS: LiquidShaderParams = {
  enabled:           true,
  liquidVisible:     true,
  waveStrength:      1.0,
  waveSpeed:         2.8,
  waveScale:         5.0,
  specularIntensity: 0.9,
  specularSharpness: 80.0,
  fresnelPower:      5.0,
  liquidRoughness:   0.35,
  depthDarken:       0.50,
  liquidOpacity:     0.88,
  foamThreshold:     1.0,
  foamColor:         '#ffffff',
}

/** Numeric slider ranges — keyed by the numeric params of {@link LiquidShaderParams}. */
export type LiquidShaderNumericKey =
  | 'waveStrength'
  | 'waveSpeed'
  | 'waveScale'
  | 'specularIntensity'
  | 'specularSharpness'
  | 'fresnelPower'
  | 'liquidRoughness'
  | 'depthDarken'
  | 'liquidOpacity'
  | 'foamThreshold'

export const LIQUID_SHADER_RANGES: Record<LiquidShaderNumericKey, {
  label: string
  min:   number
  max:   number
  step:  number
}> = {
  waveStrength:      { label: 'Wave strength', min: 0,    max: 5,    step: 0.05 },
  waveSpeed:         { label: 'Wave speed',    min: 0,    max: 10,   step: 0.1  },
  waveScale:         { label: 'Wave scale',    min: 0.5,  max: 20,   step: 0.1  },
  specularIntensity: { label: 'Specular',      min: 0,    max: 3,    step: 0.05 },
  specularSharpness: { label: 'Spec sharp.',   min: 4,    max: 256,  step: 1    },
  fresnelPower:      { label: 'Fresnel power', min: 1,    max: 12,   step: 0.1  },
  liquidRoughness:   { label: 'Roughness',     min: 0.04, max: 1,    step: 0.01 },
  depthDarken:       { label: 'Depth darken',  min: 0,    max: 1,    step: 0.01 },
  liquidOpacity:     { label: 'Opacity',       min: 0,    max: 1,    step: 0.01 },
  foamThreshold:     { label: 'Foam threshold', min: 0.4, max: 1,    step: 0.01 },
}

/** Hex-string `#rrggbb` → THREE.Color components mutated in place to keep
 *  the same reference (Three.js identity-checks uniforms). */
function applyHexToColor(target: { r: number; g: number; b: number }, hex: string): void {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  const n = parseInt(clean, 16)
  if (!Number.isFinite(n)) return
  target.r = ((n >> 16) & 0xff) / 255
  target.g = ((n >> 8)  & 0xff) / 255
  target.b = (n        & 0xff) / 255
}

/**
 * Copy a set of params into the live `hexGraphicsUniforms` bag. Exported as a
 * standalone function so the wiring is testable without mounting Vue.
 */
export function applyLiquidShaderParams(p: LiquidShaderParams): void {
  hexGraphicsUniforms.uWaterEnabled.value      = p.enabled       ? 1 : 0
  hexGraphicsUniforms.uLiquidVisible.value     = p.liquidVisible ? 1 : 0
  hexGraphicsUniforms.uWaveStrength.value      = p.waveStrength
  hexGraphicsUniforms.uWaveSpeed.value         = p.waveSpeed
  hexGraphicsUniforms.uWaveScale.value         = p.waveScale
  hexGraphicsUniforms.uSpecularIntensity.value = p.specularIntensity
  hexGraphicsUniforms.uSpecularSharpness.value = p.specularSharpness
  hexGraphicsUniforms.uFresnelPower.value      = p.fresnelPower
  hexGraphicsUniforms.uLiquidRoughness.value   = p.liquidRoughness
  hexGraphicsUniforms.uDepthDarken.value       = p.depthDarken
  hexGraphicsUniforms.uLiquidOpacity.value     = p.liquidOpacity
  hexGraphicsUniforms.uFoamThreshold.value     = p.foamThreshold
  applyHexToColor(hexGraphicsUniforms.uFoamColor.value, p.foamColor)
}

/** Reactive mirror edited by the panel — single source of truth for the UI. */
export const liquidShaderParams = reactive<LiquidShaderParams>({ ...LIQUID_SHADER_DEFAULTS })

/** Push any reactive change into the live uniform bag. */
watch(liquidShaderParams, (p) => applyLiquidShaderParams(p), { deep: true, immediate: true })

/** Restore the canonical defaults. */
export function resetLiquidShaderParams(): void {
  Object.assign(liquidShaderParams, LIQUID_SHADER_DEFAULTS)
}
