/**
 * Per-volatile distribution patterns for gaseous bodies.
 *
 * Each gas-phase volatile is laid out on the body's tiles via a
 * {@link DistributionPattern}. The defaults below mirror what the molecule
 * actually looks like in real atmospheres (H₂He → broad bands like Jupiter,
 * CH₄ → polar vortex like Neptune's storm, …).
 *
 * Callers can override a resource's pattern *kind* via `resourcePatternOverrides`
 * in the playground state — the full parameter set is then resolved here so
 * the UI only has to carry a discriminator string.
 */

import {
  applyPattern,
  hash01,
  type DistributionPattern,
  type PatternTile,
} from './distributionPatterns'
import type { VolatileId } from './volatileCatalog'

/** Discriminator strings the UI exposes — one per pattern variant. */
export type GasPatternKind = DistributionPattern['kind']

/** Stable display order for the UI dropdown. */
export const GAS_PATTERN_KINDS: readonly GasPatternKind[] =
  ['cluster', 'band', 'vortex', 'scatter', 'gradient']

/** Short human label per kind — used in the BodyControls picker. */
export const GAS_PATTERN_LABEL: Record<GasPatternKind, string> = {
  cluster:  'Cluster (storm spots)',
  band:     'Band (latitudinal stripes)',
  vortex:   'Vortex (polar spiral)',
  scatter:  'Scatter (uniform haze)',
  gradient: 'Gradient (pole / equator)',
}

/**
 * Compact labels (one word) — used in the ResourceControls per-row pattern
 * dropdown where horizontal space is tight. The full {@link GAS_PATTERN_LABEL}
 * remains available as the option's `title` tooltip.
 */
export const GAS_PATTERN_SHORT_LABEL: Record<GasPatternKind, string> = {
  cluster:  'Cluster',
  band:     'Band',
  vortex:   'Vortex',
  scatter:  'Scatter',
  gradient: 'Gradient',
}

/**
 * Default pattern per volatile — handcrafted so each gas reads as a familiar
 * planetary archetype out of the box. The user can override any of these via
 * the playground UI without touching the params (only the kind switches).
 */
export const DEFAULT_GAS_PATTERN: Record<VolatileId, DistributionPattern> = {
  // Jupiter-style bands — broad, evenly spaced, polar axis.
  h2he: { kind: 'band', count: 5, width: 0.18, peak: 1.0 },
  // Neptune's polar vortex / Great Dark Spot.
  ch4:  { kind: 'vortex', center: 'pole', spiralTightness: 3, arms: 1, peak: 1.0 },
  // Saturn's pale ammonia haze — soft, ubiquitous.
  nh3:  { kind: 'scatter', density: 0.7, peak: 1.0 },
  // Polar nitrogen frosts (Pluto-like).
  n2:   { kind: 'gradient', axis: 'pole', falloff: 2, peak: 1.0 },
  // CO₂ frost belts — equatorial bias on dry warm bodies.
  co2:  { kind: 'gradient', axis: 'equator', falloff: 1.5, peak: 1.0 },
  // Water-vapour storm clusters — compact, intense pockets.
  h2o:  { kind: 'cluster', seeds: 4, sigmaFrac: 0.22, peak: 1.0 },
}

/**
 * Default parameter set used when the caller switches a volatile's kind via
 * the UI. The pattern's substantive params (band count, vortex tightness…)
 * come from these so the user only has to choose the *flavour* — no need to
 * juggle five sliders to swap a vortex for bands.
 */
const KIND_DEFAULTS: { [K in GasPatternKind]: Extract<DistributionPattern, { kind: K }> } = {
  cluster:  { kind: 'cluster',  seeds: 4, sigmaFrac: 0.22, peak: 1.0 },
  band:     { kind: 'band',     count: 5, width: 0.18,    peak: 1.0 },
  vortex:   { kind: 'vortex',   center: 'pole', spiralTightness: 3, arms: 1, peak: 1.0 },
  scatter:  { kind: 'scatter',  density: 0.7,   peak: 1.0 },
  gradient: { kind: 'gradient', axis: 'pole', falloff: 2, peak: 1.0 },
}

/**
 * Resolves the effective pattern for a gas id — falls through in this order:
 *   1. Caller-supplied override (kind only) → uses {@link KIND_DEFAULTS} for the rest.
 *   2. Per-volatile default in {@link DEFAULT_GAS_PATTERN}.
 *   3. {@link KIND_DEFAULTS.scatter} fallback when the id is unknown
 *      (custom user-added atmo resource that has no entry in the volatile
 *      catalogue). Lets the gas distribution accept arbitrary ids without
 *      throwing.
 */
export function resolveGasPattern(
  id:        string,
  overrides: Partial<Record<string, GasPatternKind>> = {},
): DistributionPattern {
  const overrideKind = overrides[id]
  if (overrideKind !== undefined) return KIND_DEFAULTS[overrideKind]
  return DEFAULT_GAS_PATTERN[id as VolatileId] ?? KIND_DEFAULTS.scatter
}

