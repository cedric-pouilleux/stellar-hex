/**
 * Reactive bridge between the playground UI and the lib's cloud shell.
 *
 * Two kinds of knobs are exposed:
 *
 * 1. Live uniforms backed by the shared `hexGraphicsUniforms` bag
 *    (`uCloudOpacity`, `uCloudSpeed`). Mutations here propagate to every cloud
 *    mesh the lib has built, on the next frame, with no rebuild.
 *
 * 2. Per-body knobs (`coverageOverride`, `frozen`) that feed `buildCloudShell`.
 *    `coverageOverride` is patched into the mesh's `uCoverage` uniform live.
 *    `frozen` switches the fragment shader (FBM clouds ↔ Worley ice sheet)
 *    and therefore triggers a rebuild.
 */

import { reactive, watch } from 'vue'
import { hexGraphicsUniforms } from '@lib'

/** User-tweakable cloud parameters surfaced in the playground UI. */
export interface CloudShaderParams {
  /** Master toggle — hides the cloud mesh when off without rebuilding. */
  enabled:          boolean
  /** Opacity multiplier applied to the cloud shell — `uCloudOpacity`. */
  opacity:          number
  /** Animation churn speed — `uCloudSpeed`; scales FBM evolution only. */
  speed:            number
  /** Cloud tint — `uCloudColor`; sRGB hex string (e.g. `#ffffff`). */
  color:            string
  /**
   * Overrides the coverage derived from the body config. `null` keeps the
   * lib-derived value (via `cloudCoverageFor`, or 0.55 for gas giants).
   */
  coverageOverride: number | null
}

export const CLOUD_SHADER_DEFAULTS: CloudShaderParams = {
  enabled:          true,
  opacity:          0.90,
  speed:            1.0,
  color:            '#ffffff',
  coverageOverride: null,
}

/** Numeric slider ranges — keyed by the numeric params of {@link CloudShaderParams}. */
export type CloudShaderNumericKey = 'opacity' | 'speed'

export const CLOUD_SHADER_RANGES: Record<CloudShaderNumericKey, {
  label: string
  min:   number
  max:   number
  step:  number
}> = {
  opacity: { label: 'Opacity', min: 0, max: 1,  step: 0.01 },
  speed:   { label: 'Speed',   min: 0, max: 5,  step: 0.05 },
}

/** Coverage override slider range. */
export const CLOUD_COVERAGE_RANGE = { min: 0, max: 1, step: 0.01 }

/** Push the shared live uniforms from a params snapshot. */
export function applyCloudShaderParams(p: CloudShaderParams): void {
  hexGraphicsUniforms.uCloudOpacity.value = p.opacity
  hexGraphicsUniforms.uCloudSpeed.value   = p.speed
  hexGraphicsUniforms.uCloudColor.value.set(p.color)
}

/** Reactive mirror edited by the panel — single source of truth for the UI. */
export const cloudShaderParams = reactive<CloudShaderParams>({ ...CLOUD_SHADER_DEFAULTS })

watch(cloudShaderParams, (p) => applyCloudShaderParams(p), { deep: true, immediate: true })

/** Restore the canonical defaults. */
export function resetCloudShaderParams(): void {
  Object.assign(cloudShaderParams, CLOUD_SHADER_DEFAULTS)
}
