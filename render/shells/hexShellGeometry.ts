/**
 * Shared geometry helpers for stacked hex shells (frozen ice cap, liquid
 * water cap). Both shells share the same primitive — one merged hex prism
 * per submerged tile, top at the waterline, walls down to the tile's own
 * mineral cap — but layer their own material and mutation API on top.
 *
 * Centralising the geometry build, the per-tile vertex slots and the
 * `writeTilePrism` re-extrusion keeps the two shells in lockstep on the
 * topology contract: same vertex layout (top fan first, walls after),
 * same `faceToTileId` mapping, same height conventions. Caller code in
 * `buildSolidShell` and `buildLiquidShell` only adds a material + a few
 * tile-level mutations.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Tile } from '../../geometry/hexasphere.types'
import type { TerrainLevel } from '../../types/terrain.types'
import { buildPrismGeometry, buildPrismTopFanGeometry } from '../hex/hexPrismGeometry'

/** Per-tile vertex slot in the merged shell buffer. */
export interface TileSlot {
  tile:     Tile
  /** Underlying mineral elevation (band space) — wall starts here. */
  baseBand: number
  /** First vertex of the slot in the merged buffer. */
  start:    number
  /** Vertex count owned by this slot in the merged buffer. */
  count:    number
}

/** Inputs to {@link buildHexShellGeometry}. */
export interface HexShellGeometryConfig {
  tiles:         readonly Tile[]
  baseElevation: ReadonlyMap<number, number>
  topElevation:  number
  palette:       TerrainLevel[]
  bodyRadius:    number
  coreRadius:    number
  /**
   * When `true`, only the top fan of each prism is emitted — no walls.
   * Used by the liquid shell where the cap is a flat surface at the
   * waterline (a column of water has no visible "side" on a translucent
   * sheet). Defaults to `false` (full prism, ice-cap style).
   */
  topOnly?:      boolean
}

/** Output of {@link buildHexShellGeometry}. */
export interface HexShellGeometry {
  /** Merged non-indexed buffer geometry, one prism per eligible tile. */
  merged:        THREE.BufferGeometry
  /** Per-tile slot — addresses the slot's vertex range in `merged`. */
  slots:         readonly TileSlot[]
  /** O(1) tile id → slot lookup. */
  slotByTileId:  Map<number, TileSlot>
  /** `faceToTileId[i]` returns the tile id of the i-th triangle. */
  faceToTileId:  readonly number[]
  /** Live position attribute reference — patched by `writeTilePrism`. */
  positionAttr:  THREE.BufferAttribute
  /** Live normal attribute reference — patched by `writeTilePrism`. */
  normalAttr:    THREE.BufferAttribute
  /** Bridge between the prism extrusion frame and the body's coreRadius. */
  heightOffset:  number
  /** Mutable per-tile current top band — updated by callers on mutation. */
  currentTopBand: Map<number, number>
}

/**
 * Linearly interpolates between palette band heights so a fractional band
 * resolves to a smooth world-space height. Out-of-range bands clamp.
 */
export function bandToWorldHeight(band: number, palette: TerrainLevel[]): number {
  const N = palette.length
  if (N === 0) return 0
  const clamped = Math.max(0, Math.min(N - 1, band))
  const lo = Math.floor(clamped)
  const hi = Math.min(N - 1, lo + 1)
  const frac = clamped - lo
  return palette[lo].height + (palette[hi].height - palette[lo].height) * frac
}

/**
 * Re-extrudes the prism geometry of a tile into the shared position
 * buffer at the tile's known vertex range. Used both at build time and
 * at runtime (mining, sea-level slider).
 *
 * When `topBand <= baseBand` the prism is fully collapsed: every vertex
 * of the slot range — top cap AND walls — is forced onto the tile's base
 * centre point. All triangles thus degenerate (zero-area), the GPU drops
 * them at primitive-assembly time, and the raycaster never hits them.
 *
 * `heightOffset` shifts every band height to the absolute world frame
 * `buildPrismGeometry` expects (`tileLen + delta`).
 *
 * `topOnly` mirrors {@link HexShellGeometryConfig.topOnly}: when `true`,
 * only the top fan is rewritten — the slot was built without walls so
 * there's nothing else to patch.
 */
