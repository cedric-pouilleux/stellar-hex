import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildCoreMesh } from './buildCoreMesh'
import { DEFAULT_CORE_RADIUS_RATIO } from '../../physics/body'

// ── buildCoreMesh ─────────────────────────────────────────────────

describe('buildCoreMesh', () => {
  it('derives the core radius from radius * coreRadiusRatio', () => {
    const { radius } = buildCoreMesh({ radius: 4, coreRadiusRatio: 0.4 })
    expect(radius).toBeCloseTo(1.6, 6)
  })

  it('falls back to DEFAULT_CORE_RADIUS_RATIO when ratio is omitted', () => {
    const { radius } = buildCoreMesh({ radius: 10 })
    expect(radius).toBeCloseTo(10 * DEFAULT_CORE_RADIUS_RATIO, 6)
  })

  it('produces an indexed sphere geometry (consistent with SphereGeometry)', () => {
    const { mesh } = buildCoreMesh({ radius: 2 })
    expect(mesh.geometry.index).not.toBeNull()
  })

  it('the mesh bounding sphere matches the computed core radius', () => {
    const { mesh, radius } = buildCoreMesh({ radius: 3, coreRadiusRatio: 0.5 })
    mesh.geometry.computeBoundingSphere()
    expect(mesh.geometry.boundingSphere!.radius).toBeCloseTo(radius, 5)
  })

  it('is non-interactive — raycast is a no-op even when a ray intersects the sphere', () => {
    const { mesh } = buildCoreMesh({ radius: 1 })
    const ray  = new THREE.Raycaster(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1))
    const hits: THREE.Intersection[] = []
    mesh.raycast(ray, hits)
    expect(hits.length).toBe(0)
  })

  it('uses a ShaderMaterial wired with a uTime uniform and skips tone mapping', () => {
    const { mesh } = buildCoreMesh({ radius: 1 })
    const mat = mesh.material as THREE.ShaderMaterial
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial)
    expect(mat.uniforms.uTime).toBeDefined()
    expect(mat.uniforms.uTime.value).toBe(0)
    // Incandescent core → bypass tone mapping so the highlights stay saturated.
    expect(mat.toneMapped).toBe(false)
  })

  it('parents an orange PointLight to the core mesh, scaled with its radius', () => {
    const { mesh, light, radius } = buildCoreMesh({ radius: 4, coreRadiusRatio: 0.5 })
    expect(light).toBeInstanceOf(THREE.PointLight)
    expect(mesh.children).toContain(light)
    // Distance scales with the core radius so small bodies don't flood themselves.
    expect(light.distance).toBeGreaterThan(radius)
    // Warm orange-ish hue (R > G > B).
    expect(light.color.r).toBeGreaterThan(light.color.g)
    expect(light.color.g).toBeGreaterThan(light.color.b)
  })

  it('tick advances uTime and modulates the light intensity (breathing)', () => {
    const { mesh, light, tick } = buildCoreMesh({ radius: 1 })
    const mat = mesh.material as THREE.ShaderMaterial

    tick(0)
    const intensityAt0 = light.intensity
    tick(1.234)
    expect(mat.uniforms.uTime.value).toBeCloseTo(1.234, 6)
    const intensityAt1 = light.intensity

    // Two desynced sines → intensity moves from one tick to the next.
    expect(intensityAt1).not.toBeCloseTo(intensityAt0, 4)
  })

  it('dispose releases geometry and material resources and detaches the light', () => {
    const { mesh, light, dispose } = buildCoreMesh({ radius: 1 })
    const geo = mesh.geometry
    const mat = mesh.material as THREE.Material
    const geoSpy = { disposed: false }
    const matSpy = { disposed: false }
    geo.addEventListener('dispose', () => { geoSpy.disposed = true })
    mat.addEventListener('dispose', () => { matSpy.disposed = true })
    dispose()
    expect(geoSpy.disposed).toBe(true)
    expect(matSpy.disposed).toBe(true)
    expect(mesh.children).not.toContain(light)
  })

  it('pure-gas body (coreRadiusRatio = 0) yields an invisible mesh with a dark light', () => {
    // `gasMassFraction = 1` resolves to `coreRadiusRatio = 0`; `buildCoreMesh`
    // must skip the sphere geometry and kill the point light so the atmo
    // shell renders over an empty centre.
    const { mesh, light, radius } = buildCoreMesh({ radius: 4, coreRadiusRatio: 0 })
    expect(radius).toBe(0)
    expect(mesh.visible).toBe(false)
    expect(light.visible).toBe(false)
    expect(light.intensity).toBe(0)
  })

  it('pure-gas body — tick is a no-op (no shader clock, no light pulse)', () => {
    const { tick, light } = buildCoreMesh({ radius: 4, coreRadiusRatio: 0 })
    const before = light.intensity
    tick(1.234)
    expect(light.intensity).toBe(before)
  })
})
