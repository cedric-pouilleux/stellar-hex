import * as THREE from 'three'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { BodyConfig } from '../../types/body.types'
import type { TerrainLevel } from '../../types/terrain.types'
import type { StarBody } from '../../types/bodyHandle.types'
import type { BodyVariation } from './bodyVariation'
import type { HoverChannel } from '../state/hoverState'
import type { GraphicsUniforms } from '../hex/hexGraphicsUniforms'
import type { RenderQuality } from '../quality/renderQuality'
import { buildPlanetMesh, buildStarSmoothMesh } from './buildPlanetMesh'
import { buildInteractiveMesh } from './buildInteractiveMesh'
import { buildBodyHoverOverlay } from '../shells/buildBodyHoverOverlay'
import { makeInteractiveController } from './interactiveController'
import { accelerateRaycast } from '../lighting/accelerateRaycast'

/**
 * Stars use a different visual radius than the hex tile reference, so the
 * subdivision count is computed against this table — keeping tile counts
 * stable across spectral types regardless of the (much larger) display
 * sphere. Used by the dispatcher in `useBody` before delegating here.
 */
export const STAR_TILE_REF: Record<string, number> = { M: 2.0, K: 2.5, G: 3.0, F: 3.5 }

/**
 * Pre-computed inputs the star factory needs from the dispatcher. Receiving
 * them as parameters (rather than recomputing) keeps `useStar` decoupled
 * from `useBody` and avoids a circular import edge.
 */
export interface UseStarInputs {
  /** Original body config — needed for radius, coreRadiusRatio fallback. */
  config:    BodyConfig
  /** Initialised body simulation (tile states + sea level). */
  sim:       BodySimulation
  /** Resolved terrain palette for this star. */
  palette:   TerrainLevel[]
  /** Deterministic visual variation for this star. */
  variation: BodyVariation
  /** Tile count from the generated hexasphere — surfaced on the return value. */
  tileCount: number
  /** Per-body hover/pin channel — surfaced on the handle so projectors can subscribe. */
  hoverChannel:     HoverChannel
  /** Per-body graphics uniform bag — wired into the hex terrain shader. */
  graphicsUniforms: GraphicsUniforms
  /** Optional render-quality bag — propagated to the smooth-sphere builder. */
  quality?:         RenderQuality
}

/**
 * Builds the star-specific scene graph: a smooth sphere display mesh with
 * the animated star shader, a flat raycast proxy for hover queries and a
 * full hex interactive mesh swapped in on `activateInteractive()`.
 *
 * Stars carry no liquid shell, no atmosphere and no layered sol —
 * features absent from {@link StarBody}. Callers narrow the {@link Body}
 * union via `body.kind === 'star'` before reaching for planet-only
 * namespaces.
 *
 * @param inputs - Dispatcher-supplied state (config, sim, palette, …).
 * @returns      Star-specific body handle.
 */
export function useStar(inputs: UseStarInputs): StarBody {
  const { config, sim, palette, variation, tileCount, hoverChannel, graphicsUniforms, quality } = inputs
  const group = new THREE.Group()

  const { mesh: displayMesh, tick, planetMaterial: starMat } = buildStarSmoothMesh(sim, palette, variation, { quality })
  const { mesh: raycastProxy, faceToTileId }                  = buildPlanetMesh(sim, palette)
  const interactive                                            = buildInteractiveMesh(sim, palette, { hoverChannel, graphicsUniforms })
  // Accelerate the raycast proxy with a single-layer BVH (stars have no
  // atmo band). `firstHitOnly` in the controller then resolves hovers in
  // sub-millisecond time instead of walking every triangle.
  const releaseRaycastBVH                                      = accelerateRaycast(raycastProxy)
  const raycastState                                           = {
    mesh:         raycastProxy,
    faceToTileId,
    coreRadius:   config.radius * (config.coreRadiusRatio ?? 0),
  }
  const ctrl                                                   = makeInteractiveController(group, displayMesh, () => raycastState, interactive)
  const bodyHover                                              = buildBodyHoverOverlay(group, config.radius)

  let starElapsed = 0
  function tickStar(dt: number): void {
    starElapsed += dt
    tick(dt)
    interactive.tick(starElapsed)
  }

  function dispose(): void {
    releaseRaycastBVH()
    bodyHover.dispose()
    displayMesh.geometry.dispose()
    ;(displayMesh.material as THREE.Material).dispose()
    starMat.dispose()
    raycastProxy.geometry.dispose()
    ;(raycastProxy.material as THREE.Material).dispose()
    interactive.dispose()
  }

  return {
    kind: 'star',
    group, config, sim, palette, variation, tileCount,
    hoverChannel, graphicsUniforms,
    // Stars don't cast shadows on themselves and don't receive occlusion
    // from the cloud shell (they have none), so both uniform handles are
    // dormant stubs — present only to satisfy the shared `BodyBase` shape.
    shadowUniforms:   { pos: { value: new THREE.Vector3() }, radius: { value: 0 } },
    occluderUniforms: { pos: { value: new THREE.Vector3() }, radius: { value: 0 } },
    planetMaterial:   starMat,

    tick:    tickStar,
    dispose,

    getCoreRadius:    () => config.radius * (config.coreRadiusRatio ?? 0),
    getSurfaceRadius: () => config.radius,

    interactive: {
      activate:   ctrl.activateInteractive,
      deactivate: ctrl.deactivateInteractive,
      queryHover: ctrl.queryHover,
    },
    hover: {
      setTile:       interactive.setHover,
      setPinnedTile: interactive.setPinnedTile,
      setBodyHover:  bodyHover.setVisible,
      onChange:      interactive.onHoverChange,
    },
    tiles: {
      surfaceOffset:  interactive.surfaceOffset,
      tileGeometry:   interactive.tileGeometry,
      writeTileColor: interactive.writeTileColor,
      tileBaseVisual: interactive.tileBaseVisual,
    },
  }
}
