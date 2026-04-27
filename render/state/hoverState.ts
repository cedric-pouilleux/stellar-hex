import * as THREE from 'three'

/**
 * Minimal mutable ref shape — `{ value: T }`. Plain Vue-free shape so any
 * Three.js consumer (scene controllers, projectors, off-Vue callers) can
 * read or write the field without pulling a reactivity runtime.
 */
export interface MutableRef<T> {
  value: T
}

/**
 * Per-body hover / pin publication channel.
 *
 * Body factories write into the four refs when the user hovers or pins a
 * tile; scene-level projectors (e.g. `TileCenterProjector`,
 * `PinnedTileProjector`) read them every frame to project the local-space
 * tile center to screen pixels.
 *
 * Each body owns its own channel — multi-body scenes can therefore host
 * several hovered or pinned tiles concurrently without cross-body
 * interference. Callers that want a single global hover slot (popover UX)
 * can pass the same channel into multiple bodies via
 * `useBody(config, tileSize, { hoverChannel })`.
 */
export interface HoverChannel {
  /**
   * Local-space position of the currently hovered tile center, or `null`
   * when no tile is hovered. Transformed to world-space each frame by the
   * scene projector using {@link hoverParentGroup}'s `matrixWorld`.
   */
  hoverLocalPos:    MutableRef<THREE.Vector3 | null>
  /**
   * Parent group whose `matrixWorld` transforms {@link hoverLocalPos} to
   * world space. Set to the body's root group when a tile is hovered.
   */
  hoverParentGroup: MutableRef<THREE.Object3D | null>
  /**
   * Local-space position of the tile currently pinned by the popover, or
   * `null`. Tracked independently from the hover ring so the popover
   * anchor keeps following the planet's rotation even after the cursor
   * leaves the tile.
   */
  pinLocalPos:      MutableRef<THREE.Vector3 | null>
  /** Parent group whose `matrixWorld` transforms {@link pinLocalPos} to world space. */
  pinParentGroup:   MutableRef<THREE.Object3D | null>
}

/**
 * Builds a fresh {@link HoverChannel}. Each call returns an independent
 * set of refs so a multi-body scene can give every body its own channel:
 *
 * ```ts
 * const mars  = useBody(marsConfig,  tileSize)   // channel auto-created
 * const venus = useBody(venusConfig, tileSize)   // its own channel
 *
 * <TileCenterProjector :channel="mars.hoverChannel"  ... />
 * <TileCenterProjector :channel="venus.hoverChannel" ... />
 * ```
 *
 * Callers that want a shared global slot (single popover UX, single
 * tooltip in the HUD) build one channel up-front and pass it to every
 * body via the `hoverChannel` option of `useBody`.
 */
export function createHoverChannel(): HoverChannel {
  return {
    hoverLocalPos:    { value: null },
    hoverParentGroup: { value: null },
    pinLocalPos:      { value: null },
    pinParentGroup:   { value: null },
  }
}
