/**
 * Sol interactive mesh — orchestrator.
 *
 * Each tile becomes a single hex prism spanning `[coreRadius, coreRadius +
 * solHeight]`, with `solHeight ∈ [0, shellThickness]` driven by the palette.
 * The atmosphere is **not** part of this mesh anymore — it lives on a
 * dedicated board mesh (`buildAtmoBoardMesh`) built from its own hexasphere.
 *
 * This file is the **assembly point**. The heavy lifting is delegated:
 *   - {@link buildLayeredMergedGeometry} — geometry merge + per-tile ranges.
 *   - {@link buildLayeredMaterials}      — sol material.
 *   - {@link buildLayeredTileVisuals}    — sea anchor / palette / per-tile RGB cache.
 *   - {@link buildLayeredColorBuffer}    — vertex-color attribute + tile writes.
 *   - {@link buildLayeredHoverRing}      — hover + pin ring renderer.
 *   - {@link buildLiquidShell}           — stacked hex liquid cap on submerged tiles.
 *
 * The orchestrator owns the state machine (current hover/pin id, sea-level
 * band) and routes calls into the right collaborator; the public
 * {@link LayeredInteractiveMesh} surface is preserved so existing
 * orchestration and overlay consumers keep working with minor adjustments
 * (the per-layer overlay dispatch collapses to a single primitive, since
 * the mesh is now sol-only).
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { TerrainLevel } from '../types/terrain.types'
import type { BodyVariation } from '../body/bodyVariation'
import { buildLayeredMergedGeometry } from './buildLayeredMesh'
import { buildLayeredPrismGeometry } from './buildLayeredPrism'
import { buildLiquidShell, type LiquidShellHandle } from '../shells/buildLiquidShell'
import { type HoverConfig, DEFAULT_HOVER } from '../../config/render'
import type { HoverChannel } from '../state/hoverState'
import type { GraphicsUniforms } from '../hex/hexGraphicsUniforms'
import { accelerateRaycast } from '../lighting/accelerateRaycast'
import {
  type TileGeometryInfo,
  getTileLevel,
} from '../hex/hexMeshShared'
import type { InteractiveMesh } from '../body/buildInteractiveMesh'
import type { InteractiveLayer } from '../types/bodyHandle.types'
import { computeLayeredShellMetrics, resolveSolHeight } from './layeredShellMetrics'
import { buildLayeredTileVisuals } from './layeredTileVisuals'
import { buildLayeredMaterials } from './layeredMaterials'
import { buildLayeredColorBuffer } from './layeredColorBuffer'
import type { RaycastState } from '../body/interactiveController'

export { resolveSolHeight }
export type { InteractiveLayer }


/**
 * Sol interactive mesh interface — `InteractiveMesh` plus the mutation
 * primitives that only make sense on the sol layer (height mutation,
 * sea-level repaint, layered overlay).
 */
export interface LayeredInteractiveMesh extends InteractiveMesh {
  /**
   * Sol band thickness (`solOuterRadius - coreRadius`). Lets callers scale
   * runtime heights into world units.
   */
  totalThickness: number

  /**
   * Mutates the sol height of the given tiles in place. Rewrites position,
   * normal and `aSolHeight` attributes for each affected tile — vertex
   * counts stay stable thanks to always-emitted walls in
   * {@link buildLayeredPrismGeometry}.
   *
   * Silently skips unknown tile ids. Heights are clamped to
   * `[0, maxTerrainHeight]`.
   */
  updateTileSolHeight: (updates: Map<number, number>) => void

  /**
   * World-space position at the top of the sol cap for a tile. Returns
   * `null` for unknown ids. Consumers use it to anchor labels, projectors
   * or resource markers on the sol board.
   */
  getTilePosition: (tileId: number) => THREE.Vector3 | null

  /**
   * Stamps per-tile RGB into the sol vertex buffer. Same effect as
   * {@link InteractiveMesh.writeTileColor} called in a loop, but flips the
   * dirty flag once at the end.
   */
  applyTileOverlay: (colors: Map<number, { r: number; g: number; b: number }>) => void

  // ── Liquid (sea level) ─────────────────────────────────────────

  /**
   * Sets the world-space radius of the liquid surface sphere. Use with
   * {@link LayeredInteractiveMesh.totalThickness} to express runtime
   * heights: e.g. `setSeaLevel(coreRadius + userHeight)`. A value `≤ 0`
   * hides the liquid mesh.
   *
   * No-op when the body has no liquid configured (dry rocky, metallic, …).
   */
  setSeaLevel: (worldRadius: number) => void

  /**
   * Current sea level world radius. Returns `-1` on dry / frozen bodies
   * (no liquid surface). Used by the upstream hover cursor as the cap
   * radius for the liquid layer.
   */
  getSeaLevelRadius: () => number

