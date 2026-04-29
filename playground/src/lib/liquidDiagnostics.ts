/**
 * Tiny helpers that turn the playground-owned surface-liquid selection into
 * a human-readable label + accent colour for the shader panel. The lib no
 * longer carries any `liquidType` field — identity is stored alongside the
 * lib config in `playgroundState` and cross-referenced here against the
 * catalogue in `liquidCatalog.ts`.
 *
 * Pure module — no Vue dependency so the logic stays trivially testable.
 */

import type { BodyConfig, PlanetConfig } from '@lib'
import type { SurfaceLiquidType } from './liquidCatalog'

/** Re-export for UI files that previously pulled this type from here. */
export type { SurfaceLiquidType } from './liquidCatalog'

/** Snapshot of the liquid state visible to the shader panel. */
export interface LiquidState {
  /** Dominant surface liquid — `undefined` when the caller did not pick one. */
  liquidType:     SurfaceLiquidType | undefined
  /** True when the surface liquid is in a liquid (not frozen) state. */
  hasLiquid:      boolean
  /** True when the body hosts any surface liquid body (liquid or frozen). */
  hasSurfaceBody: boolean
}

/**
 * Resolve the liquid state from the lib config (`liquidState`) plus the
 * playground-owned substance selection. `liquidType` is now caller-owned
 * state — the lib does not know water from methane.
 *
 * Accepts the wide {@link BodyConfig} union and narrows internally — star
 * configs (which carry no `liquidState`) short-circuit to a dry profile.
 */
export function resolveLiquidState(
  config:     Pick<BodyConfig, 'type'> & Partial<Pick<PlanetConfig, 'liquidState'>>,
  liquidType: SurfaceLiquidType | undefined,
): LiquidState {
  if (config.type === 'star' || !config.liquidState || config.liquidState === 'none') {
    return { liquidType: undefined, hasLiquid: false, hasSurfaceBody: false }
  }
  return {
    liquidType,
    hasLiquid:      config.liquidState === 'liquid',
    hasSurfaceBody: true,
  }
}

/** Human-readable label describing the surface liquid — or a frozen/dry fallback. */
export function liquidLabel(state: LiquidState): string {
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
export function liquidAccent(state: LiquidState): string {
  if (!state.liquidType) return '#5a6370'
  if (!state.hasLiquid)  return '#8db4d8'
  switch (state.liquidType) {
    case 'water':    return '#4aa6d1'
    case 'ammonia':  return '#b3a4d6'
    case 'methane':  return '#d4a24a'
    case 'nitrogen': return '#9fd4c0'
  }
}
