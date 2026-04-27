import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildAtmoShell } from './buildAtmoShell'
import type { BodyConfig } from '../../types/body.types'

function rockyConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'test-atmo-shell',
    type: 'rocky',
    radius: 1,
    rotationSpeed: 0.05,
    axialTilt: 0,
    atmosphereThickness: 0.2,
    ...overrides,
  }
}

describe('buildAtmoShell', () => {
  it('returns an indexed icosphere mesh sized to the requested radius', () => {
    const handle = buildAtmoShell({ config: rockyConfig(), radius: 2.5, opacity: 0.5 })
    expect(handle.mesh).toBeInstanceOf(THREE.Mesh)
    // `mergeVertices` indexes the icosahedron; the rest of the body
    // pipeline expects indexed shells in non-interactive views.
    expect(handle.mesh.geometry.index).not.toBeNull()
    // Furthest vertex from the origin should sit at the requested radius.
    const pos = handle.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    let maxR = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      maxR = Math.max(maxR, Math.sqrt(x * x + y * y + z * z))
    }
    expect(maxR).toBeCloseTo(2.5, 4)
    handle.dispose()
  })

  it('renders translucent with depthWrite off, BackSide-rendered for the corona z-trick', () => {
    const handle = buildAtmoShell({ config: rockyConfig(), radius: 1, opacity: 0.5 })
    const material = handle.mesh.material as THREE.ShaderMaterial
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    // BackSide so the back-face depth values let the planet's opaque
    // foreground occlude the shell on the disc, leaving only the rim
    // corona visible. See `buildAtmoShell` for the full rationale.
    expect(material.side).toBe(THREE.BackSide)
    handle.dispose()
  })

  it('exposes the procedural uniform bank (tint, light, opacity, time)', () => {
    const handle = buildAtmoShell({ config: rockyConfig(), radius: 1, opacity: 0.4 })
    const u = (handle.mesh.material as THREE.ShaderMaterial).uniforms
    expect(u.uTint.value).toBeInstanceOf(THREE.Vector3)
    expect(u.uLightDir.value).toBeInstanceOf(THREE.Vector3)
    expect(u.uOpacity.value).toBeCloseTo(0.4, 6)
    expect(typeof u.uTime.value).toBe('number')
    handle.dispose()
  })

  it('honours an explicit tint override', () => {
    const handle = buildAtmoShell({ config: rockyConfig(), radius: 1, opacity: 0.5, tint: '#ff0000' })
    const tint = (handle.mesh.material as THREE.ShaderMaterial).uniforms.uTint.value as THREE.Vector3
    expect(tint.x).toBeCloseTo(1, 5)
    expect(tint.y).toBeCloseTo(0, 5)
    expect(tint.z).toBeCloseTo(0, 5)
    handle.dispose()
  })

  it('material.visible follows opacity — 0 hides the shell, > 0 shows it', () => {
    const dim = buildAtmoShell({ config: rockyConfig(), radius: 1, opacity: 0 })
    expect(dim.mesh.material).toMatchObject({ visible: false })
    dim.dispose()

    const lit = buildAtmoShell({ config: rockyConfig(), radius: 1, opacity: 0.3 })
    expect(lit.mesh.material).toMatchObject({ visible: true })
    lit.dispose()
  })

  it('setOpacity mutates uOpacity in place and toggles visibility', () => {
    const handle = buildAtmoShell({ config: rockyConfig(), radius: 1, opacity: 0.5 })
    const material = handle.mesh.material as THREE.ShaderMaterial

    handle.setOpacity(0)
    expect(material.uniforms.uOpacity.value).toBe(0)
    expect(material.visible).toBe(false)

    handle.setOpacity(0.7)
    expect(material.uniforms.uOpacity.value).toBeCloseTo(0.7, 6)
    expect(material.visible).toBe(true)

    handle.dispose()
  })

  it('tick advances uTime without throwing', () => {
    const handle = buildAtmoShell({ config: rockyConfig(), radius: 1, opacity: 0.5 })
    handle.tick(2.5)
    const u = (handle.mesh.material as THREE.ShaderMaterial).uniforms
    expect(u.uTime.value).toBe(2.5)
    handle.dispose()
  })

  it('setVisible toggles mesh visibility independently of opacity', () => {
    const handle = buildAtmoShell({ config: rockyConfig(), radius: 1, opacity: 0.5 })
    expect(handle.mesh.visible).toBe(true)
    handle.setVisible(false)
    expect(handle.mesh.visible).toBe(false)
    handle.setVisible(true)
    expect(handle.mesh.visible).toBe(true)
    handle.dispose()
  })

  it('dispose releases geometry + material without throwing', () => {
    const handle = buildAtmoShell({ config: rockyConfig(), radius: 1, opacity: 0.5 })
    expect(() => handle.dispose()).not.toThrow()
  })
})
