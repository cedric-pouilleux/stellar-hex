/**
 * Render-quality knobs for the body factory.
 *
 * Quality is a render-time concern, not physics — it doesn't belong on
 * `BodyConfig`. The lib accepts an optional {@link RenderQuality} bag at
 * `useBody(...)` and propagates the settings to the geometry builders.
 *
 * v1 ships a single knob, `sphereDetail`, that scales the icosphere
 * subdivision used by every spherical mesh of a body (smooth surface,
 * liquid sphere, atmo shell, corona, core, effect layer). The full
 * surface stays untouched on `'standard'` — the default — so existing
 * callers see no change.
 */

/** Quality preset for spherical geometries. */
export type SphereDetailQuality = 'standard' | 'high' | 'ultra'

/** Render-quality bag — one knob today, more to come. */
export interface RenderQuality {
  /**
   * Scales icosphere subdivision for every spherical mesh of a body.
   * `'standard'` (default) keeps the historical poly budget. `'high'`
   * bumps each mesh by one subdivision (≈ 4× tris); `'ultra'` bumps by
   * two (≈ 16× tris on the topmost meshes), both capped at
   * {@link MAX_SPHERE_DETAIL}.
   */
  sphereDetail?: SphereDetailQuality
}

/**
 * Hard cap for icosphere subdivision. Detail 7 ≈ 163 842 shared vertices
 * after `mergeVertices` — heavy but tractable on modern desktop GPUs.
 * Going higher (8 ≈ 655k) tips into territory where the visual gain
 * stops paying for the upload + raster cost.
 */
export const MAX_SPHERE_DETAIL = 7

/** Detail bump applied to a builder's "natural" base level per preset. */
const DETAIL_BUMP: Record<SphereDetailQuality, number> = {
  standard: 0,
  high:     1,
  ultra:    2,
}

/**
 * Resolves the icosphere `detail` level a builder should use given its
 * "natural" base level and the caller's quality bag.
 *
 * Rules:
 *  - `'standard'` (or no quality bag) → returns `baseDetail` unchanged.
 *  - `'high'`                          → returns `min(baseDetail + 1, MAX_SPHERE_DETAIL)`.
 *  - `'ultra'`                         → returns `min(baseDetail + 2, MAX_SPHERE_DETAIL)`.
 *
 * @param baseDetail - The level the builder would have picked on its own.
 * @param quality    - Optional render-quality bag from the caller.
 */
export function resolveSphereDetail(
  baseDetail: number,
  quality?:   RenderQuality,
): number {
  const preset = quality?.sphereDetail ?? 'standard'
  return Math.min(baseDetail + DETAIL_BUMP[preset], MAX_SPHERE_DETAIL)
}
