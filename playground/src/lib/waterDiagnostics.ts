/**
 * Tiny helpers that resolve the dominant surface liquid for a rocky body
 * into a human-readable label + accent colour. Used by the water panel to
 * show *what* the ocean shader is actually rendering (water, ammonia ice,
 * liquid methane, frozen nitrogen, …).
 *
 * Pure module — no Vue dependency so the logic stays trivially testable.
 */

import type { BodyConfig, SurfaceLiquidType } from '@lib'
import {
  canHaveSurfaceWaterBody,
  getSurfaceLiquidType,
  hasLiquidSurface,
} from '@lib'

/** Snapshot of the water state visible to the shader panel. */
export interface WaterState {
  /** Dominant surface liquid — `undefined` for dry / non-rocky worlds. */
  liquidType:     SurfaceLiquidType | undefined
  /** True when the surface liquid is in a liquid (not frozen) state. */
  hasLiquid:      boolean
  /** True when the body can host any surface liquid body (liquid or frozen). */
  hasSurfaceBody: boolean
}

/** Resolve the water state from a body config — purely derived, deterministic. */
export function resolveWaterState(config: BodyConfig): WaterState {
  return {
    liquidType:     getSurfaceLiquidType(config),
    hasLiquid:      hasLiquidSurface(config),
    hasSurfaceBody: canHaveSurfaceWaterBody(config),
  }
}

/** Human-readable label describing the surface liquid — or a frozen/dry fallback. */
export function liquidLabel(state: WaterState): string {
  if (!state.liquidType) return state.hasSurfaceBody ? 'Frozen surface' : 'Dry'
  const name: Record<SurfaceLiquidType, string> = {
    water:    'Water (H₂O)',
    ammonia:  'Ammonia (NH₃)',
    methane:  'Methane (CH₄)',
    nitrogen: 'Nitrogen (N₂)',
  }
  return `${name[state.liquidType]}${state.hasLiquid ? '' : ' — frozen'}`
}

/** Accent colour matching each liquid kind — used for the badge dot. */
export function liquidAccent(state: WaterState): string {
  if (!state.liquidType) return '#5a6370'
  if (!state.hasLiquid)  return '#8db4d8'
  switch (state.liquidType) {
    case 'water':    return '#4aa6d1'
    case 'ammonia':  return '#b3a4d6'
    case 'methane':  return '#d4a24a'
    case 'nitrogen': return '#9fd4c0'
  }
}
