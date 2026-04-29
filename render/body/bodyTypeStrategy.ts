/**
 * Strategy resolution for body rendering.
 *
 * Two top-level body kinds (`'planetary'` / `'star'`) share the same handle
 * shape but use structurally different mesh pipelines (`useStar` vs the
 * planetary scene assembler). Stars are a single strategy; planetary bodies
 * pick a {@link SurfaceLook} ('terrain' / 'bands' / 'metallic') that drives
 * palette generator + atmo defaults + shader family.
 *
 * Adding a new visual archetype on a planet = one entry in
 * {@link SURFACE_LOOK_STRATEGIES}. Adding a new top-level kind (`'blackhole'`
 * later) = a new pipeline branch in `useBody`.
 */

import type { BodyConfig, PlanetConfig, StarConfig } from '../../types/body.types'
import type { SurfaceLook } from '../../types/surface.types'
import type { BodyVariation } from './bodyVariation'
import type { TerrainLevel } from '../types/terrain.types'
import type { ParamMap } from '../../shaders/BodyMaterial'
import { generateTerrainPalette, buildMetallicPalette, buildGasPalette } from '../palettes/terrainPalette'
import { buildStarPalette } from '../palettes/starPalette'
import { subdividePalette } from '../palettes/paletteSubdivide'
import { terrainBandLayout, SPECTRAL_KELVIN, STAR_TILE_REF, resolveAtmosphereThickness } from '../../physics/body'
import { getDefaultParams, type LibBodyType } from '../../shaders'
import {
  rockyShaderParams,
  gasShaderParams,
  metallicShaderParams,
  starShaderParams,
} from './configToLibParams'

/**
 * Per-type variation ranges for the **sol-side** procedural effects
 * (cracks, lava, blend mode pick). Optional on {@link BodyTypeStrategy}:
 * only metallic bodies override the defaults — every other strategy
 * falls back to `DEFAULT_SOL_RANGES` defined in `bodyVariation.ts`.
 */
