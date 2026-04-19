import { createNoise3D } from 'simplex-noise'
import type { Tile } from '../geometry/hexasphere.types'
import type { BodyConfig } from '../types/body.types'
import type { TileState, TileResources } from './TileState'
import type { BiomeType, SurfaceLiquidType } from '../types/surface.types'
import { classifyBiome } from '../biomes/BiomeClassifier'
import { canHaveSurfaceWaterBody, getSurfaceLiquidType } from '../physics/bodyWater'
import { seededPrng } from '../core/prng'
import { WATER_COVERAGE_RANGE } from '../config/defaults'
import { getResourceDistributor, type ResourceDistributor } from './resourceDistributionRegistry'

export type { ResourceDistributor }

export interface BodySimulation {
  readonly tiles:              readonly Tile[]
  readonly tileStates:         ReadonlyMap<number, TileState>
  /**
   * Initial resource concentrations per tile (tileId → resource → 0..1).
   * Separated from TileState so the body domain stays free of game resource types.
   * This is the source of truth for depletion initialisation and resource overlays.
   */
  readonly resourceMap:        ReadonlyMap<number, TileResources>
  readonly config:             BodyConfig
  /**
   * Returns the raw elevation (-1..1) at any world-space point on the planet.
   * Uses the same seeded noise + scale as the tile elevations — safe for
   * smooth-sphere vertex coloring without knowing internal implementation details.
   */
  readonly elevationAt:        (x: number, y: number, z: number) => number
  /** Fraction of tiles below sea level (0..1). 0 for stars / gaseous. */
  readonly waterCoverage:      number
  /** Noise elevation value at the water-line — the Nth percentile of all tile elevations. */
  readonly seaLevelElevation:  number
  /**
   * Biome assigned to each rocky / star tile (tileId → BiomeType).
   * Not present for gaseous and metallic tiles.
   */
  readonly biomeMap:           ReadonlyMap<number, BiomeType>
  /**
   * Dominant surface liquid type for the planet (water, ammonia, methane, nitrogen).
   * Undefined for dry worlds, gaseous, metallic, and stars.
   */
  readonly surfaceLiquid:      SurfaceLiquidType | undefined
}

/**
 * Deterministic default water coverage for a rocky body, derived from the
 * planet name and the dominant surface liquid type. The coverage range
 * differs per liquid — water oceans span a wide fraction, while exotic
 * cryogenic liquids (ammonia, methane, nitrogen) stay confined to small
 * lakes to match real cold-world references such as Titan.
 *
 * Falls back to the water range when no liquid type is available (e.g. dry
 * or frozen worlds that still want a sensible fallback).
 *
 * @param name   - Planet name, used as the PRNG seed (independent of noise).
 * @param liquid - Dominant surface liquid, or `undefined` for no-liquid worlds.
 * @returns A deterministic coverage in the liquid-specific `[min, max]` range.
 */
function nameToWaterCoverage(
  name:    string,
  liquid?: SurfaceLiquidType,
): number {
  const rng         = seededPrng('wc:' + name)
  const [min, max]  = WATER_COVERAGE_RANGE[liquid ?? 'water']
  return min + rng() * (max - min)
}

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

  // ── Step 2: water coverage + sea level ───────────────────────
  const surfaceLiquid = config.type === 'rocky' ? getSurfaceLiquidType(config) : undefined
  let waterCoverage     = 0
  let seaLevelElevation = -1

  if (config.type === 'rocky' && canHaveSurfaceWaterBody(config)) {
    waterCoverage = config.waterCoverage ?? nameToWaterCoverage(config.name, surfaceLiquid)
    waterCoverage = Math.max(0, Math.min(1, waterCoverage))

    const sorted = Array.from(elevations.values()).sort((a, b) => a - b)
    const idx    = Math.min(Math.floor(waterCoverage * sorted.length), sorted.length - 1)
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
    ? fn({ tiles, biomeMap, config, waterCoverage, surfaceLiquid })
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
    waterCoverage,
    seaLevelElevation,
    biomeMap,
    surfaceLiquid,
  }
}
