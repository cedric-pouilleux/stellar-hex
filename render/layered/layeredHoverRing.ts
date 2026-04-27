/**
 * Hover + pin ring renderer for the layered interactive mesh.
 *
 * Owns a thin pre-allocated quad-strip mesh that traces the boundary of a
 * single hex tile. Two API entry points:
 *
 *   - `showHover(...)` / `hideHover()` — draws the visible ring + publishes
 *     the hover-channel slot read by `<TileCenterProjector>`.
 *   - `showPin(...)`   / `hidePin()`   — silent twin: no border render, just
 *     publishes the pin-channel slot read by `<PinnedTileProjector>`.
 *
 * The hover-id state machine (current id, dedup of redundant set calls,
 * listener fan-out) lives in the orchestrator — this module is a pure
 * renderer that takes resolved inputs (`tile`, `capOffset`, `tint`,
 * `parentGroup`) and writes them onto the GPU buffer + the hover channel.
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import type { HoverChannel } from '../state/hoverState'
import type { HoverConfig } from '../../config/render'
import { buildTileRing, buildBorderPositions } from '../hex/hexTileGeometry'

/**
 * Border width as a fraction of a tile's average boundary radius. Matches
 * the legacy mesh's visual — roughly 3–4 px stroke at typical zoom.
 */
const BORDER_WIDTH = 0.15

/**
 * Pre-allocated buffer capacity — sized for the worst case (a hex tile,
 * 6 edges × 2 triangles × 3 vertices × 3 floats). Pentagon tiles use less
 * and have their tail masked off via `setDrawRange`.
 */
const MAX_BORDER_FLOATS = 6 * 2 * 3 * 3

/** Reusable Color scratch for tinting (avoid per-frame allocations). */
const _hoverColor = new THREE.Color()
const _white      = new THREE.Color(1, 1, 1)

/** Plain RGB triple — kept local to avoid pulling the public `RGB` type. */
interface RGB { r: number; g: number; b: number }

/** Public surface for the layered hover ring renderer. */
export interface LayeredHoverRing {
  /** The border mesh — caller adds it to the body group. */
  mesh: THREE.Mesh
  /**
   * Renders a hover ring on `tile` at the given cap height offset. The
   * tint is lerped toward white before being assigned to the border
   * material so it seeds the bloom pass; pass the tile's pre-blend
   * RGB and the renderer handles the rest.
   *
   * @param tile         - Tile geometry (centerPoint + boundary).
   * @param capOffset    - Hex-cap height offset from the body's surface
   *                       radius (positive = above, negative = below).
   * @param surfaceOffset - Z-bias above the cap to avoid z-fighting.
   * @param tint         - Pre-blend tile RGB used to colour the ring.
   * @param parentGroup  - Group whose `matrixWorld` projects the ring
   *                       onto screen — typically the body's root group.
   */
  showHover(
    tile:          Tile,
    capOffset:     number,
    surfaceOffset: number,
    tint:          RGB,
    parentGroup:   THREE.Object3D,
  ): void
  /** Hides the visible ring and clears the hover channel slot. */
  hideHover(): void
  /**
   * Publishes a tile center into the pin channel slot — same projection
   * pipeline as the hover ring but no visible mesh (the pin marker is
   * a separate caller-side overlay, this module only owns the anchor).
   */
  showPin(
    tile:          Tile,
    capOffset:     number,
    surfaceOffset: number,
    parentGroup:   THREE.Object3D,
  ): void
  /** Clears the pin channel slot. */
  hidePin(): void
  /** Disposes the border geometry and material. Idempotent. */
  dispose(): void
}

/**
 * Builds the hover/pin ring renderer.
 *
 * @param hoverChannel - Per-body publication channel (hover + pin slots).
 * @param hoverCfg     - Visual tuning (ring expand, border colour, …).
 *                       Currently consumed for `surfaceOffset` only —
 *                       passed in for symmetry with the ring builder.
 */
export function buildLayeredHoverRing(
  hoverChannel: HoverChannel,
  _hoverCfg:    HoverConfig,
): LayeredHoverRing {
  // The border is rebuilt on every hover-id change — swapping a new
  // `Float32BufferAttribute` each time forces a fresh WebGL VBO alloc
  // plus a full re-upload, which piles up when the cursor traverses
  // many tiles per second. We pre-allocate the attribute once at the
  // tightest hex capacity and rewrite it in place via `setDrawRange`,
  // so a hover update becomes a `Float32Array.set(...)` plus a
  // `needsUpdate` flag — no allocation, no `computeBoundingSphere`.
  const borderGeo  = new THREE.BufferGeometry()
  const borderAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_BORDER_FLOATS), 3)
  borderAttr.setUsage(THREE.DynamicDrawUsage)
  borderGeo.setAttribute('position', borderAttr)
  const borderMat  = new THREE.MeshBasicMaterial({
    color:       0xffffff,
    transparent: true,
    opacity:     1.0,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    depthTest:   false,
    side:        THREE.DoubleSide,
  })
  const borderMesh = new THREE.Mesh(borderGeo, borderMat)
  borderMesh.renderOrder   = 1
  borderMesh.visible       = false
  // The border is tiny and always anchored on a body that is already in
  // the frustum. Skipping frustum-culling removes the bounding-sphere
  // recompute that would otherwise fire on every hover change.
  borderMesh.frustumCulled = false

  function showHover(
    tile:          Tile,
    capOffset:     number,
    surfaceOffset: number,
    tint:          RGB,
    parentGroup:   THREE.Object3D,
  ): void {
    const { center, ring, avgRadius } = buildTileRing(tile, capOffset, surfaceOffset, 0)
    const borderPos = buildBorderPositions(center, ring, avgRadius, BORDER_WIDTH)
    // Rewrite the pre-allocated attribute in place. `setDrawRange` caps
    // the draw to the actual vertex count so pentagons (90 floats, 30
    // vertices) don't read the stale hex tail from the buffer.
    const floats = Math.min(borderPos.length, MAX_BORDER_FLOATS)
    borderAttr.array.set(borderPos.subarray(0, floats), 0)
    borderAttr.needsUpdate = true
    borderGeo.setDrawRange(0, floats / 3)
    borderMesh.visible = true

    _hoverColor.setRGB(tint.r, tint.g, tint.b).lerp(_white, 0.5).multiplyScalar(3.0)
    borderMat.color.copy(_hoverColor)

    hoverChannel.hoverLocalPos.value    = center.clone()
    hoverChannel.hoverParentGroup.value = parentGroup
  }

  function hideHover(): void {
    borderMesh.visible                  = false
    hoverChannel.hoverLocalPos.value    = null
    hoverChannel.hoverParentGroup.value = null
  }

  function showPin(
    tile:          Tile,
    capOffset:     number,
    surfaceOffset: number,
    parentGroup:   THREE.Object3D,
  ): void {
    const { center } = buildTileRing(tile, capOffset, surfaceOffset, 0)
    hoverChannel.pinLocalPos.value    = center.clone()
    hoverChannel.pinParentGroup.value = parentGroup
  }

  function hidePin(): void {
    hoverChannel.pinLocalPos.value    = null
    hoverChannel.pinParentGroup.value = null
  }

  function dispose(): void {
    borderGeo.dispose()
    borderMat.dispose()
  }

  return { mesh: borderMesh, showHover, hideHover, showPin, hidePin, dispose }
}
