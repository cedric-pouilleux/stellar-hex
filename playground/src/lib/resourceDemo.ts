import * as THREE from 'three'
import type { BodyConfig, BodySimulation } from '@lib'
import { classifyBiome, type BiomeType } from './biomes'
import { registerResourceVisual } from './paint/resourceVisualRegistry'
import type { ResourceRules, TileResources } from './paint/tileResourceBlend'
import type { TileResourceDistribution, LayeredDistribution } from './paint/paintBody'
import { applyPattern, type DistributionPattern, type PatternTile } from './distributionPatterns'
import { VOLATILES, type VolatileId } from './volatileCatalog'
import { assignResourceMix, extractGasVolatiles, T_avgK } from './resourceMix'
import {
  assignGaseousTiles,
  patternForKind,
  type GasPatternKind,
} from './gasPatterns'
// Catalogue (data + types) lives in its own module to avoid a circular
// import — `resourceMix` reads `DEMO_RESOURCES` for its phase classifier
// and previously had to bounce through this file. Re-exported below so the
// rest of the playground keeps importing from `resourceDemo` unchanged.
import {
  DEMO_RESOURCES,
  RESOURCE_BY_ID,
  resourceLayer,
  type ResourcePhase,
  type ResourceLayer,
  type ResourceSpec,
} from './resourceCatalog'

export {
  DEMO_RESOURCES,
  resourceLayer,
  type ResourcePhase,
  type ResourceLayer,
  type ResourceSpec,
}

/** Minimal tile shape used for cluster seeding — avoids a deep relative import. */
type SeedTile = PatternTile

/**
 * Input shape for the internal distribution core. Forwarded by the public
 * {@link generateDemoDistribution} entry — the playground passes a snapshot
 * of its reactive overrides so distribution stays a pure function.
 */
interface DistributeInput {
  tiles:             readonly SeedTile[]
  elevations:        ReadonlyMap<number, number>
  config:            BodyConfig
  /**
   * Caller-side thermal metadata. The lib's `BodyConfig` no longer
   * carries temperature fields — the playground keeps them as a
   * separate input here so the gas-mix derivations stay pure.
   */
  temperatureMin:    number
  temperatureMax:    number
  seaLevelElevation: number
  /**
   * Per-resource pattern-kind overrides — applies to every resource the user
   * has tweaked in the UI (sol or atmo). Unset entries fall back to each
   * resource's catalogue default in {@link DEMO_RESOURCES}.
   */
  patternOverrides?: Partial<Record<string, GasPatternKind>>
  /**
   * Disabled resource IDs — entries here are skipped during distribution
   * even if their pattern would match. Lets the UI hide a resource entirely.
   */
  disabledResources?: ReadonlySet<string>
  /**
   * Per-resource weight in [0, 1]. Scales the pattern peak (sol) or the
   * gas-mix share (atmo) so the user can dial each resource's coverage
   * independently. Missing entries default to `1` (no scaling).
   */
  weights?: Partial<Record<string, number>>
}

/**
 * Resolves a resource's effective pattern — caller-supplied kind override
 * (with default params from {@link patternForKind}) wins, otherwise the
 * spec's own pattern is used verbatim. The optional weight scales the
 * pattern peak so the same UI control drives coverage on every kind.
 */
function effectivePattern(
  spec:      ResourceSpec,
  overrides: Partial<Record<string, GasPatternKind>> | undefined,
  weight:    number,
): DistributionPattern {
  const overrideKind = overrides?.[spec.id]
  const base = overrideKind === undefined ? spec.pattern : patternForKind(overrideKind)
  if (weight === 1) return base
  // `peak` lives on every pattern variant — scaling it uniformly is the
  // simplest mapping from a single 0..1 UI knob to a per-resource coverage
  // dial. Density-/intensity-driven kinds (cluster, scatter, …) all bottom
  // out below the threshold once the weight is small enough.
  return { ...base, peak: base.peak * weight } as DistributionPattern
}

