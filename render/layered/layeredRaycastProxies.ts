/**
 * Per-view raycast proxies for the layered interactive mesh.
 *
 * Stores two non-indexed subset geometries — one carrying only sol triangles,
 * the other only atmo triangles — each wrapped in a dummy mesh that hosts an
 * accelerated `MeshBVH`. The proxies are never mounted in the scene graph;
 * the orchestrator copies the body group's `matrixWorld` onto the active
 * proxy at every raycast query.
 *
 * `firstHitOnly` raycasts on the layered mesh would otherwise return the
 * closest triangle across both layers (an atmo face occluding a sol face is
 * a common false positive on a planet where the sol band sits inside the
 * atmo halo). By keeping each layer's BVH isolated, the raycaster sees only
 * the geometry of the visible layer and the closest hit is always correct.
 *
 * Position mutations on the visible mesh (e.g. `updateTileSolHeight` after
 * a dig) must be mirrored into the proxies — otherwise hover queries drift
 * onto the previous frame's hex layout. The orchestrator drives this via
 * {@link LayeredRaycastProxies.mirrorTilePositions} per dirty tile, then
 * calls {@link LayeredRaycastProxies.flush} once at the end of the batch
 * to refit both BVHs.
 */

import * as THREE from 'three'
import { accelerateRaycast } from '../lighting/accelerateRaycast'
import type { RaycastState } from '../body/interactiveController'
import type { InteractiveView } from './buildLayeredInteractiveMesh'
import type { LayeredTileRange } from './buildLayeredMesh'

/** Per-tile vertex range inside a single proxy's position buffer. */
interface ProxyTileRange { start: number; count: number }

/** Internal handle for one of the two proxies (sol or atmo). */
interface RaycastProxy {
  mesh:            THREE.Mesh
  faceToTileId:    number[]
  /** Per-tile vertex range — mirrors are scheduled by tile id. */
  tileVertexRange: Map<number, ProxyTileRange>
}

/**
 * Builds a non-indexed subset mesh containing only the triangles of a
 * single layer, plus the matching face-to-tile lookup. Assumes the source
 * geometry is non-indexed — the hex prism builders emit that layout.
 */
