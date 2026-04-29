/**
 * Body configuration — barrel re-exporting the orthogonal sub-profiles
 * defined under `./body/`.
 *
 * The split lets consumers that only need a subset (e.g. a noise-only
 * sandbox) import from the relevant sub-file directly, while existing
 * code keeps working through this barrel without changes.
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
 */

// ── Taxonomy ──────────────────────────────────────────────────────
export type { BodyType, SurfaceLook } from './surface.types'

// ── Identity ──────────────────────────────────────────────────────
export type {
  SpectralType,
  PlanetIdentity,
  StarIdentity,
  BodyIdentity,
} from './body/identity.types'

// ── Physics ───────────────────────────────────────────────────────
export type {
  BodyPhysicsCore,
  PlanetPhysics,
  StarPhysics,
  BodyPhysics,
  StarPhysicsInput,
  ResolvedStarData,
} from './body/physics.types'

// ── Noise profile ─────────────────────────────────────────────────
export type { BodyNoiseProfile } from './body/noiseProfile.types'

// ── Visual profile ────────────────────────────────────────────────
export type {
  ColorInput,
  MetallicBand,
  PlanetVisualProfile,
  BodyVisualProfile,
} from './body/visualProfile.types'

// ── Composed config ───────────────────────────────────────────────
export type {
  PlanetConfig,
  StarConfig,
  BodyConfig,
} from './body/config.types'