/**
 * Sol path — for every enabled `metallic` / `mineral` resource, applies its
 * pattern with optional biome filter and accumulates the per-tile concentration.
 * Each tile may carry several sol resources (mineral overlap is realistic).
 */
function runSolDistribution(
  input:    DistributeInput,
  biomeMap: Map<number, BiomeType>,
): TileResourceDistribution {
  const { tiles, config } = input
  const seed = config.name
  const R    = config.radius
  const overrides = input.patternOverrides
  const disabled  = input.disabledResources
  // Bodies without a biome system (metallic, gaseous core) drop the per-resource
  // biome filter — otherwise iron's `eligibleBiomes: ['mountain', 'volcanic']`
  // would reject every tile and leave the sol bare. Rocky bodies keep the
  // filter so e.g. sulfur stays on volcanic biomes only.
  const skipBiomeFilter = biomeMap.size === 0

  const layerMaps = new Map<string, Map<number, number>>()
  for (const spec of DEMO_RESOURCES) {
    if (resourceLayer(spec.phase) !== 'sol') continue
    if (disabled?.has(spec.id)) continue
    const eligible = skipBiomeFilter
      ? undefined
      : (spec.eligibleBiomes ? new Set(spec.eligibleBiomes) : undefined)
    const weight = input.weights?.[spec.id] ?? 1
    if (weight <= 0) continue
    const m = applyPattern(effectivePattern(spec, overrides, weight), {
      tiles,
      biomeMap,
      eligible,
      hashKey:  seed + ':' + spec.id,
      radius:   R,
    })
    if (m && m.size > 0) layerMaps.set(spec.id, m)
  }

  const out = new Map<number, TileResources>()
  for (const tile of tiles) {
    const m = new Map<string, number>()
    for (const [id, map] of layerMaps) {
      const amount = map.get(tile.id)
      if (amount !== undefined) m.set(id, amount)
    }
    if (m.size) out.set(tile.id, m)
  }
  return out
}

/**
 * Atmo path — winner-takes-all exclusive assignment for gas-phase resources.
 * Runs on every body type: rocky / metallic bodies get their thin-atmosphere
 * gas mix (N₂, CO₂, H₂O vapour when temperature allows…) and gaseous bodies
 * get the full Jovian pattern. Stars skip — they have no atmosphere.
 *
 * Each tile is claimed by exactly one volatile so the atmosphere reads as
 * clean bands / blocks / spots. Returns empty when no volatile is in gas
 * phase at the body's temperature (e.g. ultra-cold worlds where everything
 * has frozen out).
 */
function runAtmoDistribution(input: DistributeInput): TileResourceDistribution {
  const { tiles, config } = input
  if (config.type === 'star') return new Map()

  const physics = {
    tempMin: input.temperatureMin,
    tempMax: input.temperatureMax,
    radius:  config.radius,
    mass:    config.mass ?? 1,
  }
  const mix = assignResourceMix(physics)
  let gasMix: Partial<Record<VolatileId, number>> = extractGasVolatiles(mix, T_avgK(physics))

  // Strip disabled gases from the mix BEFORE the winner-takes-all pass — a
  // user-disabled gas must not steal tiles from its neighbours. Weight = 0
  // is treated the same way: it removes the gas from the mix entirely.
  const disabled = input.disabledResources
  const weights  = input.weights
  if (disabled?.size || weights) {
    const filtered: Partial<Record<VolatileId, number>> = {}
    for (const [id, w] of Object.entries(gasMix)) {
      if (disabled?.has(id)) continue
      const scale = weights?.[id] ?? 1
      if (scale <= 0) continue
      filtered[id as VolatileId] = (w ?? 0) * scale
    }
    gasMix = filtered
  }
  if (Object.keys(gasMix).length === 0) return new Map()

  const assignment = assignGaseousTiles({
    tiles,
    gasMix,
    overrides: input.patternOverrides as Partial<Record<VolatileId, GasPatternKind>> | undefined,
    hashKey:   config.name,
    radius:    config.radius,
    weights:   input.weights as Partial<Record<VolatileId, number>> | undefined,
  })

  const out = new Map<number, TileResources>()
  for (const [tileId, volatileId] of assignment) {
    out.set(tileId, new Map([[volatileId, 1.0]]))
  }
  return out
}

