import { createNoise3D } from 'simplex-noise'
import type { Tile } from '../geometry/hexasphere.types'
import type { BodyConfig } from '../types/body.types'
import type { TileState, TileResources } from './TileState'
import type { BiomeType } from '../types/surface.types'
import { classifyBiome } from '../biomes/BiomeClassifier'
import { seededPrng } from '../core/prng'
import { getResourceDistributor, type ResourceDistributor } from './resourceDistributionRegistry'

export type { ResourceDistributor }

/**
 * Authoritative simulation state for a single celestial body.
 *
 * Pure data-layer result of {@link initBodySimulation} — captures per-tile
 * elevation/biome, sea level, liquid coverage, dominant surface liquid
 * and initial resource distribution. Independent from any render layer
 * so it can run in a headless environment.
 */
export interface BodySimulation {
  readonly tiles:              readonly Tile[]
  readonly tileStates:         ReadonlyMap<number, TileState>
  /**
   * Initial resource concentrations per tile (tileId → resource → 0..1).
   * Separated from TileState so the body domain stays free of game resource types.
   */
  readonly resourceMap:        ReadonlyMap<number, TileResources>
  readonly config:             BodyConfig
  /**
   * Returns the raw elevation (-1..1) at any world-space point on the planet.
   * Uses the same seeded noise + scale as the tile elevations — safe for
   * smooth-sphere vertex coloring without knowing internal implementation details.
   */
  readonly elevationAt:        (x: number, y: number, z: number) => number
  /** Fraction of tiles below sea level (0..1). 0 for stars / gaseous / dry worlds. */
  readonly liquidCoverage:     number
  /** Noise elevation value at the water-line — the Nth percentile of all tile elevations. */
  readonly seaLevelElevation:  number
  /**
   * Biome assigned to each rocky / star tile (tileId → BiomeType).
   * Not present for gaseous and metallic tiles.
   */
  readonly biomeMap:           ReadonlyMap<number, BiomeType>
  /**
   * Dominant surface liquid type for the planet (caller-chosen opaque tag).
   * Undefined for dry worlds, gaseous, metallic, and stars.
   */
  readonly surfaceLiquid:      string | undefined
}

/**
 * Deterministically derives a {@link BodySimulation} from a seed/config
 * and a pre-generated tile mesh.
 *
 * Five-step pipeline:
 *   1. Compute per-tile seeded simplex elevation.
 *   2. Resolve water coverage + sea level (rocky bodies only).
 *   3. Classify biomes.
 *   4. Delegate resource distribution (opt-in registry).
 *   5. Assemble immutable `TileState` map.
 *
 * @param tiles      - Hexasphere tiles produced by `generateHexasphere`.
 * @param config     - Full body physics/visual configuration.
 * @param distribute - Optional override for the registered resource distributor.
 */
export function initBodySimulation(
  tiles:       Tile[],
  config:      BodyConfig,
  distribute?: ResourceDistributor,
): BodySimulation {
  const noiseScale  = config.noiseScale ?? 1.4
  const noise3D     = createNoise3D(seededPrng(config.name))
  const elevationAt = (x: number, y: number, z: number): number => {
    const len = Math.sqrt(x * x + y * y + z * z)
    return noise3D(x / len * noiseScale, y / len * noiseScale, z / len * noiseScale)
  }

  // ── Step 1: compute elevation per tile ───────────────────────
  const elevations = new Map<number, number>()
  for (const tile of tiles) {
    const { x, y, z } = tile.centerPoint
    elevations.set(tile.id, elevationAt(x, y, z))
  }

  // ── Step 2: liquid coverage + sea level ──────────────────────
  // Caller owns `liquidType` / `liquidState` / `liquidCoverage`. The lib no
  // longer infers a substance or coverage default from temperature — we just
  // honour what's in the config. A rocky body with no declared liquid is dry.
  const surfaceLiquid = config.type === 'rocky' ? config.liquidType : undefined
  const hasLiquidBody = config.type === 'rocky'
    && surfaceLiquid !== undefined
    && (config.liquidState ?? 'none') !== 'none'
  let liquidCoverage    = 0
  let seaLevelElevation = -1

  if (hasLiquidBody) {
    liquidCoverage = Math.max(0, Math.min(1, config.liquidCoverage ?? 0))

    const sorted = Array.from(elevations.values()).sort((a, b) => a - b)
    const idx    = Math.min(Math.floor(liquidCoverage * sorted.length), sorted.length - 1)
    seaLevelElevation = sorted[idx]
  }

  // ── Step 3: classify biomes (rocky + star only) ──────────────
  const biomeMap = new Map<number, BiomeType>()
  for (const tile of tiles) {
    const elev  = elevations.get(tile.id)!
    const biome = classifyBiome(elev, seaLevelElevation, config)
    if (biome !== undefined) biomeMap.set(tile.id, biome)
  }

  // ── Step 4: distribute resources (delegated via the registered distributor) ─
  // Body never imports the concrete implementation — the resources feature
  // registers it at app startup. When no distributor is installed, resourceMap
  // stays empty and body still works (geometry, terrain, biomes are independent).
  const fn = distribute ?? getResourceDistributor()
  const resourceMap: ReadonlyMap<number, TileResources> = fn
    ? fn({ tiles, biomeMap, config, liquidCoverage, surfaceLiquid })
    : new Map()

  // ── Step 5: assemble TileStates ──────────────────────────────
  const tileStates = new Map<number, TileState>()
  for (const tile of tiles) {
    const elevation = elevations.get(tile.id)!
    const biome     = biomeMap.get(tile.id)  // undefined for metallic / gaseous
    tileStates.set(tile.id, {
      tileId: tile.id,
      elevation,
      biome,
    })
  }

  return {
    tiles,
    tileStates,
    resourceMap,
    config,
    elevationAt,
    liquidCoverage,
    seaLevelElevation,
    biomeMap,
    surfaceLiquid,
  }
}
