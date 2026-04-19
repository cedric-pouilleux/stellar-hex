import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildBodyHoverOverlay } from './buildBodyHoverOverlay'
import type { BodyHoverConfig } from '../config/render'

// ── Helpers ───────────────────────────────────────────────────────

const TEST_CFG: BodyHoverConfig = {
  ringColor:    0xffffff,
  ringOpacity:  0.85,
  ringMarginPx: 6,
  ringWidthPx:  2,
}

function makeGroup() { return new THREE.Group() }

// ── buildBodyHoverOverlay ─────────────────────────────────────────

describe('buildBodyHoverOverlay', () => {
  it('adds exactly one child mesh to the group', () => {
    const group = makeGroup()
    buildBodyHoverOverlay(group, 1, TEST_CFG)
    expect(group.children).toHaveLength(1)
  })

  it('mesh is hidden by default', () => {
    const group = makeGroup()
    buildBodyHoverOverlay(group, 1, TEST_CFG)
    expect(group.children[0].visible).toBe(false)
  })

  it('setVisible(true) shows the mesh', () => {
    const group   = makeGroup()
    const overlay = buildBodyHoverOverlay(group, 1, TEST_CFG)
    overlay.setVisible(true)
    expect(group.children[0].visible).toBe(true)
  })

  it('setVisible(false) hides the mesh', () => {
    const group   = makeGroup()
    const overlay = buildBodyHoverOverlay(group, 1, TEST_CFG)
    overlay.setVisible(true)
    overlay.setVisible(false)
    expect(group.children[0].visible).toBe(false)
  })

  it('dispose removes the mesh from the group', () => {
    const group   = makeGroup()
    const overlay = buildBodyHoverOverlay(group, 1, TEST_CFG)
    overlay.dispose()
    expect(group.children).toHaveLength(0)
  })

  it('ShaderMaterial exposes silhouette-plane uniforms', () => {
    const group = makeGroup()
    buildBodyHoverOverlay(group, 1, TEST_CFG)
    const mat = (group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial)
    expect(mat.uniforms.uColor).toBeDefined()
    expect(mat.uniforms.uOpacity.value).toBeCloseTo(TEST_CFG.ringOpacity)
    expect(mat.uniforms.uInnerFrac).toBeDefined()
    expect(mat.uniforms.uSilCenterWorld).toBeDefined()
    expect(mat.uniforms.uSilNormalWorld).toBeDefined()
    expect(mat.uniforms.uOuterRadiusWorld).toBeDefined()
  })

  it('does not expose legacy screen-space uniforms', () => {
    const group = makeGroup()
    buildBodyHoverOverlay(group, 1, TEST_CFG)
    const mat = (group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial
    expect(mat.uniforms.uResolution).toBeUndefined()
    expect(mat.uniforms.uOuterRadiusPx).toBeUndefined()
    expect(mat.uniforms.uRingOuterWorld).toBeUndefined()
  })

  it('material is transparent without depth write', () => {
    const group = makeGroup()
    buildBodyHoverOverlay(group, 1, TEST_CFG)
    const mat = (group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial
    expect(mat.transparent).toBe(true)
    expect(mat.depthWrite).toBe(false)
  })

  it('frustumCulled is disabled (shader controls vertex position)', () => {
    const group = makeGroup()
    buildBodyHoverOverlay(group, 1, TEST_CFG)
    const mesh = group.children[0] as THREE.Mesh
    expect(mesh.frustumCulled).toBe(false)
  })

  it('geometry is a PlaneGeometry (2×2 surface)', () => {
    const group = makeGroup()
    buildBodyHoverOverlay(group, 1, TEST_CFG)
    const mesh = group.children[0] as THREE.Mesh
    expect(mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry)
    const p = (mesh.geometry as THREE.PlaneGeometry).parameters
    expect(p.width).toBe(2)
    expect(p.height).toBe(2)
  })

  it('mesh does not participate in raycasting', () => {
    const group     = makeGroup()
    buildBodyHoverOverlay(group, 1, TEST_CFG)
    const mesh      = group.children[0] as THREE.Mesh
    const raycaster = new THREE.Raycaster()
    raycaster.set(new THREE.Vector3(0, 0, 10), new THREE.Vector3(0, 0, -1))
    const hits: THREE.Intersection[] = []
    mesh.raycast(raycaster, hits)
    expect(hits).toHaveLength(0)
  })

  it('uInnerFrac default < 1 (ring has non-zero inner boundary)', () => {
    const group = makeGroup()
    buildBodyHoverOverlay(group, 1, TEST_CFG)
    const mat = (group.children[0] as THREE.Mesh).material as THREE.ShaderMaterial
    expect(mat.uniforms.uInnerFrac.value).toBeGreaterThan(0)
    expect(mat.uniforms.uInnerFrac.value).toBeLessThan(1)
  })
})
