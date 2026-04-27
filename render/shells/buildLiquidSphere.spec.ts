import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildLiquidSphere } from './buildLiquidSphere'
import { createGraphicsUniforms } from '../hex/hexGraphicsUniforms'

// Neutral fallback hexes documented by the module — duplicated here so the
// specs stay strict about the lib's no-chemistry contract.
const NEUTRAL_LIQUID = 0x2a3a4a
const NEUTRAL_FROZEN = 0x90b0c0

/** Fresh per-test uniform bag. Each test stays isolated from the others. */
const gu = () => createGraphicsUniforms()

// ── buildLiquidSphere ────────────────────────────────────────────

describe('buildLiquidSphere', () => {
  it('produces a sphere mesh scaled to the requested world radius', () => {
    const handle = buildLiquidSphere(
      { liquidState: 'liquid', liquidColor: 0x2878d0 },
      { radius: 2.5, graphicsUniforms: gu() },
    )
    expect(handle.mesh).toBeInstanceOf(THREE.Mesh)
    // Indexed unit sphere (icosphere reindexed via mergeVertices) — scaled
    // to the world radius via mesh.scale, so geometry stays at radius 1.
    expect(handle.mesh.geometry.index).not.toBeNull()
    handle.mesh.geometry.computeBoundingSphere()
    expect(handle.mesh.geometry.boundingSphere!.radius).toBeCloseTo(1, 5)
    expect(handle.mesh.scale.x).toBeCloseTo(2.5, 5)
    expect(handle.mesh.scale.y).toBeCloseTo(2.5, 5)
    expect(handle.mesh.scale.z).toBeCloseTo(2.5, 5)
    handle.dispose()
  })

  it('liquid surfaces are translucent, frozen sheets opaque and depth-writing', () => {
    const liquid = buildLiquidSphere({ liquidState: 'liquid', liquidColor: 0x2878d0 }, { radius: 1, graphicsUniforms: gu() })
    const frozen = buildLiquidSphere({ liquidState: 'frozen', liquidColor: 0x90b0c0 }, { radius: 1, graphicsUniforms: gu() })
    const liqMat = liquid.mesh.material as THREE.MeshStandardMaterial
    const froMat = frozen.mesh.material as THREE.MeshStandardMaterial
    expect(liqMat.transparent).toBe(true)
    expect(liqMat.depthWrite).toBe(false)
    expect(liqMat.opacity).toBeLessThan(1)
    expect(froMat.transparent).toBe(false)
    expect(froMat.depthWrite).toBe(true)
    expect(froMat.opacity).toBe(1.0)
    liquid.dispose()
    frozen.dispose()
  })

  it('liquidColor on the body config drives the mesh colour', () => {
    const handle = buildLiquidSphere(
      { liquidState: 'liquid', liquidColor: 0xff00ff },
      { radius: 1, graphicsUniforms: gu() },
    )
    const mat = handle.mesh.material as THREE.MeshStandardMaterial
    expect(mat.color.getHex()).toBe(0xff00ff)
    handle.dispose()
  })

  it('falls back to a neutral colour when neither override nor body.liquidColor is set', () => {
    const liquid = buildLiquidSphere({ liquidState: 'liquid' }, { radius: 1, graphicsUniforms: gu() })
    const frozen = buildLiquidSphere({ liquidState: 'frozen' }, { radius: 1, graphicsUniforms: gu() })
    const liqMat = liquid.mesh.material as THREE.MeshStandardMaterial
    const froMat = frozen.mesh.material as THREE.MeshStandardMaterial
    expect(liqMat.color.getHex()).toBe(NEUTRAL_LIQUID)
    expect(froMat.color.getHex()).toBe(NEUTRAL_FROZEN)
    liquid.dispose()
    frozen.dispose()
  })

  it('options.color has priority over body.liquidColor', () => {
    const handle = buildLiquidSphere(
      { liquidState: 'liquid', liquidColor: 0xff00ff },
      { radius: 1, color: 0x00ff00, graphicsUniforms: gu() },
    )
    const mat = handle.mesh.material as THREE.MeshStandardMaterial
    expect(mat.color.getHex()).toBe(0x00ff00)
    handle.dispose()
  })

  it('setSeaLevel updates the scale; non-positive values hide the mesh', () => {
    const handle = buildLiquidSphere(
      { liquidState: 'liquid', liquidColor: 0x2878d0 },
      { radius: 1, graphicsUniforms: gu() },
    )
    handle.setSeaLevel(3)
    expect(handle.mesh.scale.x).toBeCloseTo(3, 5)
    expect(handle.mesh.visible).toBe(true)

    handle.setSeaLevel(0)
    expect(handle.mesh.visible).toBe(false)

    handle.setSeaLevel(2)
    expect(handle.mesh.scale.x).toBeCloseTo(2, 5)
    expect(handle.mesh.visible).toBe(true)
    handle.dispose()
  })

  it('setVisible + setOpacity mutate state without rebuild', () => {
    const handle = buildLiquidSphere(
      { liquidState: 'liquid', liquidColor: 0x2878d0 },
      { radius: 1, opacity: 0.5, graphicsUniforms: gu() },
    )
    const mat = handle.mesh.material as THREE.MeshStandardMaterial
    expect(mat.opacity).toBe(0.5)

    handle.setOpacity(0.2)
    expect(mat.opacity).toBe(0.2)

    handle.setOpacity(1.2) // clamped
    expect(mat.opacity).toBe(1.0)

    handle.setVisible(false)
    expect(handle.mesh.visible).toBe(false)
    handle.setVisible(true)
    expect(handle.mesh.visible).toBe(true)
    handle.dispose()
  })

  it('dispose releases geometry + material without throwing', () => {
    const handle = buildLiquidSphere(
      { liquidState: 'liquid', liquidColor: 0x2878d0 },
      { radius: 1, graphicsUniforms: gu() },
    )
    expect(() => handle.dispose()).not.toThrow()
  })
})
