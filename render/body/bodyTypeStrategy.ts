/**
 * Per-body-type policy table.
 *
 * Centralises every decision the lib makes "based on the body's type"
 * (rocky / gaseous / metallic / star) so adding a new type — `'icy'`,
 * `'anomaly'`, … — collapses to a one-table edit instead of hunting
 * `if (config.type === '…')` cascades across `useBody`, `layeredMaterials`,
 * `buildBodyEffectLayer`, `buildInteractiveMesh`, `ringVariation` and
 * `configToLibParams`.
 *
 * Each strategy is a flat data record + two builders (palette + shader
 * params). Callers go through {@link strategyFor} and never branch on
 * `config.type` again. The dispatcher fork between planets and stars
 * inside `useBody` stays as-is — stars use a structurally different
 * mesh pipeline (`useStar`), which is a different concern from the
 * per-type decisions consolidated here.
 */

import type { BodyConfig } from '../../types/body.types'
import type { BodyType } from '../../types/surface.types'
import type { BodyVariation } from './bodyVariation'
import type { TerrainLevel } from '../../types/terrain.types'
import type { ParamMap } from '../../shaders/BodyMaterial'
import { generateTerrainPalette, buildMetallicPalette, buildGasPalette } from '../../terrain/terrainPalette'
import { buildStarPalette } from '../../terrain/starPalette'
import { subdividePalette } from '../../terrain/paletteSubdivide'
import { terrainBandLayout, SPECTRAL_KELVIN, resolveAtmosphereThickness } from '../../physics/body'
import { getDefaultParams } from '../../shaders'
import {
  rockyShaderParams,
  gasShaderParams,
  metallicShaderParams,
  starShaderParams,
} from './configToLibParams'
import { STAR_TILE_REF } from './useStar'

/**
 * Per-type variation ranges consumed by `generateBodyVariation`. Encodes
 * the rocky-vs-metallic differences in crack/lava distributions so the
 * generator stays agnostic of the body type.
 */
export interface VariationRanges {
  /** `[min, max]` linear range for the crack width multiplier. */
  crackWidth: readonly [number, number]
  /** `[min, max]` linear range for the crack scale multiplier. */
  crackScale: readonly [number, number]
  /** `[min, max]` linear range for the lava scale multiplier. */
  lavaScale:  readonly [number, number]
  /**
   * Returns the crack blend mode index (matches `crackBlend` slider in
   * `BODY_PARAMS`). Driven by a per-type rule rather than a uniform range
   * because metallic bodies bias toward a binary Mix / Soft-Light pick.
   */
  pickCrackBlend(rng: () => number): number
}

/**
 * Data + builders for a single {@link BodyType}.
 *
 * Fields are deliberately flat data when possible — `flatSurface`,
 * `atmoLayerMode`, `metallicSheen` are read-only constants the consumer
 * lifts straight off the strategy, no function call. The two builders
 * (`buildPalette`, `buildShaderParams`) wrap the per-type logic that's
 * too large for a flat record.
 */
export interface BodyTypeStrategy {
  /** Human-readable name — used for logs / panels, not for dispatch. */
  readonly displayName: string
  /**
   * `true` when the smooth-sphere display should be flat (no vertex
   * displacement) — currently only stars, whose granulation is a shader
   * effect rather than terrain relief.
   */
  readonly flatSurface: boolean
  /**
   * `true` when the smooth display sphere plays the role of the
   * atmosphere itself (gas-giant case) instead of being an inert sol
   * backdrop. Drives four downstream behaviours:
   *   - the smooth sphere stretches to `config.radius` (atmospheric silhouette)
   *   - it stays visible as a backdrop dome in the playable surface view
   *   - its `Side` flips to `BackSide` in surface view (inner curvature read)
   *   - default vertex paint is skipped (caller paints atmo-flavoured colours)
   */
  readonly displayMeshIsAtmosphere: boolean
  /** Per-type variation ranges consumed by `generateBodyVariation`. */
  readonly variationRanges: VariationRanges
  /**
   * Default atmosphere opacity for the `'shader'` view, in `[0, 1]`. The
   * config can override via `BodyConfig.atmosphereOpacity`. Gas giants land
   * at `1` (opaque envelope, smooth sphere can be skipped); rocky bodies
   * use a translucent halo (~`0.45`); metallic and stars default to `0`
   * (no atmo halo on shader view).
   */
  readonly defaultAtmosphereOpacity: number
  /** Whether this body type can ever carry a decorative ring system. */
  readonly canHaveRings: boolean
  /**
   * Metallic sheen coefficient passed to the legacy hex shader. `1.0` for
   * metallic bodies, `0.0` otherwise. Lifted into the strategy so the
   * shader override receives a single numeric input.
   */
  readonly metallicSheen: number
  /**
   * Returns the tile-reference radius used to derive the hexasphere
   * subdivision count. Stars use {@link STAR_TILE_REF} keyed by spectral
   * class (so tile counts stay stable across O/B/A/F/G/K/M); planets
   * use their own visual radius.
   */
  tileRefRadius(config: BodyConfig): number
  /**
   * Builds the terrain palette at the given band count. Each strategy
   * is responsible for densification + re-mapping to the integer band
   * model used downstream — the function returns the final palette
   * (length === count, threshold `i+1` per band, `Infinity` on the
   * last band, height = `i × layout.unit` or `0` when `flatSurface`).
   */
  buildPalette(config: BodyConfig, count: number, coreRadiusRatio: number): TerrainLevel[]
  /**
   * Builds the shader uniform map for this body's procedural material.
   * Combines the type's default param block with caller-supplied
   * physics + variation. Receives the deterministic seed so each
   * strategy can stamp it on its own field naming.
   */
  buildShaderParams(config: BodyConfig, seed: number, variation?: BodyVariation): ParamMap
}

