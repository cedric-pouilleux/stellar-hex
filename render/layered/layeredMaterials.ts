/**
 * Material factory for the sol interactive mesh.
 *
 * Vanilla vertex-coloured PBR — the procedural sol shader (cracks, lava,
 * craters, ocean mask) is owned by the smooth-sphere display mesh in the
 * `'shader'` view. The interactive sol mesh reads as flat hex cells with
 * one colour per tile, driven by the palette + per-tile overlay.
 *
 * Atmosphere materials used to live here (`atmoPlayable`, `atmoShader`)
 * back when the sol mesh carried a stacked atmo band. They have moved to
 * the dedicated atmosphere board mesh (`buildAtmoBoardMesh`) and the
 * shader-view halo (`buildAtmoShell`); this module only knows about the
 * sol layer now.
 */

import * as THREE from 'three'
import { applyFlatLightingPatch, type FlatLightingHandle } from '../lighting/flatLightingPatch'

/** Aggregate returned by {@link buildLayeredMaterials}. */
export interface LayeredMaterials {
  solMaterial:     THREE.MeshStandardMaterial
  /**
   * Toggle for the flat-lighting override. Wired to the sol material's
   * `uFlatLighting` uniform — enabling collapses the directional shading
   * from scene lights so every tile reads as uniformly lit. PBR channels
   * (roughness, metalness, future per-tile biome material attributes)
   * are preserved when the toggle is off.
   */
  flatLighting:    FlatLightingHandle
}

/** Builds the sol material for the sol interactive mesh. */
export function buildLayeredMaterials(): LayeredMaterials {
  const solMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness:    0.85,
    metalness:    0.0,
    side:         THREE.FrontSide,
  })
  const flatLighting = applyFlatLightingPatch(solMaterial)
  // Sol mesh is only ever shown in the playable surface view — having
  // star-driven directional shading on it would hide tiles on the night
  // side. Default the flat-lighting override to ON so the board reads
  // uniformly even before any explicit `view.set('surface')` call.
  flatLighting.setFlatLighting(true)
  return { solMaterial, flatLighting }
}
