/**
 * Physics rules and body-level constants — public barrel.
 *
 * The actual logic is split across thematic modules so each file stays
 * focused on a single sub-domain:
 *
 *   - `./liquid`     — surface-liquid invariant (`hasSurfaceLiquid`).
 *   - `./atmosphere` — per-type atmosphere thickness cap + resolver.
 *   - `./layering`   — core / shell radial split + density references.
 *   - `./terrain`    — tile geometry, terrain staircase, metallic thresholds.
 *   - `./star`       — G-type reference frame + spectral kelvin lookup.
 *
 * This barrel preserves the historical import path so existing consumers
 * (`import { ... } from '../physics/body'`) keep working unchanged.
 */

export { hasSurfaceLiquid } from './liquid'

export {
  MAX_ATMOSPHERE_THICKNESS_BY_TYPE,
  resolveAtmosphereThickness,
} from './atmosphere'

export {
  DEFAULT_CORE_RADIUS_RATIO,
  REF_SOLID_DENSITY,
  REF_GAS_DENSITY,
  deriveCoreRadiusRatio,
  MIN_SOL_BAND_FRACTION,
  resolveCoreRadiusRatio,
} from './layering'

export {
  DEFAULT_TILE_SIZE,
  DEFAULT_TERRAIN_STEP,
  MIN_TERRAIN_LEVEL_COUNT,
  resolveTerrainLevelCount,
  terrainBandLayout,
  METALLIC_PLAIN_THRESH,
  METALLIC_PEAK_THRESH,
} from './terrain'
export type { TerrainBandLayout } from './terrain'

export {
  REF_STAR_RADIUS,
  REF_STAR_TEMP,
  SPECTRAL_KELVIN,
} from './star'
