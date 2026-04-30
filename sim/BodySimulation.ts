import { createNoise3D } from 'simplex-noise'
import type { Tile } from '../geometry/hexasphere.types'
import type { BodyConfig } from '../types/body.types'
import type { TileState } from './TileState'
import { seededPrng } from '../internal/prng'
import { continentMask3D, continentSeedFromName } from '../internal/continents'
import {
  resolveCoreRadiusRatio,
  resolveTerrainLevelCount,
  resolveAtmosphereThickness,
  hasSurfaceLiquid,
} from '../physics/body'
import { clamp01 } from '../internal/math'

/**
 * Authoritative simulation state for a single celestial body.
 *
 * Pure data-layer result of {@link initBodySimulation} — captures per-tile
 * elevation (quantised into integer bands), sea level, liquid coverage and
 * the dominant surface liquid type. Independent from any render layer so
 * it can run in a headless environment. Resource distribution is an
 * entirely off-lib concern: consumers run their own strategy against the
 * returned sim and keep the result wherever fits their domain.
 */
export interface BodySimulation {
  readonly tiles:              readonly Tile[]
  readonly tileStates:         ReadonlyMap<number, TileState>
  readonly config:             BodyConfig
  /**
   * Atmosphere board tiles — independent hexasphere from the sol board, with
   * its own subdivision count (derived from the atmosphere outer radius
   * rather than the sol surface radius). Empty array when the body carries
   * no atmosphere (`hasAtmosphere(config) === false`).
   *
   * Atmo tile ids are NOT comparable to sol tile ids: a sol tile `42` has
   * no relation to an atmo tile `42` — they live on separate hexaspheres.
   * Resource distribution on the atmo board is an off-lib concern; the lib
   * exposes the tiles, consumers paint them through the atmo board mesh.
   */
  readonly atmoTiles:          readonly Tile[]
  /**
   * Returns the integer elevation band `[0, N-1]` at any world-space point on
   * the planet. Uses the same seeded simplex + quantisation as tile
   * elevations, so a point placed on a tile center resolves to that tile's
   * band. Safe for smooth-sphere vertex colouring which then looks up the
   * palette by band index.
   */
  readonly elevationAt:        (x: number, y: number, z: number) => number
  /**
   * Simplex-space threshold where the sea waterline sits, for shaders that
   * reuse the raw simplex noise (smooth-sphere ocean mask). Use
   * {@link seaLevelElevation} everywhere else — the band-space value is the
   * canonical one for tile logic.
   *
   * Equals `-1` on dry bodies (no ocean), so `> -1` works as the "has water"
   * test like before.
   */
  readonly seaLevelNoise:      number
  /**
   * Inverse of the band-quantisation: maps a (possibly fractional) band
   * value to the corresponding simplex-noise threshold. Used at runtime to
   * push a moving sea level into the ocean-mask shader uniform.
   *
   * Returns `-1` on dry bodies (no quantisation table available).
   */
  readonly bandToNoiseThreshold: (band: number) => number
  /** Fraction of tiles below sea level (0..1). 0 for stars / gaseous / dry worlds. */
  readonly liquidCoverage:     number
  /**
   * Sea waterline expressed in band space `[0, N-1]` (can be fractional —
   * the waterline may sit between two bands). `-1` on dry bodies. Callers
   * mutating this at runtime (UI sliders, external mutators) drive submerged
   * reclassification via `elevation < seaLevelElevation`.
   */
  readonly seaLevelElevation:  number
  /**
   * `true` when the body carries a surface liquid (rocky with
   * `liquidState !== 'none'`). Dry worlds, gaseous, metallic and stars all
   * report `false`. Substance identity is caller-owned and not surfaced
   * here — consumers that need a label look up their own catalogue keyed
   * on the original config they passed in.
   */
  readonly hasLiquidSurface:   boolean
}

/**
 * Deterministically derives a {@link BodySimulation} from a seed/config
 * and a pre-generated tile mesh.
 *
 * Three-step pipeline:
 *   1. Sample seeded simplex noise for every tile.
 *   2. Rank tiles into `N` equal-frequency bands (elevation 0..N-1), where
 *      `N` is derived from `(radius, coreRadiusRatio)` via
 *      `resolveTerrainLevelCount` (render layer).
 *   3. Resolve liquid coverage → a band-space sea waterline + assemble
 *      the immutable `TileState` map.
 *
 * @param tiles   - Hexasphere tiles produced by `generateHexasphere`.
 * @param config  - Full body physics/visual configuration.
 */
