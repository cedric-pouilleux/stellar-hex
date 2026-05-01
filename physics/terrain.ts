/**
 * Terrain elevation staircase + tile geometry constants.
 *
 * Pure-logic helpers, no `three` import. The band count `N` is derived
 * from the radial partition so backend (sim) and frontend (render) agree
 * without negotiating extra fields over the wire.
 */

// ── Tile geometry ─────────────────────────────────────────────────────────────
/**
 * Target physical size (world units) for a single hexasphere tile.
 * All bodies derive their subdivision count from this value via
 * `tileSizeToSubdivisions(radius, DEFAULT_TILE_SIZE)`, ensuring every tile
 * across stars, planets and moons has the same surface footprint.
 *
 * `0.05` is the recommended default for a single body in close-up view
 * (~5 000 tiles on a unit-radius body). For multi-body system views,
 * pass a larger value (e.g. `0.10` for 1 250 tiles) to keep the hex
 * count low on background bodies — see the performance guide.
 */
export const DEFAULT_TILE_SIZE = 0.05

// ── Terrain elevation staircase (rocky planets) ──────────────────────────────

/**
 * Reference world-unit size of a single elevation step. The band count `N` is
 * derived from the shell thickness so that each step spans roughly this
 * value — i.e. digging one elevation removes a visually constant slice of
 * terrain regardless of the body size. Anchored to `DEFAULT_TILE_SIZE` so
 * a step matches half a tile edge.
 */
export const DEFAULT_TERRAIN_STEP = DEFAULT_TILE_SIZE * 0.5

/**
 * Floor on the derived band count — guarantees a minimum palette resolution
 * even for tiny shells (e.g. a moon with a very thick core).
 */
export const MIN_TERRAIN_LEVEL_COUNT = 4

/**
 * Resolves the band count `N` for a body. Deterministic, pure function of
 * `(radius, coreRadiusRatio, atmosphereThickness?)` — there is no caller
 * override: the staircase geometry is a direct consequence of the radial
 * partition, so the backend (simulation) and the frontend (rendering)
 * agree on `N` without negotiating additional fields over the wire.
 *
 * The sol band — where the staircase lives — spans
 * `(1 - coreRadiusRatio - atmosphereThickness) × radius`. Passing the
 * atmosphere thickness shrinks the staircase proportionally so the sol
 * band ends at `solOuterRadius` instead of `radius`. Omit it (or pass `0`)
 * for legacy callers that treat the whole shell as sol.
 *
 * Derivation: `N = round(solShell / DEFAULT_TERRAIN_STEP)`, clamped to
 * {@link MIN_TERRAIN_LEVEL_COUNT}.
 */
export function resolveTerrainLevelCount(
  radius:               number,
  coreRadiusRatio:      number,
  atmosphereThickness?: number,
): number {
  const atmo    = Math.max(0, Math.min(1, atmosphereThickness ?? 0))
  const shell   = Math.max(0, (1 - coreRadiusRatio - atmo) * radius)
  const derived = Math.round(shell / DEFAULT_TERRAIN_STEP)
  return Math.max(MIN_TERRAIN_LEVEL_COUNT, derived)
}

/**
 * Layout of the elevation staircase in world units.
 *
 * Band index `i ∈ [0, N - 1]` maps to a world height `i * unit` measured
 * from `coreRadius`. The staircase is strictly uniform:
 *
 *   - `height[0]     = 0`      → prism collapsed, core visible
 *   - `height[1]     = unit`   → one step above the core
 *   - `height[N - 1] = shell`  → silhouette sits at `radius`
 *
 * Every consecutive pair of bands is separated by exactly `unit`, so the
 * gap between elev=0 and elev=1 equals the gap between any two adjacent
 * bands — digging always removes a constant slice of world-space height.
 */
export interface TerrainBandLayout {
  /** Constant world-unit gap between two consecutive bands. */
  unit:  number
  /** Shell thickness `(1 - coreRadiusRatio) * radius`. */
  shell: number
}

/**
 * Resolve the staircase layout for a body. The returned `unit` is tuned so
 * the tallest band caps at `shell` exactly. With the radial partition
 * `[core | sol | atmo]`, `shell` is the **sol band** length:
 * `(1 - coreRadiusRatio - atmosphereThickness) × radius`. Pass `0` (or
 * omit) the atmosphere thickness for legacy callers that treat the whole
 * `[core, radius]` shell as sol.
 */
export function terrainBandLayout(
  radius:               number,
  coreRadiusRatio:      number,
  levelCount:           number,
  atmosphereThickness?: number,
): TerrainBandLayout {
  const N     = Math.max(MIN_TERRAIN_LEVEL_COUNT, Math.floor(levelCount))
  const atmo  = Math.max(0, Math.min(1, atmosphereThickness ?? 0))
  const shell = Math.max(0, (1 - coreRadiusRatio - atmo) * radius)
  // `unit = shell / (N - 1)` so `height[N-1] = (N-1) * unit = shell` —
  // the top sol band caps exactly at `solOuterRadius`.
  const unit  = shell / Math.max(1, N - 1)
  return { unit, shell }
}

// ── Metallic planet elevation thresholds ─────────────────────────────────────
// Raw noise elevation values (not normalised land-position fractions).

/** Crater floor / depression band: elevation below this → metallic_plain. */
export const METALLIC_PLAIN_THRESH = 0.20

/** Peak band: elevation above this → metallic_peak. */
export const METALLIC_PEAK_THRESH  = 0.80