  /** Toggles the liquid surface visibility. No-op on dry bodies. */
  setLiquidVisible: (on: boolean) => void

  /** Sets the liquid surface alpha in `[0, 1]`. No-op on dry bodies. */
  setLiquidOpacity: (alpha: number) => void

  /**
   * Live-patches the liquid surface tint. No-op on dry / frozen bodies.
   * Substance-agnostic — the caller resolves the chemistry (h2o, ch4, …)
   * and passes the resolved colour through.
   */
  setLiquidColor: (color: THREE.ColorRepresentation) => void

  /** Toggles the entire sol mesh visibility (sol + liquid). */
  setVisible: (on: boolean) => void

  /**
   * Forces the sol material to render with flat (light-independent)
   * shading when enabled. Used by the playable views (`'surface'`,
   * `'atmosphere'`) so star-driven shadows don't hide tiles on the
   * night side of the body. PBR channels (roughness, metalness, future
   * per-tile biome attributes) stay intact — only the directional
   * contribution of scene lights is bypassed.
   */
  setFlatLighting: (enabled: boolean) => void

  /**
   * Resolves the raycast target for the sol mesh — the mesh itself, with
   * its accelerated BVH. The mesh may be hidden by the view switcher;
   * the controller copies the body's `matrixWorld` onto it before each
   * query so raycasting still works while it sits invisible.
   */
  getRaycastState: () => RaycastState

  /**
   * Resolves the raycast target for the liquid shell, when the body
   * carries one. Returns `null` on dry bodies / frozen bodies (no liquid
   * shell built). The mesh is the merged liquid cap; `faceToTileId`
   * maps a triangle index back to the tile it covers, letting callers
   * tell which water hex the user is hovering.
   */
  getLiquidRaycastState: () => { mesh: THREE.Mesh; faceToTileId: readonly number[] } | null
}

/** Required dependencies + optional tuning for {@link buildLayeredInteractiveMesh}. */
export interface LayeredInteractiveMeshOptions {
  /** Per-body hover publication channel — forwarded to upstream cursor consumers. */
  hoverChannel:     HoverChannel
  /** Per-body graphics uniform bag — wired into the liquid shell shader. */
  graphicsUniforms: GraphicsUniforms
  /** Optional hover overlay visual tuning. Falls back to {@link DEFAULT_HOVER}. */
  hoverCfg?:        HoverConfig
}

/**
 * Builds the sol interactive mesh for a rocky / metallic / gaseous body.
 *
 * @param sim       - Pre-computed simulation (tiles, states, palette bridge).
 * @param levels    - Palette driving vertex colours and per-tile sol heights.
 * @param variation - Deterministic visual variation for the sol shader.
 * @param options   - Per-body channels + optional tuning.
 */