function buildRaycastProxy(
  sourceGeo:          THREE.BufferGeometry,
  sourceFaceToTileId: number[],
  sourceFaceToLayer:  (0 | 1)[],
  targetLayer:        0 | 1,
): RaycastProxy {
  const srcPos    = sourceGeo.getAttribute('position').array as Float32Array
  const faceCount = sourceFaceToLayer.length

  let matching = 0
  for (let f = 0; f < faceCount; f++) if (sourceFaceToLayer[f] === targetLayer) matching++

  const positions       = new Float32Array(matching * 9)
  const faceToTileId    = new Array<number>(matching)
  const tileVertexRange = new Map<number, ProxyTileRange>()
  let writeFace = 0
  for (let f = 0; f < faceCount; f++) {
    if (sourceFaceToLayer[f] !== targetLayer) continue
    const tid = sourceFaceToTileId[f]
    let entry = tileVertexRange.get(tid)
    if (!entry) {
      entry = { start: writeFace * 3, count: 0 }
      tileVertexRange.set(tid, entry)
    }
    entry.count += 3
    positions.set(srcPos.subarray(f * 9, (f + 1) * 9), writeFace * 9)
    faceToTileId[writeFace] = tid
    writeFace++
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
  // Detached from every graph so the renderer never touches it; the
  // controller copies `group.matrixWorld` onto it each query.
  mesh.visible       = false
  mesh.frustumCulled = false
  return { mesh, faceToTileId, tileVertexRange }
}

/** Public surface for the raycast proxy pair. */
export interface LayeredRaycastProxies {
  /**
   * Resolves the raycast target for the active view. The sol view returns
   * its proxy with the body's `coreRadius` so the controller can mask hits
   * occluded by the inner core; the atmo view skips that mask (the atmo
   * shell sits outside the core entirely so no hit can ever be hidden).
   */
  getRaycastState(activeView: InteractiveView, coreRadius: number): RaycastState
  /**
   * Mirrors a tile's sol + atmo position slices from the source position
   * array into both proxies. Cheaper than rebuilding the proxy: only the
   * affected vertices are touched, and only the touched proxy gets a BVH
   * refit (deferred until {@link flush}).
   *
   * Pass the source geometry's full `position.array` plus the tile's
   * range inside it — the proxies handle the projection into their own
   * (smaller) buffers via the cached per-tile ranges.
   */
  mirrorTilePositions(
    tileId:     number,
    sourcePos:  Float32Array,
    tileRange:  LayeredTileRange,
  ): void
  /**
   * Flushes pending position writes into both proxies — flags
   * `position.needsUpdate` and refits each BVH. `refit()` is O(log n)
   * per touched leaf — cheaper than a full rebuild and correct since
   * we only mutate positions, never add/remove triangles.
   */
  flush(): void
  /** Releases the BVHs and the proxy geometries. Idempotent. */
  dispose(): void
}

/**
 * Builds the per-view raycast proxy pair for the layered mesh.
 *
 * @param sourceGeo          - Full layered geometry (sol + atmo merged).
 * @param sourceFaceToTileId - Face → tile id mapping for the source mesh.
 * @param sourceFaceToLayer  - Face → layer (0 = sol, 1 = atmo) for the source mesh.
 */
export function buildLayeredRaycastProxies(
  sourceGeo:          THREE.BufferGeometry,
  sourceFaceToTileId: number[],
  sourceFaceToLayer:  (0 | 1)[],
): LayeredRaycastProxies {
  const proxySol  = buildRaycastProxy(sourceGeo, sourceFaceToTileId, sourceFaceToLayer, 0)
  const proxyAtmo = buildRaycastProxy(sourceGeo, sourceFaceToTileId, sourceFaceToLayer, 1)
  const releaseSolBVH  = accelerateRaycast(proxySol.mesh)
  const releaseAtmoBVH = accelerateRaycast(proxyAtmo.mesh)

  const proxySolPos  = proxySol.mesh.geometry.getAttribute('position').array  as Float32Array
  const proxyAtmoPos = proxyAtmo.mesh.geometry.getAttribute('position').array as Float32Array

  function getRaycastState(activeView: InteractiveView, coreRadius: number): RaycastState {
    return activeView === 'surface'
      ? { mesh: proxySol.mesh,  faceToTileId: proxySol.faceToTileId,  coreRadius }
      : { mesh: proxyAtmo.mesh, faceToTileId: proxyAtmo.faceToTileId, coreRadius: 0 }
  }

  function mirrorTilePositions(
    tileId:    number,
    sourcePos: Float32Array,
    tileRange: LayeredTileRange,
  ): void {
    const solInProxy = proxySol.tileVertexRange.get(tileId)
    if (solInProxy) {
      proxySolPos.set(
        sourcePos.subarray(tileRange.sol.start * 3, (tileRange.sol.start + tileRange.sol.count) * 3),
        solInProxy.start * 3,
      )
    }
    const atmoInProxy = proxyAtmo.tileVertexRange.get(tileId)
    if (atmoInProxy) {
      proxyAtmoPos.set(
        sourcePos.subarray(tileRange.atmo.start * 3, (tileRange.atmo.start + tileRange.atmo.count) * 3),
        atmoInProxy.start * 3,
      )
    }
  }

  function flush(): void {
    const solPosAttr  = proxySol.mesh.geometry.getAttribute('position')  as THREE.BufferAttribute
    const atmoPosAttr = proxyAtmo.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    solPosAttr.needsUpdate  = true
    atmoPosAttr.needsUpdate = true
    const solBVH  = (proxySol.mesh.geometry  as { boundsTree?: { refit: () => void } }).boundsTree
    const atmoBVH = (proxyAtmo.mesh.geometry as { boundsTree?: { refit: () => void } }).boundsTree
    solBVH?.refit()
    atmoBVH?.refit()
  }

  function dispose(): void {
    releaseSolBVH()
    releaseAtmoBVH()
    proxySol.mesh.geometry.dispose()
    ;(proxySol.mesh.material as THREE.Material).dispose()
    proxyAtmo.mesh.geometry.dispose()
    ;(proxyAtmo.mesh.material as THREE.Material).dispose()
  }

  return { getRaycastState, mirrorTilePositions, flush, dispose }
}
