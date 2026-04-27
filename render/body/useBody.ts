import * as THREE from 'three'
import { generateHexasphere } from '../../geometry/hexasphere'
import { initBodySimulation } from '../../sim/BodySimulation'
import type { BodyConfig } from '../../types/body.types'
import type { TerrainLevel } from '../../types/terrain.types'
import type { Body, PlanetBody } from '../../types/bodyHandle.types'
import { generateBodyVariation } from './bodyVariation'
import { useStar } from './useStar'
import { strategyFor } from './bodyTypeStrategy'
import { createHoverChannel, type HoverChannel } from '../state/hoverState'
import { createGraphicsUniforms, type GraphicsUniforms } from '../hex/hexGraphicsUniforms'
import type { RenderQuality } from '../quality/renderQuality'
import { tileSizeToSubdivisions, choosePalette } from './bodyHelpers'
import { assemblePlanetSceneGraph } from './assemblePlanetSceneGraph'
import { createPlanetViewSwitcher } from './createPlanetViewSwitcher'

// Re-exports for the public API surface — keep historical import paths
// (`@cedric-pouilleux/stellar-hex/core` → `useBody`, `resolveTileHeight`, …)
// stable while the implementations live in `bodyHelpers.ts`.
export {
  tileSizeToSubdivisions,
  choosePalette,
  resolveTileHeight,
  resolveTileLevel,
} from './bodyHelpers'

// ── Public API ────────────────────────────────────────────────────

const _wPos = new THREE.Vector3()
const _dir  = new THREE.Vector3()

/**
 * Factory that builds a complete celestial body — hex mesh, interactive
 * raycast proxy, smooth display mesh, atmosphere glow, rings and effect
 * layers — deterministically from a {@link BodyConfig}.
 *
 * Dispatches to the star sub-builder (which keeps its own smooth + hex
 * meshes) or to the unified 3-layer path (rocky / metallic / gaseous all
 * share the layered prism interactive mesh). Scene-graph assembly lives
 * in {@link assemblePlanetSceneGraph}; view toggles live in
 * {@link createPlanetViewSwitcher}.
 *
 * @param config    - Physics + visual configuration of the body.
 * @param tileSize  - Target world-space tile edge length (drives subdivisions).
 * @param options   - Optional hooks — sun position provider, palette override.
 */
