import * as THREE from 'three'

/**
 * Shared module-level state for tile hover tracking.
 * Written by the hex mesh hover logic, read by the tile projectors every frame
 * inside their render loop — reactivity is **not** required, so plain mutable
 * refs are used (no Vue dependency). This keeps `features/body/render/*` and
 * this module usable in any Three.js app.
 */

export interface MutableRef<T> {
  value: T
}

/**
 * Local-space position of the currently hovered tile center, or null if none.
 * Transformed to world-space each frame by TileCenterProjector using
 * `hoverParentGroup`'s `matrixWorld`.
 */
export const hoverLocalPos: MutableRef<THREE.Vector3 | null> = { value: null }

/** Parent group whose matrixWorld transforms `hoverLocalPos` to world space. */
export const hoverParentGroup: MutableRef<THREE.Object3D | null> = { value: null }

/**
 * Local-space position of the tile currently pinned by the popover, or null.
 * Tracked independently of the hover ring so the popover anchor keeps following
 * the planet's rotation even after the cursor leaves the tile.
 */
export const pinLocalPos: MutableRef<THREE.Vector3 | null> = { value: null }

/** Parent group whose matrixWorld transforms `pinLocalPos` to world space. */
export const pinParentGroup: MutableRef<THREE.Object3D | null> = { value: null }
