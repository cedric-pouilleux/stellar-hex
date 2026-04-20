/**
 * Pure logic for a two-handle temperature range slider.
 *
 * The UI binds to a `{ min, max }` pair inside the absolute `[absoluteMin, absoluteMax]`
 * domain and guarantees `min + minGap <= max`. Every helper here is side-effect free
 * so the component can stay a thin reactive wrapper.
 */

/** Absolute bounds and minimum gap enforced between the two handles. */
export interface RangeBounds {
  absoluteMin: number
  absoluteMax: number
  /** Minimum gap between `min` and `max`. Defaults to 1 when omitted. */
  minGap?:     number
}

/** Current range values. */
export interface RangeValues {
  min: number
  max: number
}

/** Clamp `v` to `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

/**
 * Normalize `value` into `[0, 1]` for the given absolute bounds.
 * Returns 0 when the domain collapses (`absoluteMax <= absoluteMin`).
 */
export function toRatio(value: number, absoluteMin: number, absoluteMax: number): number {
  const span = absoluteMax - absoluteMin
  if (span <= 0) return 0
  return clamp((value - absoluteMin) / span, 0, 1)
}

/**
 * Commit a new `min` value while keeping `max - min >= minGap`
 * and both handles inside `[absoluteMin, absoluteMax]`.
 * The max handle is pushed up if the new min would cross it.
 */
export function commitMin(nextMin: number, current: RangeValues, bounds: RangeBounds): RangeValues {
  const gap = bounds.minGap ?? 1
  const lo  = bounds.absoluteMin
  const hi  = bounds.absoluteMax - gap
  const min = clamp(nextMin, lo, hi)
  const max = Math.max(current.max, min + gap)
  return { min, max: clamp(max, bounds.absoluteMin, bounds.absoluteMax) }
}

/**
 * Commit a new `max` value while keeping `max - min >= minGap`
 * and both handles inside `[absoluteMin, absoluteMax]`.
 * The min handle is pushed down if the new max would cross it.
 */
export function commitMax(nextMax: number, current: RangeValues, bounds: RangeBounds): RangeValues {
  const gap = bounds.minGap ?? 1
  const lo  = bounds.absoluteMin + gap
  const hi  = bounds.absoluteMax
  const max = clamp(nextMax, lo, hi)
  const min = Math.min(current.min, max - gap)
  return { min: clamp(min, bounds.absoluteMin, bounds.absoluteMax), max }
}

/**
 * Thermal gradient used as the slider track background.
 * Stops are spaced so the sub-zero palette dominates when the domain
 * is symmetric around 0°C (roughly matching human perception).
 */
export const TEMPERATURE_GRADIENT_STOPS: ReadonlyArray<{ stop: number; color: string }> = [
  { stop: 0.00, color: '#1a2f7a' }, // deep cold
  { stop: 0.22, color: '#2f7ecb' }, // cold blue
  { stop: 0.42, color: '#6dc1e0' }, // cool cyan
  { stop: 0.55, color: '#f0ecc0' }, // temperate
  { stop: 0.72, color: '#f0a040' }, // warm
  { stop: 0.88, color: '#d04020' }, // hot
  { stop: 1.00, color: '#7a0a0a' }, // extreme
]

/** Returns a `linear-gradient(90deg, …)` CSS string from the thermal stops. */
export function temperatureGradientCss(): string {
  const stops = TEMPERATURE_GRADIENT_STOPS
    .map(s => `${s.color} ${(s.stop * 100).toFixed(0)}%`)
    .join(', ')
  return `linear-gradient(90deg, ${stops})`
}
