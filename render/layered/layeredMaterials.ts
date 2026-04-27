/**
 * Material factories for the layered interactive mesh.
 *
 * Three materials are produced:
 *
 *  - **`solMaterial`**     — flat hex cells, vertex-coloured. Vanilla
 *    `MeshStandardMaterial`; the procedural sol shader (cracks, lava,
 *    craters, ocean mask) is owned by the smooth-sphere display mesh
 *    instead.
 *  - **`atmoPlayable`**    — fully opaque atmo, mounted on the mesh in
 *    the interactive `'atmosphere'` view so playable atmo tiles read as
 *    a solid resource board, no see-through.
 *  - **`atmoShader`**      — render-only variant for the `'shader'`
 *    view. Opaque on gaseous bodies (the smooth sphere can be skipped),
 *    translucent on rocky / metallic bodies (the smooth sphere reads
 *    through the halo). The view machinery swaps it onto the atmo
 *    material slot when `setView('shader')` fires.
 *
 * Atmo gradient uniforms (translucent variant only) are synced to the
 * actual mesh dimensions here because `createAtmoMaterial` derives defaults
 * from `config.radius` alone — without the sync, the gradient would top
 * out at the nominal surface and the halo headroom would render as a flat,
 * full-alpha band.
 */

import * as THREE from 'three'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { BodyVariation } from '../body/bodyVariation'
import { createAtmoMaterial, type AtmoMaterialHandle } from './atmoMaterial'
import { strategyFor } from '../body/bodyTypeStrategy'

/** Aggregate returned by {@link buildLayeredMaterials}. */
export interface LayeredMaterials {
  solMaterial: THREE.MeshStandardMaterial
  /** Always opaque — used by the interactive `'atmosphere'` view. */
  atmoPlayable: AtmoMaterialHandle
  /** Variant used by `'shader'` view (opaque on gas, translucent on rocky/metallic). */
  atmoShader:   AtmoMaterialHandle
}

/**
 * Builds the sol + atmo materials for the layered interactive mesh.
 */
export function buildLayeredMaterials(opts: {
  sim:            BodySimulation
  variation:      BodyVariation
  coreRadius:     number
  totalThickness: number
}): LayeredMaterials {
  const { sim, variation, coreRadius, totalThickness } = opts
  const strategy = strategyFor(sim.config.type)

  const solMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness:    0.85,
    metalness:    0.0,
    side:         THREE.FrontSide,
  })

  // Playable atmo — always opaque so per-tile resource colours read as a
  // solid board with no see-through to the sol band hidden behind it.
  const atmoPlayable = createAtmoMaterial(sim.config, variation, { opacity: 1 })

  // Shader-view atmo — opacity follows the per-body-type policy, with an
  // optional override on the config. Gas ≈ 1.0 (opaque envelope), rocky ≈
  // 0.45 (translucent halo), metallic ≈ 0 (no atmo halo), star ≈ 0 (no
  // atmo at all).
  const shaderOpacity = sim.config.atmosphereOpacity ?? strategy.defaultAtmosphereOpacity
  const atmoShader = createAtmoMaterial(sim.config, variation, { opacity: shaderOpacity })

  for (const handle of [atmoPlayable, atmoShader]) {
    if (handle.mode === 'translucent') {
      handle.material.uniforms.uCoreRadius.value     = coreRadius
      handle.material.uniforms.uTotalThickness.value = totalThickness
    }
  }

  return { solMaterial, atmoPlayable, atmoShader }
}
