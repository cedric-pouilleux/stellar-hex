/**
 * Playground-side catalogue of surface-liquid substances.
 *
 * The lib is chemistry-agnostic — `BodyConfig` carries only `liquidState`
 * (presence) and `liquidColor` (opaque tint). This module owns the
 * substance→colour mapping the lib used to hold, so the playground UI can
 * still offer a "water / ammonia / methane / nitrogen" dropdown and resolve
 * the matching canonical colour before handing the config over to `useBody`.
 */

/** Known surface-liquid identifiers. Extendable without touching the lib. */
export type SurfaceLiquidType = 'water' | 'ammonia' | 'methane' | 'nitrogen'

export const SURFACE_LIQUID_TYPES: readonly SurfaceLiquidType[] =
  ['water', 'ammonia', 'methane', 'nitrogen']

/**
 * Canonical sea-colour per substance (hex string). Temperature-independent by
 * design — the lib does not tint oceans based on climate, and neither do we.
 * Frozen sheets always read as `FROZEN_COLOR` regardless of the underlying
 * liquid.
 */
export const SURFACE_LIQUID_COLORS: Record<SurfaceLiquidType, string> = {
  water:    '#2878d0',  // Earth-ocean blue
  ammonia:  '#7a9840',  // yellow-green olive
  methane:  '#7a5828',  // Titan warm amber
  nitrogen: '#c8b0b8',  // Pluto-like dusty rose
}

/** Colour applied to any frozen surface sheet regardless of substance. */
export const FROZEN_LIQUID_COLOR = '#90b0c0'

/** Fallback colour when no substance is selected but a sea-level still paints. */
export const DRY_SEA_COLOR = '#686058'

/**
 * Resolves the canonical sea colour for a given liquid identity + state.
 * Returns `undefined` when the body is dry (no colour needed); callers forward
 * the result straight to `BodyConfig.liquidColor`.
 */
export function liquidColorFromType(
  type:  SurfaceLiquidType | undefined,
  state: 'liquid' | 'frozen' | 'none',
): string | undefined {
  if (state === 'none') return undefined
  if (state === 'frozen') return FROZEN_LIQUID_COLOR
  return type !== undefined ? SURFACE_LIQUID_COLORS[type] : undefined
}

/**
 * Guards an arbitrary string input (e.g. from a `<select>`) against the
 * known-substance list. Returns `undefined` for unknown or empty values.
 */
export function normaliseLiquidType(raw: string | undefined): SurfaceLiquidType | undefined {
  return raw && (SURFACE_LIQUID_TYPES as readonly string[]).includes(raw)
    ? (raw as SurfaceLiquidType)
    : undefined
}
