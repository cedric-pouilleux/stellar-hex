/**
 * Render-scoped body options — visual overrides the `sim` layer does not
 * know about. Kept separate from {@link BodyConfig} so the pure-logic surface
 * (`sim.ts`) stays free of any render-only concept (palettes, colours…).
 */

import type { TerrainLevel } from './terrain.types'

/**
 * Optional render-time overrides passed to the render factory (`useBody`,
 * `BodyController`, …). Every field is an override: omitting the whole
 * object reproduces the default visual pipeline.
 */
export interface BodyRenderOptions {
  /**
   * Terrain palette override. When set, replaces the palette auto-chosen
   * from the body type (rocky / metallic / gaseous / star). Consumers that
   * only tweak the low/high anchors of the rocky ramp should use
   * `BodyConfig.terrainColorLow` / `terrainColorHigh` instead — this full
   * override is reserved for caller-side classifications (biomes, climate
   * zones…) that need a per-band palette.
   */
  palette?: TerrainLevel[]
}
