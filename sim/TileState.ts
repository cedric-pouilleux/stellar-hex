/** Per-tile simulation state — pure physical data, no game resource dependency. */
export interface TileState {
  readonly tileId:     number
  /**
   * Integer band index in `[0, N-1]` where `N` is derived from
   * `(radius, coreRadiusRatio)` via `resolveTerrainLevelCount`. `0` is
   * the band closest to the core; higher values stack outward. Derived from
   * seeded simplex noise ranked into `N` equal-frequency bins, so the value
   * space is deterministic, uniform, and decoupled from the raw noise range.
   *
   * Sea level floats freely inside the same integer space
   * (see {@link BodySimulation.seaLevelElevation}) — submerged status is
   * computed live from `elevation < seaLevelElevation`, never baked here.
   */
  readonly elevation:  number
}
