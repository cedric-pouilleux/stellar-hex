/**
 * Layered interactive mesh — orchestrator.
 *
 * Each tile becomes a **two-band prism** instead of a flat hex cap:
 * - A sol band from `coreRadius` to `coreRadius + solHeight(tile)`, with
 *   `solHeight` clamped to `[0, surfaceRadius - coreRadius]` so peaks stop
 *   at the nominal surface.
 * - An atmo band filling the remaining shell up to `atmoOuterRadius`,
 *   which sits ABOVE the nominal surface by a headroom proportional to
 *   the body's atmosphere thickness — tall sol columns are fully
 *   immersed in the halo rather than poking through its outer rim.
 *
 * Both bands share a single merged `BufferGeometry`; the sub-meshes are
 * split via `geometry.addGroup` + a multi-material array, so callers get
 * one `THREE.Mesh` with two draw calls. The sol draw call runs the
 * per-bodyType procedural shader (see `BodyMaterial`); the atmo draw
 * call runs the dedicated atmosphere shader (`createAtmoMaterial`,
 * `thin` mode for rocky/metallic, `bands` mode for gaseous).
 *
 * This file is the **assembly point**. The heavy lifting is delegated:
 *   - {@link buildLayeredMergedGeometry} — geometry merge + per-tile ranges.
 *   - {@link buildLayeredMaterials}      — sol + atmo material pair.
 *   - {@link buildLayeredTileVisuals}    — sea anchor / palette / per-tile RGB cache.
 *   - {@link buildLayeredColorBuffer}    — vertex-color attribute + tile writes.
 *   - {@link buildLayeredHoverRing}      — hover + pin ring renderer.
 *   - {@link buildLayeredRaycastProxies} — sol/atmo proxy meshes + BVHs.
 *   - {@link buildLiquidSphere}          — translucent sea surface (when present).
 *
 * The orchestrator owns the state machine (current hover/pin id, active
 * view, sea-level band) and routes calls into the right collaborator;
 * the public {@link LayeredInteractiveMesh} surface is preserved so the
 * existing `useBody` orchestration and overlay consumers keep working.
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { TerrainLevel } from '../../types/terrain.types'
import type { BodyVariation } from '../body/bodyVariation'
import { buildLayeredMergedGeometry } from './buildLayeredMesh'
import { LAYER_SOL, buildLayeredPrismGeometry } from './buildLayeredPrism'
import { buildLiquidSphere, type LiquidSphereHandle } from '../shells/buildLiquidSphere'
import { type HoverConfig, DEFAULT_HOVER } from '../../config/render'
import type { HoverChannel } from '../state/hoverState'
import type { GraphicsUniforms } from '../hex/hexGraphicsUniforms'
import type { RenderQuality } from '../quality/renderQuality'
import {
  type TileGeometryInfo,
  getTileLevel,
} from '../hex/hexMeshShared'
import type { InteractiveMesh } from '../body/buildInteractiveMesh'
import type {
  InteractiveLayer,
  InteractiveView,
} from '../../types/bodyHandle.types'
import { computeLayeredShellMetrics, resolveSolHeight } from './layeredShellMetrics'
import { buildLayeredTileVisuals } from './layeredTileVisuals'
import { buildLayeredMaterials } from './layeredMaterials'
import { buildLayeredHoverRing } from './layeredHoverRing'
import { buildLayeredColorBuffer } from './layeredColorBuffer'
import { buildLayeredRaycastProxies } from './layeredRaycastProxies'
import { createLayeredHoverPinState } from './layeredHoverPinState'
import type { RaycastState } from '../body/interactiveController'

export { resolveSolHeight }

/**
 * Multiplicative nudge applied to the liquid sphere's world radius so it sits
 * a hair above the hex caps at the sea-level band. Tiles whose elevation ===
 * `currentSeaLevelBand` have their flat cap vertices anchored at exactly
 * `coreRadius + band * bandUnit` — identical to the untiled liquid sphere,
 * producing a ring of z-fighting scintillation at each shore hex. Offsetting
 * the sphere by ~0.08% of its radius breaks the coplanarity. The wave bump
 * shader perturbs fragment normals at a much larger scale, so the bias is
 * invisible to the eye.
 */