export interface SolVariationRanges {
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
   * Shader family used by the procedural material — selects which fragment
   * shader runs (`rocky.frag`, `gas.frag`, `metallic.frag`, `star.frag`).
   * Decoupled from the public {@link BodyType} so the shader catalogue can
   * keep its current names while the public taxonomy moves to
   * `'planetary' | 'star'` + {@link SurfaceLook}.
   */
  readonly shaderType: LibBodyType
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
  /**
   * Per-type sol-side variation ranges. Omitted by every strategy that
   * matches the lib's defaults — only metallic bodies override.
   */
  readonly solVariationRanges?: SolVariationRanges
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

// ── Branch narrowing helpers ─────────────────────────────────────────
//
// `BodyConfig` is a discriminated union — the strategy-table router
// (`strategyFor`) only ever calls the planetary strategies with a
// `PlanetConfig` and the star strategy with a `StarConfig`. These helpers
// let each strategy callback recover the narrower shape so it can read
// branch-specific fields (`metallicBands`, `spectralType`…) without a cast.

function asPlanet(config: BodyConfig): PlanetConfig {
  if (config.type !== 'planetary') throw new Error('Planet strategy received a non-planetary config')
  return config
}

function asStar(config: BodyConfig): StarConfig {
  if (config.type !== 'star') throw new Error('Star strategy received a non-star config')
  return config
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

const TERRAIN_STRATEGY: BodyTypeStrategy = {
  displayName:             'terrain',
  shaderType:              'rocky',
  flatSurface:             false,
  displayMeshIsAtmosphere: false,
  canHaveRings:            true,
  metallicSheen:           0.0,
  defaultAtmosphereOpacity: 0.45,
  tileRefRadius: (config) => config.radius,
  buildPalette:  (config, count, coreRatio) => {
    const c = asPlanet(config)
    return generateTerrainPalette(
      count,
      c.radius,
      coreRatio,
      c.terrainColorLow,
      c.terrainColorHigh,
      resolveAtmosphereThickness(c),
    )
  },
  buildShaderParams: (config, seed, variation) => ({
    ...getDefaultParams('rocky'),
    ...rockyShaderParams(asPlanet(config), variation),
    seed,
  }),
}

const BANDS_STRATEGY: BodyTypeStrategy = {
  displayName:             'bands',
  shaderType:              'gaseous',
  flatSurface:             false,
  displayMeshIsAtmosphere: true,
  canHaveRings:            true,
  metallicSheen:           0.0,
  defaultAtmosphereOpacity: 1.0,
  tileRefRadius: (config) => config.radius,
  buildPalette:  (config, count, coreRatio) => {
    const c = asPlanet(config)
    return remapToIntegerBands(
      buildGasPalette(c.bandColors),
      count,
      coreRatio,
      c.radius,
      /* flatSurface */ false,
      resolveAtmosphereThickness(c),
    )
  },
  buildShaderParams: (config, seed, variation) => ({
    ...getDefaultParams('gaseous'),
    ...gasShaderParams(asPlanet(config), variation),
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
  shaderType:              'metallic',
  flatSurface:             false,
  displayMeshIsAtmosphere: false,
  canHaveRings:            true,
  metallicSheen:           1.0,
  defaultAtmosphereOpacity: 0.0,
  solVariationRanges: {
    crackWidth:     [0.10, 0.40],
    crackScale:     [1.60, 5.00],
    lavaScale:      [0.30, 1.00],
    // Metallic prefers a binary Mix (0) / Soft-Light (4) pick — sharper
    // crack reads on reflective surfaces.
    pickCrackBlend: (rng) => rng() > 0.5 ? 4 : 0,
  },
  tileRefRadius: (config) => config.radius,
  buildPalette:  (config, count, coreRatio) => {
    const c = asPlanet(config)
    return remapToIntegerBands(
      buildMetallicPalette(c.metallicBands),
      count,
      coreRatio,
      c.radius,
      /* flatSurface */ false,
      resolveAtmosphereThickness(c),
    )
  },
  buildShaderParams: (config, seed, variation) => ({
    ...getDefaultParams('metallic'),
    ...metallicShaderParams(asPlanet(config), variation),
    seed,
  }),
}

const STAR_STRATEGY: BodyTypeStrategy = {
  displayName:             'star',
  shaderType:              'star',
  flatSurface:             true,
  displayMeshIsAtmosphere: false,
  canHaveRings:            false,
  metallicSheen:           0.0,
  // Stars use a dedicated mesh pipeline (`useStar`) and never mount an
  // atmo halo — opacity 0 keeps the strategy table self-consistent.
  defaultAtmosphereOpacity: 0.0,
  tileRefRadius: (config) => STAR_TILE_REF[asStar(config).spectralType] ?? STAR_TILE_REF_FALLBACK,
  buildPalette:  (config, count, coreRatio) => {
    const c = asStar(config)
    return remapToIntegerBands(
      buildStarPalette(c.spectralType),
      count,
      coreRatio,
      c.radius,
      /* flatSurface */ true,
      resolveAtmosphereThickness(c),
    )
  },
  buildShaderParams: (config, seed) => {
    const c = asStar(config)
    const temperature = SPECTRAL_KELVIN[c.spectralType] ?? 5778
    return {
      ...getDefaultParams('star'),
      ...starShaderParams(c),
      seed,
      temperature,
    }
  },
}

/**
 * Strategy table for planetary surface looks. Adding a new visual archetype
 * (`'crystalline'`, `'oceanic'`, …) collapses to one entry here plus a new
 * discriminant in {@link SurfaceLook}.
 */
export const SURFACE_LOOK_STRATEGIES: Readonly<Record<SurfaceLook, BodyTypeStrategy>> = {
  terrain:  TERRAIN_STRATEGY,
  bands:    BANDS_STRATEGY,
  metallic: METALLIC_STRATEGY,
}

/**
 * Resolves the strategy for a body. Stars use a fixed strategy (their
 * pipeline is structurally different — see {@link useStar}); planetary
 * bodies pick a {@link SurfaceLook}, defaulting to `'terrain'` when the
 * config omits it.
 */
export function strategyFor(config: BodyConfig): BodyTypeStrategy {
  if (config.type === 'star') return STAR_STRATEGY
  const look = config.surfaceLook ?? 'terrain'
  const s = SURFACE_LOOK_STRATEGIES[look]
  if (!s) throw new Error(`No surface-look strategy registered for "${look}"`)
  return s
}
