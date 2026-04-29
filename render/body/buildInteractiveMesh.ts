/**
 * Legacy single-layer interactive hex mesh — used by the star path.
 *
 * Single merged hex mesh (1 draw call) + 2 hover overlay meshes:
 *   - fill  : additive semi-transparent fan covering the tile top face
 *   - border: thin quad-strip along the tile boundary perimeter
 *
 * Planets use {@link buildLayeredInteractiveMesh} instead (two-band prism
 * with sol + atmo). Kept here because the star renderer has no atmo band
 * and can stay on the flat variant.
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import type { TerrainLevel } from '../types/terrain.types'
import type { BodySimulation } from '../../sim/BodySimulation'
import { type HoverConfig, DEFAULT_HOVER } from '../../config/render'
import type { HoverChannel } from '../state/hoverState'
import type { GraphicsUniforms } from '../hex/hexGraphicsUniforms'
import type { TileBaseVisual } from '../types/bodyHandle.types'
import {
  type TileGeometryInfo,
  getTileLevel,
} from '../hex/hexMeshShared'
import { buildMergedGeometry } from '../hex/hexMergedGeometry'
import { applyHexShader } from '../hex/hexShaderOverride'
import { strategyFor, type BodyTypeStrategy } from './bodyTypeStrategy'

/**
 * Public surface returned by {@link buildInteractiveMesh}. Exposes reusable
 * primitives (tileGeometry / writeTileColor / computeTileBaseRGB /
 * onHoverChange / surfaceOffset) that any overlay renderer can consume to
 * paint tiles without knowing about the underlying mesh layout.
 */
export interface InteractiveMesh {
  group:              THREE.Group
  faceToTileId:       number[]
  /** Baseline radial offset (body-relative) applied to the interactive surface. */
  surfaceOffset:      number
  setFill:            (on: boolean) => void

  // ── Primitives for external overlay renderers ──────────────────────

  /**
   * Resolves the geometry context for a tile (tile + terrain level).
   * Returns null when the id is unknown. Consumed by overlay factories
   * such as `createTileOverlayMesh`.
   */
  tileGeometry:       (tileId: number) => TileGeometryInfo | null
  /**
   * Writes a raw RGB value to every vertex of a tile in the merged color
   * buffer. No palette logic — callers decide the color.
   */
  writeTileColor:     (tileId: number, rgb: { r: number; g: number; b: number }) => void
  /**
   * Resolves the pre-blend visual snapshot for a tile (palette colour +
   * PBR + emissive + submerged flag). Lets off-lib consumers run their own
   * resource-aware blend without reading the lib's blend internals.
   * Returns null when the tile id is unknown.
   */
  tileBaseVisual:     (tileId: number) => TileBaseVisual | null
  /** Advances the per-vertex shader animation clock (call each frame with elapsed seconds). */
  tick:               (elapsed: number) => void
  dispose:            () => void
}

/** Required dependencies + optional tuning for {@link buildInteractiveMesh}. */
export interface InteractiveMeshOptions {
  /** Per-body hover/pin publication channel — written on hover/pin changes. */
  hoverChannel:     HoverChannel
  /** Per-body graphics uniform bag — wired into the hex terrain shader. */
  graphicsUniforms: GraphicsUniforms
  /** Optional hover overlay visual tuning. Falls back to {@link DEFAULT_HOVER}. */
  hoverCfg?:        HoverConfig
  /**
   * Optional pre-resolved body-type strategy. When omitted, the builder
   * resolves it via `strategyFor(sim.config)`. Passing it through avoids
   * the redundant lookup when the orchestrator already resolved it.
   */
  strategy?:        BodyTypeStrategy
}

/**
 * Builds the interactive hex mesh used when a body is focused — carries
 * the hover/pin overlays, per-tile color writebacks, and the per-vertex
 * shader animation clock. Returns an {@link InteractiveMesh} façade
 * consumed by the scene components.
 *
 * Star-only path: stars never carry a liquid surface, so this builder
 * does not mount any liquid shell. Planets go through the layered
 * variant ({@link buildLayeredInteractiveMesh}) which has its own.
 *
 * @param sim     - Pre-computed body simulation.
 * @param levels  - Terrain palette driving vertex colouring.
 * @param options - Per-body channels + optional tuning. See {@link InteractiveMeshOptions}.
 */
