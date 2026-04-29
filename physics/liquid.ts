/**
 * Surface-liquid invariant — pure rule, no `three` import.
 *
 * Single source of truth consulted by every layer (sim, render) so the
 * "carries a surface liquid?" question always resolves to the same answer.
 */

import type { BodyType } from '../types/surface.types'

/**
 * Single source of truth for "does this body carry a surface liquid?".
 *
 * Stars never carry a surface liquid — there is no solid surface for one
 * to sit on. Every other body type (`rocky`, `gaseous`, `metallic` and
 * any future planetary archetype) honours `liquidState`: a metallic body
 * with `liquidState: 'liquid'` produces a liquid metal surface, a gaseous
 * body with `liquidState: 'liquid'` produces a deep ocean under its
 * envelope, and so on. Picking when that makes sense (composition,
 * temperature, biome) is a caller-side decision; the lib only carries the
 * resolved state.
 */
export function hasSurfaceLiquid(config: {
  type:         BodyType
  liquidState?: 'liquid' | 'frozen' | 'none'
}): boolean {
  if (config.type === 'star') return false
  return (config.liquidState ?? 'none') !== 'none'
}
