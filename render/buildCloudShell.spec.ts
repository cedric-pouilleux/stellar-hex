import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { buildCloudShell } from './buildCloudShell'

describe('buildCloudShell', () => {
  it('draws the sphere at the absolute radius passed in (no internal offset)', () => {
    const handle = buildCloudShell({ radius: 1.14, coverage: 0.5, frozen: false })
    const geo = handle.mesh.geometry as THREE.SphereGeometry
    expect(geo.parameters.radius).toBeCloseTo(1.14)
    handle.dispose()
  })

  it('draws the sphere at the absolute radius passed in for frozen shell too', () => {
    const handle = buildCloudShell({ radius: 2.16, coverage: 0.7, frozen: true })
    const geo = handle.mesh.geometry as THREE.SphereGeometry
    expect(geo.parameters.radius).toBeCloseTo(2.16)
    handle.dispose()
  })

  it('sets renderOrder to 2 and disables frustum culling', () => {
    const handle = buildCloudShell({ radius: 1, coverage: 0.5, frozen: false })
    expect(handle.mesh.renderOrder).toBe(2)
    expect(handle.mesh.frustumCulled).toBe(false)
    handle.dispose()
  })

  it('advances uTime uniform on tick', () => {
    const handle = buildCloudShell({ radius: 1, coverage: 0.5, frozen: false })
    const mat = handle.mesh.material as THREE.ShaderMaterial
    const before = mat.uniforms.uTime.value
    handle.tick(0.016)
    expect(mat.uniforms.uTime.value).toBeCloseTo(before + 0.016)
    handle.dispose()
  })

  describe('getSunWorldPos callback', () => {
    it('copies the callback result into uSunWorldPos on tick', () => {
      const sunPos = new THREE.Vector3(100, 50, 50)
      const handle = buildCloudShell({
        radius: 1, coverage: 0.5, frozen: false,
        getSunWorldPos: () => sunPos,
      })
      const mat = handle.mesh.material as THREE.ShaderMaterial
      handle.tick(0.016)
      const uni = mat.uniforms.uSunWorldPos.value as THREE.Vector3
      expect(uni.x).toBeCloseTo(100)
      expect(uni.y).toBeCloseTo(50)
      expect(uni.z).toBeCloseTo(50)
      handle.dispose()
    })

    it('takes precedence over findDominantLightWorldPos when both are available', () => {
      const scene = new THREE.Scene()
      const light = new THREE.PointLight(0xffffff, 10)
      light.position.set(99, 99, 99)
      scene.add(light)
      scene.updateMatrixWorld(true)

      const sunPos = new THREE.Vector3(1, 2, 3)
      const handle = buildCloudShell({
        radius: 1, coverage: 0.5, frozen: false,
        getSunWorldPos: () => sunPos,
      })
      scene.add(handle.mesh)

      handle.tick(0.016)
      const mat = handle.mesh.material as THREE.ShaderMaterial
      const uni = mat.uniforms.uSunWorldPos.value as THREE.Vector3
      // Callback result (1,2,3) not the scene light position (99,99,99)
      expect(uni.x).toBeCloseTo(1)
      handle.dispose()
    })

    it('calls getSunWorldPos exactly once per tick', () => {
      const spy = vi.fn().mockReturnValue(new THREE.Vector3(0, 1e5, 0))
      const handle = buildCloudShell({
        radius: 1, coverage: 0.5, frozen: false,
        getSunWorldPos: spy,
      })
      handle.tick(0.016)
      handle.tick(0.016)
      expect(spy).toHaveBeenCalledTimes(2)
      handle.dispose()
    })
  })

  it('falls back to findDominantLightWorldPos when no callback and mesh has parent', () => {
    const scene = new THREE.Scene()
    const light = new THREE.PointLight(0xffffff, 5)
    light.position.set(0, 10, 0)
    scene.add(light)
    scene.updateMatrixWorld(true)

    const handle = buildCloudShell({ radius: 1, coverage: 0.5, frozen: false })
    scene.add(handle.mesh)

    handle.tick(0.016)
    const mat = handle.mesh.material as THREE.ShaderMaterial
    const uni = mat.uniforms.uSunWorldPos.value as THREE.Vector3
    // The dominant light at (0,10,0) should have been found
    expect(uni.y).toBeGreaterThan(0)
    handle.dispose()
  })

  it('leaves uSunWorldPos unchanged when no callback and mesh has no parent', () => {
    const handle = buildCloudShell({ radius: 1, coverage: 0.5, frozen: false })
    const mat = handle.mesh.material as THREE.ShaderMaterial
    const uni = mat.uniforms.uSunWorldPos.value as THREE.Vector3
    handle.tick(0.016)
    expect(uni.x).toBe(0)
    expect(uni.y).toBe(0)
    expect(uni.z).toBe(0)
    handle.dispose()
  })
})
