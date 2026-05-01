import { reactive } from 'vue'
import type { HoverCursorConfig } from '@lib'

/**
 * Reactive playground mirror of `HoverCursorConfig`. Each control widget
 * mutates a single field; the HexaPane watches the object and forwards
 * the resolved config into the body via `body.hover.updateCursor`.
 *
 * The lib's config supports `false` for a per-primitive disable; here we
 * keep an `enabled` flag so the widget can toggle without losing the
 * pending color / size / opacity / intensity values.
 *
 * `ring` is the cap (waterline / sol cap / atmo cap, every layer).
 * `floorRing` is the seabed twin drawn under liquid hovers — independent
 * params so the user can tint the underwater outline differently.
 */
export interface RingParams {
  enabled: boolean
  color:   string
  size:    number
  opacity: number
}

export interface HoverCursorParams {
  ring:      RingParams
  floorRing: RingParams
  emissive: {
    enabled:   boolean
    color:     string
    intensity: number
    size:      number
  }
}

export const HOVER_CURSOR_DEFAULTS: HoverCursorParams = {
  ring:      { enabled: true, color: '#ffffff', size: 1, opacity: 1 },
  floorRing: { enabled: true, color: '#9ad9ff', size: 1, opacity: 0.7 },
  emissive:  { enabled: true, color: '#ffffff', intensity: 1.5, size: 0.6 },
}

/** Tunable bounds for the slider controls. */
export const HOVER_CURSOR_RANGES = {
  ringSize:          { min: 0.5,  max: 3,    step: 0.1  },
  ringOpacity:       { min: 0,    max: 1,    step: 0.05 },
  emissiveIntensity: { min: 0,    max: 5,    step: 0.1  },
  emissiveSize:      { min: 0.05, max: 2,    step: 0.05 },
} as const

export const hoverCursorParams = reactive<HoverCursorParams>(
  structuredClone(HOVER_CURSOR_DEFAULTS),
)

/**
 * Resolves the playground reactive params to the lib's `HoverCursorConfig`
 * shape. Disabled primitives collapse to `false` so the lib mutes them
 * even if the construction-time defaults were enabled.
 */
export function resolveHoverCursorConfig(p: HoverCursorParams): HoverCursorConfig {
  return {
    ring: p.ring.enabled
      ? { color: p.ring.color, size: p.ring.size, opacity: p.ring.opacity }
      : false,
    floorRing: p.floorRing.enabled
      ? { color: p.floorRing.color, size: p.floorRing.size, opacity: p.floorRing.opacity }
      : false,
    emissive: p.emissive.enabled
      ? { color: p.emissive.color, intensity: p.emissive.intensity, size: p.emissive.size }
      : false,
  }
}
