/**
 * Pure-data resource catalogue — types, specs, and the unified
 * {@link DEMO_RESOURCES} list. Extracted from `resourceDemo.ts` so
 * `resourceMix.ts` can read the phase mapping without pulling in the
 * distribution pipeline (which already depends on `resourceMix`); the
 * previous arrangement created a circular import that left
 * `DEMO_PHASE_BY_ID` evaluating against an undefined `DEMO_RESOURCES`
 * binding under some module-load orders.
 *
 * No Vue / THREE / lib runtime dependencies — only plain types and
 * configuration data, so the file is trivially testable and free of any
 * reactive plumbing.
 */
import type { BiomeType } from './biomes'
import type { DistributionPattern } from './distributionPatterns'
import { VOLATILES, type VolatileId } from './volatileCatalog'
import { DEFAULT_GAS_PATTERN } from './gasPatterns'

/**
 * Broad phase classification — drives the routing of each resource onto a
 * specific render layer:
 *   - `metallic` / `mineral` → sol layer (hex caps of the solid surface)
 *   - `gas`                  → atmo layer (atmosphere prism caps)
 *
 * The phase is intrinsic to the resource (a chemical fact); body type does
 * not change it. A gaseous body simply ends up with no sol resources because
 * its mineral/metallic pattern eligibility is empty (no biomes), and a rocky
 * body ends up with no atmo resources (gases aren't yet distributed on
 * non-gaseous bodies — refinement reserved for a future iteration).
 */
export type ResourcePhase = 'metallic' | 'mineral' | 'gas'

/** Render layer a resource lands on, derived from its phase. */
export type ResourceLayer = 'sol' | 'atmo'

/** Maps a phase to its render layer. */
export function resourceLayer(phase: ResourcePhase): ResourceLayer {
  return phase === 'gas' ? 'atmo' : 'sol'
}

/**
 * Unified resource specification consumed by the distribution + paint pipeline
 * AND the playground UI. Every resource carries:
 *
 *   - identity (`id`, `label`, `color`)
 *   - phase    → routes to sol or atmo via {@link resourceLayer}
 *   - pattern  → user-tweakable via the resource controls
 *   - optional `eligibleBiomes` filter (sol only — gases ignore biomes)
 *   - PBR knobs (roughness, metalness, emissive) for the paint registry
 */
export interface ResourceSpec {
  id:              string
  label:           string
  color:           number
  phase:           ResourcePhase
  pattern:         DistributionPattern
  eligibleBiomes?: BiomeType[]
  roughness?:      number
  metalness?:      number
  emissive?:       number
}

/**
 * Sol catalogue — metals + minerals. Patterns + biome eligibility match the
 * legacy `ROCKY_DISTRIBUTION_SPECS` table that used to live in `runRockyDistribution`.
 *
 * Eligible biomes include their frozen-world equivalents so resources keep
 * landing on cold planets too — mountain ⇄ ice_peak (high band, any
 * temperature regime) and plains ⇄ ice_sheet (submerged tiles when frozen,
 * exposed when the ice cap is mined out). Without these mirrors, a planet
 * with `temperatureMax ≤ 0` reports only `plains`/`ice_peak`/`ice_sheet`
 * from `classifyBiome` and every metal would have zero eligible tiles.
 */
export const SOL_RESOURCES: ResourceSpec[] = [
  {
    id: 'iron', label: 'Iron', color: 0x7c6b5c, phase: 'metallic',
    pattern:        { kind: 'cluster', seeds: 3, sigmaFrac: 0.35, peak: 0.9 },
    eligibleBiomes: ['mountain', 'volcanic', 'ice_peak'],
    roughness: 0.55, metalness: 0.85,
  },
  {
    id: 'copper', label: 'Copper', color: 0xb87333, phase: 'metallic',
    pattern:        { kind: 'cluster', seeds: 2, sigmaFrac: 0.25, peak: 0.8 },
    eligibleBiomes: ['mountain', 'ice_peak'],
    roughness: 0.45, metalness: 0.90,
  },
  {
    id: 'gold', label: 'Gold', color: 0xe6c36a, phase: 'metallic',
    pattern:        { kind: 'cluster', seeds: 2, sigmaFrac: 0.18, peak: 0.7 },
    eligibleBiomes: ['mountain', 'ice_peak'],
    roughness: 0.30, metalness: 0.95, emissive: 0.15,
  },
  {
    id: 'silicon', label: 'Silicon', color: 0x8993a0, phase: 'mineral',
    pattern:        { kind: 'cluster', seeds: 3, sigmaFrac: 0.30, peak: 0.7 },
    eligibleBiomes: ['plains', 'forest', 'desert', 'ice_sheet'],
    roughness: 0.80, metalness: 0.10,
  },
  {
    id: 'sulfur', label: 'Sulfur', color: 0xd8c040, phase: 'mineral',
    pattern:        { kind: 'cluster', seeds: 2, sigmaFrac: 0.25, peak: 0.9 },
    eligibleBiomes: ['volcanic', 'ice_sheet'],
    roughness: 0.85, metalness: 0.00,
  },
]

/**
 * Gas catalogue — derived from the volatile reference. Each entry pulls its
 * label + colour from {@link VOLATILES} so the UI surfaces molecular formulae
 * (e.g. "Water (H₂O)") and the lib paint registry uses the gas-phase tint.
 */
export const GAS_RESOURCES: ResourceSpec[] = (Object.keys(VOLATILES) as VolatileId[]).map(id => ({
  id,
  label:     VOLATILES[id].label,
  color:     VOLATILES[id].gasColor,
  phase:     'gas',
  pattern:   DEFAULT_GAS_PATTERN[id],
  roughness: 0.85,
  metalness: 0.00,
}))

/** Unified catalogue iterated by the distribution + paint + UI pipelines. */
export const DEMO_RESOURCES: ResourceSpec[] = [...SOL_RESOURCES, ...GAS_RESOURCES]

/** Lookup table — resource id → spec. */
export const RESOURCE_BY_ID: ReadonlyMap<string, ResourceSpec> = new Map(
  DEMO_RESOURCES.map(r => [r.id, r]),
)
