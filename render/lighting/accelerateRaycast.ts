/**
 * BVH-accelerated raycast for a single mesh instance.
 *
 * Attaches a {@link MeshBVH} to the mesh's geometry and overrides
 * `raycast` on the instance (not on `THREE.Mesh.prototype`). Keeps the
 * acceleration opt-in per mesh and avoids polluting the global prototype
 * chain of consumers that embed this library.
 *
 * The merged hex mesh used for hover queries carries ~18 triangles per
 * tile × several thousand tiles (≈ 90k tris on a dense star). Native
 * Three.js raycasting tests every triangle — at 60 fps that is millions
 * of ray/triangle intersections per second on the CPU and causes the
 * hover-induced fps drop observed on the star's hex view.
 *
 * `MeshBVH` brings that cost down to `O(log n)` with a one-time build
 * (bounded by tree construction — a few ms for 90k tris).
 */

import type * as THREE from 'three'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'

/** three-mesh-bvh reads `this.geometry.boundsTree`; we attach it without patching globals. */
interface BVHGeometry extends THREE.BufferGeometry {
  boundsTree?: MeshBVH
}

/**
 * Builds a BVH on the mesh's geometry and swaps the instance `raycast`
 * method for the accelerated implementation.
 *
 * `indirect: true` is load-bearing. The default BVH constructor rearranges
 * triangles in-place for a more compact traversal buffer, which breaks
 * consumers that rely on the original face ordering (our `faceToTileId`
 * lookup does: see `interactiveController.queryHover` → `faceToTileId[
 * hit.faceIndex]`). With reordering, hit face indices no longer map to
 * their original tile ids and hover fires a random tile every frame —
 * the border/listeners avalanche is slower than the native raycast.
 * Indirect mode keeps the geometry untouched at the cost of one extra
 * indirection per hit, a negligible overhead for our use case.
 *
 * @param mesh - Target mesh whose raycast queries should be accelerated.
 * @returns    - A disposer that clears the BVH reference and restores the
 *               native raycast, so callers don't leak memory when the mesh
 *               is disposed.
 */
export function accelerateRaycast(mesh: THREE.Mesh): () => void {
  const geo = mesh.geometry as BVHGeometry
  geo.boundsTree = new MeshBVH(geo, { indirect: true })
  const nativeRaycast = mesh.raycast
  mesh.raycast = acceleratedRaycast

  return () => {
    geo.boundsTree = undefined
    mesh.raycast   = nativeRaycast
  }
}