// ── Shared palette helper ─────────────────────────────────────────────

/**
 * Densifies a generator-built palette to the target band count, then
 * re-maps every entry into the integer band model: threshold `i + 1`
 * (or `Infinity` on the last band) and height `i × layout.unit`. When
 * `flatSurface` is `true`, every height collapses to `0` — used by stars
 * whose granulation is a shader effect rather than terrain relief.
 *
 * `atmosphereThickness` shrinks the staircase to fit inside the sol band:
 * the tallest height tops out at `solOuterRadius`, never inside the atmo
 * shell.
 */
function remapToIntegerBands(
  base:                TerrainLevel[],
  count:               number,
  coreRadiusRatio:     number,
  radius:              number,
  flatSurface:         boolean,
  atmosphereThickness: number,
): TerrainLevel[] {
  const densified = count > base.length ? subdividePalette(base, count) : base
  const N         = densified.length
  const layout    = terrainBandLayout(radius, coreRadiusRatio, N, atmosphereThickness)
  return densified.map((l, i) => ({
    ...l,
    threshold: i === N - 1 ? Infinity : i + 1,
    height:    flatSurface ? 0 : i * layout.unit,
  }))
}

// ── Per-type policy records ───────────────────────────────────────────

/**
 * Lookup-by-spectral-class fallback. Stars without an explicit spectral
 * type fall back to `'G'` (Sun-like), matching the legacy default.
 */
const STAR_TILE_REF_FALLBACK = STAR_TILE_REF.G ?? 3.0

const ROCKY_STRATEGY: BodyTypeStrategy = {
  displayName:             'rocky',
  flatSurface:             false,
  displayMeshIsAtmosphere: false,
  canHaveRings:            true,
  metallicSheen:           0.0,
  defaultAtmosphereOpacity: 0.45,
  variationRanges: {
    crackWidth:     [0.10, 0.50],
    crackScale:     [1.00, 4.00],
    lavaScale:      [0.30, 2.50],
    pickCrackBlend: (rng) => Math.floor(rng() * 5),
  },
  tileRefRadius: (config) => config.radius,
  buildPalette:  (config, count, coreRatio) => generateTerrainPalette(
    count,
    config.radius,
    coreRatio,
    config.terrainColorLow,
    config.terrainColorHigh,
    resolveAtmosphereThickness(config),
  ),
  buildShaderParams: (config, seed, variation) => ({
    ...getDefaultParams('rocky'),
    ...rockyShaderParams(config, variation),
    seed,
  }),
}

