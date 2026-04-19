import type { BiomeType } from '../types/surface.types'

/**
 * Per-tile resource concentrations (resourceId → 0..1).
 * Body keeps IDs as opaque strings — the resources feature owns the catalog
 * and validates IDs; body only needs a keyed container for distribution output.
 */
export type TileResources = ReadonlyMap<string, number>

/** Per-tile simulation state — pure physical data, no game resource dependency. */
export interface TileState {
  readonly tileId:     number
  readonly elevation:  number           // -1..1, noise sample at tile center
  /**
   * Semantic classification of the tile.
   * Defined for rocky planets (ocean, ocean_deep, plains, forest, desert,
   * mountain, volcanic, ice_peak, ice_sheet) and stars. Undefined for
   * gaseous and metallic planets (no biome system).
   */
  readonly biome:      BiomeType | undefined
}
