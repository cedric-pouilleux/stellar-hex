/**
 * Planet and star mesh factories built on top of the merged hex
 * geometry. `buildPlanetMesh` returns a raycast-proxy mesh used by legacy
 * consumers (star path); `buildStarSmoothMesh` returns the animated
 * smooth-sphere display mesh for stars.
 */

import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TerrainLevel } from '../types/terrain.types'
import type { BodySimulation } from '../../sim/BodySimulation'
import type { BodyVariation } from './bodyVariation'
import { BodyMaterial } from '../../shaders'
import { configToLibParams } from './configToLibParams'
import { getTileLevel } from '../hex/hexMeshShared'
import { buildMergedGeometry } from '../hex/hexMergedGeometry'
import { resolveSphereDetail, type RenderQuality } from '../quality/renderQuality'
/** Folds emissive into the base channel, clamped to [0, 1]. */
function addEmissive(base: number, emissive: number | undefined, intensity: number): number {
  return Math.min(1, base + (emissive ?? 0) * intensity)
}

/**
 * Builds a merged hex-tile mesh for raycast / display purposes.
 * When the body carries a liquid surface, the explicit ocean tiles are
 * skipped so the smooth water sphere can render on top.
 *
 * @param sim    - Pre-computed body simulation (tiles + elevations).
 * @param levels - Terrain palette driving vertex colours and heights.
 * @returns      - The mesh and a face→tile id lookup for hover queries.
 */
export function buildPlanetMesh(
  sim:    BodySimulation,
  levels: TerrainLevel[],
): { mesh: THREE.Mesh; faceToTileId: number[] } {
  const { geometry, faceToTileId } = buildMergedGeometry(sim, levels)
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, side: THREE.FrontSide }),
  )
  return { mesh, faceToTileId }
}

/**
 * Builds an animated star-surface sphere using the lib `BodyMaterial`.
 *
 * Indexed sphere (like rocky) as overview display — animated star shader
 * baked with per-vertex granulation colors derived from the star palette
 * + elevation. The raycast / interactive swap is handled by the star
 * factory via `buildInteractiveMesh` hex tiles when the camera focuses
 * the star.
 */
export function buildStarSmoothMesh(
  sim:        BodySimulation,
  levels:     TerrainLevel[],
  variation?: BodyVariation,
  options?:   { quality?: RenderQuality },
): { mesh: THREE.Mesh; tick: (dt: number) => void; planetMaterial: InstanceType<typeof BodyMaterial> } {
  const { config, elevationAt } = sim
  const noiseScale = config.noiseScale ?? 1.4
  const segs       = Math.max(24, Math.min(
    Math.round(noiseScale * 48),
    Math.round(Math.sqrt(sim.tiles.length) * 3.5),
  ))
  // Icosphere instead of UV-sphere: no polar singularity, so granulation /
  // emissive bands stay even across the disc. `mergeVertices` restores the
  // indexed topology so the per-vertex emissive paint stays seamless.
  const baseDetail = Math.max(2, Math.min(5, Math.ceil(Math.log2(segs / 4))))
  const detail     = resolveSphereDetail(baseDetail, options?.quality)
  const geo        = mergeVertices(new THREE.IcosahedronGeometry(config.radius, detail))
  const pos        = geo.getAttribute('position') as THREE.BufferAttribute
  const col        = new Float32Array(pos.count * 3)

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const n     = elevationAt(x, y, z)
    const level = getTileLevel(n, levels)
    // Bake emissive luminance into vertex color so the granulation pattern
    // is visible even before the shader adds its own glow.
    const ei = level.emissiveIntensity ?? 0
    col[i * 3]     = addEmissive(level.color.r, level.emissive?.r, ei)
    col[i * 3 + 1] = addEmissive(level.color.g, level.emissive?.g, ei)
    col[i * 3 + 2] = addEmissive(level.color.b, level.emissive?.b, ei)
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))

  const params    = configToLibParams(config, variation)
  const planetMat = new BodyMaterial('star', params, { vertexColors: true })
  const mesh      = new THREE.Mesh(geo, planetMat.material)
  let elapsed     = 0
  const tick      = (dt: number) => { elapsed += dt; planetMat.tick(elapsed) }
  return { mesh, tick, planetMaterial: planetMat }
}
