/**
 * Public API of the body feature — Vue entry point.
 * All external consumers (components, pages) should import from here.
 *
 * Re-exports the pure-core API from `./core` and augments it with the
 * Vue-coupled surface: scene components built on top of the Three.js core.
 *
 * For a Vue-free consumption (vanilla Three.js, other frameworks),
 * import from `./core` directly.
 */

// ── Pure core (shaders, geometry, physics, simulation, builders…) ──
export * from './core'

// ── Scene controllers ────────────────────────────────────────────
export { default as Body } from './scene/Body.vue'
export { default as PinnedTileProjector } from './scene/PinnedTileProjector.vue'
export { default as BodyController } from './scene/BodyController.vue'
export { default as BodyRings } from './scene/BodyRings.vue'
export { default as ShadowUpdater } from './scene/ShadowUpdater.vue'
export { default as TileCenterProjector } from './scene/TileCenterProjector.vue'
