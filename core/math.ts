/**
 * Numeric utilities used by body rendering and shader derivation.
 * Kept internal to body so the feature can be published standalone.
 */

/** Clamp value v to [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Clamp value to [0, 1]. */
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Linear interpolation from a to b by factor t (clamped to [0,1]). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}