/**
 * Core distribution — produces a {@link LayeredDistribution} so each render
 * layer carries only resources that physically belong there. Gases never
 * land on the sol bucket, minerals never on the atmo bucket. The body's
 * biome map is computed once and shared with the sol path.
 */
function runDistribution(input: DistributeInput): LayeredDistribution {
  const { tiles, elevations, config, seaLevelElevation } = input
  const temperature = { min: input.temperatureMin, max: input.temperatureMax }

  // Classify biomes once — the sol path filters per-resource against this map;
  // the atmo path ignores it (atmospheres are biome-free).
  const biomeMap = new Map<number, BiomeType>()
  for (const tile of tiles) {
    const elev  = elevations.get(tile.id)!
    const biome = classifyBiome(elev, seaLevelElevation, config, temperature)
    if (biome !== undefined) biomeMap.set(tile.id, biome)
  }

  return {
    sol:  runSolDistribution(input, biomeMap),
    atmo: runAtmoDistribution(input),
  }
}

/** Optional knobs forwarded into {@link runDistribution} from caller code. */
export interface GenerateDemoDistributionOptions {
  /**
   * Caller-side thermal metadata used by the atmo gas-mix derivation.
   * Required because the lib's `BodyConfig` no longer carries
   * `temperatureMin/Max` (climate is caller-owned).
   */
  temperatureMin:    number
  temperatureMax:    number
  /**
   * Per-resource pattern-kind overrides — keyed by resource id (sol or atmo).
   * Values come from the playground's reactive resource UI state. Unset entries
   * fall back to each resource's catalogue default in {@link DEMO_RESOURCES}.
   */
  patternOverrides?: Partial<Record<string, GasPatternKind>>
  /**
   * Disabled resource IDs — entries here are skipped during distribution
   * even if their pattern would match. Lets the UI hide a resource entirely.
   */
  disabledResources?: ReadonlySet<string>
  /**
   * Per-resource weight in [0, 1]. Scales pattern peak (sol) or pattern peak
   * + gas mix share (atmo) so the user can dial coverage independently of
   * the pattern kind. Missing entries default to `1` (no scaling).
   */
  weights?: Partial<Record<string, number>>
}

/**
 * Standalone distribution entry — runs the catalogue-driven strategy against
 * a freshly-built {@link BodySimulation}. Returns a {@link LayeredDistribution}
 * so callers can paint sol and atmo tiles independently (see {@link paintBody}).
 */
export function generateDemoDistribution(
  sim:     BodySimulation,
  options: GenerateDemoDistributionOptions,
): LayeredDistribution {
  const elevations = new Map<number, number>()
  for (const [tileId, state] of sim.tileStates) elevations.set(tileId, state.elevation)
  return runDistribution({
    tiles:              sim.tiles,
    elevations,
    config:             sim.config,
    temperatureMin:     options.temperatureMin,
    temperatureMax:     options.temperatureMax,
    seaLevelElevation:  sim.seaLevelElevation,
    patternOverrides:   options.patternOverrides,
    disabledResources:  options.disabledResources,
    weights:            options.weights,
  })
}

/**
 * Sums every resource's per-tile amount across both layers of a layered
 * distribution. Atmo deposits carry a flat `1.0` per tile (winner-takes-all)
 * so the totals collapse to "tile counts" for gases; sol deposits carry the
 * gaussian intensity computed by the pattern, so totals reflect coverage
 * weighted by intensity. Both are useful at the UI: a higher number means
 * "more of this resource on the planet right now".
 */
export function sumDistributionTotals(dist: LayeredDistribution): Map<string, number> {
  const totals = new Map<string, number>()
  for (const layer of [dist.sol, dist.atmo]) {
    for (const tile of layer.values()) {
      for (const [id, amount] of tile) {
        totals.set(id, (totals.get(id) ?? 0) + amount)
      }
    }
  }
  return totals
}

