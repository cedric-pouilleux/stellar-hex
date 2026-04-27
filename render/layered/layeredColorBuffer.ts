/**
 * Color buffer manager for the layered interactive mesh.
 *
 * Owns the geometry's `color` attribute and exposes the three primitives
 * the orchestrator needs to drive per-tile tinting:
 *
 *   - `writeTileColor(tileId, rgb)`     — stamp on both sol + atmo bands
 *     (used by the unified resource overlays where the atmo band reads
 *     the same colour as the sol prism so the overlay survives the
 *     view toggle).
 *   - `applyTileOverlay(layer, colors)` — stamp on a single band
 *     (sol-only resource overlays, atmo-only gas tinting…).
 *   - `paintTile(tileId, rgb)` (alias of `writeTileColor` semantics, kept
 *     for the sea-level repaint path that pre-resolves a {@link TileVisual}
 *     and writes its r/g/b into both bands).
 *
 * Each method flips `needsUpdate` itself so the orchestrator does not have
 * to track the dirty flag — one attribute, one source of truth.
 */

import * as THREE from 'three'
import type { LayeredTileRange } from './buildLayeredMesh'
import type { InteractiveLayer } from './buildLayeredInteractiveMesh'

/** Plain RGB triple — kept local to avoid importing the public `RGB` type. */
interface RGB { r: number; g: number; b: number }

/** Public surface for the layered color buffer. */
export interface LayeredColorBuffer {
  /**
   * Stamps `rgb` on every vertex of a tile's **sol** band only. The atmo
   * band keeps its own colour buffer (empty by default → falls back to the
   * shader's uniform tint, painted explicitly via {@link applyTileOverlay}
   * `('atmo', …)` when gameplay needs per-tile atmospheric resource hues).
   * Mixing the two would leak sol-driven shades (e.g. the dark band-0
   * colour on mined tiles) into the playable atmo grid as black blotches.
   * Marks the attribute dirty for the next render.
   */
  writeTileColor(tileId: number, rgb: RGB): void
  /**
   * Stamps per-tile colours on a single band (sol or atmo). Lets overlay
   * renderers tint one layer without touching the other. Marks dirty
   * once at the end of the batch — pass an empty map to no-op cleanly.
   */
  applyTileOverlay(layer: InteractiveLayer, colors: Map<number, RGB>): void
  /**
   * Identical effect to {@link writeTileColor} but exposed as a separate
   * entry point because the sea-level repaint path resolves a full
   * `TileVisual` (carrying r/g/b plus PBR metadata) and only writes the
   * colour channel. Keeping the two named callers makes the intent of
   * each call site obvious.
   */
  paintTile(tileId: number, rgb: RGB): void
}

/**
 * Builds the color buffer manager.
 *
 * Allocates the `Float32Array` of size `vertCount × 3`, attaches it to
 * the geometry as the `color` attribute, runs the initial fill from the
 * supplied `tileVisuals` map, and returns the runtime helpers.
 *
 * @param geometry    - Layered geometry already carrying position/normal/aSolHeight.
 * @param tileRange   - Per-tile sol + atmo vertex ranges.
 * @param tileVisuals - Initial tile-visual cache (already populated by the orchestrator).
 */
export function buildLayeredColorBuffer(
  geometry:    THREE.BufferGeometry,
  tileRange:   ReadonlyMap<number, LayeredTileRange>,
  tileVisuals: ReadonlyMap<number, RGB>,
): LayeredColorBuffer {
  const vertCount = geometry.getAttribute('position').count
  const colors    = new Float32Array(vertCount * 3)

  // ── Initial fill ────────────────────────────────────────────────
  // Sol-only — the atmo band starts at (0, 0, 0) so the atmo shader falls
  // back to its uniform tint until the caller paints atmospheric
  // resources explicitly via `applyTileOverlay('atmo', …)`.
  for (const [tileId, vis] of tileVisuals) {
    const range = tileRange.get(tileId)
    if (!range) continue
    fillRange(colors, range.sol.start, range.sol.count, vis)
  }

  const colorAttr = new THREE.Float32BufferAttribute(colors, 3)
  geometry.setAttribute('color', colorAttr)

  function writeTileColor(tileId: number, rgb: RGB): void {
    const range = tileRange.get(tileId)
    if (!range) return
    setRangeRGB(colorAttr, range.sol.start, range.sol.count, rgb)
    colorAttr.needsUpdate = true
  }

  function applyTileOverlay(layer: InteractiveLayer, perTile: Map<number, RGB>): void {
    if (perTile.size === 0) return
    for (const [tileId, rgb] of perTile) {
      const range = tileRange.get(tileId)
      if (!range) continue
      const slice = layer === 'sol' ? range.sol : range.atmo
      setRangeRGB(colorAttr, slice.start, slice.count, rgb)
    }
    colorAttr.needsUpdate = true
  }

  function paintTile(tileId: number, rgb: RGB): void {
    writeTileColor(tileId, rgb)
  }

  return { writeTileColor, applyTileOverlay, paintTile }
}

// ── Local helpers ────────────────────────────────────────────────────

/** Fills `vertCount * 3` floats starting at `start * 3` with the same RGB. */
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

/** Writes `rgb` over a vertex slice of a `BufferAttribute` (no dirty flag — caller flips once). */
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
