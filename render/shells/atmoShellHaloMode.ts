/**
 * Halo mode state machine for the atmosphere shell.
 *
 * "Halo mode" collapses the volumetric shell to a thin fresnel-driven
 * liseré at the silhouette, in the pure body tint — used by the
 * playable-sol view to advertise the atmosphere's full radius without
 * covering the body's centre with bands, clouds or painted-tile
 * colours.
 *
 * Behaviour on enable:
 *   - opacity drops to a fraction of the baseline ({@link HALO_OPACITY_FACTOR})
 *   - `cloudAmount`, `storms`, `tileColorMix` zeroed
 *   - `uRimOnly` flag set so the shader's rim-only path kicks in
 *   - blending switches to additive so the rim reads as a glow even at
 *     low opacity against dark backgrounds
 *
 * On disable, baseline values captured at construction are restored —
 * any `setOpacity`/`setParams` calls made *while* halo mode was active
 * are NOT preserved on toggle off. Callers that need live tuning should
 * keep parameter mutations outside halo mode.
 */

import * as THREE from 'three'

/** Opacity multiplier applied while halo mode is active. */
const HALO_OPACITY_FACTOR = 0.25

/** Baseline values captured at shell-build time. */
export interface AtmoShellBaseline {
  opacity:      number
  cloudAmount:  number
  storms:       number
  tileColorMix: number
}

/** Handle returned by {@link createAtmoShellHaloMode}. */
export interface AtmoShellHaloMode {
  setEnabled: (enabled: boolean) => void
}

/**
 * Builds the halo-mode toggle for an atmosphere shell. Mutates the
 * provided uniforms and material in place; idempotent (re-enabling /
 * re-disabling the same state is a no-op).
 */
export function createAtmoShellHaloMode(input: {
  uniforms: Record<string, THREE.IUniform>
  material: THREE.ShaderMaterial
  baseline: AtmoShellBaseline
}): AtmoShellHaloMode {
  const { uniforms, material, baseline } = input
  let enabled = false

  return {
    setEnabled(next) {
      if (next === enabled) return
      enabled = next
      if (next) {
        const v = baseline.opacity * HALO_OPACITY_FACTOR
        uniforms.uOpacity.value      = v
        material.visible             = v > 0
        uniforms.uCloudAmount.value  = 0
        uniforms.uStorms.value       = 0
        uniforms.uTileColorMix.value = 0
        uniforms.uRimOnly.value      = 1
        material.blending            = THREE.AdditiveBlending
      } else {
        uniforms.uOpacity.value      = baseline.opacity
        material.visible             = baseline.opacity > 0
        uniforms.uCloudAmount.value  = baseline.cloudAmount
        uniforms.uStorms.value       = baseline.storms
        uniforms.uTileColorMix.value = baseline.tileColorMix
        uniforms.uRimOnly.value      = 0
        material.blending            = THREE.NormalBlending
      }
    },
  }
}