/**
 * Catalog rules consumed by the playground's `applyResourceBlend`. Pure
 * callbacks — no THREE types, no lib types, no module-level state.
 */
export function getDemoResourceRules(): ResourceRules {
  return {
    isMetallic:      (id) => RESOURCE_BY_ID.get(id)?.phase === 'metallic',
    // Surface-liquid status is no longer a resource flag — the planet's
    // liquid layer is driven by `BodyConfig.liquidState` + the volatile
    // catalogue (`playground/src/lib/volatileCatalog.ts`). No demo resource
    // ever lands as a surface liquid, so this rule is always false.
    isSurfaceLiquid: () => false,
  }
}

/**
 * UI-facing resource lookups — kept separate from `ResourceRules` because
 * the hover popover needs labels + colors while the blend only needs the
 * boolean classifiers.
 */
export interface DemoResourceDisplay {
  getCompatibleResourceColors(opts: {
    bodyType:         'rocky' | 'gaseous' | 'metallic' | 'star'
    solidSurfaceOnly?: boolean
  }): Array<{ id: string; color: number }>
  getResourceDisplay(id: string): { label: string; color: number } | undefined
}

export function getDemoResourceDisplay(): DemoResourceDisplay {
  return {
    getCompatibleResourceColors({ bodyType, solidSurfaceOnly }) {
      // Stars never surface resources — return early to avoid leaking the
      // unified catalogue into star-specific UI paths.
      if (bodyType === 'star') return []
      // `solidSurfaceOnly` used to filter out `liquid: true` entries; no
      // demo resource carries that flag anymore (surface liquids are driven
      // by the volatile catalogue). The `gas` phase is the natural proxy
      // when a caller asks for surface-solid resources.
      return DEMO_RESOURCES
        .filter(r => !solidSurfaceOnly || r.phase !== 'gas')
        .map(r => ({ id: r.id, color: r.color }))
    },
    getResourceDisplay(id) {
      const r = RESOURCE_BY_ID.get(id)
      if (r) return { label: r.label, color: r.color }
      // Volatile fallback — gaseous-body tiles carry volatile ids (h2o, ch4,
      // …) that aren't in `DEMO_RESOURCES`. Surface their gas-phase tint and
      // catalogue label so the hover popover stays informative.
      const vol = VOLATILES[id as VolatileId]
      if (vol) return { label: vol.label, color: vol.gasColor }
      return undefined
    },
  }
}

/**
 * Registers the demo's resource visuals (colour, roughness, metalness,
 * emissive) into the playground paint registry. Safe to call many times —
 * the registry is idempotent.
 */
export function registerDemoVisuals(): void {
  for (const r of DEMO_RESOURCES) {
    registerResourceVisual(r.id, {
      color:             new THREE.Color(r.color),
      roughness:         r.roughness ?? 0.6,
      metalness:         r.metalness ?? 0.0,
      colorBlend:        0.9,
      emissive:          r.emissive ? new THREE.Color(r.color) : undefined,
      emissiveIntensity: r.emissive ?? 0,
    })
  }
  // Volatiles use their gas-phase tint and a smooth, low-metalness material
  // so a gas-giant tile reads as soft cloud cover rather than glossy mineral.
  // `colorBlend` is pushed high (0.98) because gaseous distribution is
  // winner-takes-all — each tile carries one gas at full concentration, and
  // the user wants clean solid blocks. A lower blend would let the base band
  // palette bleed through and dilute the per-gas colour.
  for (const id of Object.keys(VOLATILES) as VolatileId[]) {
    const vol = VOLATILES[id]
    registerResourceVisual(id, {
      color:      new THREE.Color(vol.gasColor),
      roughness:  0.85,
      metalness:  0.0,
      colorBlend: 0.98,
    })
  }
}

/**
 * One-shot playground bootstrap — registers the demo resource visuals so
 * the paint pipeline finds them on first build. Idempotent.
 */
let visualsRegistered = false
export function bootstrapDemoCatalog(): void {
  if (visualsRegistered) return
  registerDemoVisuals()
  visualsRegistered = true
}