export function useBody(
  config: BodyConfig,
  tileSize: number,
  options?: {
    /**
     * Mutable Vector3 carrying the dominant light's world-space position.
     * Read by `body.tick(dt)` to push a fresh light direction onto the
     * planet shader. The caller owns the vector and mutates it from its
     * own loop (or never, for fixed lights). The lib never reassigns it.
     * When omitted, the body's shader keeps its initial light direction.
     */
    sunWorldPos?: THREE.Vector3
    /**
     * Optional render-time palette override; see {@link choosePalette} for
     * the sizing/thresholding contract. When omitted, the palette is
     * auto-derived from `config.type` + the rocky ramp anchors
     * (`terrainColorLow` / `terrainColorHigh`).
     */
    palette?: TerrainLevel[]
    /**
     * Optional hover/pin publication channel. Pass a shared channel when
     * several bodies must publish into the same UI slot (single-popover
     * UX); omit to get a fresh per-body channel — the default and the
     * recommended setup for multi-body scenes.
     */
    hoverChannel?: HoverChannel
    /**
     * Optional graphics uniform bag. Pass a shared bag to drive every body
     * with the same graphics settings; omit to get a fresh per-body bag —
     * mutating one body's uniforms then leaves siblings untouched.
     */
    graphicsUniforms?: GraphicsUniforms
    /**
     * Corona halo headroom — fraction of `solOuterRadius` the BackSide
     * atmo shell extends past the visible sol silhouette. Clamped to
     * `[0.02, 1]`; defaults to `0.05`. Rocky / metallic only — gas
     * skips the shell (its smooth sphere plays that role).
     */
    coronaHeadroom?: number
    /**
     * Optional render-quality knobs. Currently exposes `sphereDetail`
     * (`'standard' | 'high'`) — `'high'` bumps the icosphere detail of
     * every spherical mesh by one subdivision for smoother silhouettes,
     * at the cost of ≈ 4× tris on those meshes. Defaults to standard.
     */
    quality?:        RenderQuality
  },
): Body {
  const hoverChannel     = options?.hoverChannel     ?? createHoverChannel()
  const graphicsUniforms = options?.graphicsUniforms ?? createGraphicsUniforms()
  const sunWorldPos      = options?.sunWorldPos
  const coronaHeadroom   = Math.max(0.02, Math.min(1, options?.coronaHeadroom ?? 0.05))
  const quality          = options?.quality
  const strategy         = strategyFor(config.type)
  // Tile-reference radius is per-type — stars look up their spectral
  // class so tile counts stay stable across the (much larger) display
  // sphere; planets just use their visual radius.
  const subdivisions = tileSizeToSubdivisions(strategy.tileRefRadius(config), tileSize)
  const data         = generateHexasphere(config.radius, subdivisions)
  const variation    = generateBodyVariation(config)
  const sim          = initBodySimulation(data.tiles, config)
  const palette      = choosePalette(config, options?.palette)

  // Star path is fully delegated to `useStar` — its returned shape mirrors
  // the planet path so callers keep a single code surface.
  if (config.type === 'star') {
    return useStar({ config, sim, palette, variation, tileCount: data.tiles.length, hoverChannel, graphicsUniforms, quality })
  }

  // Rocky / Metallic / Gaseous — assembly + view switcher.
  const graph = assemblePlanetSceneGraph({
    config, sim, palette, variation,
    hoverChannel, graphicsUniforms, coronaHeadroom, quality,
  })
  const viewSwitcher = createPlanetViewSwitcher(graph)

  const {
    group, smoothSphere, displayMesh, planetMaterial,
    interactive, ctrl, bodyHover,
    coreMesh, atmoShell, liquidCorona,
    shadowUniforms, occluderUniforms,
  } = graph

  let elapsed = 0
  function dispose() {
    bodyHover.dispose()
    displayMesh.geometry.dispose()
    ;(displayMesh.material as THREE.Material).dispose()
    interactive.dispose()
    planetMaterial.dispose()
    coreMesh.dispose()
    atmoShell?.dispose()
    liquidCorona?.dispose()
  }

  const planet: PlanetBody = {
    kind: 'planet',
    group,
    config,
    sim,
    palette,
    variation,
    tileCount: data.tiles.length,
    shadowUniforms,
    occluderUniforms,
    planetMaterial,
    hoverChannel,
    graphicsUniforms,

    tick: (dt: number) => {
      elapsed += dt
      planetMaterial.tick(elapsed)
      interactive.tick(elapsed)
      coreMesh.tick(elapsed)
      atmoShell?.tick(elapsed)
      if (sunWorldPos) {
        group.getWorldPosition(_wPos)
        _dir.copy(sunWorldPos).sub(_wPos).normalize()
        planetMaterial.setLight({ direction: _dir })
        atmoShell?.setLight(_dir)
        liquidCorona?.setLight(_dir)
      }
    },
    dispose,

    getCoreRadius:    () => coreMesh.radius,
    getSurfaceRadius: () => config.radius,

    /**
     * Atmo shell handle — `null` on bodies without an atmospheric layer
     * (metallic, star) or when `atmosphereOpacity` resolves to zero.
     * Callers tune the procedural shader live via `body.atmoShell?.setParams(...)`
     * and project resource overlays via `body.tiles.paintAtmoShell(...)`.
     */
    atmoShell,
    /**
     * Liquid corona handle — outer translucent halo coloured with the
     * body's `liquidColor`. `null` on bodies without a surface liquid.
     * Live-tunable opacity / colour through `setOpacity` / `setColor`.
     */
    liquidCorona,

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
    liquid: {
      // Route sea-level changes through both the hex mesh (liquid sphere +
      // per-tile colour repaint) and the smooth display sphere (vertex
      // colour repaint + shader ocean-mask uniform) so the waterline stays
      // consistent across views.
      setSeaLevel: (worldRadius: number) => {
        interactive.setSeaLevel(worldRadius)
        smoothSphere.setSeaLevel(worldRadius)
      },
      setVisible: interactive.setLiquidVisible,
      setOpacity: interactive.setLiquidOpacity,
    },
    view: {
      set: viewSwitcher.set,
    },
    tiles: {
      surfaceOffset:       interactive.surfaceOffset,
      tileGeometry:        interactive.tileGeometry,
      getTilePosition:     interactive.getTilePosition,
      updateTileSolHeight: interactive.updateTileSolHeight,
      writeTileColor:      interactive.writeTileColor,
      tileBaseVisual:      interactive.tileBaseVisual,
      applyTileOverlay:    interactive.applyTileOverlay,
      repaintSmoothSphere: smoothSphere.repaint,
      paintSmoothSphere:   smoothSphere.paintFromTiles,
      // Forwards the playable-atmo overlay onto the procedural shader-view
      // shell. No-op when the body has no atmo shell (metallic / star) —
      // the caller may safely call this in a uniform paint pipeline.
      paintAtmoShell:      atmoShell ? atmoShell.paintFromTiles : () => { /* noop */ },
    },
  }
  return planet
}
