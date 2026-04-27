/**
 * Public API of the body feature — pure-logic entry point.
 *
 * Narrower than `./core`: this surface is free of shaders, GLSL, Three.js
 * render helpers, materials and scene-display utilities. It exposes only
 * the deterministic data/physics layer — body types, geometry, physics
 * and simulation — so it can run in a headless environment (backend,
 * worker, CLI) with no WebGL.
 *
 * Typical backend usage:
 *   - Generate tiles from a seed via `generateHexasphere(subdivisions)`
 *   - Run `initBodySimulation(tiles, config)` to derive per-tile
 *     elevations, sea level and surface-liquid tag — the authoritative
 *     geological simulation state.
 *   - Persist the seed + sim state; the frontend reconstructs rendering
 *     from the same seed via `./core` or `./index`.
 *
 * Vue-specific additions live in `./index.ts`; the render layer (shaders,
 * materials, builders) lives in `./core.ts`.
 *
 * # Doctrine — chemistry- and phase-agnostic lib
 *
 * The lib accepts only **resolved physical state** on `BodyConfig`:
 *
 *   - `liquidState`     — presence flag (`liquid | frozen | none`)
 *   - `liquidColor`     — opaque tint, already resolved by the caller
 *   - `liquidCoverage`  — initial waterline as a coverage fraction
 *   - `bandColors`      — 4 stops for gas-giant atmospheric bands
 *   - `terrainColorLow/High` — rocky ramp anchors
 *   - `metallicBands`   — 4 stops for metallic terrain
 *
 * Substance vocabulary (`'h2o'`, `'ch4'`, melting points, vapour pressure,
 * phase partitions, atmosphere retention models, climate models…) lives
 * entirely in caller code. The lib never reads a temperature field, never
 * derives a phase, never picks a colour from a substance name, and never
 * owns a chemistry catalogue. `BodyConfig` carries no `temperature*`
 * fields — climate-driven looks are pre-resolved caller-side and pushed
 * via the visual profile + variation overrides.
 *
 * Runtime transitions are **push-only**: when the caller's chemistry
 * model decides a phase change (ocean freezes, atmosphere thickens,
 * volatile evaporates…), it recomputes the resolved state and writes it
 * back onto `BodyConfig`. The lib observes nothing on its own.
 *
 * Frozen surfaces are not rendered as a separate liquid shell — the
 * recommended pattern is for the caller to stack a hex ice cap on
 * submerged tiles (top at `seaLevelElevation`), exposing the underlying
 * mineral tile once the cap is mined out. See `BodyPhysics.liquidState`.
 */

// ── Types ─────────────────────────────────────────────────────────
export type {
  BodyConfig,
  BodyIdentity,
  BodyPhysics,
  BodyNoiseProfile,
  BodyVisualProfile,
  BodyType,
  SpectralType,
  ColorInput,
  MetallicBand,
} from './types/body.types'

// ── Geometry ─────────────────────────────────────────────────────
export { generateHexasphere } from './geometry/hexasphere'
export type { Point3D, Tile, HexasphereData } from './geometry/hexasphere.types'
export { buildNeighborMap, getNeighbors } from './geometry/hexNeighbors'

// ── Physics ───────────────────────────────────────────────────────
// See the file preamble for the chemistry-agnostic doctrine — the lib
// only consumes resolved state (`liquidState`, `liquidColor`,
// `liquidCoverage`, `bandColors`); substance catalogues live in
// consumer code.
export { SPECTRAL_TABLE, resolveStarData, toStarParams } from './physics/starPhysics'
export { REF_STAR_RADIUS, REF_STAR_TEMP, DEFAULT_TILE_SIZE } from './physics/body'
export {
  hasSurfaceLiquid,
  deriveCoreRadiusRatio,
  resolveCoreRadiusRatio,
  REF_SOLID_DENSITY,
  REF_GAS_DENSITY,
} from './physics/body'
export type { StarConfig } from './types/body.types'

// ── Simulation ───────────────────────────────────────────────────
export type { BodySimulation } from './sim/BodySimulation'
export type { TileState } from './sim/TileState'
export { initBodySimulation } from './sim/BodySimulation'