const GASEOUS_STRATEGY: BodyTypeStrategy = {
  displayName:             'gaseous',
  flatSurface:             false,
  displayMeshIsAtmosphere: true,
  canHaveRings:            true,
  metallicSheen:           0.0,
  defaultAtmosphereOpacity: 1.0,
  // Gas bodies don't carry sol-side cracks/lava — values exposed for shape
  // consistency only, never read by `generateBodyVariation` on this type.
  variationRanges: {
    crackWidth:     [0.10, 0.50],
    crackScale:     [1.00, 4.00],
    lavaScale:      [0.30, 2.50],
    pickCrackBlend: (rng) => Math.floor(rng() * 5),
  },
  tileRefRadius: (config) => config.radius,
  buildPalette:  (config, count, coreRatio) => remapToIntegerBands(
    buildGasPalette(config.bandColors),
    count,
    coreRatio,
    config.radius,
    /* flatSurface */ false,
    resolveAtmosphereThickness(config),
  ),
  buildShaderParams: (config, seed, variation) => ({
    ...getDefaultParams('gaseous'),
    ...gasShaderParams(config, variation),
    // Gas variation drives the noise field — overridden here so the
    // shader picks up the deterministic seed regardless of which preset
    // the gas params used internally.
    noiseSeed: variation?.noiseSeed ?? [0, 0, 0],
    noiseFreq: variation?.noiseFreq ?? 1.0,
    seed,
  }),
}

const METALLIC_STRATEGY: BodyTypeStrategy = {
  displayName:             'metallic',
  flatSurface:             false,
  displayMeshIsAtmosphere: false,
  canHaveRings:            true,
  metallicSheen:           1.0,
  defaultAtmosphereOpacity: 0.0,
  variationRanges: {
    crackWidth:     [0.10, 0.40],
    crackScale:     [1.60, 5.00],
    lavaScale:      [0.30, 1.00],
    // Metallic prefers a binary Mix (0) / Soft-Light (4) pick — sharper
    // crack reads on reflective surfaces.
    pickCrackBlend: (rng) => rng() > 0.5 ? 4 : 0,
  },
  tileRefRadius: (config) => config.radius,
  buildPalette:  (config, count, coreRatio) => remapToIntegerBands(
    buildMetallicPalette(config.metallicBands),
    count,
    coreRatio,
    config.radius,
    /* flatSurface */ false,
    resolveAtmosphereThickness(config),
  ),
  buildShaderParams: (config, seed, variation) => ({
    ...getDefaultParams('metallic'),
    ...metallicShaderParams(config, variation),
    seed,
  }),
}

const STAR_STRATEGY: BodyTypeStrategy = {
  displayName:             'star',
  flatSurface:             true,
  displayMeshIsAtmosphere: false,
  canHaveRings:            false,
  metallicSheen:           0.0,
  // Stars use a dedicated mesh pipeline (`useStar`) and never mount an
  // atmo halo — opacity 0 keeps the strategy table self-consistent.
  defaultAtmosphereOpacity: 0.0,
  // Stars use a dedicated mesh pipeline; sol-side variation ranges are
  // exposed for shape consistency but never read on this type.
  variationRanges: {
    crackWidth:     [0.10, 0.50],
    crackScale:     [1.00, 4.00],
    lavaScale:      [0.30, 2.50],
    pickCrackBlend: (rng) => Math.floor(rng() * 5),
  },
  tileRefRadius: (config) => STAR_TILE_REF[config.spectralType ?? 'G'] ?? STAR_TILE_REF_FALLBACK,
  buildPalette:  (config, count, coreRatio) => remapToIntegerBands(
    buildStarPalette(config.spectralType ?? 'G'),
    count,
    coreRatio,
    config.radius,
    /* flatSurface */ true,
    resolveAtmosphereThickness(config),
  ),
  buildShaderParams: (config, seed) => {
    const temperature = config.spectralType ? (SPECTRAL_KELVIN[config.spectralType] ?? 5778) : 5778
    return {
      ...getDefaultParams('star'),
      ...starShaderParams(config),
      seed,
      temperature,
    }
  },
}

/**
 * Strategy table indexed by {@link BodyType}. Add a new type =
 * append one entry here and add the discriminant to the union in
 * `types/surface.types.ts`. Every dispatch in the lib resolves through
 * this record.
 */
export const BODY_TYPE_STRATEGIES: Readonly<Record<BodyType, BodyTypeStrategy>> = {
  rocky:    ROCKY_STRATEGY,
  gaseous:  GASEOUS_STRATEGY,
  metallic: METALLIC_STRATEGY,
  star:     STAR_STRATEGY,
}

/**
 * Resolves the strategy for a body type. Throws on an unknown type so
 * forgetting an entry in {@link BODY_TYPE_STRATEGIES} fails loudly during
 * development instead of silently mis-rendering.
 */
export function strategyFor(type: BodyType): BodyTypeStrategy {
  const s = BODY_TYPE_STRATEGIES[type]
  if (!s) throw new Error(`No body-type strategy registered for "${type}"`)
  return s
}
