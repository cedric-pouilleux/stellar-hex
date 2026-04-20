/**
 * Reactive bridge between the playground UI and the lib's live
 * `hexGraphicsUniforms` bag for every hex ocean shader uniform.
 *
 * The lib exposes `hexGraphicsUniforms` as a plain `{ value }` object that
 * Three.js reads on every frame. Vue cannot observe mutations on a plain
 * object, so we keep a reactive mirror (`oceanShaderParams`) and push any
 * change into the uniform bag via a single watcher.
 *
 * The ranges + defaults live here so the panel and any TU share one source
 * of truth without depending on the lib's internal numbers.
 */

import { reactive, watch } from 'vue'
import { hexGraphicsUniforms } from '@lib'

/** One tunable uniform row — bool via checkbox or number via slider. */
export interface OceanShaderParams {
  /** Master water toggle — `uWaterEnabled`. */
  enabled:           boolean
  /** Ocean layer visibility — `uOceanVisible`; off exposes the hex sea floor. */
  oceanVisible:      boolean
  /** Bump-mapping amplitude — `uWaveStrength`. */
  waveStrength:      number
  /** Animation speed driving both bump + hue drift — `uWaveSpeed`. */
  waveSpeed:         number
  /** Sun glint + fresnel strength — `uSpecularIntensity`. */
  specularIntensity: number
  /** Depth darkening baseline — `uDepthDarken`. */
  depthDarken:       number
  /** Surface transparency — `uOceanOpacity`. */
  oceanOpacity:      number
}

/** Canonical defaults — mirrors the shipped `hexGraphicsUniforms` values. */
export const OCEAN_SHADER_DEFAULTS: OceanShaderParams = {
  enabled:           true,
  oceanVisible:      true,
  waveStrength:      1.0,
  waveSpeed:         2.8,
  specularIntensity: 0.9,
  depthDarken:       0.50,
  oceanOpacity:      0.88,
}

/** Numeric slider ranges — keyed by the numeric params of {@link OceanShaderParams}. */
export type OceanShaderNumericKey =
  | 'waveStrength'
  | 'waveSpeed'
  | 'specularIntensity'
  | 'depthDarken'
  | 'oceanOpacity'

export const OCEAN_SHADER_RANGES: Record<OceanShaderNumericKey, {
  label: string
  min:   number
  max:   number
  step:  number
}> = {
  waveStrength:      { label: 'Wave strength', min: 0, max: 5,  step: 0.05 },
  waveSpeed:         { label: 'Wave speed',    min: 0, max: 10, step: 0.1  },
  specularIntensity: { label: 'Specular',      min: 0, max: 3,  step: 0.05 },
  depthDarken:       { label: 'Depth darken',  min: 0, max: 1,  step: 0.01 },
  oceanOpacity:      { label: 'Opacity',       min: 0, max: 1,  step: 0.01 },
}

/**
 * Copy a set of params into the live `hexGraphicsUniforms` bag. Exported as a
 * standalone function so the wiring is testable without mounting Vue.
 */
export function applyOceanShaderParams(p: OceanShaderParams): void {
  hexGraphicsUniforms.uWaterEnabled.value      = p.enabled      ? 1 : 0
  hexGraphicsUniforms.uOceanVisible.value      = p.oceanVisible ? 1 : 0
  hexGraphicsUniforms.uWaveStrength.value      = p.waveStrength
  hexGraphicsUniforms.uWaveSpeed.value         = p.waveSpeed
  hexGraphicsUniforms.uSpecularIntensity.value = p.specularIntensity
  hexGraphicsUniforms.uDepthDarken.value       = p.depthDarken
  hexGraphicsUniforms.uOceanOpacity.value      = p.oceanOpacity
}

/** Reactive mirror edited by the panel — single source of truth for the UI. */
export const oceanShaderParams = reactive<OceanShaderParams>({ ...OCEAN_SHADER_DEFAULTS })

/** Push any reactive change into the live uniform bag. */
watch(oceanShaderParams, (p) => applyOceanShaderParams(p), { deep: true, immediate: true })

/** Restore the canonical defaults. */
export function resetOceanShaderParams(): void {
  Object.assign(oceanShaderParams, OCEAN_SHADER_DEFAULTS)
}
