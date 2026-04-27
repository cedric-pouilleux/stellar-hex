/**
 * Pure shell-dimension math for the layered interactive mesh.
 *
 * No Three.js allocation, no state — just geometry calculations derived
 * from `BodyConfig`. Extracted so the main factory
 * ({@link buildLayeredInteractiveMesh}) reads as pure orchestration, and
 * the math stays unit-testable without mounting a full body.
 *
 * The radial partition is **strict**: the silhouette stays at exactly
 * `config.radius`, and the shell `[0, radius]` is divided as:
 *
 *   - core      : `[0, coreRadius]`            length `coreRadiusRatio × radius`
 *   - sol       : `[coreRadius, solOuterRadius]` length `(1 − coreRadiusRatio − atmosphereThickness) × radius`
 *   - atmosphere: `[solOuterRadius, radius]`   length `atmosphereThickness × radius`
 *
 * Tile elevation is clamped to the sol band so peaks stop at
 * `solOuterRadius`; the atmo shell stays unobstructed regardless of relief
 * height.
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
 * Resolves the per-tile sol height inside the unified shell.
 *
 * With the band-indexed elevation model, the palette already encodes
 * `height = elevation * unit` — strictly positive, monotonically
 * increasing. The height is clamped only to `maxHeight` so callers decide
 * whether hex tops may sit above the nominal surface (experimental mode
 * lets them poke through) or should stay inside a fixed envelope.
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
 * Aggregate of every geometric dimension the layered mesh needs at build
 * time. Everything here is a deterministic function of `sim.config` — no
 * mutable state.
 */
export interface LayeredShellMetrics {
  /** Visual surface radius (= `config.radius`) — the body's silhouette. */
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
  /** Atmosphere band thickness in world units (`radius - solOuterRadius`). */
  atmoHeadroom:     number
  /** Outer radius of the atmo band — equal to `solSurfaceRadius`. */
  atmoOuterRadius:  number
  /** Total shell thickness (`atmoOuterRadius - coreRadius`). */
  totalThickness:   number
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
 * Derives every shell + atmo + band dimension used by the layered mesh
 * from a simulation's config.
 *
 * STRICT SILHOUETTE INVARIANCE:
 *   atmoOuterRadius = solSurfaceRadius = config.radius
 *
 * The visible planet size is exactly `config.radius` — never inflated by
 * the atmosphere thickness. Switching between hex and shader views keeps
 * the silhouette identical.
 */
export function computeLayeredShellMetrics(sim: BodySimulation): LayeredShellMetrics {
  const solSurfaceRadius = sim.config.radius
  // Body-type cap is enforced here — a rocky planet config carrying a
  // gas-giant `atmosphereThickness` value still rounds down to the rocky
  // cap, so the sol band stays at the dominantly-rocky proportion the
  // game design demands.
  const atmoFraction     = resolveAtmosphereThickness(sim.config)
  const coreRatio        = resolveCoreRadiusRatio(sim.config)
  const coreRadius       = solSurfaceRadius * coreRatio
  const solOuterRadius   = solSurfaceRadius * (1 - atmoFraction)
  const shellThickness   = Math.max(0, solOuterRadius - coreRadius)
  const maxTerrainHeight = shellThickness
  const atmoHeadroom     = solSurfaceRadius - solOuterRadius
  const atmoOuterRadius  = solSurfaceRadius
  const totalThickness   = atmoOuterRadius - coreRadius

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
    atmoOuterRadius,
    totalThickness,
    bandCount,
    bandUnit,
    bandToRadius,
  }
}
