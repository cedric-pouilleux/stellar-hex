import * as THREE from 'three'
import type { Tile } from '../geometry/hexasphere.types'
import type { TerrainLevel } from '../types/body.types'
import {
  buildTileRing,
  buildFillPositions,
  buildBorderPositions,
  buildSideBorderPositions,
} from './useHexasphereMesh'

/**
 * Resolves the geometry context for a tile (tile data + terrain level) used by
 * overlay primitives. Returned from {@link TileGeometryQuery} callbacks.
 */
export interface TileGeometryContext {
  tile:  Tile
  level: TerrainLevel
}

/** Lookup function resolving a tile id to its geometry context. */
export type TileGeometryQuery = (tileId: number) => TileGeometryContext | null

/**
 * Visual layout modes supported by {@link createTileOverlayMesh}.
 *
 * - `fill`        — triangle fan covering the top face of each tile.
 * - `border`      — thin inset perimeter ring on the top face.
 * - `fill-sides`  — triangle fan on the top face plus the entire side wall strip.
 * - `border-sides`— inset border on the top face plus the entire side wall strip.
 */
export type TileOverlayKind = 'fill' | 'border' | 'fill-sides' | 'border-sides'

/**
 * Configuration for a single overlay layer rendered on top of the hex mesh.
 * All distances are in world units; all angles/fractions are normalised.
 */
export interface TileOverlayOptions {
  /** Base overlay color. */
  color:         number | THREE.Color
  /** Alpha applied to the material. */
  opacity?:      number
  /** Optional blending override (defaults to normal). */
  blending?:     THREE.Blending
  /** Layout variant (fill / border / with sides). */
  kind:          TileOverlayKind
  /** Radial offset added to the baseline surface offset of the body. */
  surfaceOffset: number
  /** Border width as a fraction of tile avg radius (border kinds only). */
  borderWidth?:  number
  /** Ring expand factor applied to fill kinds (0 = flush with boundary). */
  ringExpand?:   number
  /** THREE renderOrder for the mesh. */
  renderOrder?:  number
  /** Starts hidden; call setTiles to reveal. */
  initiallyVisible?: boolean
}

/**
 * Handle returned by {@link createTileOverlayMesh}. Wraps a reusable mesh
 * whose geometry is rebuilt on demand to cover a given set of tiles.
 */
export interface TileOverlayMesh {
  /** Underlying THREE mesh — caller adds/removes from any parent group. */
  mesh: THREE.Mesh
  /**
   * Rebuilds the overlay geometry for the given tiles. Pass null or an
   * empty array to hide the overlay.
   */
  setTiles(tileIds: number[] | null): void
  /** Disposes the geometry + material. */
  dispose(): void
}

const DEFAULT_BORDER_WIDTH = 0.15

/**
 * Creates a reusable tile-overlay mesh — a shared geometry that can be
 * rebuilt at any time to cover an arbitrary set of tiles with a single
 * merged draw call.
 *
 * @param query - Resolves tile id → geometry context (tile data + level).
 * @param opts  - Visual options (color, layout, offset, blending).
 */
export function createTileOverlayMesh(
  query: TileGeometryQuery,
  opts:  TileOverlayOptions,
): TileOverlayMesh {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3))

  const material = new THREE.MeshBasicMaterial({
    color:       opts.color,
    transparent: (opts.opacity ?? 1.0) < 1.0 || opts.blending !== undefined,
    opacity:     opts.opacity ?? 1.0,
    blending:    opts.blending ?? THREE.NormalBlending,
    depthWrite:  false,
    side:        THREE.FrontSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = opts.renderOrder ?? 2
  mesh.visible     = opts.initiallyVisible ?? false

  const borderWidth = opts.borderWidth ?? DEFAULT_BORDER_WIDTH
  const ringExpand  = opts.ringExpand  ?? 0

  function setTiles(tileIds: number[] | null): void {
    if (!tileIds || tileIds.length === 0) {
      mesh.visible = false
      return
    }

    const positions: number[] = []
    for (const tileId of tileIds) {
      const ctx = query(tileId)
      if (!ctx) continue
      const { tile, level } = ctx
      const { center, ring, avgRadius } = buildTileRing(
        tile, level.height, opts.surfaceOffset, ringExpand,
      )

      if (opts.kind === 'fill' || opts.kind === 'fill-sides') {
        const top = buildFillPositions(center, ring)
        for (const n of top) positions.push(n)
      }
      if (opts.kind === 'border' || opts.kind === 'border-sides') {
        const bor = buildBorderPositions(center, ring, avgRadius, borderWidth)
        for (const n of bor) positions.push(n)
      }
      if (opts.kind === 'fill-sides' || opts.kind === 'border-sides') {
        const side = buildSideBorderPositions(tile, level.height, opts.surfaceOffset, level.height)
        for (const n of side) positions.push(n)
      }
    }

    if (positions.length === 0) {
      mesh.visible = false
      return
    }

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
    )
    geometry.attributes.position.needsUpdate = true
    geometry.computeBoundingSphere()
    mesh.visible = true
  }

  function dispose(): void {
    geometry.dispose()
    material.dispose()
  }

  return { mesh, setTiles, dispose }
}
