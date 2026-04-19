import type * as THREE from 'three'
import type { BodyConfig, OrbitConfig } from './body.types'
import type { BodyVariation } from '../render/bodyVariation'
import type { ShadowUniforms } from '../render/useHexasphereMesh'

/**
 * Minimal rendering contract consumed by the scene-level `<Body>` component.
 *
 * Any object that produces a Three.js group + a per-frame tick + the
 * deterministic variation handle can be rendered, independently of how it was
 * produced (solar-system pipeline, standalone `useBody()` call, an editor,
 * a unit test scene, …). This interface deliberately excludes every
 * consumer-specific concern (overlays, application-level callbacks) so that `<Body>`
 * remains reusable in any runtime that speaks the same rendering contract.
 */
export interface RenderableBody {
  /** Root THREE group — meshes and shells attach under it. */
  group:     THREE.Group
  /** Physical + display parameters (radius, temperatures, atmosphere, …). */
  config:    BodyConfig
  /** Optional orbit definition. Omit for a fixed body (star at the origin, or a standalone preview). */
  orbit?:    OrbitConfig
  /** Deterministic visual variation (ring config, shader params). */
  variation: BodyVariation
  /** Per-frame tick driven by the scene's render loop. */
  tick:      (dt: number) => void
  /**
   * Optional shadow uniforms — when present, a child body can cast an eclipse
   * shadow on this body via `ShadowUpdater`.
   */
  shadowUniforms?: ShadowUniforms
  /**
   * Pure raycast → tile id resolution. Returns null when the body is not in
   * interactive mode or when the ray misses. Side-effect-free: scene
   * controllers may call this to detect hover/click without mutating any
   * visual state. Optional so that lightweight consumers (editors, tests) can
   * satisfy the interface without mounting a tile-picking mesh.
   */
  queryHover?: (raycaster: THREE.Raycaster) => number | null
  /**
   * Apply a tile-hover highlight. Driven by `Body.vue` from a controlled
   * `hoveredTileId` prop — external consumers should not call this directly.
   */
  setHover?: (tileId: number | null) => void
  /**
   * Apply a pinned-tile marker. Driven by `Body.vue` from a controlled
   * `pinnedTileId` prop — external consumers should not call this directly.
   */
  setPinnedTile?: (tileId: number | null) => void
  /**
   * Apply a body-level hover ring. Driven by `Body.vue` from a controlled
   * `bodyHover` prop — external consumers should not call this directly.
   */
  setBodyHover?: (visible: boolean) => void
  /** Activate tile-level interactive rendering (hex mesh + fills). */
  activateInteractive?:   () => void
  /** Deactivate tile-level interactive rendering (back to smooth display). */
  deactivateInteractive?: () => void
}
