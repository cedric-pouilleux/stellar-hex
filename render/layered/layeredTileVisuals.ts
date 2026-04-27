/**
 * Tile visual computation pipeline for the layered interactive mesh.
 *
 * Resolves a tile's `(colour, roughness, metalness, emissive)` from the
 * palette band — used at build, on `setSeaLevel` repaint, and on resource
 * mutations.
 */

import type * as THREE from 'three'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { TerrainLevel } from '../../types/terrain.types'
import { getTileLevel } from '../hex/hexMeshShared'
import { hasSurfaceLiquid } from '../../physics/body'

/**
 * Palette-only tile visual snapshot. Resource-aware tinting lives off-lib —
 * this struct carries just what the lib needs to render: palette colour
 * (folded with emissive) + base PBR + the emissive reference for consumers
 * that want to re-fold it.
 */
export interface TileVisual {
  r:         number
  g:         number
  b:         number
  rough:     number
  metal:     number
  emissive:  THREE.Color | undefined
  emissiveI: number
}

/** Folds emissive into the base channel, clamped to [0, 1]. */
function foldEmissive(base: number, emissive: number | undefined, intensity: number): number {
  return Math.min(1, base + (emissive ?? 0) * intensity)
}

/** Closure that resolves a tile's visual from its current state. */
export type ComputeTileVisual = (tileId: number) => TileVisual

/** Aggregate returned by {@link buildLayeredTileVisuals}. */
export interface LayeredTileVisuals {
  /** Per-tile cached `TerrainLevel` — primed by callers, read by paint paths. */
  tileLevel:  Map<number, TerrainLevel>
  /** Per-tile cached {@link TileVisual}. */
  tileVisual: Map<number, TileVisual>
  /** Whether this body carries a declared liquid surface (any state). */
  hasLiquidSurface: boolean
  /** Whether the declared liquid is in the liquid state (vs frozen). */
  surfaceIsLiquid:  boolean
  computeTileVisual: ComputeTileVisual
}

/**
 * Builds the tile-visual pipeline for a layered mesh. Submerged tiles keep
 * their palette colour — the translucent liquid sphere alone provides the
 * underwater tint, since pre-tinting the cap stacked two blue layers and
 * produced a hard hue jump as tiles flipped across the waterline.
 */
export function buildLayeredTileVisuals(
  sim:    BodySimulation,
  levels: TerrainLevel[],
): LayeredTileVisuals {
  const hasLiquidSurface = hasSurfaceLiquid(sim.config)
  const surfaceIsLiquid  = hasLiquidSurface && sim.config.liquidState === 'liquid'

  const tileLevel  = new Map<number, TerrainLevel>()
  const tileVisual = new Map<number, TileVisual>()

  const computeTileVisual: ComputeTileVisual = (tileId) => {
    const state     = sim.tileStates.get(tileId)!
    const level     = tileLevel.get(tileId) ?? getTileLevel(state.elevation, levels)
    const emissive  = level.emissive
    const emissiveI = level.emissiveIntensity ?? 0
    return {
      r:         foldEmissive(level.color.r, emissive?.r, emissiveI),
      g:         foldEmissive(level.color.g, emissive?.g, emissiveI),
      b:         foldEmissive(level.color.b, emissive?.b, emissiveI),
      rough:     level.roughness ?? 0.85,
      metal:     level.metalness ?? 0.0,
      emissive,
      emissiveI,
    }
  }

  return {
    tileLevel,
    tileVisual,
    hasLiquidSurface,
    surfaceIsLiquid,
    computeTileVisual,
  }
}