export function initBodySimulation(
  tiles:     Tile[],
  config:    BodyConfig,
  atmoTiles: readonly Tile[] = [],
): BodySimulation {
  const noiseScale       = config.noiseScale       ?? 1.4
  const noiseOctaves     = Math.max(1, Math.floor(config.noiseOctaves ?? 1))
  const noisePersistence = Math.max(0, config.noisePersistence ?? 0.5)
  const noiseLacunarity  = Math.max(1e-4, config.noiseLacunarity  ?? 2.0)
  const noisePower       = Math.max(1e-4, config.noisePower       ?? 1.0)
  const noiseRidge       = Math.max(0, Math.min(1, config.noiseRidge ?? 0))
  const reliefFlatness   = Math.max(0, Math.min(1, config.reliefFlatness ?? 0))
  // Macro continent layer — adds a low-frequency voronoi mask on top of the
  // simplex sample. `continentAmount = 0` short-circuits the cost.
  const continentAmount  = Math.max(0, Math.min(1, config.continentAmount ?? 0))
  const continentScale   = Math.max(1, Math.min(3, config.continentScale  ?? 1))
  const continentSeed    = continentSeedFromName(config.name)
  const noise3D          = createNoise3D(seededPrng(config.name))
  const bandCount        = resolveTerrainLevelCount(
    config.radius,
    resolveCoreRadiusRatio(config),
    resolveAtmosphereThickness(config),
  )

  /**
   * Fractional Brownian motion (fBm) sampler layered over 3D simplex noise.
   *
   * At each octave `k`, the noise is sampled at frequency `scale * lacunarity^k`
   * and weighted by `persistence^k`. A ridge-multifractal transform is
   * optionally mixed in (`1 - 2|n|` keeps the crests sharp), then a
   * sign-preserving power reshapes the distribution. The running sum is
   * normalised so the returned value stays roughly in `[-1, 1]` regardless of
   * the octave count, keeping the downstream equal-frequency quantisation
   * stable.
   */
  const sampleNoise = (nx: number, ny: number, nz: number): number => {
    let freq = noiseScale
    let amp  = 1
    let sum  = 0
    let norm = 0
    for (let o = 0; o < noiseOctaves; o++) {
      let n = noise3D(nx * freq, ny * freq, nz * freq)
      if (noiseRidge > 0) {
        const ridged = 1 - 2 * Math.abs(n)
        n = n * (1 - noiseRidge) + ridged * noiseRidge
      }
      sum  += n * amp
      norm += amp
      amp  *= noisePersistence
      freq *= noiseLacunarity
    }
    let value = sum / Math.max(1e-6, norm)
    if (noisePower !== 1) {
      const sign = value < 0 ? -1 : 1
      value = sign * Math.pow(Math.abs(value), noisePower)
    }
    return value
  }

  // Unit-sphere projection matches the smooth-sphere vertex lookup path in
  // `buildSmoothSphereMesh`, so tile-center queries and shader re-samples
  // land on identical values.
  //
  // The optional continent mask is added in unit-sphere space too (that's the
  // domain it was designed for), and the same calculation runs in
  // `liquidMask.glsl` so the GPU and CPU rank-quantise tiles identically on
  // the liquid boundary.
  const noiseAt = (x: number, y: number, z: number): number => {
    const len = Math.sqrt(x * x + y * y + z * z)
    const ux = x / len, uy = y / len, uz = z / len
    let value = sampleNoise(ux, uy, uz)
    if (continentAmount > 0) {
      value += continentMask3D({ x: ux, y: uy, z: uz }, continentScale, continentSeed) * continentAmount
    }
    return value
  }

  // ── Step 1: sample raw noise per tile ─────────────────────────────
  const rawNoise = new Map<number, number>()
  for (const tile of tiles) {
    const { x, y, z } = tile.centerPoint
    rawNoise.set(tile.id, noiseAt(x, y, z))
  }

  // ── Step 2: quantise into N equal-frequency bands ─────────────────
  // Each band contains the same number of tiles (±1) so the visible
  // distribution of "low/high" tiles is uniform regardless of the noise
  // field's raw statistics.
  const sortedNoise = Array.from(rawNoise.values()).sort((a, b) => a - b)
  const bandEdges   = new Float64Array(bandCount - 1) // N-1 interior boundaries
  for (let i = 0; i < bandCount - 1; i++) {
    const idx = Math.min(sortedNoise.length - 1, Math.floor(((i + 1) / bandCount) * sortedNoise.length))
    bandEdges[i] = sortedNoise[idx]
  }
  const noiseToBand = (n: number): number => {
    let lo = 0, hi = bandEdges.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (n < bandEdges[mid]) hi = mid
      else                    lo = mid + 1
    }
    return lo
  }

  /**
   * Post-quantisation relief contraction (see `BodyConfig.reliefFlatness`).
   *
   * Rank-based banding fills every band uniformly, which exposes the whole
   * staircase no matter how the noise is shaped. This biases the assigned
   * band towards the top so the visible surface flattens while `N` bands
   * remain available for extraction — digging reveals the full shell.
   *
   * At `reliefFlatness = 0` the map is identity (hot path — fall back to
   * the raw band). At `reliefFlatness = 1` every band collapses to `N - 1`.
   */
  const applyRelief = reliefFlatness > 0
    ? (band: number): number => Math.round((bandCount - 1) - (1 - reliefFlatness) * (bandCount - 1 - band))
    : (band: number): number => band

  const elevations = new Map<number, number>()
  for (const [tileId, n] of rawNoise) elevations.set(tileId, applyRelief(noiseToBand(n)))

  const elevationAt = (x: number, y: number, z: number): number => applyRelief(noiseToBand(noiseAt(x, y, z)))

  // ── Step 3: sea level (band + simplex space) ─────────────────────
  // Caller declares the presence of a liquid body via `liquidState !== 'none'`
  // and an initial waterline as a coverage fraction via `liquidCoverage`
  // (defaults to 0.5 = half-submerged). Runtime code (UI slider, external mutators)
  // drives the waterline via `setSeaLevel` in band space. `hasSurfaceLiquid`
  // encodes the "only rocky bodies can hold surface liquid" invariant —
  // gaseous / metallic configurations are ignored.
  const hasLiquidBody = hasSurfaceLiquid(config)

  const DEFAULT_LIQUID_COVERAGE = 0.5

  let liquidCoverage    = 0
  let seaLevelElevation = -1  // sentinel: no ocean
  let seaLevelNoise     = -1  // sentinel: no ocean

  // Re-usable band→simplex inversion. Shares the same percentile mapping as
  // the initial `seaLevelNoise` derivation below so a mid-band slider value
  // resolves to the same simplex threshold the init path computed.
  const bandToNoiseThreshold = (band: number): number => {
    if (!hasLiquidBody || sortedNoise.length === 0) return -1
    const clamped = Math.max(0, Math.min(bandCount, band))
    const idx     = Math.min(
      sortedNoise.length - 1,
      Math.floor((clamped / bandCount) * sortedNoise.length),
    )
    return sortedNoise[idx]
  }

  if (hasLiquidBody) {
    // Sea level in band space — fractional, can sit between bands. The target
    // coverage comes from `config.liquidCoverage` (default 0.5). Equal-
    // frequency band quantisation makes `seaLevel ≈ bandCount * coverage` a
    // good first approximation; the actual coverage is recomputed below by
    // counting submerged tiles. When `reliefFlatness > 0` the populated bands
    // are squeezed against `N - 1`, so we apply the same linear contraction
    // to the initial waterline — the default still lands at the requested
    // percentile of the *populated* range.
    // `liquidCoverage` lives on `PlanetConfig` only; `hasSurfaceLiquid`
    // already short-circuits star configs, so the read below is safe.
    const liquidCoverageInput  = config.type === 'planetary' ? config.liquidCoverage : undefined
    const targetCoverage = clamp01(liquidCoverageInput ?? DEFAULT_LIQUID_COVERAGE)
    const rawSea = Math.max(0, bandCount * targetCoverage - 0.5)
    seaLevelElevation = reliefFlatness > 0
      ? (bandCount - 1) - (1 - reliefFlatness) * (bandCount - 1 - rawSea)
      : rawSea

    // Fraction of tiles strictly below the waterline. Kept as an output for
    // resource distribution and downstream heuristics that need a coverage
    // estimate without reading elevations themselves.
    let submerged = 0
    for (const e of elevations.values()) if (e < seaLevelElevation) submerged++
    liquidCoverage = submerged / Math.max(1, elevations.size)

    // Simplex-space threshold — same percentile as the coverage output. Still
    // exposed for shaders that re-sample simplex noise on the smooth sphere
    // (ocean mask) and need the threshold in the noise domain.
    const idx = Math.min(Math.floor(liquidCoverage * sortedNoise.length), sortedNoise.length - 1)
    seaLevelNoise = sortedNoise[idx]
  }

  // ── Step 3 (continued): assemble TileStates ──────────────────────
  const tileStates = new Map<number, TileState>()
  for (const tile of tiles) {
    const elevation = elevations.get(tile.id)!
    tileStates.set(tile.id, {
      tileId: tile.id,
      elevation,
    })
  }

  return {
    tiles,
    tileStates,
    config,
    atmoTiles,
    elevationAt,
    seaLevelNoise,
    bandToNoiseThreshold,
    liquidCoverage,
    seaLevelElevation,
    hasLiquidSurface: hasLiquidBody,
  }
}
