/**
 * Body render configuration — visual constants and FX configs scoped to
 * a single body's rendering pipeline.
 *
 * Scene-level constants (camera FOV, main orbit speed, god-rays mask
 * layer, etc.) are caller-owned and intentionally live outside this lib.
 */

// ── Camera / interaction ──────────────────────────────────────────────────────
/** Orbital drag sensitivity in the preview panel. */
export const PREVIEW_ORBIT_SPEED = 0.85

/** Camera focus interpolation rate (lerp per second). */
export const FOCUS_LERP          = 5.0

// ── Shadow system ─────────────────────────────────────────────────────────────
/** Sun/star visual radius in world units — must match the star body config. */
export const SHADOW_SUN_RADIUS   = 3.0

// ── Orbit trail ───────────────────────────────────────────────────────────────
/** Number of line segments in an orbital trail ring. */
export const ORBIT_TRAIL_SEGMENTS = 128

// ── God rays ──────────────────────────────────────────────────────────────────

/**
 * Tunable parameters for the screen-space god-rays (volumetric scattering)
 * post-processing pass. Fed to `GodRaysShader` uniforms.
 */
export interface GodRaysParams {
  /** Overall ray brightness */
  exposure: number
  /** Attenuation per step — closer to 1 = longer rays */
  decay:    number
  /** Step stretch factor */
  density:  number
  /** Per-sample weight before angular modulation */
  weight:   number
}

// ── Lens flare & sun screen FX ────────────────────────────────────────────────

/**
 * Configuration for the lens-flare overlay rendered in front of a star.
 * Scales the three flare sub-sprites (glow, ring, ghosts) independently.
 */
export interface LensFlareConfig {
  enabled:      boolean
  glowScale:    number   // 0.2 – 3.0
  ringScale:    number   // 0.2 – 3.0
  ghostScale:   number   // 0.2 – 3.0
  ghostOpacity: number   // 0.0 – 1.0
}

/**
 * Screen-space sun effect bundle — blinding glow + concentric rings,
 * composited on top of the god-rays pass.
 */
export interface SunFXConfig {
  blindingEnabled:   boolean
  blindingIntensity: number   // 0.0 – 2.0
  blindingSize:      number   // 0.3 – 2.0  (fraction of screen height)
  ringsEnabled:      boolean
  ringsCount:        number   // 1 – 8
  ringsOpacity:      number   // 0.0 – 1.0
  ringsSpread:       number   // 0.2 – 2.0  (spacing between rings)
}

/** Default lens-flare configuration — balanced for a G-type reference star. */
export const DEFAULT_LENS_FLARE: LensFlareConfig = {
  enabled:      true,
  glowScale:    1.0,
  ringScale:    1.0,
  ghostScale:   1.0,
  ghostOpacity: 1.0,
}

/** Default sun-FX configuration — moderate blinding with 5 rings. */
export const DEFAULT_SUN_FX: SunFXConfig = {
  blindingEnabled:   true,
  blindingIntensity: 0.6,
  blindingSize:      0.6,
  ringsEnabled:      true,
  ringsCount:        5,
  ringsOpacity:      0.7,
  ringsSpread:       1.8,
}

// ── Tile hover highlight ───────────────────────────────────────────────────────

/**
 * Visual configuration for the per-tile hover overlay (fill + border ring),
 * consumed by `TileOverlayMesh` when rendering the hovered hex.
 */
export type HoverConfig  = {
  /** Fill overlay color (hex integer, e.g. 0xffffff). */
  fillColor:     number
  /** Fill overlay opacity — uses additive blending, keep low (0.05 – 0.3). */
  fillOpacity:   number
  /** Border quad-strip color. */
  borderColor:   number
  /** Border opacity. */
  borderOpacity: number
  /**
   * Border width as a fraction of the tile's average boundary radius.
   * 0.08 ≈ 8% of the tile radius — visible but not overwhelming.
   */
  borderWidth:   number
  /**
   * Z-offset added on top of the tile height to avoid z-fighting.
   * Expressed as a scale delta on the sphere radius (≈ world units at r=1).
   */
  surfaceOffset: number
  /**
   * Outward expansion of the ring beyond the boundary vertices,
   * as a fraction of the tile average boundary radius.
   */
  ringExpand:    number
}

/** Default tile hover overlay — additive white fill with a thin white ring. */
export const DEFAULT_HOVER: HoverConfig = {
  fillColor:     0xffffff,
  fillOpacity:   0.85,
  borderColor:   0xffffff,
  borderOpacity: 0.90,
  borderWidth:   0.08,
  surfaceOffset: 0.002,
  ringExpand:    0.12,
}

// ── Body (planet) hover highlight ─────────────────────────────────────────────

/**
 * Visual configuration for the body-level hover ring drawn around a planet
 * silhouette. All dimensions are screen-space so the ring stays constant
 * across camera zoom.
 */
export type BodyHoverConfig = {
  /** Circle stroke color. */
  ringColor:    number
  /** Circle stroke opacity. */
  ringOpacity:  number
  /**
   * Gap between the planet's silhouette edge and the circle's inner radius,
   * in screen pixels. Maintained at any zoom level.
   */
  ringMarginPx: number
  /**
   * Circle stroke width in screen pixels. Maintained at any zoom level.
   */
  ringWidthPx:  number
}

/** Default body hover ring — white stroke, 2 px wide, 6 px offset. */
export const DEFAULT_BODY_HOVER: BodyHoverConfig = {
  ringColor:    0xffffff,
  ringOpacity:  0.85,
  ringMarginPx: 6,
  ringWidthPx:  2,
}