export function writeTilePrism(
  positions:    Float32Array,
  normals:      Float32Array,
  slot:         TileSlot,
  topBand:      number,
  palette:      TerrainLevel[],
  heightOffset: number,
  topOnly = false,
): void {
  const baseHeight = bandToWorldHeight(slot.baseBand, palette) + heightOffset
  const clampedTop = Math.max(slot.baseBand, topBand)
  const topHeight  = bandToWorldHeight(clampedTop, palette)    + heightOffset

  if (clampedTop <= slot.baseBand) {
    const c   = slot.tile.centerPoint
    const len = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z) || 1
    const scale = (len + baseHeight) / len
    const cx = c.x * scale, cy = c.y * scale, cz = c.z * scale
    const nx = c.x / len,   ny = c.y / len,   nz = c.z / len
    const start = slot.start * 3
    const end   = (slot.start + slot.count) * 3
    for (let i = start; i < end; i += 3) {
      positions[i]     = cx
      positions[i + 1] = cy
      positions[i + 2] = cz
      normals[i]       = nx
      normals[i + 1]   = ny
      normals[i + 2]   = nz
    }
    return
  }

  const geo = topOnly
    ? buildPrismTopFanGeometry(slot.tile, topHeight)
    : buildPrismGeometry(slot.tile, topHeight, baseHeight)
  const src = geo.getAttribute('position').array as Float32Array
  const nrm = geo.getAttribute('normal').array   as Float32Array

  positions.set(src, slot.start * 3)
  normals.set(nrm, slot.start * 3)

  // Pad any unused tail with the base centre so leftover triangles stay
  // degenerate (a micro-thin prism may emit fewer vertices than the slot
  // allocated at build time).
  const writtenFloats = src.length
  const totalFloats   = slot.count * 3
  if (writtenFloats < totalFloats) {
    const c   = slot.tile.centerPoint
    const len = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z) || 1
    const scale = (len + baseHeight) / len
    const cx = c.x * scale, cy = c.y * scale, cz = c.z * scale
    const start = slot.start * 3 + writtenFloats
    const end   = (slot.start + slot.count) * 3
    for (let i = start; i < end; i += 3) {
      positions[i]     = cx
      positions[i + 1] = cy
      positions[i + 2] = cz
      normals[i]       = c.x / len
      normals[i + 1]   = c.y / len
      normals[i + 2]   = c.z / len
    }
  }

  geo.dispose()
}

/**
 * Builds the merged hex-shell geometry from a set of tiles. Tiles missing
 * from `baseElevation`, or whose base sits at or above `topElevation`,
 * are skipped. The result is always a single non-indexed buffer ready to
 * be wrapped in a mesh by the caller — material choice + mutation API
 * are intentionally NOT included here.
 *
 * Returns `null` when no tile is eligible — lets the caller decide
 * whether to allocate a placeholder mesh or skip rendering entirely.
 */
export function buildHexShellGeometry(config: HexShellGeometryConfig): HexShellGeometry | null {
  const { tiles, baseElevation, topElevation, palette, bodyRadius, coreRadius, topOnly = false } = config

  // The sol mesh extrudes from coreRadius; `buildPrismGeometry` extrudes
  // from the tile's own length (= bodyRadius). The offset bridges the two
  // so the cap walls meet the underlying mineral cap exactly.
  const heightOffset = coreRadius - bodyRadius

  const slots:       TileSlot[]            = []
  const geometries:  THREE.BufferGeometry[] = []
  const slotByTileId = new Map<number, TileSlot>()
  const currentTopBand = new Map<number, number>()

  let vertexOffset = 0
  for (const tile of tiles) {
    const base = baseElevation.get(tile.id)
    if (base === undefined) continue
    if (base >= topElevation) continue

    const baseHeight = bandToWorldHeight(base, palette)         + heightOffset
    const topHeight  = bandToWorldHeight(topElevation, palette) + heightOffset
    const geo        = topOnly
      ? buildPrismTopFanGeometry(tile, topHeight)
      : buildPrismGeometry(tile, topHeight, baseHeight)
    const count      = geo.getAttribute('position').count

    const slot: TileSlot = { tile, baseBand: base, start: vertexOffset, count }
    slots.push(slot)
    slotByTileId.set(tile.id, slot)
    currentTopBand.set(tile.id, topElevation)
    geometries.push(geo)
    vertexOffset += count
  }

  if (geometries.length === 0) return null

  const merged = mergeGeometries(geometries)
  geometries.forEach(g => g.dispose())

  const faceToTileId: number[] = []
  for (const slot of slots) {
    const faces = slot.count / 3
    for (let f = 0; f < faces; f++) faceToTileId.push(slot.tile.id)
  }

  return {
    merged,
    slots,
    slotByTileId,
    faceToTileId,
    positionAttr: merged.getAttribute('position') as THREE.BufferAttribute,
    normalAttr:   merged.getAttribute('normal')   as THREE.BufferAttribute,
    heightOffset,
    currentTopBand,
  }
}

/**
 * Vertex-count of the top fan for a tile. The prism geometry emits the
 * top fan first (`n` triangles × 3 vertices, where `n` is the tile's
 * boundary length: 5 for pentagons, 6 for hexagons), so the first
 * `topFanVertexCount` vertices of a slot are guaranteed to belong to
 * the top cap.
 */
export function topFanVertexCount(tile: Tile): number {
  return tile.boundary.length * 3
}
