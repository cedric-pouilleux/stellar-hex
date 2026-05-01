import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { applyFlatLightingPatch } from './flatLightingPatch'

describe('applyFlatLightingPatch', () => {
  it('exposes a uniform bound at 0 by default (flat lighting disabled)', () => {
    const material = new THREE.MeshStandardMaterial()
    const handle   = applyFlatLightingPatch(material)
    expect(handle.uniform.value).toBe(0)
  })

  it('setFlatLighting toggles the uniform between 0 and 1', () => {
    const material = new THREE.MeshStandardMaterial()
    const handle   = applyFlatLightingPatch(material)
    handle.setFlatLighting(true)
    expect(handle.uniform.value).toBe(1)
    handle.setFlatLighting(false)
    expect(handle.uniform.value).toBe(0)
  })

  it('bumps the material version so Three.js recompiles the program on the next render', () => {
    const material = new THREE.MeshStandardMaterial()
    const baseline = material.version
    applyFlatLightingPatch(material)
    expect(material.version).toBeGreaterThan(baseline)
  })

  it('onBeforeCompile injects the uFlatLighting uniform and the mix line into the fragment shader', () => {
    const material = new THREE.MeshStandardMaterial()
    const handle   = applyFlatLightingPatch(material)

    const fakeShader = {
      uniforms: {} as Record<string, unknown>,
      fragmentShader: '#include <output_fragment>',
    }
    material.onBeforeCompile?.(fakeShader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer)

    expect(fakeShader.uniforms.uFlatLighting).toBe(handle.uniform)
    expect(fakeShader.fragmentShader).toContain('uniform float uFlatLighting;')
    expect(fakeShader.fragmentShader).toContain('outgoingLight = mix(outgoingLight, diffuseColor.rgb + totalEmissiveRadiance, uFlatLighting);')
    expect(fakeShader.fragmentShader).toContain('#include <output_fragment>')
  })

  it('chains a previous onBeforeCompile so external patches are preserved', () => {
    const material = new THREE.MeshStandardMaterial()
    const previous = vi.fn((shader: { uniforms: Record<string, unknown> }) => {
      shader.uniforms.uExternalFlag = { value: 42 }
    })
    material.onBeforeCompile = previous as unknown as THREE.Material['onBeforeCompile']

    applyFlatLightingPatch(material)

    const fakeShader = {
      uniforms: {} as Record<string, unknown>,
      fragmentShader: '#include <output_fragment>',
    }
    material.onBeforeCompile?.(fakeShader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer)

    expect(previous).toHaveBeenCalledOnce()
    expect(fakeShader.uniforms.uExternalFlag).toEqual({ value: 42 })
    expect(fakeShader.uniforms.uFlatLighting).toBeDefined()
  })

  it('is idempotent — re-applying on the same material returns the same handle', () => {
    const material = new THREE.MeshStandardMaterial()
    const first    = applyFlatLightingPatch(material)
    const second   = applyFlatLightingPatch(material)
    expect(second).toBe(first)
    // The cached handle keeps mutating the same uniform, so a single
    // call still flips the value across both views of the material.
    second.setFlatLighting(true)
    expect(first.uniform.value).toBe(1)
  })
})
