/**
 * Configuration of the unified hover cursor primitives — ring outline,
 * emissive point light, opaque underwater column. Each primitive is
 * independently togglable via `false` and shares the same dispatch path
 * for sol / liquid / atmo layers.
 *
 * Forwarded into `useBody` via the `hoverCursor` option. The lib resolves
 * defaults against the body's own radius so a config-free caller still
 * gets sensible visuals.
 */

import type * as THREE from 'three'

/** Outline ring tracing the hovered tile's boundary. */
export interface HoverCursorRingConfig {
  /**
   * Outer radius scale of the ring vs the tile boundary. A value \> 1
   * inflates the ring outside the tile (visible as a halo); \< 1 shrinks
   * it inside. Default `1.0` — flush on the boundary.
   */
  size?:    number
  /** Ring color (default: `0xffffff`). */
  color?:   THREE.ColorRepresentation
  /** Ring opacity in `[0, 1]` (default: `1.0`). */
  opacity?: number
}

/** Point light placed at the hovered tile (sol / liquid / atmo). */
export interface HoverCursorEmissiveConfig {
  /**
   * Light reach in world units (Three.js `PointLight.distance`). Defaults
   * to `bodyRadius × 0.6`, which lights a few neighbour rings before
   * decaying to zero.
   */
  size?:      number
  /** Light color (default: `0xffffff`). */
  color?:     THREE.ColorRepresentation
  /** Light intensity (default: `1.5`). */
  intensity?: number
}

/** Opaque emissive prism filling the underwater volume — liquid layer only. */
export interface HoverCursorColumnConfig {
  /** Column color (default: `0xffffff`). */
  color?: THREE.ColorRepresentation
}

/**
 * Aggregate cursor config — every primitive is optional, every primitive
 * accepts `false` to be fully disabled. An omitted key means "use default
 * for this primitive"; an explicit `false` removes the primitive entirely.
 *
 * `ring` paints the cap on every layer (waterline / sol cap / atmo cap).
 * `floorRing` is a liquid-only twin drawn on the seabed so the user can
 * tell which sol tile sits under the hovered ocean hex; it accepts the
 * same params as `ring` and may be tinted independently.
 */
export interface HoverCursorConfig {
  ring?:      false | HoverCursorRingConfig
  floorRing?: false | HoverCursorRingConfig
  emissive?:  false | HoverCursorEmissiveConfig
  column?:    false | HoverCursorColumnConfig
}

/**
 * Named cursor presets registered at body construction. The lib pre-allocates
 * the union of every primitive used across the presets, then swaps the
 * active preset live via `body.hover.useCursor(name)`. Lets game-side
 * intents (attack / build / inspect…) carry their own ring color, light
 * intensity, column tint, etc.
 *
 * A preset that omits a primitive falls back to that primitive's default
 * (white ring, white emissive at 1.5 intensity, white column). Setting a
 * primitive to `false` in a preset hides it while that preset is active.
 */
export type HoverCursorPresets = Record<string, HoverCursorConfig>
