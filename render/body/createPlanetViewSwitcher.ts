/**
 * View toggle for non-stellar bodies.
 *
 * Three mutually exclusive views drive every body:
 *
 *   - `'surface'`    : sol mesh visible (relief + liquid). Atmo board
 *                      hidden, smooth sphere hidden (or shown as a
 *                      transparent backdrop on gas giants whose smooth
 *                      sphere plays the atmospheric silhouette). Atmo
 *                      shell is kept on as a discreet halo (`setHaloMode`)
 *                      so the sol keeps full visibility while the
 *                      atmosphere's presence stays hinted at the rim.
 *   - `'atmosphere'` : atmo board visible (resource grid). Sol mesh
 *                      hidden, smooth sphere hidden, atmo shell hidden.
 *   - `'shader'`     : non-interactive overview. Smooth sphere visible
 *                      (when its strategy enables it), atmo halo shell
 *                      overlaid in full (bands + clouds + tile paint).
 *                      Sol mesh and atmo board both hidden.
 */

import * as THREE from 'three'
import type { InteractiveView } from '../../types/bodyHandle.types'
import type { PlanetSceneGraph } from './assemblePlanetSceneGraph'

/** Public handle returned by {@link createPlanetViewSwitcher}. */
export interface PlanetViewSwitcher {
  set(view: InteractiveView): void
}

/**
 * Builds the view switcher for a planet scene graph. Captures the original
 * render flags (depth test/write, render order, atmo side) at construction
 * time so toggles can restore them when leaving a transient view (gas
 * backdrop, sol view).
 */
export function createPlanetViewSwitcher(graph: PlanetSceneGraph): PlanetViewSwitcher {
  const {
    group, strategy,
    displayMesh, planetMaterial,
    interactive, atmoBoard,
    atmoShell,
  } = graph

  const displayMaterial      = displayMesh.material as THREE.Material
  const baseDisplayDepthTest = displayMaterial.depthTest
  const baseDisplayDepthW    = displayMaterial.depthWrite
  const baseDisplayRenderOrd = displayMesh.renderOrder
  const atmoMaterial         = atmoShell?.mesh.material as THREE.Material | undefined
  const baseAtmoDepthTest    = atmoMaterial?.depthTest    ?? true
  const baseAtmoRenderOrd    = atmoShell?.mesh.renderOrder ?? 1

  function set(view: InteractiveView): void {
    const isSurface     = view === 'surface'
    const isAtmosphere  = view === 'atmosphere'
    const isShader      = view === 'shader'
    const isGasBackdrop = isSurface && strategy.displayMeshIsAtmosphere

    // Sol mesh — visible only in the surface view.
    interactive.setVisible(isSurface)

    // Atmo board — visible only in the atmosphere view.
    atmoBoard?.setVisible(isAtmosphere)

    // Atmo halo shell + liquid corona — visible alongside the smooth
    // sphere on the shader overview. Hidden in the playable views.
    if ((isShader || isSurface) && atmoShell && atmoShell.mesh.parent !== group) {
      group.add(atmoShell.mesh)
    }

    // Smooth sphere — visible in shader view (all types) and as a backdrop
    // for gas surface view (depth flags off so the playable sol grid
    // overdraws it).
    displayMesh.visible        = isShader || isGasBackdrop
    displayMaterial.depthTest  = !isSurface && baseDisplayDepthTest
    displayMaterial.depthWrite = !isSurface && baseDisplayDepthW
    displayMesh.renderOrder    = isSurface ? -2 : baseDisplayRenderOrd

    // Gas surface backdrop: dim hard, flatten lighting, switch to BackSide
    // so the user reads the inner curvature of the atmospheric dome
    // wrapping the playable hex core.
    planetMaterial.setViewDim(isGasBackdrop ? 0.05 : 1.0)
    planetMaterial.setFlatLighting(isGasBackdrop)
    if (strategy.displayMeshIsAtmosphere) {
      const sm       = displayMaterial as THREE.ShaderMaterial
      const nextSide = isSurface ? THREE.BackSide : THREE.FrontSide
      if (sm.side !== nextSide) {
        sm.side        = nextSide
        sm.needsUpdate = true
      }
    }

    // Atmo halo shell — visible in shader + surface, hidden in atmosphere
    // view. Side flips per view: FrontSide in shader so the shell reads
    // as a translucent halo overlaid on the smooth sphere, BackSide in
    // surface so the back-face depth pushes it behind the playable hex
    // prisms. Halo mode kicks in for surface so the playable sol keeps
    // full colour fidelity (no band/cloud bleed onto the rim).
    if (atmoShell && atmoMaterial) {
      atmoShell.setVisible(!isAtmosphere)
      atmoShell.setHaloMode(isSurface)
      atmoMaterial.depthTest     = baseAtmoDepthTest
      atmoMaterial.depthWrite    = false
      atmoShell.mesh.renderOrder = baseAtmoRenderOrd
      const sm       = atmoMaterial as THREE.ShaderMaterial
      const nextSide = isShader ? THREE.FrontSide : THREE.BackSide
      if (sm.side !== nextSide) {
        sm.side        = nextSide
        sm.needsUpdate = true
      }
      atmoShell.setFlatLighting(!isShader)
    } else {
      atmoShell?.setVisible(false)
    }
  }

  return { set }
}
