import * as THREE from 'three'

/**
 * Public handle returned by {@link applyFlatLightingPatch}. Lets callers
 * toggle the flat-lighting override at runtime without touching the
 * underlying material.
 */
export interface FlatLightingHandle {
  /**
   * Enables or disables the flat-lighting override.
   *
   * When enabled, the material's outgoing colour collapses to the
   * unlit diffuse + emissive contribution — directional shading from
   * scene lights (`PointLight`, `DirectionalLight`, …) is ignored. The
   * surface reads as uniformly lit on every facet, perfect for the
   * playable sol / atmo boards where star shadowing would hide tiles
   * on the night side. Disabling restores the standard PBR pipeline.
   */
  setFlatLighting(enabled: boolean): void

  /**
   * Current uniform reference. Exposed so tests can assert the bound
   * value without spinning a real WebGL renderer.
   */
  readonly uniform: { value: number }
}

/**
 * Patches a Three.js material so its outgoing fragment colour can be
 * forced to a flat (light-independent) value via a uniform toggle.
 *
 * Implementation: hooks `onBeforeCompile` to inject a `uFlatLighting`
 * uniform and a single `mix()` line that swaps `outgoingLight` for the
 * unlit `diffuseColor.rgb + totalEmissiveRadiance`. PBR channels
 * (roughness, metalness, emissive) are preserved when the toggle is
 * off — the patch does **not** alter the lit pipeline, only chooses
 * between the lit and unlit outputs at the very end.
 *
 * Reuses the same mechanism already in place on the procedural
 * smooth-sphere shader (`BodyMaterial.setFlatLighting`) and on the
 * atmosphere shell (`buildAtmoShell.setFlatLighting`), but applies it
 * to vanilla `MeshStandardMaterial` / `MeshLambertMaterial` /
 * `MeshPhongMaterial` instances via `onBeforeCompile`.
 *
 * The patch is idempotent: re-applying it on the same material is a
 * no-op (the existing handle is silently re-used).
 *
 * @param material - Material to patch. Mutated in place.
 * @returns Handle exposing `setFlatLighting` and the bound uniform.
 */
export function applyFlatLightingPatch(material: THREE.Material): FlatLightingHandle {
  const cached = (material as { flatLightingHandle?: FlatLightingHandle }).flatLightingHandle
  if (cached) return cached

  const uniform = { value: 0 }

  const previousOnBeforeCompile = material.onBeforeCompile?.bind(material)

  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer)
    shader.uniforms.uFlatLighting = uniform
    shader.fragmentShader = 'uniform float uFlatLighting;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      [
        'outgoingLight = mix(outgoingLight, diffuseColor.rgb + totalEmissiveRadiance, uFlatLighting);',
        '#include <output_fragment>',
      ].join('\n'),
    )
  }
  // Force a recompile so the patch lands on the next render.
  material.needsUpdate = true

  const handle: FlatLightingHandle = {
    setFlatLighting(enabled: boolean): void {
      uniform.value = enabled ? 1 : 0
    },
    uniform,
  }
  ;(material as { flatLightingHandle?: FlatLightingHandle }).flatLightingHandle = handle
  return handle
}