const LIQUID_Z_BIAS = 1.0008

// `InteractiveLayer` / `InteractiveView` now live in `types/bodyHandle.types`
// (single source of truth for the public handle surface). Re-exported here
// so existing internal sub-builders can keep importing them locally.
export type { InteractiveLayer, InteractiveView }

/**
 * Extended interactive mesh interface — `InteractiveMesh` plus the
 * mutation primitives that only make sense on the 3-layer shell model.
 * Returned by {@link buildLayeredInteractiveMesh} so downstream code that
 * knows it is on a rocky/metallic body can call the per-layer helpers.
 */
export interface LayeredInteractiveMesh extends InteractiveMesh {
  /**
   * Total shell thickness `atmoOuterRadius - coreRadius` — includes the
   * atmo headroom carved above the nominal surface. Lets callers scale
   * runtime heights into world units; the sol zone alone spans
   * `config.radius - coreRadius` and is always strictly smaller.
   */
  totalThickness: number

  /**
   * Mutates the sol height of the given tiles in place. Rewrites position,
   * normal and `aSolHeight` attributes for each affected tile — the merged
   * geometry is *not* reallocated, vertex counts stay stable thanks to
   * always-emitted walls in {@link buildLayeredPrismGeometry}.
   *
   * Silently skips unknown tile ids. Heights are clamped to
   * `[0, totalThickness]`.
   */
  updateTileSolHeight: (updates: Map<number, number>) => void

  /**
   * World-space position at the top of the requested layer for a tile —
   * the sol cap for `'sol'`, the outer shell for `'atmo'`. Returns `null`
   * for unknown ids. Consumers use it to anchor labels, projectors or
   * resource markers to the layer the user is acting on.
   */
  getTilePosition: (tileId: number, layer: InteractiveLayer) => THREE.Vector3 | null

  /**
   * Stamps per-tile RGB into the vertex buffer of a single layer. Lets
   * overlay renderers tint the sol without touching the atmo band (or
   * vice versa) — {@link InteractiveMesh.writeTileColor} remains the
   * shortcut for "both layers, same colour".
   */
  applyTileOverlay: (layer: InteractiveLayer, colors: Map<number, { r: number; g: number; b: number }>) => void

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

  /** Toggles the liquid surface visibility. No-op on dry bodies. */
  setLiquidVisible: (on: boolean) => void

  /** Sets the liquid surface alpha in `[0, 1]`. No-op on dry bodies. */
  setLiquidOpacity: (alpha: number) => void

  /**
   * Switches the visible band — `'surface'` shows only the sol (terrain
   * relief), `'atmosphere'` shows only the outer hexasphere (flat,
   * pinned at `surfaceRadius`). Implemented as a cheap group swap on
   * the shared merged geometry; no material rebuild.
   */
  setView: (view: InteractiveView) => void

  /**
   * Resolves the raycast target to use for the current view. Two distinct
   * proxy meshes are built at construction — one containing the sol
   * triangles only, the other the atmo triangles only — each carrying
   * its own `MeshBVH`. Swapping on view is what makes `firstHitOnly`
   * correct on layered bodies: the BVH the raycaster queries never
   * contains the triangles of the hidden layer, so the closest hit is
   * always on the layer the user sees.
   */
  getRaycastState: () => RaycastState

  /** Current view flag, as last set by {@link setView}. */
  getActiveView:   () => InteractiveView
}

/** Required dependencies + optional tuning for {@link buildLayeredInteractiveMesh}. */
export interface LayeredInteractiveMeshOptions {
  /** Per-body hover/pin publication channel — written on hover/pin changes. */
  hoverChannel:     HoverChannel
  /** Per-body graphics uniform bag — wired into the liquid shell shader. */
  graphicsUniforms: GraphicsUniforms
  /** Optional hover overlay visual tuning. Falls back to {@link DEFAULT_HOVER}. */
  hoverCfg?:        HoverConfig
  /** Optional render-quality bag — propagated to the inner liquid sphere. */
  quality?:         RenderQuality
}

