/**
 * Color buffer manager for the sol interactive mesh.
 *
 * Owns the geometry's `color` attribute and exposes the primitives the
 * orchestrator needs to drive per-tile tinting:
 *
 *   - `writeTileColor(tileId, rgb)` — stamp every vertex of a tile.
 *   - `applyTileOverlay(colors)`    — bulk overlay (one pass over the map).
 *   - `paintTile(tileId, rgb)`      — alias of `writeTileColor`, exposed
 *     separately because the sea-level repaint path resolves a full
 *     `TileVisual` and only writes the colour channel; keeping the names
 *     distinct makes the call sites easy to read.
 *
 * Each method flips `needsUpdate` itself so the orchestrator does not have
 * to track the dirty flag — one attribute, one source of truth.
 */

import * as THREE from 'three'
import type { LayeredTileRange } from './buildLayeredMesh'

/** Plain RGB triple — kept local to avoid importing the public `RGB` type. */
interface RGB { r: number; g: number; b: number }

/** Public surface for the sol color buffer. */
export interface LayeredColorBuffer {
  /** Stamps `rgb` on every vertex of a tile. Marks dirty for the next render. */
  writeTileColor(tileId: number, rgb: RGB): void
  /**
   * Stamps per-tile colours from a map. Marks dirty once at the end of the
   * batch — pass an empty map to no-op cleanly.
   */
  applyTileOverlay(colors: Map<number, RGB>): void
  /** Identical effect to {@link writeTileColor} — exposed under a separate name for the sea-level repaint path. */
  paintTile(tileId: number, rgb: RGB): void
}

/**
 * Builds the color buffer manager. Allocates the `Float32Array` of size
 * `vertCount × 3`, attaches it to the geometry as the `color` attribute,
 * runs the initial fill from the supplied `tileVisuals`, and returns the
 * runtime helpers.
 *
 * @param geometry    - Sol geometry already carrying position/normal/aSolHeight.
 * @param tileRange   - Per-tile vertex ranges in the merged buffer.
 * @param tileVisuals - Initial tile-visual cache (already populated by the orchestrator).
 */
export function buildLayeredColorBuffer(
  geometry:    THREE.BufferGeometry,
  tileRange:   ReadonlyMap<number, LayeredTileRange>,
  tileVisuals: ReadonlyMap<number, RGB>,
): LayeredColorBuffer {
  const vertCount = geometry.getAttribute('position').count
  const colors    = new Float32Array(vertCount * 3)

  for (const [tileId, vis] of tileVisuals) {
    const range = tileRange.get(tileId)
    if (!range) continue
    fillRange(colors, range.start, range.count, vis)
  }

  const colorAttr = new THREE.Float32BufferAttribute(colors, 3)
  geometry.setAttribute('color', colorAttr)

  function writeTileColor(tileId: number, rgb: RGB): void {
    const range = tileRange.get(tileId)
    if (!range) return
    setRangeRGB(colorAttr, range.start, range.count, rgb)
    colorAttr.needsUpdate = true
  }

  function applyTileOverlay(perTile: Map<number, RGB>): void {
    if (perTile.size === 0) return
    for (const [tileId, rgb] of perTile) {
      const range = tileRange.get(tileId)
      if (!range) continue
      setRangeRGB(colorAttr, range.start, range.count, rgb)
    }
    colorAttr.needsUpdate = true
  }

  function paintTile(tileId: number, rgb: RGB): void {
    writeTileColor(tileId, rgb)
  }

  return { writeTileColor, applyTileOverlay, paintTile }
}

// ── Local helpers ────────────────────────────────────────────────────

/** Fills `count * 3` floats starting at `start * 3` with the same RGB. */
function fillRange(
  buf:   Float32Array,
  start: number,
  count: number,
  rgb:   RGB,
): void {
  for (let i = start; i < start + count; i++) {
    buf[i * 3]     = rgb.r
    buf[i * 3 + 1] = rgb.g
    buf[i * 3 + 2] = rgb.b
  }
}

/** Writes `rgb` over a vertex slice of a `BufferAttribute`. */
function setRangeRGB(
  attr:  THREE.BufferAttribute,
  start: number,
  count: number,
  rgb:   RGB,
): void {
  for (let i = start; i < start + count; i++) {
    attr.setXYZ(i, rgb.r, rgb.g, rgb.b)
  }
}