export function buildInteractiveMesh(
  sim:     BodySimulation,
  levels:  TerrainLevel[],
  options: InteractiveMeshOptions,
): InteractiveMesh {
  const { graphicsUniforms } = options
  const cfg = options.hoverCfg ?? DEFAULT_HOVER
  const strategy = options.strategy ?? strategyFor(sim.config)
  void options.hoverChannel // unused — cursor lives upstream now

  const { geometry, faceToTileId, tileVertexRange } = buildMergedGeometry(sim, levels)

  const selfLit     = levels.some(l => (l.emissiveIntensity ?? 0) > 0)
  const fillUniform = { value: 0.0 }

  const timeUniform = { value: 0.0 }

  // DoubleSide on star prisms is load-bearing: their top-cap triangles are
  // wound CW seen from outside the sphere, so FrontSide culling would hide
  // the entire hex view (displayed as a uniformly white sphere). Since
  // stars use `flatSurface: true` and carry no walls, the backface shading
  // cost is marginal anyway — the gain from FrontSide would not compensate
  // the visual regression.
  let hexMat: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
  if (selfLit) {
    hexMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
  } else {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide })
    applyHexShader(m, fillUniform, timeUniform, strategy.metallicSheen, graphicsUniforms)
    hexMat = m
  }
  const hexMesh = new THREE.Mesh(geometry, hexMat)
  hexMesh.renderOrder = 0
  // Disable frustum culling on the planet surface mesh.
  // In hex mode the camera orbits close to the sphere and the bounding
  // sphere can graze the frustum edges — floating-point precision in the
  // containment test then oscillates between culled/visible, causing
  // single-frame black flashes ("voile noir") at specific camera angles.
  hexMesh.frustumCulled = false

  const group = new THREE.Group()
  group.add(hexMesh)

  const tileById = new Map<number, Tile>()
  for (const tile of sim.tiles) tileById.set(tile.id, tile)

  const tileLevel = new Map<number, TerrainLevel>()
  for (const tile of sim.tiles) {
    const state = sim.tileStates.get(tile.id)!
    tileLevel.set(tile.id, getTileLevel(state.elevation, levels))
  }

  /** Tile geometry lookup exposed as a public primitive. */
  function tileGeometry(tileId: number): TileGeometryInfo | null {
    const tile  = tileById.get(tileId)
    const level = tileLevel.get(tileId)
    if (!tile || !level) return null
    return { tile, level }
  }

  function setFill(on: boolean) {
    fillUniform.value = on ? 0.35 : 0.0
  }

  /** Pre-blend visual snapshot — the palette side of a tile, without resource influence. */
  function tileBaseVisual(tileId: number): TileBaseVisual | null {
    const state = sim.tileStates.get(tileId)
    const level = tileLevel.get(tileId)
    if (!state || !level) return null
    return {
      r:                 level.color.r,
      g:                 level.color.g,
      b:                 level.color.b,
      roughness:         level.roughness ?? 0.85,
      metalness:         level.metalness ?? 0.0,
      emissive:          level.emissive,
      emissiveIntensity: level.emissiveIntensity ?? 0,
      // Star-only path — stars carry no liquid surface so no tile is ever submerged.
      submerged:         false,
    }
  }

  /** Writes an RGB value to every vertex of a tile in the merged color buffer. */
  function writeTileColor(tileId: number, rgb: { r: number; g: number; b: number }): void {
    const range = tileVertexRange.get(tileId)
    if (!range) return
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    for (let i = range.start; i < range.start + range.count; i++) {
      colorAttr.setXYZ(i, rgb.r, rgb.g, rgb.b)
    }
    colorAttr.needsUpdate = true
  }

  function dispose() {
    hexMesh.geometry.dispose()
    ;(hexMesh.material as THREE.Material).dispose()
  }

  /**
   * Advances the per-vertex shader animation clock.
   * Must be called every frame with elapsed seconds since start.
   */
  function tick(elapsed: number): void {
    timeUniform.value = elapsed
  }

  return {
    group,
    faceToTileId,
    surfaceOffset: cfg.surfaceOffset,
    setFill,
    tileGeometry,
    writeTileColor,
    tileBaseVisual,
    tick,
    dispose,
  }
}
