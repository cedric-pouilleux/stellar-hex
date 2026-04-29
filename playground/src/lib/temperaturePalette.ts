/**
 * Temperature-driven default tile-colour palette.
 *
 * Picks a `(colorLow, colorHigh)` anchor pair from the body's mean
 * equilibrium temperature. The pair is fed straight to
 * `BodyConfig.terrainColorLow / terrainColorHigh`, which the lib's
 * `generateTerrainPalette` lerps over the elevation gradient (band 0
 * = valley floor, band N-1 = silhouette peak).
 *
 * This is the **fallback** palette — what every hex tile looks like
 * before any resource pattern paints over it. Resource blend (cluster
 * spots, scatter dust, …) overlays this base via `applyResourceBlend`.
 *
 * Six bands, ordered hottest → coldest, evoke the canonical archetypes:
 * volcanic, scorched (Venus-like), arid (Mars at noon), temperate
 * (Earth), cold (tundra), glacial (Pluto / Triton).
 */

/**
 * Minimal thermal input — `temperatureMin/Max` in °C. The lib's
 * `BodyConfig` no longer carries these fields (climate is caller-owned),
 * so this helper accepts them directly to stay decoupled from any
 * caller-side wrapper type.
 */
export interface TemperatureInput {
  temperatureMin: number
  temperatureMax: number
}

/**
 * Two-stop palette anchor consumed by `generateTerrainPalette`.
 *   - `colorLow`  → band 0 (valley floor, prism collapsed)
 *   - `colorHigh` → band N-1 (silhouette peak)
 */
export interface TemperatureAnchors {
  colorLow:  string
  colorHigh: string
}

/** One temperature band entry — `minTempC` is the inclusive lower bound. */
interface TemperatureBand extends TemperatureAnchors {
  /** Inclusive lower bound on the body's mean temperature, in °C. */
  minTempC: number
  /** Short label — exported for documentation / diagnostics, not used in matching. */
  label:    string
}

/**
 * Bands ordered hottest → coldest. The matcher walks them in order and
 * stops on the first whose `minTempC` is `≤ T_avg`. The terminal band uses
 * `-Infinity` so the loop is exhaustive over any finite input.
 *
 * Anchors aim for a "first read" silhouette per archetype rather than a
 * literal sample of any specific real body — the ramp from `colorLow` to
 * `colorHigh` should evoke the climate before the user even sees a single
 * resource painted on top.
 */
const TEMPERATURE_BANDS: readonly TemperatureBand[] = [
  // Lava-resurfacing regime (Io, hot super-Earths). Dark basalt floor →
  // glowing molten orange peaks.
  { minTempC:  400,       label: 'volcanic',  colorLow: '#2a0a02', colorHigh: '#c44820' },
  // Venus-class. Burnt umber floor → bright tan peaks under thick haze.
  { minTempC:  200,       label: 'scorched',  colorLow: '#3a1808', colorHigh: '#c08040' },
  // Mars at noon, hot deserts. Iron-oxide red floor → pale dune crests.
  { minTempC:   50,       label: 'arid',      colorLow: '#4a3520', colorHigh: '#d4b478' },
  // Earth-like. Loam-dark valleys → light bare-rock summits.
  { minTempC:  -20,       label: 'temperate', colorLow: '#2c2820', colorHigh: '#8a8270' },
  // Tundra / Mars-cold. Slate floor → frosted grey peaks.
  { minTempC:  -80,       label: 'cold',      colorLow: '#3a3a40', colorHigh: '#aab0bc' },
  // Pluto / Triton / icy moons. Deep blue-grey floor → snow-bright caps.
  { minTempC: -Infinity,  label: 'glacial',   colorLow: '#404a58', colorHigh: '#d8e4f0' },
]

/**
 * Resolves the temperature-driven anchor pair for a body. The mean
 * equilibrium temperature `(temperatureMin + temperatureMax) / 2` selects
 * the first band whose `minTempC` is `≤ T_avg`.
 *
 * Pure function — deterministic for any given input.
 *
 * @param input Caller-side thermal metadata.
 * @returns Anchor pair `{ colorLow, colorHigh }` ready to write into
 *          `BodyConfig.terrainColorLow / terrainColorHigh`.
 */
export function deriveTemperatureAnchors(input: TemperatureInput): TemperatureAnchors {
  const T_avg = (input.temperatureMin + input.temperatureMax) / 2
  // The terminal band's `minTempC = -Infinity` makes `find` exhaustive.
  const band  = TEMPERATURE_BANDS.find(b => T_avg >= b.minTempC)!
  return { colorLow: band.colorLow, colorHigh: band.colorHigh }
}

/**
 * Read-only view on the band table — exposed for tests and any UI surface
 * that wants to render a legend ("how does the planet's base palette change
 * with temperature?"). Not intended for runtime mutation.
 */
export const TEMPERATURE_PALETTE_BANDS: readonly TemperatureBand[] = TEMPERATURE_BANDS

// ── Lava colour ───────────────────────────────────────────────────

/**
 * Three-stop lava colour ramp — molten worlds glow brighter the hotter
 * they are. Mirrors the legacy lib defaults so the rocky shader
 * preserves its visual contract after the lava chemistry was lifted out
 * of the lib.
 */
const LAVA_COLOR_BANDS: readonly { minTempC: number; color: string }[] = [
  { minTempC:  200, color: '#ff5500' },  // bright orange — extreme heat
  { minTempC:  100, color: '#ff3300' },  // saturated red — active flow
  { minTempC: -Infinity, color: '#cc2200' },  // dark red — cooling crust
]

/**
 * Resolves the lava overlay colour for a rocky body from its mean
 * equilibrium temperature. Pure function.
 *
 * @param input Caller-side thermal metadata.
 * @returns Hex colour string ready to push onto `BodyVariation.lavaColor`.
 */
export function deriveLavaColor(input: TemperatureInput): string {
  const T_avg = (input.temperatureMin + input.temperatureMax) / 2
  const band  = LAVA_COLOR_BANDS.find(b => T_avg > b.minTempC) ?? LAVA_COLOR_BANDS[LAVA_COLOR_BANDS.length - 1]!
  return band.color
}
