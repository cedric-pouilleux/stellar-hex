import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildGasInteriorMesh } from './useHexasphereMesh'
import type { TerrainLevel } from '../types/body.types'

// ── Helpers ───────────────────────────────────────────────────────

function makePalette(n = 3): TerrainLevel[] {
  const colors = [0xc08040, 0xe8b870, 0xf0d0a0]
  return Array.from({ length: n }, (_, i) => ({
    threshold:  i / n,
    height:     0,
    color:      new THREE.Color(colors[i] ?? 0xffffff),
  }))
}

// ── buildGasInteriorMesh ──────────────────────────────────────────

describe('buildGasInteriorMesh', () => {
  it('returns a mesh, a tick function and a dispose function', () => {
    const { mesh, tick, dispose } = buildGasInteriorMesh(1, makePalette())
    expect(mesh).toBeInstanceOf(THREE.Mesh)
    expect(tick).toBeTypeOf('function')
    expect(dispose).toBeTypeOf('function')
  })

  it('mesh is not interactive (raycast is a no-op)', () => {
    const { mesh } = buildGasInteriorMesh(1, makePalette())
    const hits: THREE.Intersection[] = []
    mesh.raycast({} as THREE.Raycaster, hits)
    expect(hits).toHaveLength(0)
  })

  it('uses BackSide so it renders behind core tiles', () => {
    const { mesh } = buildGasInteriorMesh(1, makePalette())
    const mat = mesh.material as THREE.ShaderMaterial
    expect(mat.side).toBe(THREE.BackSide)
  })

  it('does not write to the depth buffer', () => {
    const { mesh } = buildGasInteriorMesh(1, makePalette())
    const mat = mesh.material as THREE.ShaderMaterial
    expect(mat.depthWrite).toBe(false)
  })

  it('is transparent', () => {
    const { mesh } = buildGasInteriorMesh(1, makePalette())
    const mat = mesh.material as THREE.ShaderMaterial
    expect(mat.transparent).toBe(true)
  })

  it('sphere radius matches the provided radius', () => {
    const radius = 2.5
    const { mesh } = buildGasInteriorMesh(radius, makePalette())
    // SphereGeometry stores the radius in its parameters
    expect((mesh.geometry as THREE.SphereGeometry).parameters.radius).toBeCloseTo(radius)
  })

  it('tick advances the time uniform', () => {
    const { mesh, tick } = buildGasInteriorMesh(1, makePalette())
    const mat = mesh.material as THREE.ShaderMaterial
    const before = mat.uniforms.uTime.value as number
    tick(0.016)
    expect(mat.uniforms.uTime.value).toBeGreaterThan(before)
  })

  it('palette colors are wired to uColorA/B/C uniforms', () => {
    const palette = makePalette(3)
    const { mesh } = buildGasInteriorMesh(1, palette)
    const mat = mesh.material as THREE.ShaderMaterial
    expect(mat.uniforms.uColorA.value).toBeInstanceOf(THREE.Color)
    expect(mat.uniforms.uColorB.value).toBeInstanceOf(THREE.Color)
    expect(mat.uniforms.uColorC.value).toBeInstanceOf(THREE.Color)
  })

  it('works with a minimal 1-entry palette (no crash)', () => {
    expect(() => buildGasInteriorMesh(1, makePalette(1))).not.toThrow()
  })

  it('dispose does not throw', () => {
    const { dispose } = buildGasInteriorMesh(1, makePalette())
    expect(() => dispose()).not.toThrow()
  })
})
