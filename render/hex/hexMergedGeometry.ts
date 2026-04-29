/**
 * Merged hex-tile geometry — the shared base used by both the raycast
 * proxy mesh (`buildPlanetMesh`) and the interactive hex mesh
 * (`buildInteractiveMesh`). Kept internal to the hex-mesh cluster so
 * external consumers only see the finished meshes.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TerrainLevel } from '../types/terrain.types'
import type { BodySimulation } from '../../sim/BodySimulation'
import { getTileLevel } from './hexMeshShared'
import { buildPrismGeometry } from './hexPrismGeometry'
import { hasSurfaceLiquid } from '../../physics/body'

/** Folds emissive into the base channel, clamped to [0, 1]. */
function foldEmissive(base: number, emissive: number | undefined, intensity: number): number {
  return Math.min(1, base + (emissive ?? 0) * intensity)
}

/** Vertex range in the merged buffer for a single tile. */
export interface TileVertexRange { start: number; count: number }

/** Aggregate returned by {@link buildMergedGeometry} — geometry + hover lookups. */
export interface MergedGeometry {
  geometry:        THREE.BufferGeometry
  faceToTileId:    number[]
  tileVertexRange: Map<number, TileVertexRange>
}

/**
 * Builds the merged hex geometry used by the focused body renderer.
 *
 * Every tile is extruded into a prism (top cap + walls); when the body
 * carries a liquid surface, the walls extend down to the deepest palette
 * band so the shore seals without gap. Vertex buffers (color, roughness,
 * metalness, land-flag, tile center, tile radius) are pre-baked so the
 * downstream shader can read them directly.
 *
 * The output geometry is a single merged `BufferGeometry`; shaders can
 * still index per-tile vertex ranges via the returned `tileVertexRange`
 * map (e.g. to repaint a tile's colour on hover without touching the
 * whole buffer).
 */
export function buildMergedGeometry(
  sim:    BodySimulation,
  levels: TerrainLevel[],
): MergedGeometry {
  const geometries:     THREE.BufferGeometry[]         = []
  const faceToTileId:   number[]                       = []
  const tileVertexRange = new Map<number, TileVertexRange>()

  // Liquid surfaces seal the shoreline by extending every prism's walls
  // down to the deepest palette level — otherwise land tiles would expose
  // a gap where their bottom meets the (lower) neighbouring ocean-floor
  // tile's top. Frozen and dry bodies don't need the basement extension,
  // and gaseous/metallic/star configs never do regardless of `liquidState`.
  const surfaceIsLiquid = hasSurfaceLiquid(sim.config)
    && sim.config.type === 'planetary'
    && sim.config.liquidState === 'liquid'
  const basementHeight  = surfaceIsLiquid ? levels[0].height : 0

  let vertexOffset = 0

  for (const tile of sim.tiles) {
    const state     = sim.tileStates.get(tile.id)!
    const level     = getTileLevel(state.elevation, levels)
    const geo       = buildPrismGeometry(tile, level.height, basementHeight)
    const faceCount = geo.getAttribute('position').count / 3
    for (let f = 0; f < faceCount; f++) faceToTileId.push(tile.id)

    const vertCount = geo.getAttribute('position').count
    tileVertexRange.set(tile.id, { start: vertexOffset, count: vertCount })
    vertexOffset += vertCount

    // Bake the palette-only visual for the tile: base colour folded with
    // the palette's emissive (lava on volcanic rocky, sun granulation on
    // stars). Resource-aware tinting now lives entirely off-lib — callers
    // paint on top via `body.tiles.sol.applyOverlay` after construction.
    const rough         = level.roughness         ?? 0.85
    const metal         = level.metalness         ?? 0.0
    const emissive      = level.emissive
    const emissiveI     = level.emissiveIntensity ?? 0
    const r             = foldEmissive(level.color.r, emissive?.r, emissiveI)
    const g             = foldEmissive(level.color.g, emissive?.g, emissiveI)
    const b             = foldEmissive(level.color.b, emissive?.b, emissiveI)

    const colors   = new Float32Array(vertCount * 3)
    const roughArr = new Float32Array(vertCount)
    const metalArr = new Float32Array(vertCount)
    for (let i = 0; i < vertCount; i++) {
      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b
      roughArr[i]   = rough
      metalArr[i]   = metal
    }
    // Land flag forwarded to the terrain bump shader. Submerged tiles
    // (negative world-space height on liquid surfaces) skip the bump so
    // the ocean floor stays flat under the smooth liquid sphere.
    const landFlag = (surfaceIsLiquid && level.height < 0) ? 0.0 : 1.0
    const landArr  = new Float32Array(vertCount)
    for (let i = 0; i < vertCount; i++) {
      landArr[i] = landFlag
    }

    // Tile center + average boundary radius for edge blending shader.
    // The center is extruded to the top surface so the distance computation
    // in the fragment shader is in the same plane as the visible top face.
    const { centerPoint, boundary } = tile
    const cLen   = Math.sqrt(centerPoint.x ** 2 + centerPoint.y ** 2 + centerPoint.z ** 2)
    const cScale = (cLen + level.height) / cLen
    const cx = centerPoint.x * cScale
    const cy = centerPoint.y * cScale
    const cz = centerPoint.z * cScale
    let avgR = 0
    for (const bp of boundary) {
      const bLen = Math.sqrt(bp.x ** 2 + bp.y ** 2 + bp.z ** 2)
      const bScale = (bLen + level.height) / bLen
      const dx = bp.x * bScale - cx
      const dy = bp.y * bScale - cy
      const dz = bp.z * bScale - cz
      avgR += Math.sqrt(dx * dx + dy * dy + dz * dz)
    }
    avgR /= boundary.length

    const tileCenterArr = new Float32Array(vertCount * 3)
    const tileRadiusArr = new Float32Array(vertCount)
    for (let i = 0; i < vertCount; i++) {
      tileCenterArr[i * 3]     = cx
      tileCenterArr[i * 3 + 1] = cy
      tileCenterArr[i * 3 + 2] = cz
      tileRadiusArr[i]         = avgR
    }

    geo.setAttribute('color',        new THREE.Float32BufferAttribute(colors,        3))
    geo.setAttribute('aRoughness',   new THREE.Float32BufferAttribute(roughArr,      1))
    geo.setAttribute('aMetalness',   new THREE.Float32BufferAttribute(metalArr,      1))
    geo.setAttribute('aLand',        new THREE.Float32BufferAttribute(landArr,       1))
    geo.setAttribute('aTileCenter',  new THREE.Float32BufferAttribute(tileCenterArr, 3))
    geo.setAttribute('aTileRadius',  new THREE.Float32BufferAttribute(tileRadiusArr, 1))
    geometries.push(geo)
  }

  const geometry = mergeGeometries(geometries)
  geometries.forEach(g => g.dispose())
  return { geometry, faceToTileId, tileVertexRange }
}