export function buildLayeredInteractiveMesh(
  sim:       BodySimulation,
  levels:    TerrainLevel[],
  variation: BodyVariation,
  options:   LayeredInteractiveMeshOptions,
): LayeredInteractiveMesh {
  const { hoverChannel, graphicsUniforms } = options
  const cfg = options.hoverCfg ?? DEFAULT_HOVER
  void variation // reserved for future sol shader integration

  // ── Shell metrics (pure math) ────────────────────────────────────
  const metrics = computeLayeredShellMetrics(sim)
  const {
    solSurfaceRadius,
    coreRadius,
    solOuterRadius,
    maxTerrainHeight,
    shellThickness,
    bandUnit,
  } = metrics
  const totalThickness = shellThickness

  // ── Tile-visual pipeline (palette + resource blend) ──────────────
  const visuals = buildLayeredTileVisuals(sim, levels)
  const { tileLevel, tileVisual, hasLiquidSurface, surfaceIsLiquid, computeTileVisual } = visuals

  let currentSeaLevelBand = hasLiquidSurface ? sim.seaLevelElevation : -1

  // ── Per-tile sol height resolution ───────────────────────────────
  const solHeightByTile = new Map<number, number>()
  const solHeightFn = (tile: Tile): number => {
    const state = sim.tileStates.get(tile.id)
    if (state && state.elevation === 0) {
      solHeightByTile.set(tile.id, 0)
      return 0
    }
    const h = resolveSolHeight(tile, sim, levels, maxTerrainHeight)
    solHeightByTile.set(tile.id, h)
    return h
  }

  // ── Geometry ─────────────────────────────────────────────────────
  const layered = buildLayeredMergedGeometry(
    sim.tiles, coreRadius, solOuterRadius, solHeightFn,
  )
  const { geometry, faceToTileId, tileRange } = layered

  // ── Tile cache + initial visuals ─────────────────────────────────
  const tileById = new Map<number, Tile>()
  for (const tile of sim.tiles) tileById.set(tile.id, tile)

  for (const tile of sim.tiles) {
    const state = sim.tileStates.get(tile.id)!
    const level = getTileLevel(state.elevation, levels)
    tileLevel.set(tile.id, level)
    tileVisual.set(tile.id, computeTileVisual(tile.id))
  }

  // ── Color buffer ─────────────────────────────────────────────────
  const colorBuffer = buildLayeredColorBuffer(geometry, tileRange, tileVisual)

  // ── Material + mesh ──────────────────────────────────────────────
  const { solMaterial, flatLighting } = buildLayeredMaterials()
  const hexMesh = new THREE.Mesh(geometry, solMaterial)
  hexMesh.renderOrder   = 0
  hexMesh.frustumCulled = false
  const releaseBVH      = accelerateRaycast(hexMesh)

  // ── Liquid shell (stacked hex caps on submerged tiles) ───────────
  // `buildLayeredInteractiveMesh` is only invoked from the planet path
  // (assemblePlanetSceneGraph), so `sim.config` is always a PlanetConfig
  // here — narrow once before forwarding to the liquid-shell builder.
  let liquid: LiquidShellHandle | null = null
  if (hasLiquidSurface
      && sim.config.type === 'planetary'
      && sim.config.liquidState === 'liquid') {
    // Build the shell with EVERY tile and a top elevation above the
    // tallest band so each tile gets a slot in the merged buffer. The
    // initial waterline collapses the tiles whose base sits at or above
    // it (degenerate top fans, zero render cost). Driving `setTopElevation`
    // afterwards covers the full slider range without ever rebuilding —
    // a tile rises above water when the level drops below its base, and
    // a new tile is submerged when the level climbs above it.
    const baseElevation = new Map<number, number>()
    for (const tile of sim.tiles) {
      const state = sim.tileStates.get(tile.id)
      if (!state) continue
      baseElevation.set(tile.id, state.elevation)
    }
    const buildTop = metrics.bandCount + 1
    liquid = buildLiquidShell({
      tiles:           sim.tiles,
      baseElevation,
      topElevation:    buildTop,
      palette:         levels,
      bodyRadius:      sim.config.radius,
      coreRadius,
      color:           sim.config.liquidColor ?? 0x175da1,
      graphicsUniforms,
    })
    // Collapse to the actual waterline — tiles whose base ≥ current sea
    // level become degenerate (no fragments).
    liquid.setTopElevation(currentSeaLevelBand)
  }

  // ── Group assembly ───────────────────────────────────────────────
  const group = new THREE.Group()
  group.add(hexMesh)
  if (liquid) group.add(liquid.group)

  /**
   * Hover-aware fill toggle. With the dedicated atmo board carrying its
   * own halo and the sol shader handling ambient lighting, the legacy
   * fill-bump behaviour collapsed to a no-op on the sol mesh — the hook
   * is kept for API parity with the legacy `InteractiveMesh` surface.
   */
  function setFill(_on: boolean): void { /* noop */ }

  function tileGeometry(tileId: number): TileGeometryInfo | null {
    const tile  = tileById.get(tileId)
    const level = tileLevel.get(tileId)
    if (!tile || !level) return null
    return { tile, level }
  }

  function tileBaseVisual(tileId: number) {
    const state = sim.tileStates.get(tileId)
    const level = tileLevel.get(tileId)
    if (!state || !level) return null
    const submerged = surfaceIsLiquid && currentSeaLevelBand >= 0
      && state.elevation < currentSeaLevelBand
    return {
      r:                 level.color.r,
      g:                 level.color.g,
      b:                 level.color.b,
      roughness:         level.roughness ?? 0.85,
      metalness:         level.metalness ?? 0.0,
      emissive:          level.emissive,
      emissiveIntensity: level.emissiveIntensity ?? 0,
      submerged,
    }
  }

  // ── Mutation API (sol-only) ──────────────────────────────────────

  function updateTileSolHeight(updates: Map<number, number>): void {
    if (updates.size === 0) return
    const posAttr  = geometry.getAttribute('position')   as THREE.BufferAttribute
    const normAttr = geometry.getAttribute('normal')     as THREE.BufferAttribute
    const solHAttr = geometry.getAttribute('aSolHeight') as THREE.BufferAttribute
    const posArr   = posAttr.array  as Float32Array
    const normArr  = normAttr.array as Float32Array
    const solHArr  = solHAttr.array as Float32Array

    for (const [tileId, requested] of updates) {
      const tile  = tileById.get(tileId)
      const range = tileRange.get(tileId)
      if (!tile || !range) continue

      const solH = Math.max(0, Math.min(maxTerrainHeight, requested))
      solHeightByTile.set(tileId, solH)

      const fresh = buildLayeredPrismGeometry(tile, coreRadius, solH, totalThickness)
      const fPos  = fresh.geometry.getAttribute('position').array   as Float32Array
      const fNorm = fresh.geometry.getAttribute('normal').array     as Float32Array
      const fSolH = fresh.geometry.getAttribute('aSolHeight').array as Float32Array

      posArr.set(fPos,   range.start * 3)
      normArr.set(fNorm, range.start * 3)
      solHArr.set(fSolH, range.start)
      fresh.geometry.dispose()
    }

    posAttr.needsUpdate  = true
    normAttr.needsUpdate = true
    solHAttr.needsUpdate = true

    // Refit the BVH so hover queries pick up the new heights.
    const bvh = (geometry as { boundsTree?: { refit: () => void } }).boundsTree
    bvh?.refit()

    // Propagate the new sol heights to the liquid shell so its per-tile
    // wall start tracks the underlying mineral cap. Without this step a
    // tile dug below the waterline keeps its initial baseBand and never
    // gains a liquid hex (and a tile lifted above the waterline keeps a
    // stale liquid cap that should have collapsed).
    if (liquid) {
      const liquidUpdates = new Map<number, number>()
      for (const tileId of updates.keys()) {
        const solH = solHeightByTile.get(tileId)
        if (solH === undefined) continue
        liquidUpdates.set(tileId, bandUnit > 0 ? solH / bandUnit : 0)
      }
      liquid.setBaseElevation(liquidUpdates)
    }

    void updates
  }

  function getTilePosition(tileId: number): THREE.Vector3 | null {
    const tile = tileById.get(tileId)
    if (!tile) return null
    const solH = solHeightByTile.get(tileId) ?? 0
    const r    = coreRadius + solH
    const c    = tile.centerPoint
    const len  = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z)
    const s    = r / len
    return new THREE.Vector3(c.x * s, c.y * s, c.z * s)
  }

  function tick(elapsed: number): void {
    liquid?.tick(elapsed)
  }

  /**
   * Moves the waterline to `worldRadius`, slides the liquid shell's top
   * band to match, and repaints every tile whose submerged status
   * flipped across the move.
   */
  function setSeaLevel(worldRadius: number): void {
    if (!hasLiquidSurface) return
    const nextBand = (worldRadius - coreRadius) / bandUnit
    liquid?.setTopElevation(nextBand)
    if (nextBand === currentSeaLevelBand) return
    const prevBand = currentSeaLevelBand
    currentSeaLevelBand = nextBand

    const lo = Math.min(prevBand, nextBand)
    const hi = Math.max(prevBand, nextBand)

    for (const tile of sim.tiles) {
      const state = sim.tileStates.get(tile.id)
      if (!state) continue
      if (state.elevation < lo || state.elevation >= hi) continue
      const vis = computeTileVisual(tile.id)
      tileVisual.set(tile.id, vis)
      colorBuffer.paintTile(tile.id, vis)
    }
  }
  function setLiquidVisible(on: boolean): void {
    liquid?.setVisible(on)
  }
  function setLiquidOpacity(alpha: number): void {
    liquid?.setOpacity(alpha)
  }
  function setLiquidColor(color: THREE.ColorRepresentation): void {
    liquid?.setColor(color)
  }

  function setVisible(on: boolean): void {
    hexMesh.visible = on
    if (liquid) liquid.setVisible(on)
  }

  function getSeaLevelRadius(): number {
    return hasLiquidSurface ? coreRadius + currentSeaLevelBand * bandUnit : -1
  }

  function getRaycastState(): RaycastState {
    return { mesh: hexMesh, faceToTileId, coreRadius }
  }

  function getLiquidRaycastState(): { mesh: THREE.Mesh; faceToTileId: readonly number[] } | null {
    return liquid ? { mesh: liquid.mesh, faceToTileId: liquid.faceToTileId } : null
  }

  function dispose() {
    releaseBVH()
    geometry.dispose()
    solMaterial.dispose()
    liquid?.dispose()
  }

  return {
    group,
    faceToTileId,
    surfaceOffset: cfg.surfaceOffset,
    totalThickness,
    setFill,
    tileGeometry,
    writeTileColor:   colorBuffer.writeTileColor,
    tileBaseVisual,
    updateTileSolHeight,
    getTilePosition,
    applyTileOverlay: colorBuffer.applyTileOverlay,
    setSeaLevel,
    getSeaLevelRadius,
    setLiquidVisible,
    setLiquidOpacity,
    setLiquidColor,
    setVisible,
    setFlatLighting: flatLighting.setFlatLighting,
    getRaycastState,
    getLiquidRaycastState,
    tick,
    dispose,
  }
}
