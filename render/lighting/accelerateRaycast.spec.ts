import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { accelerateRaycast } from './accelerateRaycast'

/**
 * Builds a trivial single-triangle mesh used as the system under test.
 * Three.js raycasting on this geometry is fast; we're not measuring perf,
 * only verifying the BVH wiring keeps the hit semantics intact and the
 * disposer unwinds cleanly.
 */
function buildTriangleMesh(): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, -1, 0,
     1, -1, 0,
     0,  1, 0,
  ], 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ], 3))
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
}

describe('accelerateRaycast', () => {
  it('attaches a BVH to the geometry and swaps the raycast method', () => {
    const mesh         = buildTriangleMesh()
    const nativeRay    = mesh.raycast
    const release      = accelerateRaycast(mesh)

    expect((mesh.geometry as { boundsTree?: unknown }).boundsTree).toBeDefined()
    expect(mesh.raycast).not.toBe(nativeRay)

    release()
  })

  it('still returns a hit for a ray aimed at the centre of the triangle', () => {
    const mesh = buildTriangleMesh()
    accelerateRaycast(mesh)

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 5),
      new THREE.Vector3(0, 0, -1),
    )
    const hits: THREE.Intersection[] = []
    mesh.raycast(raycaster, hits)
    expect(hits.length).toBe(1)
  })

  it('misses when the ray points away from the triangle', () => {
    const mesh = buildTriangleMesh()
    accelerateRaycast(mesh)

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 5),
      new THREE.Vector3(0, 0, 1),
    )
    const hits: THREE.Intersection[] = []
    mesh.raycast(raycaster, hits)
    expect(hits.length).toBe(0)
  })

  it('preserves the original face order (indirect BVH) so external faceIndex → tile maps stay valid', () => {
    // Two-triangle geometry where each face has a distinct, recognisable
    // position. If the BVH constructor rearranges triangles in place, the
    // position buffer will no longer match the pre-build ordering.
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      // Triangle A — z = 0
      -1, -1, 0,  1, -1, 0,  0, 1, 0,
      // Triangle B — z = 2 (far from A so the BVH split would separate them)
      -1, -1, 2,  1, -1, 2,  0, 1, 2,
    ], 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([
      0, 0, 1, 0, 0, 1, 0, 0, 1,
      0, 0, 1, 0, 0, 1, 0, 0, 1,
    ], 3))
    const mesh   = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
    const before = Array.from(geo.getAttribute('position').array)

    accelerateRaycast(mesh)

    const after = Array.from(geo.getAttribute('position').array)
    expect(after).toEqual(before)
  })

  it('dispose clears the bounds tree and restores the native raycast', () => {
    const mesh      = buildTriangleMesh()
    const nativeRay = mesh.raycast
    const release   = accelerateRaycast(mesh)

    release()
    expect((mesh.geometry as { boundsTree?: unknown }).boundsTree).toBeUndefined()
    expect(mesh.raycast).toBe(nativeRay)
  })
})
