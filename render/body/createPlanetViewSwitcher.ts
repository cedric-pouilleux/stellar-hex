/**
 * View toggle for non-stellar bodies — encapsulates the surface /
 * atmosphere / shader switching logic that was previously inline in
 * `useBody`. Keeps the depth-flag, side-flip and visibility book-keeping
 * in one place so the body factory stays focused on assembly.
 *
 * Stars carry no meaningful view distinction and use the no-op stub from
 * `useStar`.
 */

import * as THREE from 'three'
import type { InteractiveView } from '../layered/buildLayeredInteractiveMesh'
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
    interactive, coreMesh,
    atmoShell, liquidCorona,
  } = graph

  const displayMaterial      = displayMesh.material as THREE.Material
  const baseDisplayDepthTest = displayMaterial.depthTest
  const baseDisplayDepthW    = displayMaterial.depthWrite
  const baseDisplayRenderOrd = displayMesh.renderOrder
  const atmoMaterial         = atmoShell?.mesh.material as THREE.Material | undefined
  const baseAtmoDepthTest    = atmoMaterial?.depthTest    ?? true
  const baseAtmoRenderOrd    = atmoShell?.mesh.renderOrder ?? 1

  function set(view: InteractiveView): void {
    interactive.setView(view)
    coreMesh.mesh.visible     = view === 'surface'
    interactive.group.visible = view !== 'shader'

    if ((view === 'shader' || view === 'surface') && atmoShell && atmoShell.mesh.parent !== group) {
      group.add(atmoShell.mesh)
    }

    const isSurface     = view === 'surface'
    const isShader      = view === 'shader'
    const isGasBackdrop = isSurface && strategy.displayMeshIsAtmosphere

    // Smooth sphere — visible in Shader view (all types) and as a backdrop
    // for gas Sol view (depth flags off so the playable hex grid overdraws
    // it). On rocky / metallic Sol view we hide it; the playable hex prisms
    // already show the sol palette.
    displayMesh.visible        = isShader || isGasBackdrop
    displayMaterial.depthTest  = !isSurface && baseDisplayDepthTest
    displayMaterial.depthWrite = !isSurface && baseDisplayDepthW
    displayMesh.renderOrder    = isSurface ? -2 : baseDisplayRenderOrd

    // Gas Sol backdrop: dim hard, flatten lighting, switch to BackSide so
    // the user reads the inner curvature of the atmospheric dome wrapping
    // the playable hex core. Setters are no-ops on shaders that don't
    // consume the uniforms.
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

    // Atmo shell — visible in Shader + Surface, hidden in Atmosphere view.
    // Side flips per view: FrontSide in Shader so the shell reads as a
    // translucent halo overlaid on the smooth sphere, BackSide in Sol so
    // the back-face depth pushes it behind the playable hex prisms.
    if (atmoShell && atmoMaterial) {
      atmoShell.setVisible(view !== 'atmosphere')
      atmoMaterial.depthTest     = baseAtmoDepthTest
      atmoMaterial.depthWrite    = false
      atmoShell.mesh.renderOrder = baseAtmoRenderOrd
      const sm       = atmoMaterial as THREE.ShaderMaterial
      const nextSide = isShader ? THREE.FrontSide : THREE.BackSide
      if (sm.side !== nextSide) {
        sm.side        = nextSide
        sm.needsUpdate = true
      }
      // Sol view keeps the dome look uniformly lit; Shader view shades
      // the halo with the sun direction so the user sees a proper
      // day / night terminator.
      atmoShell.setFlatLighting(!isShader)
    } else {
      atmoShell?.setVisible(false)
    }

    // Liquid corona — visible alongside the atmoShell, hidden in
    // Atmosphere view. Same flat-lighting toggle as atmoShell.
    if (liquidCorona) {
      liquidCorona.setVisible(view !== 'atmosphere')
      liquidCorona.setFlatLighting(!isShader)
    }
  }

  return { set }
}
