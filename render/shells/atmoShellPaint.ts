/**
 * Per-tile paint pipeline for the atmosphere shell.
 *
 * The shell carries a vertex `color` attribute that the shader masks on
 * `max(r, g, b)` to decide between procedural tint and caller-supplied
 * tile paint. The painter pre-computes the K nearest tiles (and their
 * normalised blend weights) for every shell vertex once at build time,
 * so the runtime paint loop is a single allocation-free pass over the
 * vertex buffer.
 *
 * Smooth dégradés between adjacent painted tiles come from K=3: the
 * weighted average of the three nearest tiles produces a soft edge that
 * the procedural FBm pattern then breaks up — no visible polygon
 * boundaries on the icosphere even at low subdivisions.
 */

import * as THREE from 'three'
import type { Tile } from '../../geometry/hexasphere.types'
import { buildSphericalKNearestLookup } from '../hex/sphericalTileLookup'

/** Per-tile RGB triple consumed by `AtmoShellPainter.paintFromTiles`. */
export interface AtmoShellRGB {
  r: number
  g: number
  b: number
}

/**
 * Maximum number of tiles blended into each shell vertex. K=3 gives smooth
 * edges between adjacent hex centres; raising it would only smear the
 * paint further at no visible benefit on the ~2.5k shell vertices.
 */
export const SHELL_PAINT_K = 3

/** Painter handle returned by {@link createAtmoShellPainter}. */
export interface AtmoShellPainter {
  /**
   * Stamps per-tile RGB into the shell's vertex colour buffer using a
   * K-nearest blend. Tiles missing from `colors` simply don't contribute;
   * vertices whose K-nearest neighbourhood is fully unpainted are reset
   * to `(0, 0, 0)` so the shader falls back to the procedural tint.
   *
   * No-op when the painter was built without `tiles` (decorative shell
   * with no gameplay link).
   */
  paintFromTiles: (colors: Map<number, AtmoShellRGB>) => void
}

/**
 * Builds the painter for an atmosphere shell. When `tiles` is empty or
 * undefined, the returned `paintFromTiles` is a no-op — the shell stays
 * purely procedural.
 *
 * The colour attribute is mutated in place; the painter flips
 * `needsUpdate` on the attribute so Three.js re-uploads it on the next
 * frame.
 */
export function createAtmoShellPainter(input: {
  pos:       THREE.BufferAttribute
  colorAttr: THREE.BufferAttribute
  tiles:     readonly Tile[] | undefined
}): AtmoShellPainter {
  const { pos, colorAttr, tiles } = input
  const colorBuf = colorAttr.array as Float32Array

  if (!tiles || tiles.length === 0) {
    return { paintFromTiles: () => { /* no tile mapping — purely procedural shell */ } }
  }

  const paintK        = Math.min(SHELL_PAINT_K, tiles.length)
  const lookup        = buildSphericalKNearestLookup(tiles, paintK)
  const vertexTileIds = new Int32Array(pos.count * SHELL_PAINT_K)
  const vertexWeights = new Float32Array(pos.count * SHELL_PAINT_K)
  for (let i = 0; i < pos.count; i++) {
    lookup(pos.getX(i), pos.getY(i), pos.getZ(i), vertexTileIds, vertexWeights, i * SHELL_PAINT_K)
  }

  return {
    paintFromTiles(colors) {
      if (colors.size === 0) return
      const vertCount = pos.count
      for (let i = 0; i < vertCount; i++) {
        // Accumulate the weighted contribution of the K nearest tiles.
        // Tiles missing from `colors` simply don't contribute — the
        // remaining weights drive the blend, no fade-to-black artefact.
        let r = 0, g = 0, b = 0, w = 0
        const base = i * paintK
        for (let p = 0; p < paintK; p++) {
          const rgb = colors.get(vertexTileIds[base + p])
          if (!rgb) continue
          const wp = vertexWeights[base + p]
          r += rgb.r * wp
          g += rgb.g * wp
          b += rgb.b * wp
          w += wp
        }
        if (w === 0) {
          // No painted tile in the K-nearest neighbourhood — clear so the
          // shader falls back to the uniform tint instead of holding a
          // stale colour from a previous distribution.
          colorBuf[i * 3]     = 0
          colorBuf[i * 3 + 1] = 0
          colorBuf[i * 3 + 2] = 0
          continue
        }
        const inv = 1 / w
        colorBuf[i * 3]     = r * inv
        colorBuf[i * 3 + 1] = g * inv
        colorBuf[i * 3 + 2] = b * inv
      }
      colorAttr.needsUpdate = true
    },
  }
}
