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
 * Only `rocky` bodies can hold a liquid surface — gaseous, metallic and
 * stars are explicitly excluded regardless of the `liquidState` value on
 * the config. Using this helper everywhere keeps the sim layer (liquid
 * coverage, sea level) and the render layer (liquid sphere, sea anchors,
 * shore basements) in lockstep — a gas giant accidentally configured with
 * `liquidState: 'liquid'` still renders dry.
 */
export function hasSurfaceLiquid(config: {
  type:         BodyType
  liquidState?: 'liquid' | 'frozen' | 'none'
}): boolean {
  if (config.type !== 'rocky') return false
  return (config.liquidState ?? 'none') !== 'none'
}
