import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createAtmoMaterial } from './atmoMaterial'
import type { BodyConfig } from '../../types/body.types'

// ── Fixtures ──────────────────────────────────────────────────────

function rockyConfig(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    name: 'test-atmo',
    type: 'rocky',
    radius: 1,
    rotationSpeed: 0.05,
    axialTilt: 0,
    atmosphereThickness: 0.4,
    liquidType: 'water',
    liquidState: 'liquid',
    ...overrides,
  }
}

// ── Translucent variant (rocky / metallic shader-view halo) ───────

describe('createAtmoMaterial — translucent variant', () => {
  it('selects the translucent variant when opacity < 0.99', () => {
    const handle = createAtmoMaterial(rockyConfig(), undefined, { opacity: 0.5 })
    expect(handle.mode).toBe('translucent')
    expect(handle.material).toBeInstanceOf(THREE.ShaderMaterial)
    handle.dispose()
  })

  it('exposes the halo uniform bank (tint, light, opacity, fresnel, shell metrics)', () => {
    const handle = createAtmoMaterial(rockyConfig(), undefined, { opacity: 0.5 })
    const u = handle.material.uniforms
    expect(u.uTint.value).toBeInstanceOf(THREE.Vector3)
    expect(u.uLightDir.value).toBeInstanceOf(THREE.Vector3)
    expect(typeof u.uOpacity.value).toBe('number')
    expect(typeof u.uFresnelPower.value).toBe('number')
    expect(typeof u.uCoreRadius.value).toBe('number')
    expect(typeof u.uTotalThickness.value).toBe('number')
    expect(typeof u.uTime.value).toBe('number')
    handle.dispose()
  })

  it('is transparent, depth-write-off, FrontSide — wall fragments discarded in-shader', () => {
    const { material, dispose } = createAtmoMaterial(rockyConfig(), undefined, { opacity: 0.5 })
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    expect(material.side).toBe(THREE.FrontSide)
    dispose()
  })

  it('material.visible is false when opacity is 0', () => {
    const { material, dispose } = createAtmoMaterial(rockyConfig(), undefined, { opacity: 0 })
    expect(material.uniforms.uOpacity.value).toBe(0)
    expect(material.visible).toBe(false)
    dispose()
  })

  it('derives core / total thickness from radius and coreRadiusRatio', () => {
    const { material, dispose } = createAtmoMaterial(
      rockyConfig({ radius: 2, coreRadiusRatio: 0.5 }),
      undefined,
      { opacity: 0.5 },
    )
    expect(material.uniforms.uCoreRadius.value).toBeCloseTo(1.0, 6)
    expect(material.uniforms.uTotalThickness.value).toBeCloseTo(1.0, 6)
    dispose()
  })

  it('setParams patches opacity + fresnelPower and keeps material.visible in sync', () => {
    const handle = createAtmoMaterial(rockyConfig(), undefined, { opacity: 0 })
    expect(handle.material.visible).toBe(false)

    handle.setParams({ opacity: 0.5, fresnelPower: 4 })
    expect(handle.material.uniforms.uOpacity.value).toBe(0.5)
    expect(handle.material.uniforms.uFresnelPower.value).toBe(4)
    expect(handle.material.visible).toBe(true)

    handle.setParams({ opacity: 0 })
    expect(handle.material.visible).toBe(false)
    handle.dispose()
  })
})

// ── Opaque variant (playable atmo + gas shader view) ──────────────

describe('createAtmoMaterial — opaque variant', () => {
  it('selects the opaque variant when opacity >= 0.99 (or omitted)', () => {
    const a = createAtmoMaterial(rockyConfig())
    expect(a.mode).toBe('opaque')
    a.dispose()
    const b = createAtmoMaterial(rockyConfig(), undefined, { opacity: 1 })
    expect(b.mode).toBe('opaque')
    b.dispose()
  })

  it('renders opaque with depthWrite enabled', () => {
    const { material, dispose } = createAtmoMaterial(rockyConfig())
    expect(material.transparent).toBe(false)
    expect(material.depthWrite).toBe(true)
    expect(material.side).toBe(THREE.FrontSide)
    dispose()
  })

  it('exposes the minimal opaque uniform bank (tint, light, time)', () => {
    const handle = createAtmoMaterial(rockyConfig())
    const u = handle.material.uniforms
    expect(u.uTint.value).toBeInstanceOf(THREE.Vector3)
    expect(u.uLightDir.value).toBeInstanceOf(THREE.Vector3)
    expect(typeof u.uTime.value).toBe('number')
    // Halo-only uniforms should not be present on the opaque shader.
    expect(u.uOpacity).toBeUndefined()
    expect(u.uFresnelPower).toBeUndefined()
    handle.dispose()
  })

  it('setParams is a no-op on the opaque variant (kept for API parity)', () => {
    const handle = createAtmoMaterial(rockyConfig())
    expect(() => handle.setParams({ opacity: 0.2, fresnelPower: 4 })).not.toThrow()
    handle.dispose()
  })
})

// ── Shared behaviour ─────────────────────────────────────────────

describe('createAtmoMaterial — shared behaviour', () => {
  it('falls back to a neutral default tint when no override is given', () => {
    // The lib no longer derives a tint from temperature — caller pushes
    // a climate-driven hue via `tint` if needed. Default is a pale sky blue.
    const a = createAtmoMaterial(rockyConfig())
    const b = createAtmoMaterial(rockyConfig())
    const aTint = a.material.uniforms.uTint.value as THREE.Vector3
    const bTint = b.material.uniforms.uTint.value as THREE.Vector3
    expect(aTint.equals(bTint)).toBe(true)
    a.dispose()
    b.dispose()
  })

  it('honours an explicit tint override', () => {
    const { material, dispose } = createAtmoMaterial(rockyConfig(), undefined, { tint: '#ff0000' })
    const t = material.uniforms.uTint.value as THREE.Vector3
    expect(t.x).toBeCloseTo(1, 5)
    expect(t.y).toBeCloseTo(0, 5)
    expect(t.z).toBeCloseTo(0, 5)
    dispose()
  })

  it('normalises the initial light direction', () => {
    const { material, dispose } = createAtmoMaterial(rockyConfig(), undefined, { lightDir: [2, 0, 0] })
    const d = material.uniforms.uLightDir.value as THREE.Vector3
    expect(d.length()).toBeCloseTo(1, 5)
    expect(d.x).toBeCloseTo(1, 5)
    dispose()
  })

  it('setLight mutates uLightDir in place, keeping the same Vector3 instance', () => {
    const handle = createAtmoMaterial(rockyConfig())
    const before = handle.material.uniforms.uLightDir.value as THREE.Vector3
    handle.setLight({ direction: new THREE.Vector3(0, 1, 0) })
    const after = handle.material.uniforms.uLightDir.value as THREE.Vector3
    expect(after).toBe(before)
    expect(after.y).toBeCloseTo(1, 5)
    handle.dispose()
  })

  it('tick advances uTime without throwing', () => {
    const handle = createAtmoMaterial(rockyConfig())
    handle.tick(1.5)
    expect(handle.material.uniforms.uTime.value).toBe(1.5)
    handle.dispose()
  })

  it('dispose releases the material without throwing', () => {
    const handle = createAtmoMaterial(rockyConfig())
    expect(() => handle.dispose()).not.toThrow()
  })
})
