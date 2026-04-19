/**
 * Physical surface classifications — pure body domain, no game or resource system dependency.
 * `features/resources` imports from here, not the other way around.
 */

/** Discriminant for all planetary body categories. */
export type BodyType = 'rocky' | 'gaseous' | 'metallic' | 'star'

/** Type of liquid forming oceans on a rocky planet's surface.
 * Determined by temperature: water (temperate) > ammonia (cold) > methane (very cold) > nitrogen (extreme cold).
 */
export type SurfaceLiquidType = 'water' | 'ammonia' | 'methane' | 'nitrogen'

/** Rocky surface biomes — gaseous and metallic planets carry no biome. */
export type RockyBiomeType =
  | 'ocean'
  | 'ocean_deep'
  | 'ice_sheet'
  | 'plains'
  | 'forest'
  | 'desert'
  | 'mountain'
  | 'volcanic'
  | 'ice_peak'

/** Biome for a tile. Only rocky planets and stars carry a biome. */
export type BiomeType = 'star' | RockyBiomeType
