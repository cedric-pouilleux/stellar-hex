/**
 * Tiny helpers that read the caller-owned surface-liquid fields from
 * `BodyConfig` (`liquidType`, `liquidState`) and turn them into a
 * human-readable label + accent colour. No temperature derivation — the
 * fields are now edited manually through `LiquidControls`.
 *
 * Pure module — no Vue dependency so the logic stays trivially testable.
 */

import type { BodyConfig } from '@lib'

/** Playground-known surface liquid identifiers. The lib treats `liquidType`
 *  as an opaque string — consumers are free to extend this union. */
export type SurfaceLiquidType = 'water' | 'ammonia' | 'methane' | 'nitrogen'

/** Snapshot of the liquid state visible to the shader panel. */
export interface LiquidState {
  /** Dominant surface liquid — `undefined` when the caller did not pick one. */
  liquidType:     SurfaceLiquidType | undefined
  /** True when the surface liquid is in a liquid (not frozen) state. */
  hasLiquid:      boolean
  /** True when the body hosts any surface liquid body (liquid or frozen). */
  hasSurfaceBody: boolean
}

const KNOWN_LIQUIDS: readonly SurfaceLiquidType[] = ['water', 'ammonia', 'methane', 'nitrogen']

function normaliseLiquidType(raw: string | undefined): SurfaceLiquidType | undefined {
  return raw && (KNOWN_LIQUIDS as readonly string[]).includes(raw)
    ? (raw as SurfaceLiquidType)
    : undefined
}

/** Resolve the liquid state straight from the caller-owned config fields. */
export function resolveLiquidState(config: BodyConfig): LiquidState {
  if (config.type !== 'rocky' || !config.liquidState || config.liquidState === 'none') {
    return { liquidType: undefined, hasLiquid: false, hasSurfaceBody: false }
  }
  return {
    liquidType:     normaliseLiquidType(config.liquidType),
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
