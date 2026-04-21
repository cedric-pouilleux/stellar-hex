import type * as THREE from 'three'
import type { BodyType } from './surface.types'

export type { BodyType } from './surface.types'

// ── Spectral classification ───────────────────────────────────────
// Kept here so both StarBodyConfig and render code share one source.
export type SpectralType = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M'

// ── Shared terrain level ──────────────────────────────────────────
export interface TerrainLevel {
  threshold:          number 
  height:             number
  color:              THREE.Color
  emissive?:          THREE.Color
  emissiveIntensity?: number
  metalness?:         number
  roughness?:         number
}

// ── Planet body (rocky / gaseous / metallic / star) ──────────────

export interface BodyConfig {
  type:           BodyType
  name:           string
  temperatureMin: number         // °C
  temperatureMax: number         // °C
  radius:         number         // visual radius in world units
  rotationSpeed:  number         // rad/s
  axialTilt:      number         // radians
  mass?:                number   // M_earth
  atmosphereThickness?: number   // 0..1; 0 = no atmosphere
  /**
   * Ratio of surface covered by a liquid/ice body [0..1].
   * Caller-decided — the lib no longer infers from temperature.
   */
  liquidCoverage?:      number
  /**
   * Dominant surface liquid substance (free-form identifier chosen by the caller,
   * e.g. `'water'`, `'ammonia'`, `'methane'`, `'nitrogen'`, or any custom tag).
   * The lib treats it as an opaque string; only the caller's palette/render config
   * assigns semantics to specific values.
   */
  liquidType?:          string
  /**
   * Physical state of the surface liquid body. Drives animation
   * (flowing vs static) and biome classification. Defaults to `'none'`.
   */
  liquidState?:         'liquid' | 'frozen' | 'none'
  /**
   * Optional manual override for the sea colour. When set, the palette uses
   * this colour instead of the type-keyed canonical colour for the liquid
   * surface band. Shore colour is still resolved from `liquidType`.
   */
  liquidColor?:         THREE.ColorRepresentation
  noiseScale?:          number   // default 1.4
  /**
   * Total number of terrain levels. Split evenly: N/2 ocean bands + N/2 land
   * bands. Per-level height is derived deterministically from the body radius
   * (`TERRAIN_LEVEL_STEP_PER_RADIUS`) — no amplitude knob, the relief
   * dimensions scale naturally with the body size.
   * Defaults to `DEFAULT_TERRAIN_LEVEL_COUNT` when omitted.
   */
  terrainLevelCount?:   number
  palette?:             TerrainLevel[]
  /** Whitelist of resource IDs allowed on this body (strings, validated by the resources feature). */
  allowedResources?:    string[]
  /** Ratio of solid core radius to visual radius (gaseous only). Default 0.55. */
  coreRadiusRatio?:     number
  gasComposition?: {
    H2He:   number
    CH4:    number
    NH3:    number
    H2O:    number
    sulfur: number
  }
  resourceDensity?: number
  hasCracks?:       boolean
  hasLava?:         boolean
  /** When true, a decorative ring system is generated around this body (visual only). */
  hasRings?:        boolean
  /** Spectral classification (star bodies only). */
  spectralType?:    SpectralType
}

// ── Star physics input (used by starPhysics.ts calculations) ─────
// Minimal struct: spectral type + optional overrides.
// Distinct from StarBodyConfig which carries render/scene fields.
export interface StarConfig {
  spectralType: SpectralType
  radius?:      number   // world units override
  tempK?:       number   // Kelvin override
}

export interface ResolvedStarData {
  tempK:      number   // surface temperature in Kelvin
  radius:     number   // world units
  luminosity: number   // relative to G-type reference (L_G = 1)
  color:      string   // representative CSS hex color
}

// ── Star body ─────────────────────────────────────────────────────
export interface StarBodyConfig {
  type:          'star'
  name:          string
  spectralType:  SpectralType
  /** Visual radius override. Defaults from spectral type table. */
  radius?:       number
  /** Surface temperature override (K). Defaults from spectral type table. */
  tempK?:        number
  rotationSpeed: number
  axialTilt:     number
  palette?:      TerrainLevel[]
}

// ── Union — the single type accepted by all render/physics APIs ───
export type AnyBodyConfig = BodyConfig | StarBodyConfig

// ── Orbit ─────────────────────────────────────────────────────────
export interface OrbitConfig {
  radius:        number  // world units from parent center
  speed:         number  // rad/s
  inclination:   number  // radians from equatorial plane
  initialAngle?: number  // starting orbital angle (default 0)
}
