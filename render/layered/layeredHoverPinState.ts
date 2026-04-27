/**
 * Hover + pin state machine for the layered interactive mesh.
 *
 * The orchestrator (`buildLayeredInteractiveMesh`) keeps geometry, materials,
 * raycast proxies and the colour buffer; this module owns the hover / pin
 * id bookkeeping, the listener set, and the rebuild of the hover ring at
 * the right cap height. Splitting it out keeps the orchestrator focused on
 * scene-graph assembly while the state-machine stays trivially testable.
 *
 * The module is pure logic over a small set of ports — it has no
 * knowledge of `activeView` or per-tile sol heights; the orchestrator
 * exposes those facts via the `getTileCapOffset` port. That single
 * port is the only construction-time function injection: passing it once
 * (rather than as a method argument) keeps the public method surface
 * callback-free.
 */

import type * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import type { HoverConfig } from '../../config/render'
import type { HoverListener } from '../hex/hexMeshShared'
import type { HoverPlacementOptions } from '../../types/bodyHandle.types'
import type { RGB } from '../../types/bodyHandle.types'
import type { buildLayeredHoverRing } from './layeredHoverRing'

type HoverRing = ReturnType<typeof buildLayeredHoverRing>

/** Construction-time ports — read once, never mutated from the outside. */
export interface LayeredHoverPinPorts {
  /** Hover ring renderer — owns the GPU resource, rebuilt by this module. */
  hoverRing:        HoverRing
  /** Tile lookup by id — orchestrator-owned cache. */
  tileById:         Map<number, Tile>
  /** Per-tile visual snapshot — used for the hover ring tint. */
  tileVisual:       Map<number, RGB>
  /** Hover overlay visual config (`surfaceOffset`, fill / border…). */
  hoverConfig:      HoverConfig
  /** Body root group — the ring is mounted as a child of it. */
  group:            THREE.Group
  /**
   * Resolves the radial offset (relative to `solSurfaceRadius`) at which the
   * ring should sit for a given tile. The orchestrator computes this from
   * its `activeView` + `solHeightByTile` state — captured once at
   * construction so the state-machine never reads the orchestrator
   * directly.
   */
  getTileCapOffset: (tileId: number) => number
}

/** Public surface — methods only, no callback arguments. */
export interface LayeredHoverPinState {
  setHover(tileId: number | null, options?: HoverPlacementOptions): void
  setPinnedTile(tileId: number | null, options?: HoverPlacementOptions): void
  onHoverChange(listener: HoverListener): () => void
  /**
   * Re-places the hover / pin rings at their current tile if it appears in
   * `affectedTileIds`. Called by the orchestrator after a sol-height
   * mutation (dig) so the ring sticks to the new cap.
   */
  refreshAffected(affectedTileIds: ReadonlyMap<number, unknown>): void
  /** Current hovered tile id — used by `tileBaseVisual` consumers. */
  getHoverId():  number | null
  /** Current pinned tile id. */
  getPinnedId(): number | null
}

type HoverOpts = HoverPlacementOptions | undefined

function shallowEqualOpts(a: HoverOpts, b: HoverOpts): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.capOffsetFromRadius === b.capOffsetFromRadius
}

/**
 * Creates the hover / pin state machine. The returned handle exposes the
 * mutating setters consumed by the public `LayeredInteractiveMesh` surface;
 * internal bookkeeping (last options, listener set, current ids) stays
 * encapsulated here.
 */
export function createLayeredHoverPinState(
  ports: LayeredHoverPinPorts,
): LayeredHoverPinState {
  const { hoverRing, tileById, tileVisual, hoverConfig, group, getTileCapOffset } = ports

  let currentHoverId:    number | null = null
  let currentPinnedId:   number | null = null
  let lastHoverOptions:  HoverOpts     = undefined
  let lastPinnedOptions: HoverOpts     = undefined
  const hoverListeners                 = new Set<HoverListener>()

  function applyHoverRing(tileId: number, options?: HoverOpts): void {
    const tile = tileById.get(tileId)
    if (!tile) {
      hoverRing.hideHover()
      return
    }
    const capOffset = options?.capOffsetFromRadius ?? getTileCapOffset(tileId)
    const tint      = tileVisual.get(tileId) ?? { r: 1, g: 1, b: 1 }
    hoverRing.showHover(tile, capOffset, hoverConfig.surfaceOffset, tint, group)
  }

  function applyPinnedRing(tileId: number, options?: HoverOpts): void {
    const tile = tileById.get(tileId)
    if (!tile) {
      hoverRing.hidePin()
      return
    }
    const capOffset = options?.capOffsetFromRadius ?? getTileCapOffset(tileId)
    hoverRing.showPin(tile, capOffset, hoverConfig.surfaceOffset, group)
  }

  function setHover(tileId: number | null, options?: HoverOpts): void {
    // Opts-only refresh path: caller passes the same id with new options
    // to relocate an existing ring (e.g. the cap appeared / disappeared
    // between frames). `tileId === currentHoverId` short-circuits the
    // no-op early-return below.
    if (tileId === currentHoverId && shallowEqualOpts(options, lastHoverOptions)) return
    currentHoverId   = tileId
    lastHoverOptions = options
    for (const cb of hoverListeners) cb(tileId)

    if (tileId === null) {
      hoverRing.hideHover()
      return
    }
    applyHoverRing(tileId, options)
  }

  function setPinnedTile(tileId: number | null, options?: HoverOpts): void {
    currentPinnedId   = tileId
    lastPinnedOptions = options
    if (tileId === null) {
      hoverRing.hidePin()
      return
    }
    applyPinnedRing(tileId, options)
  }

  function onHoverChange(listener: HoverListener): () => void {
    hoverListeners.add(listener)
    return () => { hoverListeners.delete(listener) }
  }

  function refreshAffected(affectedTileIds: ReadonlyMap<number, unknown>): void {
    if (currentHoverId  !== null && affectedTileIds.has(currentHoverId)) {
      applyHoverRing(currentHoverId, lastHoverOptions)
    }
    if (currentPinnedId !== null && affectedTileIds.has(currentPinnedId)) {
      applyPinnedRing(currentPinnedId, lastPinnedOptions)
    }
  }

  return {
    setHover,
    setPinnedTile,
    onHoverChange,
    refreshAffected,
    getHoverId:  () => currentHoverId,
    getPinnedId: () => currentPinnedId,
  }
}
