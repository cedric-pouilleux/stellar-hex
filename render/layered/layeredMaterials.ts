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

/** Aggregate returned by {@link buildLayeredMaterials}. */
export interface LayeredMaterials {
  solMaterial: THREE.MeshStandardMaterial
}

/** Builds the sol material for the sol interactive mesh. */
export function buildLayeredMaterials(): LayeredMaterials {
  const solMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness:    0.85,
    metalness:    0.0,
    side:         THREE.FrontSide,
  })
  return { solMaterial }
}
