/**
 * Reactive bridge between the playground UI and the atmosphere shell shader.
 *
 * The shell's shader exposes `uColor` / `uIntensity` / `uPower` per-mesh
 * uniforms built from `auraParamsFor(config)`, plus a shared `uAtmoOpacity`
 * from `hexGraphicsUniforms`. We keep everything in a Vue-reactive bag and
 * let the playground panes live-patch the mesh uniforms through
 * `BodyShellsHandle.setAtmosphereParams` (intensity/power/color) or toggle
 * visibility via `setAtmosphereEnabled`.
 *
 * `opacity` flows straight through `hexGraphicsUniforms.uAtmoOpacity` on the
 * next frame, no rebuild required. Color overrides are stored as hex strings;
 * `null` on `*Override` fields means "use the lib-derived value".
 */

import { reactive, watch } from 'vue'
import { hexGraphicsUniforms } from '@lib'

/** User-tweakable atmosphere parameters surfaced in the playground UI. */
export interface AtmosphereShaderParams {
  /** Master toggle — hides the atmosphere mesh when off without rebuilding. */
  enabled:           boolean
  /** Opacity multiplier — `uAtmoOpacity`. */
  opacity:           number
  /** Override of the auto-derived `uIntensity` — `null` leaves the build value. */
  intensityOverride: number | null
  /** Override of the auto-derived `uPower` — `null` leaves the build value. */
  powerOverride:     number | null
  /** Override of the auto-derived `uColor` — `null` leaves the build value. */
  colorOverride:     string | null
}

export const ATMOSPHERE_SHADER_DEFAULTS: AtmosphereShaderParams = {
  enabled:           true,
  opacity:           1.0,
  intensityOverride: null,
  powerOverride:     null,
  colorOverride:     null,
}

/** Numeric slider ranges — keyed by the numeric params of {@link AtmosphereShaderParams}. */
export type AtmosphereShaderNumericKey = 'opacity'

export const ATMOSPHERE_SHADER_RANGES: Record<AtmosphereShaderNumericKey, {
  label: string
  min:   number
  max:   number
  step:  number
}> = {
  opacity: { label: 'Opacity', min: 0, max: 2, step: 0.01 },
}

/** Slider ranges for override fields. */
export const ATMOSPHERE_INTENSITY_RANGE = { min: 0, max: 3, step: 0.01 }
export const ATMOSPHERE_POWER_RANGE     = { min: 0.1, max: 8, step: 0.05 }

/** Push the shared live uniforms from a params snapshot. */
export function applyAtmosphereShaderParams(p: AtmosphereShaderParams): void {
  hexGraphicsUniforms.uAtmoOpacity.value = p.opacity
}

/** Reactive mirror edited by the panel — single source of truth for the UI. */
export const atmosphereShaderParams = reactive<AtmosphereShaderParams>({ ...ATMOSPHERE_SHADER_DEFAULTS })

watch(atmosphereShaderParams, (p) => applyAtmosphereShaderParams(p), { deep: true, immediate: true })

/** Restore the canonical defaults. */
export function resetAtmosphereShaderParams(): void {
  Object.assign(atmosphereShaderParams, ATMOSPHERE_SHADER_DEFAULTS)
}
