/**
 * Pure derivation helpers consumed by the body factory and external callers
 * (UI panels, raycast tooltips, dig pipelines). Pulled out of `useBody.ts`
 * so the factory can stay focused on scene-graph assembly while these stay
 * trivially testable without instantiating any THREE resource.
 */

import { resolveCoreRadiusRatio, resolveTerrainLevelCount, resolveAtmosphereThickness } from '../../physics/body'
import type { BodyConfig } from '../../types/body.types'
import type { TerrainLevel } from '../../types/terrain.types'
import { getTileLevel } from '../hex/hexMeshShared'
import { strategyFor } from './bodyTypeStrategy'

// ── Tile size → subdivisions ──────────────────────────────────────

/**
 * Derives the hexasphere subdivision count needed to make each tile match
 * `tileSize` on the surface of a sphere of the given `radius`.
 *
 * The relation follows from the Goldberg polyhedron tile count:
 *   N = (4π r²) / tileSize²   and   N = 10·f² + 2
 * where `f` is the subdivision frequency returned.
 *
 * @param radius   - Sphere radius in world units.
 * @param tileSize - Target tile edge length in world units.
 * @returns Subdivision frequency (≥ 2).
 */
export function tileSizeToSubdivisions(radius: number, tileSize: number): number {
  const N = (4 * Math.PI * radius * radius) / (tileSize * tileSize)
  return Math.max(2, Math.round(Math.sqrt(Math.max(0, (N - 2) / 10))))
}

// ── Auto palette selection ────────────────────────────────────────

/**
 * Selects or builds the terrain palette for a given planet config.
 *
 * Routes through {@link strategyFor} — each body type provides its own
 * palette generator + densification rule. All non-rocky generators feed
 * their base palette through a shared remapping helper so
 * `getTileLevel(elevation, palette)` with integer `elevation ∈ [0, N-1]`
 * resolves to `palette[elevation]` regardless of the body type.
 *
 * @param config          - Body configuration (drives the strategy lookup).
 * @param paletteOverride - When provided, short-circuits the generators and
 *                          returns this array verbatim. Caller is responsible
 *                          for sizing/thresholding it consistently with
 *                          `resolveTerrainLevelCount(radius, coreRadiusRatio)`.
 */
export function choosePalette(config: BodyConfig, paletteOverride?: TerrainLevel[]): TerrainLevel[] {
  if (paletteOverride) return paletteOverride
  const coreRatio = resolveCoreRadiusRatio(config)
  const atmo      = resolveAtmosphereThickness(config)
  const count     = resolveTerrainLevelCount(config.radius, coreRatio, atmo)
  return strategyFor(config.type).buildPalette(config, count, coreRatio)
}

// ── Tile height resolution ───────────────────────────────────────

/** Default tile height used when palette resolution fails. */
const DEFAULT_TILE_HEIGHT = 0.06

/**
 * Resolves the visual height of a tile from the terrain palette.
 * Falls back to {@link DEFAULT_TILE_HEIGHT} when the palette returns no usable
 * height for the elevation (empty palette, missing/non-finite `height`).
 *
 * @param config          - Planet body config (needed to choose the palette).
 * @param elevation       - Tile elevation — integer band index `[0, N-1]`.
 * @param paletteOverride - Optional render-time palette override; see
 *                          {@link choosePalette}. When omitted, the palette
 *                          is auto-derived from `config.type`.
 * @returns Resolved tile height for building placement.
 */
export function resolveTileHeight(
  config:          BodyConfig,
  elevation:       number,
  paletteOverride?: TerrainLevel[],
): number {
  const palette = choosePalette(config, paletteOverride)
  const level   = getTileLevel(elevation, palette)
  if (typeof level?.height === 'number' && isFinite(level.height)) return level.height
  return DEFAULT_TILE_HEIGHT
}

/**
 * Resolves the signed terrain level of a tile *relative to sea level* — a
 * caller-friendly index independent from the absolute band count:
 *   - `0`  = the band currently sitting at the waterline.
 *   - `-1` = one band below the waterline (shallows); deeper bands go `-2, -3, ...`.
 *   - `1`  = one band above the waterline; peaks climb `2, 3, ...`.
 * On dry or frozen bodies (no sea), `seaLevel` is `-1`: the call just returns
 * the absolute band index so every tile stays in `[0, N-1]`.
 *
 * @param seaLevel  - Sea level elevation from the simulation (band space).
 * @param elevation - Tile elevation — integer band index `[0, N-1]`.
 * @returns Signed integer level.
 */
export function resolveTileLevel(seaLevel: number, elevation: number): number {
  if (seaLevel < 0) return elevation
  return Math.round(elevation - seaLevel)
}