/**
 * Returns the canonical default pattern for a given kind. Used by callers
 * that hold a generic resource id (sol or atmo) with a `kind` override and
 * just need a fully-populated {@link DistributionPattern} to feed the
 * dispatcher. Same parameter set the per-volatile resolver uses.
 */
export function patternForKind(kind: GasPatternKind): DistributionPattern {
  return KIND_DEFAULTS[kind]
}

// ── Winner-takes-all gas → tile assignment ───────────────────────

/** Input for {@link assignGaseousTiles}. */
export interface AssignGaseousTilesInput {
  tiles:     readonly PatternTile[]
  /**
   * Normalised gas mix — values are shares of the total, summing to ≤ 1.
   * Keys are gas resource ids; catalogued volatiles use {@link VolatileId}
   * literals, custom user-added atmo resources use their generated id.
   */
  gasMix:    Partial<Record<string, number>>
  /** Per-gas pattern-kind override (UI-driven). */
  overrides?: Partial<Record<string, GasPatternKind>>
  /** Seed key — typically the body name; mixed with gas ids for per-gas randomness. */
  hashKey:   string
  /** Body radius, forwarded to the pattern evaluator. */
  radius:    number
  /**
   * Per-gas weight in [0, 1] applied to the pattern peak, so a small weight
   * makes the gas lose pattern competition against its neighbours. Missing
   * entries default to `1` (no scaling).
   */
  weights?:  Partial<Record<string, number>>
  /**
   * Minimum pattern intensity required for a tile to "belong" to a gas.
   * Tiles below this floor fall back to a share-weighted stochastic pick so
   * the atmosphere stays visually continuous. Default `0.12`.
   */
  minWinnerIntensity?: number
}

/**
 * Winner-takes-all tile → volatile assignment. Every tile ends up claimed by
 * exactly one gas — no per-tile mixing, so the result reads as clean bands /
 * blocks / spots defined by each volatile's pattern.
 *
 *   - Tiles where one pattern peaks above `minWinnerIntensity` → assigned to
 *     that pattern's volatile.
 *   - Tiles below that floor (the background where no pattern stands out) →
 *     stochastic pick weighted by each volatile's share of the mix. Produces
 *     organic cloud-like texture in the areas between structured regions.
 *
 * Deterministic: same `(hashKey, radius, tiles, gasMix, overrides)` always
 * yields the same map. Suitable for direct consumption by the resource
 * distribution pipeline.
 */
export function assignGaseousTiles(input: AssignGaseousTilesInput): Map<number, string> {
  const out: Map<number, string> = new Map()

  // Filter to gases with a non-zero share — anything else cannot win tiles
  // and would only pollute the fallback distribution.
  const gasIds = Object.keys(input.gasMix)
    .filter(id => (input.gasMix[id] ?? 0) > 0)
  if (gasIds.length === 0) return out

  const overrides    = input.overrides ?? {}
  const minIntensity = input.minWinnerIntensity ?? 0.12

  // Evaluate each gas pattern ONCE, with threshold forced to 0 so every
  // tile receives an intensity sample. The original threshold would otherwise
  // gate-out low-intensity tiles, leaving "holes" that break winner-takes-all.
  const layers = new Map<string, Map<number, number>>()
  for (const id of gasIds) {
    const base    = resolveGasPattern(id, overrides)
    const weight  = input.weights?.[id] ?? 1
    const pattern = { ...base, threshold: 0, peak: base.peak * weight } as DistributionPattern
    const layer   = applyPattern(pattern, {
      tiles:    input.tiles,
      biomeMap: new Map(),           // gas giants have no biomes → no filter
      hashKey:  input.hashKey + ':' + id,
      radius:   input.radius,
    })
    if (layer) layers.set(id, layer)
  }

  // Cumulative-share table used by the stochastic fallback. Stable iteration
  // order (same gasIds array) keeps the fallback deterministic.
  const shareTotal = gasIds.reduce((s, id) => s + (input.gasMix[id] ?? 0), 0) || 1

  for (const tile of input.tiles) {
    let winner: string | undefined
    let bestIntensity = 0

    for (const [id, layer] of layers) {
      const intensity = layer.get(tile.id) ?? 0
      if (intensity > bestIntensity) {
        bestIntensity = intensity
        winner        = id
      }
    }

    if (winner !== undefined && bestIntensity >= minIntensity) {
      out.set(tile.id, winner)
      continue
    }

    // Share-weighted stochastic fallback — organic cloud fill where no
    // pattern owns the tile. The dominant gas gets most of these tiles,
    // trace gases get a proportional scattering.
    const h = hash01(input.hashKey + ':fallback', tile.id)
    let cum = 0
    let fallback: string = gasIds[0]
    for (const id of gasIds) {
      cum += (input.gasMix[id] ?? 0) / shareTotal
      if (h < cum) { fallback = id; break }
    }
    out.set(tile.id, fallback)
  }
  return out
}
