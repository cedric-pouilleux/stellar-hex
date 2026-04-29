import * as THREE from 'three'
import type { TerrainLevel } from '../types/terrain.types'
import { MIN_TERRAIN_LEVEL_COUNT, terrainBandLayout } from '../../physics/body'

// Neutral fallback used when the caller declares a liquid body but omits the
// colour. Keeps the sphere visible without baking any chemistry assumption
// into the lib.
const NEUTRAL_SEA_COLOR   = new THREE.Color('#2a3a4a')
const NEUTRAL_FROZEN_COLOR = new THREE.Color('#90b0c0')

/**
 * Default low anchor — assigned to band `0` (elev = 0, prism collapsed).
 * A near-black grey that reads as raw base rock on the rocky default.
 */
export const DEFAULT_TERRAIN_LOW_COLOR  = new THREE.Color('#191919')

/**
 * Default high anchor — assigned to band `N - 1` (tallest terrain band,
 * silhouette sits at `radius`). Pure white so the top tiles look like
 * snow-capped peaks on the rocky default.
 */
export const DEFAULT_TERRAIN_HIGH_COLOR = new THREE.Color('#ffffff')

/**
 * Material + colour anchor for tiles sitting below the current sea level.
 * Decoupled from the land palette so sea level can move at runtime without
 * regenerating the palette — the caller simply re-asks which tiles are
 * submerged and swaps in this anchor's visual.
 */
export interface SeaAnchor {
  /** Submerged tile colour — caller-supplied via `liquidColor`, neutral fallback otherwise. */
  color:     THREE.Color
  /** Material metalness for the submerged band. */
  metalness: number
  /** Material roughness for the submerged band. */
  roughness: number
}

/**
 * Generate a rocky terrain palette as a linear gradient from `lowColor` at
 * the shortest band (`i = 0`, prism collapsed) to `highColor` at the
 * tallest band (`i = N - 1`, silhouette at `radius`). Caller-side
 * classifications (biomes, climate zones…) are handled by a later pass;
 * this palette is intentionally monochromatic so the hex mesh
 * communicates altitude alone.
 *
 * Emits exactly `levelCount` bands. Band `i` caps at world height
 * `i * unit` above the core, so the staircase is strictly uniform:
 * `height[0] = 0` (collapsed to the core), `height[N - 1] = shell` (at
 * `radius`), and every adjacent pair is separated by exactly `unit`.
 * Thresholds are band indices (`[1, 2, ..., N-1, Infinity]`), so
 * `getTileLevel(elevation, palette)` with integer `elevation ∈ [0, N-1]`
 * returns `palette[elevation]` exactly.
 *
 * @param levelCount      - Desired total level count (≥ {@link MIN_TERRAIN_LEVEL_COUNT}).
 *                          Typically resolved via `resolveTerrainLevelCount` so each
 *                          band stays proportionate to the tile size.
 * @param radius          - Planet visual radius — combined with `coreRadiusRatio`
 *                          to derive the world-space step `unit = shell / (N - 1)`.
 * @param coreRadiusRatio - Fraction of `radius` occupied by the inner core.
 * @param lowColor        - Low anchor (band 0). Defaults to {@link DEFAULT_TERRAIN_LOW_COLOR}.
 * @param highColor       - High anchor (band N - 1). Defaults to {@link DEFAULT_TERRAIN_HIGH_COLOR}.
 */
export function generateTerrainPalette(
  levelCount:           number,
  radius:               number = 1,
  coreRadiusRatio:      number = 0,
  lowColor:             THREE.ColorRepresentation = DEFAULT_TERRAIN_LOW_COLOR,
  highColor:            THREE.ColorRepresentation = DEFAULT_TERRAIN_HIGH_COLOR,
  atmosphereThickness:  number = 0,
): TerrainLevel[] {
  const N      = Math.max(MIN_TERRAIN_LEVEL_COUNT, Math.floor(levelCount))
  const layout = terrainBandLayout(radius, coreRadiusRatio, N, atmosphereThickness)
  const unit   = layout.unit

  const low  = new THREE.Color(lowColor)
  const high = new THREE.Color(highColor)

  const result: TerrainLevel[] = []
  for (let i = 0; i < N; i++) {
    const t     = N > 1 ? i / (N - 1) : 0
    const color = low.clone().lerp(high, t)
    result.push({
      // `getTileLevel` picks the first band whose threshold strictly exceeds
      // the query; `i + 1` therefore routes integer elevation `i` straight
      // to `palette[i]`. Last band is unbounded so the topmost tile always
      // resolves to the peak colour.
      threshold: i === N - 1 ? Infinity : i + 1,
      height:    i * unit,
      color,
      metalness: 0.0,
      roughness: 0.85,
    })
  }
  return result
}

/**
 * Resolves the visual anchor for tiles sitting below the current sea level.
 * The caller owns the substance→colour catalogue: `liquidColor` is taken
 * as-is and drives the submerged tile tint. When omitted, a neutral slate
 * blue (or pale ice grey when frozen) keeps the sphere visible without
 * baking chemistry into the lib.
 *
 * Material properties are keyed only on `liquidState` — liquid surfaces are
 * wet (low roughness, medium metalness); frozen sheets are slick ice (mid
 * roughness, very low metalness).
 *
 * @param liquidColor  Caller-provided sea colour (opaque `ColorInput`).
 * @param liquidState  Physical state of the surface liquid.
 */
export function resolveSeaAnchor(
  liquidColor: THREE.ColorRepresentation | undefined,
  liquidState: 'liquid' | 'frozen' | 'none',
): SeaAnchor {
  const frozen = liquidState === 'frozen'
  const color = liquidColor !== undefined
    ? new THREE.Color(liquidColor)
    : (frozen ? NEUTRAL_FROZEN_COLOR.clone() : NEUTRAL_SEA_COLOR.clone())
  return {
    color,
    metalness: frozen ? 0.02 : 0.35,
    roughness: frozen ? 0.65 : 0.25,
  }
}
