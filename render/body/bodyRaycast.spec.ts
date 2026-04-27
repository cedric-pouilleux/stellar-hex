import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { findBodyIndex, raycastBodies } from './bodyRaycast'
import type { RaycastBody } from './bodyRaycast'

// ── Helpers ──────────────────────────────────────────────────────────

function makeGroup(pos: THREE.Vector3 = new THREE.Vector3()): THREE.Group {
  const g = new THREE.Group()
  g.position.copy(pos)
  g.updateMatrixWorld(true)
  return g
}

function makeBody(pos?: THREE.Vector3, radius = 1): RaycastBody {
  return { group: makeGroup(pos), config: { radius } }
}

// ── findBodyIndex ────────────────────────────────────────────────────

describe('findBodyIndex', () => {
  it('returns the index when the object is a body group', () => {
    const bodies = [makeBody(), makeBody()]
    expect(findBodyIndex(bodies[1].group, bodies)).toBe(1)
  })

  it('returns the index when the object is a child of a body group', () => {
    const bodies = [makeBody()]
    const child = new THREE.Mesh()
    bodies[0].group.add(child)
    expect(findBodyIndex(child, bodies)).toBe(0)
  })

  it('returns the index for a deeply nested child', () => {
    const bodies = [makeBody()]
    const mid = new THREE.Group()
    const leaf = new THREE.Mesh()
    bodies[0].group.add(mid)
    mid.add(leaf)
    expect(findBodyIndex(leaf, bodies)).toBe(0)
  })

  it('returns -1 when the object belongs to no body', () => {
    const bodies = [makeBody()]
    const orphan = new THREE.Mesh()
    expect(findBodyIndex(orphan, bodies)).toBe(-1)
  })
})

// ── raycastBodies ────────────────────────────────────────────────────

describe('raycastBodies', () => {
  it('returns null when the ray misses all bodies', () => {
    const bodies = [makeBody(new THREE.Vector3(0, 0, 0), 1)]
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(100, 100, 10),
      new THREE.Vector3(0, 0, -1),
    )
    expect(raycastBodies(raycaster, bodies)).toBeNull()
  })

  it('skips the focused body index', () => {
    // Single body — if focused it should be skipped entirely.
    const bodies = [makeBody(new THREE.Vector3(0, 0, 0), 1)]
    // Add a visible mesh so the raycaster can actually intersect.
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8))
    bodies[0].group.add(mesh)
    bodies[0].group.updateMatrixWorld(true)

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 5),
      new THREE.Vector3(0, 0, -1),
    )
    expect(raycastBodies(raycaster, bodies, { focusedIndex: 0 })).toBeNull()
  })

  it('returns a satellite hit in front of the focused body', () => {
    // Focused planet at origin (radius 2), satellite in front of it (z = 3, radius 0.5).
    // Ray comes from z = 10 toward -z: must hit satellite first, not be rejected.
    const bodies = [
      makeBody(new THREE.Vector3(0, 0, 0), 2),
      makeBody(new THREE.Vector3(0, 0, 3), 0.5),
    ]
    for (const b of bodies) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.config.radius, 16, 16))
      b.group.add(mesh)
      b.group.updateMatrixWorld(true)
    }

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(0, 0, -1),
    )
    const result = raycastBodies(raycaster, bodies, { focusedIndex: 0 })
    expect(result).not.toBeNull()
    expect(result!.bodyIndex).toBe(1)
  })

  it('discards a satellite hit behind the focused body', () => {
    // Focused planet at origin (radius 2), satellite behind it (z = -5, radius 0.5).
    const bodies = [
      makeBody(new THREE.Vector3(0, 0, 0), 2),
      makeBody(new THREE.Vector3(0, 0, -5), 0.5),
    ]
    for (const b of bodies) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.config.radius, 16, 16))
      b.group.add(mesh)
      b.group.updateMatrixWorld(true)
    }

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(0, 0, -1),
    )
    expect(raycastBodies(raycaster, bodies, { focusedIndex: 0 })).toBeNull()
  })

  it('returns the first valid body hit', () => {
    const bodies = [
      makeBody(new THREE.Vector3(0, 0, 0), 2),
      makeBody(new THREE.Vector3(5, 0, 0), 2),
    ]
    // Add visible meshes.
    for (const b of bodies) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.config.radius, 8, 8))
      b.group.add(mesh)
      b.group.updateMatrixWorld(true)
    }

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(5, 0, 10),
      new THREE.Vector3(0, 0, -1),
    )
    const result = raycastBodies(raycaster, bodies)
    expect(result).not.toBeNull()
    expect(result!.bodyIndex).toBe(1)
  })
})
