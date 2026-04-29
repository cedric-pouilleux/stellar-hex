/**
 * Pure shell-dimension math for the sol interactive mesh.
 *
 * No Three.js allocation, no state — just geometry calculations derived
 * from `BodyConfig`. The radial partition `[core | sol | atmo]` stays
 * the conceptual model:
 *
 *   - core     : `[0, coreRadius]`              length `coreRadiusRatio × radius`
 *   - sol      : `[coreRadius, solOuterRadius]` length `(1 − coreRadiusRatio − atmosphereThickness) × radius`
 *   - atmo     : `[solOuterRadius, radius]`     length `atmosphereThickness × radius`
 *
 * The sol mesh built from these metrics covers the **sol band only**. The
 * atmosphere lives on its own dedicated board mesh ({@link buildAtmoBoardMesh})
 * — the radial atmo span surfaces here as `atmoFraction` for the board
 * mesh's caller (`assemblePlanetSceneGraph`) to size its prisms, but no
 * geometry produced from this module ever sits above `solOuterRadius`.
 */

import type { Tile } from '../../geometry/hexasphere.types'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { TerrainLevel } from '../../types/terrain.types'
import {
  resolveCoreRadiusRatio,
  resolveTerrainLevelCount,
  resolveAtmosphereThickness,
  terrainBandLayout,
} from '../../physics/body'
import { getTileLevel } from '../hex/hexMeshShared'

/**
 * Resolves the per-tile sol height for the unified shell. Pure look-up
 * into the palette — the band-indexed elevation model already stamps a
 * monotonically increasing height on every band, so the resolver only
 * has to clamp to `maxHeight`.
 */
export function resolveSolHeight(
  tile:      Tile,
  sim:       BodySimulation,
  levels:    TerrainLevel[],
  maxHeight: number,
): number {
  const state = sim.tileStates.get(tile.id)
  const level = state ? getTileLevel(state.elevation, levels) : levels[0]
  return Math.max(0, Math.min(maxHeight, level.height))
}

/**
 * Aggregate of every geometric dimension the sol mesh and the atmo board
 * builder need at build time. Everything here is a deterministic function
 * of `sim.config`.
 */
export interface LayeredShellMetrics {
  /** Visual silhouette radius (= `config.radius`). */
  solSurfaceRadius: number
  /** World radius of the opaque inner core sphere. */
  coreRadius:       number
  /** Outer radius of the sol band — where the sol caps top out. */
  solOuterRadius:   number
  /** Sol band thickness (`solOuterRadius - coreRadius`). */
  shellThickness:   number
  /** Ceiling for tile sol heights; equals {@link shellThickness}. */
  maxTerrainHeight: number
  /** Atmosphere band fraction of the radius (`atmosphereThickness ∈ [0, 1]`). */
  atmoFraction:     number
  /** Atmosphere band thickness in world units (`solSurfaceRadius - solOuterRadius`). */
  atmoHeadroom:     number
  /** Integer band count `N` for the staircase elevation model. */
  bandCount:        number
  /** Per-band world-unit step. */
  bandUnit:         number
  /**
   * Band-space → world-radius converter. Fractional bands (e.g. sea
   * level sliding between two integer bands) slide linearly along the
   * same axis, keeping the waterline in lockstep with the hex caps.
   */
  bandToRadius:     (band: number) => number
}

/**
 * Derives every shell + atmo + band dimension used by the sol mesh and
 * the atmo board from a simulation's config.
 *
 * The visible planet silhouette is exactly `config.radius` — the sol mesh
 * caps at `solOuterRadius`, the atmo board spans
 * `[solOuterRadius, config.radius]`, and a tile's elevation is clamped to
 * the sol band so peaks never poke into the atmo region.
 */
export function computeLayeredShellMetrics(sim: BodySimulation): LayeredShellMetrics {
  const solSurfaceRadius = sim.config.radius
  const atmoFraction     = resolveAtmosphereThickness(sim.config)
  const coreRatio        = resolveCoreRadiusRatio(sim.config)
  const coreRadius       = solSurfaceRadius * coreRatio
  const solOuterRadius   = solSurfaceRadius * (1 - atmoFraction)
  const shellThickness   = Math.max(0, solOuterRadius - coreRadius)
  const maxTerrainHeight = shellThickness
  const atmoHeadroom     = solSurfaceRadius - solOuterRadius

  const bandCount    = resolveTerrainLevelCount(sim.config.radius, coreRatio, atmoFraction)
  const bandLayout   = terrainBandLayout(sim.config.radius, coreRatio, bandCount, atmoFraction)
  const bandUnit     = bandLayout.unit
  const bandToRadius = (band: number): number => coreRadius + band * bandUnit

  return {
    solSurfaceRadius,
    coreRadius,
    solOuterRadius,
    shellThickness,
    maxTerrainHeight,
    atmoFraction,
    atmoHeadroom,
    bandCount,
    bandUnit,
    bandToRadius,
  }
}
