/**
 * Public API of the body feature — pure-logic entry point.
 *
 * Narrower than `./core`: this surface is free of shaders, GLSL, Three.js
 * render helpers, materials and scene-display utilities. It exposes only
 * the deterministic data/physics layer — body types, geometry, physics,
 * simulation, biomes and resource registries — so it can run in a headless
 * environment (backend, worker, CLI) with no WebGL.
 *
 * Typical backend usage:
 *   - Generate tiles from a seed via `generateHexasphere(subdivisions)`
 *   - Run `initBodySimulation(tiles, config, distribute)` to derive biomes,
 *     surface liquid, resource maps — the authoritative simulation state.
 *   - Persist the seed + sim state; the frontend reconstructs rendering
 *     from the same seed via `./core` or `./index`.
 *
 * Vue-specific additions live in `./index.ts`; the render layer (shaders,
 * materials, builders) lives in `./core.ts`.
 */

// ── Types ─────────────────────────────────────────────────────────
export type {
  AnyBodyConfig,
  BodyConfig,
  BodyType,
  StarBodyConfig,
  SpectralType,
  TerrainLevel,
  OrbitConfig,
} from './types/body.types'

// ── Geometry ─────────────────────────────────────────────────────
export { generateHexasphere } from './geometry/hexasphere'
export type { Point3D, Tile, HexasphereData } from './geometry/hexasphere.types'
export { buildNeighborMap, getNeighbors } from './geometry/hexNeighbors'

// ── Physics ───────────────────────────────────────────────────────
// Note: surface-liquid physics (water/ammonia/methane/nitrogen thresholds,
// coverage ranges, substance selection) is no longer part of the public API.
// Callers populate `BodyConfig.liquidType` / `liquidState` / `liquidCoverage`
// from their own physical model — the playground ships one such model in
// `playground/src/lib/bodyWater.ts`.
export { SPECTRAL_TABLE, resolveStarData, toStarParams } from './physics/starPhysics'
export { REF_STAR_RADIUS, REF_STAR_TEMP, DEFAULT_TILE_SIZE } from './config/defaults'
export type { StarConfig } from './types/body.types'

// ── Surface types ─────────────────────────────────────────────────
export type { BiomeType, RockyBiomeType } from './types/surface.types'

// ── Simulation ───────────────────────────────────────────────────
export type { BodySimulation } from './sim/BodySimulation'
export type { TileState, TileResources } from './sim/TileState'
export { initBodySimulation } from './sim/BodySimulation'
export {
  registerResourceDistributor,
  registerBodyResourceBridge,
  getBodyResourceBridge,
} from './sim/resourceDistributionRegistry'
export type { ResourceDistributor, BodyResourceBridge } from './sim/resourceDistributionRegistry'