/**
 * Builds the layered interactive mesh for a rocky / metallic / gaseous body.
 *
 * @param sim       - Pre-computed simulation (tiles, states, palette bridge).
 * @param levels    - Palette driving vertex colours and per-tile sol heights.
 * @param variation - Deterministic visual variation for the sol shader.
 * @param options   - Per-body channels + optional tuning. See {@link LayeredInteractiveMeshOptions}.
 */
export function buildLayeredInteractiveMesh(
  sim:       BodySimulation,
  levels:    TerrainLevel[],
  variation: BodyVariation,
  options:   LayeredInteractiveMeshOptions,
): LayeredInteractiveMesh {
  const { hoverChannel, graphicsUniforms } = options
  const cfg = options.hoverCfg ?? DEFAULT_HOVER

  // ── Shell metrics (pure math) ────────────────────────────────────
  const metrics = computeLayeredShellMetrics(sim)
  const {
    solSurfaceRadius,
    coreRadius,
    maxTerrainHeight,
    atmoOuterRadius,
    totalThickness,
    bandUnit,
    bandToRadius,
  } = metrics

  // ── Per-tile sol height resolution ───────────────────────────────
  const solHeightByTile = new Map<number, number>()
  const solHeightFn = (tile: Tile): number => {
    // Lowest band is treated as "already mined out" — collapse the sol
    // prism so the core mesh shines through. Matches what an external
    // dig hook pushes when a tile reaches band 0, so naturally low tiles
    // and dug-out tiles behave identically.
    const state = sim.tileStates.get(tile.id)
    if (state && state.elevation === 0) {
      solHeightByTile.set(tile.id, 0)
      return 0
    }
    // Clamp to `maxTerrainHeight` so the palette can't produce heights
    // above the experimental ceiling; the atmo outer radius is sized to
    // sit above that ceiling so tall columns stay inside the halo.
    const h = resolveSolHeight(tile, sim, levels, maxTerrainHeight)
    solHeightByTile.set(tile.id, h)
    return h
  }

  // ── Tile-visual pipeline (palette + resource blend) ──────────────
  const visuals = buildLayeredTileVisuals(sim, levels)
  const { tileLevel, tileVisual, hasLiquidSurface, surfaceIsLiquid, computeTileVisual } = visuals

  // Sea-level radius — used to position the translucent liquid sphere. The
  // prism sol bottoms are NOT clipped to sea level anymore: doing so leaves a
  // ring-shaped gap between the core mesh and the base of emerged land tiles
  // (the tile column no longer reaches the core), and the translucent liquid
  // sphere does not fully conceal it. Walls therefore always span
  // `[coreRadius, solTop]`, and the liquid sphere tints the submerged portion
  // of land tiles — an acceptable trade given the alternative is visible holes
  // on the planet silhouette.
  let currentSeaLevelBand = hasLiquidSurface ? sim.seaLevelElevation : -1
  const seaLevelRadius = hasLiquidSurface
    ? bandToRadius(currentSeaLevelBand) * LIQUID_Z_BIAS
    : undefined

  // ── Geometry ─────────────────────────────────────────────────────
  const layered = buildLayeredMergedGeometry(
    sim.tiles, coreRadius, atmoOuterRadius, solHeightFn,
  )
  const { geometry, faceToTileId, faceToLayer, tileRange } = layered

  // ── Tile cache + initial visuals ─────────────────────────────────
  const tileById = new Map<number, Tile>()
  for (const tile of sim.tiles) tileById.set(tile.id, tile)

  for (const tile of sim.tiles) {
    const state = sim.tileStates.get(tile.id)!
    const level = getTileLevel(state.elevation, levels)
    tileLevel.set(tile.id, level)
    tileVisual.set(tile.id, computeTileVisual(tile.id))
  }

  // ── Color buffer (delegated) ─────────────────────────────────────
  const colorBuffer = buildLayeredColorBuffer(geometry, tileRange, tileVisual)

  // ── Geometry draw groups (sol + atmo split) ──────────────────────
  // Merged layout: per tile, sol vertices come before atmo vertices.
  // Walk the faceToLayer array once and collapse contiguous runs of
  // the same layer into a single group so we stay at 1 draw call per
  // layer when Three.js allows it.
  const solMaterialIndex  = 0
  const atmoMaterialIndex = 1
  const emitGroup = (startFace: number, endFaceExclusive: number, layer: 0 | 1) => {
    const startVertex = startFace * 3
    const count       = (endFaceExclusive - startFace) * 3
    geometry.addGroup(startVertex, count, layer === LAYER_SOL ? solMaterialIndex : atmoMaterialIndex)
  }
  if (faceToLayer.length > 0) {
    let runStart: number = 0
    let runLayer: 0 | 1  = faceToLayer[0]
    for (let f = 1; f < faceToLayer.length; f++) {
      const l = faceToLayer[f]
      if (l !== runLayer) {
        emitGroup(runStart, f, runLayer)
        runStart = f
        runLayer = l
      }
    }
    emitGroup(runStart, faceToLayer.length, runLayer)
  }

  // Per-view group snapshots. Clone the draw groups so `setView` can
  // swap them in O(1) without rescanning `faceToLayer`.
  type DrawGroup = { start: number; count: number; materialIndex: number }
  const allGroups: DrawGroup[] = geometry.groups.map(g => ({ ...g, materialIndex: g.materialIndex ?? 0 }))
  const surfaceGroups          = allGroups.filter(g => g.materialIndex === solMaterialIndex)
  const atmosphereGroups       = allGroups.filter(g => g.materialIndex === atmoMaterialIndex)

  // ── Materials (sol + atmo) ───────────────────────────────────────
  // `atmoPlayable` is mounted by default (interactive views start on
  // `'surface'` or `'atmosphere'`). `setView('shader')` swaps in
  // `atmoShader`, which carries the body-type-driven opacity profile.
  const { solMaterial, atmoPlayable, atmoShader } = buildLayeredMaterials({
    sim, variation, coreRadius, totalThickness,
  })
  let activeAtmoMat = atmoPlayable

  const hexMesh = new THREE.Mesh(geometry, [solMaterial, activeAtmoMat.material])
  hexMesh.renderOrder   = 0
  hexMesh.frustumCulled = false

  // ── Raycast proxies (delegated) ──────────────────────────────────
  const raycastProxies = buildLayeredRaycastProxies(geometry, faceToTileId, faceToLayer)

  // ── Hover ring (delegated) ───────────────────────────────────────
  const hoverRing = buildLayeredHoverRing(hoverChannel, cfg)

  // ── Liquid surface (sea level) ───────────────────────────────────
  let liquid: LiquidSphereHandle | null = null
  if (seaLevelRadius !== undefined) {
    liquid = buildLiquidSphere(sim.config, { radius: seaLevelRadius, graphicsUniforms, quality: options.quality })
  }

  // ── Group assembly ───────────────────────────────────────────────
  const group = new THREE.Group()
  group.add(hexMesh)
  if (liquid) group.add(liquid.mesh)
  group.add(hoverRing.mesh)

  // ── Hover / pin state ────────────────────────────────────────────
  // Orchestrator keeps `activeView` (mutated by `setView`) and the cap-
  // offset resolver, then injects the resolver into the state machine as
  // a port so the latter never reads orchestrator state directly.
  let activeView: InteractiveView = 'surface'

  /**
   * Returns the hex-cap height passed to `buildTileRing` so the hover
   * ring sits flush with the tile's visible top. Expressed as an offset
   * from the hexasphere radius (= `config.radius` = `solSurfaceRadius`).
   *
   * - Surface view: ring rides the sol cap at `coreRadius + solHeight`,
   *   expressed as an offset from `solSurfaceRadius`. `solHeight` is
   *   clamped to `shellThickness` so the offset is always ≤ 0 (tile tops
   *   cap at the nominal surface; they cannot poke through).
   * - Atmosphere view: ring rides the outer hexasphere at `atmoOuterRadius`,
   *   which sits strictly above the tallest hex plus the atmo headroom
   *   — so the offset is the full atmo gap.
   */
  function tileCapOffsetFromRadius(tileId: number): number {
    if (activeView === 'atmosphere') return atmoOuterRadius - solSurfaceRadius
    const solH = solHeightByTile.get(tileId) ?? totalThickness
    return (coreRadius + solH) - solSurfaceRadius
  }

  const hoverPinState = createLayeredHoverPinState({
    hoverRing,
    tileById,
    tileVisual,
    hoverConfig:      cfg,
    group,
    getTileCapOffset: tileCapOffsetFromRadius,
  })

  /**
   * Hover-aware fill toggle. The legacy mesh bumped an ambient fill on
   * every vertex; with the procedural sol shader carrying its own
   * lighting, `setFill` degrades to a subtle atmo opacity boost on the
   * translucent shader-view material — visible halo when the body is
   * focused, sleeker silhouette otherwise. Opaque atmos (gas envelopes,
   * playable view) are at full visibility already, so the toggle is a
   * no-op there.
   */
  const baseAtmoOpacity = atmoShader.mode === 'translucent'
    ? (atmoShader.material.uniforms.uOpacity.value as number)
    : 1
  function setFill(on: boolean) {
    if (atmoShader.mode !== 'translucent') return
    atmoShader.setParams({ opacity: on ? Math.min(1, baseAtmoOpacity * 1.4) : baseAtmoOpacity })
  }

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
    // The cap stays at its palette colour even when submerged — the
    // translucent liquid sphere on top provides the underwater tint.
    // `submerged` still flows through for resource-blend gating.
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

  // ── Mutation API (3-layer model) ─────────────────────────────────

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

      // Clamp to `maxTerrainHeight` — the experimental ceiling, matching
      // `solHeightFn` so initial and mutated heights agree.
      const solH = Math.max(0, Math.min(maxTerrainHeight, requested))
      solHeightByTile.set(tileId, solH)

      // Rebuild the tile's prism in isolation and copy its attribute
      // arrays over the merged buffer — vertex counts are stable so the
      // layout matches by construction.
      const fresh = buildLayeredPrismGeometry(tile, coreRadius, solH, totalThickness)
      const fPos  = fresh.geometry.getAttribute('position').array   as Float32Array
      const fNorm = fresh.geometry.getAttribute('normal').array     as Float32Array
      const fSolH = fresh.geometry.getAttribute('aSolHeight').array as Float32Array

      posArr.set(fPos,   range.sol.start * 3)
      normArr.set(fNorm, range.sol.start * 3)
      solHArr.set(fSolH, range.sol.start)
      fresh.geometry.dispose()

      // Mirror the position update into the per-layer raycast proxies
      // so BVH-accelerated `queryHover` keeps returning the right tile
      // ids after the dig.
      raycastProxies.mirrorTilePositions(tileId, posArr, range)
    }

    posAttr.needsUpdate  = true
    normAttr.needsUpdate = true
    solHAttr.needsUpdate = true
    // No `computeBoundingSphere()` here — the merged prism geometry is bounded
    // by construction in `[coreRadius, atmoOuterRadius]`, and sol-height
    // mutations are clamped to `maxTerrainHeight` (≤ atmoOuterRadius - coreRadius),
    // so the initial bounding sphere set by `mergeGeometries` stays valid.

    raycastProxies.flush()

    // Hover / pin rings are cached at the cap height captured when they
    // were first placed — when the tile they sit on changes height (dig,
    // lift) the ring would otherwise float at the old cap. Rebuild in
    // place so the marker sticks to the new surface.
    hoverPinState.refreshAffected(updates)
  }

  function getTilePosition(tileId: number, layer: InteractiveLayer): THREE.Vector3 | null {
    const tile = tileById.get(tileId)
    if (!tile) return null
    const solH = solHeightByTile.get(tileId) ?? 0
    const r    = layer === 'sol' ? coreRadius + solH : atmoOuterRadius
    const c    = tile.centerPoint
    const len  = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z)
    const s    = r / len
    return new THREE.Vector3(c.x * s, c.y * s, c.z * s)
  }

  function tick(elapsed: number): void {
    atmoPlayable.tick(elapsed)
    atmoShader.tick(elapsed)
    liquid?.tick(elapsed)
  }

  /**
   * Moves the waterline to `worldRadius` and rewrites only the tiles whose
   * submerged status actually flips between the previous and new waterline.
   * A tile flips iff its integer band sits in the half-open interval
   * `[min(prev, next), max(prev, next))` — anything strictly above both
   * waterlines (always emerged) or below both (always submerged) keeps its
   * cached colour and is skipped. Geometry never moves; only the colour
   * buffer is touched, and only on the dirty subset.
   */
  function setSeaLevel(worldRadius: number): void {
    // When the waterline drops to (or below) the inner core, there is
    // physically no basin left to fill — and a liquid sphere sized at
    // exactly `coreRadius` would wrap the molten core like a translucent
    // shell, dimming its glow and blocking the point-light's contribution
    // to the surrounding scene. Hide the liquid mesh in that case.
    liquid?.setSeaLevel(worldRadius > coreRadius ? worldRadius * LIQUID_Z_BIAS : 0)
    if (!hasLiquidSurface) return
    // Invert `bandToRadius`: `band = (worldRadius - coreRadius) / unit`.
    const nextBand = (worldRadius - coreRadius) / bandUnit
    if (nextBand === currentSeaLevelBand) return
    const prevBand = currentSeaLevelBand
    currentSeaLevelBand = nextBand

    // Half-open window where `(elev < prevBand) !== (elev < nextBand)`.
    const lo = Math.min(prevBand, nextBand)
    const hi = Math.max(prevBand, nextBand)

    for (const tile of sim.tiles) {
      const state = sim.tileStates.get(tile.id)
      if (!state) continue
      // Outside the flip window — submerged status unchanged, skip.
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

  function setView(view: InteractiveView): void {
    activeView = view
    // Group selection — `'shader'` reuses the atmosphere group set so the
    // halo shell still draws over the smooth-sphere display mesh that
    // `useBody` mounts when shader view is active.
    const pick = view === 'surface' ? surfaceGroups : atmosphereGroups
    geometry.groups.length = 0
    for (const g of pick) geometry.groups.push({ ...g })

    // Material swap — playable atmo vs shader-view atmo. Index 1 is the atmo
    // material slot in the merged-mesh material array.
    const target = view === 'shader' ? atmoShader : atmoPlayable
    if (target !== activeAtmoMat) {
      activeAtmoMat = target
      const materials = hexMesh.material as THREE.Material[]
      materials[1] = target.material
    }

    // Liquid rides with the surface view (it sits at sea level on the sol
    // band); atmosphere / shader views hide it — otherwise the sphere pokes
    // through an otherwise empty atmo hexasphere.
    liquid?.setVisible(view === 'surface')
  }

  function dispose() {
    hoverPinState.setHover(null)
    hoverPinState.setPinnedTile(null)
    geometry.dispose()
    solMaterial.dispose()
    atmoPlayable.dispose()
    atmoShader.dispose()
    liquid?.dispose()
    hoverRing.dispose()
    raycastProxies.dispose()
  }

  return {
    group,
    faceToTileId,
    surfaceOffset: cfg.surfaceOffset,
    totalThickness,
    setHover:      hoverPinState.setHover,
    setPinnedTile: hoverPinState.setPinnedTile,
    setFill,
    tileGeometry,
    writeTileColor:   colorBuffer.writeTileColor,
    tileBaseVisual,
    onHoverChange:    hoverPinState.onHoverChange,
    updateTileSolHeight,
    getTilePosition,
    applyTileOverlay: colorBuffer.applyTileOverlay,
    setSeaLevel,
    setLiquidVisible,
    setLiquidOpacity,
    setView,
    getRaycastState: () => raycastProxies.getRaycastState(activeView, coreRadius),
    getActiveView:   () => activeView,
    tick,
    dispose,
  }
}
