import type * as THREE from 'three'
import type { BodyConfig } from '../../types/body.types'
import type { TerrainLevel } from './terrain.types'
import type { BodyVariation } from '../body/bodyVariation'
import type { ShadowUniforms } from '../hex/hexMeshShared'
import type { HoverChannel } from '../state/hoverState'
import type { GraphicsUniforms } from '../hex/hexGraphicsUniforms'
import type { BodyInteractive, BodyHover, BodyLiquid, BodyView } from './bodyHandle.types'

/**
 * Minimal rendering contract consumed by the scene-level `<Body>` component.
 *
 * Any object that produces a Three.js group + a per-frame tick + the
 * deterministic variation handle can be rendered, independently of how it was
 * produced (solar-system pipeline, standalone `useBody()` call, an editor,
 * a unit test scene, …). This interface deliberately excludes every
 * consumer-specific concern (overlays, application-level callbacks) so that
 * `<Body>` remains reusable in any runtime that speaks the same rendering
 * contract.
 *
 * A full handle returned by `useBody()` (see {@link Body}) satisfies this
 * contract structurally — the scene components read the subset they need.
 */
export interface RenderableBody {
  /** Root THREE group — meshes and shells attach under it. */
  group:     THREE.Group
  /** Physical + display parameters (radius, atmosphere, axial tilt, …). */
  config:    BodyConfig
  /** Deterministic visual variation (ring config, shader params). */
  variation: BodyVariation
  /**
   * Effective terrain palette used by this body — forwarded by `useBody` so
   * consumers of the rendering contract (shell anchors, overlay shaders) can
   * read the same palette the internal meshes use.
   */
  palette?:  TerrainLevel[]
  /** Per-frame tick driven by the scene's render loop. */
  tick:      (dt: number) => void
  /**
   * Optional shadow uniforms — when present, a child body can cast an eclipse
   * shadow on this body via `ShadowUpdater`.
   */
  shadowUniforms?: ShadowUniforms
  /**
   * Optional per-body hover/pin channel. Forwarded by `useBody`; surfaced
   * here so `<Body>` can wire the projectors without leaking the underlying
   * handle.
   */
  hoverChannel?:    HoverChannel
  /**
   * Optional per-body graphics uniform bag. Forwarded by `useBody`; surfaced
   * here so `<Body>` can pass it down to the cloud shell.
   */
  graphicsUniforms?: GraphicsUniforms
  /**
   * Interactive mode + raycast queries. Optional so lightweight consumers
   * (editors, tests) can satisfy the interface without mounting a
   * tile-picking mesh.
   */
  interactive?: BodyInteractive
  /** Controlled tile hover / pin / body-hover setters (scene-controller driven). */
  hover?:       BodyHover
  /** Surface liquid controls. Absent on dry bodies and stars. */
  liquid?:      BodyLiquid
  /** View toggle (`'surface'` vs `'atmosphere'`). Absent on stars. */
  view?:        BodyView
  /**
   * Returns the world radius of the opaque inner core sphere. Present on
   * all non-stellar bodies.
   */
  getCoreRadius?:    () => number
  /**
   * Returns the world radius of the outer surface (= `config.radius`).
   * Present on all non-stellar bodies; kept symmetric with `getCoreRadius`.
   */
  getSurfaceRadius?: () => number
}
