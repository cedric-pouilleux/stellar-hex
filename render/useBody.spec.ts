import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { useBody } from './useBody'
import type { BodyConfig } from '../types/body.types'

// ── Helpers ───────────────────────────────────────────────────────

/** Mirrors the StatsOverlay polygon counting logic (position.count / 3). */
function countGroupPolygons(group: THREE.Group): number {
  let n = 0
  group.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh) {
      const pos = (obj as THREE.Mesh).geometry?.getAttribute('position')
      if (pos) n += (pos.count / 3) | 0
    }
  })
  return n
}

/** Returns true when every mesh geometry in the group is non-indexed (merged prisms). */
function hasNonIndexedMesh(group: THREE.Group): boolean {
  let found = false
  group.traverse(obj => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && mesh.geometry && !mesh.geometry.index) found = true
  })
  return found
}

/** Returns true when every non-trivial mesh geometry in the group is indexed (sphere). */
function hasIndexedMesh(group: THREE.Group): boolean {
  let found = false
  group.traverse(obj => {
    const mesh = obj as THREE.Mesh
    // Ignore the PlaneGeometry used by bodyHoverOverlay (4 vertices)
    if (mesh.isMesh && mesh.geometry && mesh.geometry.index
      && mesh.geometry.getAttribute('position').count > 10) found = true
  })
  return found
}

function makeStarConfig(radius = 1): BodyConfig {
  return {
    name: 'TestStar', type: 'star', spectralType: 'G',
    temperatureMin: 5000, temperatureMax: 15000,
    radius, rotationSpeed: 0.01, axialTilt: 0,
  }
}

function makeRockyConfig(radius = 1): BodyConfig {
  return {
    name: 'TestRocky', type: 'rocky',
    temperatureMin: -10, temperatureMax: 30,
    atmosphereThickness: 0.5,
    liquidType: 'water', liquidState: 'liquid', liquidCoverage: 0.5,
    radius, rotationSpeed: 0.05, axialTilt: 0,
  }
}

// Large tile size → subdivision 2 → 42 tiles (fast test builds).
const TILE_SIZE = 0.5

// ── Star display mesh is smooth sphere (indexed) in overview ──────

describe('useBody — star', () => {
  it('places an indexed smooth sphere in the group without hex mode', () => {
    // Stars now use buildStarSmoothMesh (same pattern as rocky):
    // indexed SphereGeometry + animated BodyMaterial('star').
    const star = useBody(makeStarConfig(), TILE_SIZE)
    expect(hasIndexedMesh(star.group)).toBe(true)
    expect(hasNonIndexedMesh(star.group)).toBe(false)
    star.dispose()
  })

  it('polygon count stays low without hex mode (smooth sphere vertex count / 3)', () => {
    // SphereGeometry with segs ≈ 64 → far fewer than the old hex mesh.
    const star = useBody(makeStarConfig(), TILE_SIZE)
    expect(countGroupPolygons(star.group)).toBeLessThan(5_000)
    star.dispose()
  })

  it('exposes planetMaterial so ShaderPane can live-update star uniforms', () => {
    // The playground's shader slider pipeline calls `body.planetMaterial.setParams`
    // on every input event. Omitting this field here (previous regression) broke
    // every star shader control — temperature, pulsation, corona, granulation…
    const star = useBody(makeStarConfig(), TILE_SIZE)
    expect((star as any).planetMaterial?.setParams).toBeTypeOf('function')
    star.dispose()
  })

  it('switches to non-indexed hex mesh in interactive mode and back on deactivate', () => {
    // Same smooth ↔ hex swap lifecycle as rocky planets.
    const star = useBody(makeStarConfig(), TILE_SIZE)

    expect(hasNonIndexedMesh(star.group)).toBe(false)
    expect(hasIndexedMesh(star.group)).toBe(true)

    star.activateInteractive()
    expect(hasNonIndexedMesh(star.group)).toBe(true)
    expect(hasIndexedMesh(star.group)).toBe(false)

    star.deactivateInteractive()
    expect(hasNonIndexedMesh(star.group)).toBe(false)
    expect(hasIndexedMesh(star.group)).toBe(true)

    star.dispose()
  })
})

// ── Rocky display mesh is smooth sphere (indexed) ─────────────────

describe('useBody — rocky (non-interactive)', () => {
  it('places an indexed smooth sphere in the group (not a hex mesh)', () => {
    // Rocky planets use buildSmoothSphereMesh → THREE.SphereGeometry (indexed).
    const rocky = useBody(makeRockyConfig(), TILE_SIZE)
    expect(hasIndexedMesh(rocky.group)).toBe(true)
    rocky.dispose()
  })

  it('polygon count stays low without hex mode (smooth sphere vertex count / 3)', () => {
    // SphereGeometry with segs ≈ 72 → position.count ≈ 74×37 = 2738 → polys ≈ 912.
    // The hex mesh (buildPlanetMesh + buildInteractiveMesh) is built but NOT in the group.
    const rocky = useBody(makeRockyConfig(), TILE_SIZE)
    const polys = countGroupPolygons(rocky.group)
    // Smooth sphere is indexed: position.count = (segs+1)*(segs/2+1) ≪ tile prism count.
    // 5000 is a generous ceiling that no smooth sphere (segs ≤ ~120) would exceed.
    expect(polys).toBeLessThan(5_000)
    rocky.dispose()
  })

  it('hex mesh is absent from group before activateInteractive, present after', () => {
    // buildPlanetMesh (raycaster proxy) and buildInteractiveMesh are constructed
    // eagerly for all rocky planets, consuming CPU memory even in smooth mode.
    // They must NOT appear in body.group until activateInteractive() is called.
    const rocky = useBody(makeRockyConfig(), TILE_SIZE)

    // Before: only smooth sphere (indexed) — no non-indexed hex prism mesh.
    expect(hasNonIndexedMesh(rocky.group)).toBe(false)

    rocky.activateInteractive()

    // After activation: hex prism mesh (non-indexed) replaces the smooth sphere.
    // Note: when the surface is liquid, an ocean sphere (indexed) is added
    // alongside the hex mesh, so `hasIndexedMesh` may still be true here.
    expect(hasNonIndexedMesh(rocky.group)).toBe(true)

    rocky.deactivateInteractive()

    // After deactivation: back to smooth sphere — hex mesh removed from group.
    expect(hasNonIndexedMesh(rocky.group)).toBe(false)
    expect(hasIndexedMesh(rocky.group)).toBe(true)

    rocky.dispose()
  })

  it('mounts a smooth ocean sphere in hex mode when the surface is liquid', () => {
    const rocky = useBody(makeRockyConfig(), TILE_SIZE)
    rocky.activateInteractive()

    // Count indexed meshes with non-trivial geometry — the ocean layer uses
    // a SphereGeometry which is indexed and contributes many vertices.
    let indexedMeshes = 0
    rocky.group.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh && mesh.geometry?.index
        && mesh.geometry.getAttribute('position').count > 10) indexedMeshes++
    })
    expect(indexedMeshes).toBeGreaterThanOrEqual(1)

    rocky.dispose()
  })
})
