import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { findSceneRoot, findDominantLightWorldPos } from './findDominantLight'

describe('findSceneRoot', () => {
  it('returns the object itself when it has no parent', () => {
    const root = new THREE.Group()
    expect(findSceneRoot(root)).toBe(root)
  })

  it('ascends the parent chain to the top-most ancestor', () => {
    const root  = new THREE.Scene()
    const mid   = new THREE.Group()
    const leaf  = new THREE.Mesh()
    root.add(mid)
    mid.add(leaf)
    expect(findSceneRoot(leaf)).toBe(root)
  })
})

describe('findDominantLightWorldPos', () => {
  it('returns false and leaves out untouched when no lights exist', () => {
    const scene = new THREE.Scene()
    const out   = new THREE.Vector3(42, 42, 42)
    expect(findDominantLightWorldPos(scene, out)).toBe(false)
    expect(out.toArray()).toEqual([42, 42, 42])
  })

  it('picks the brightest PointLight and writes its world position', () => {
    const scene = new THREE.Scene()
    const dim   = new THREE.PointLight(0xffffff, 1)
    dim.position.set(1, 0, 0)
    const bright = new THREE.PointLight(0xffffff, 10)
    bright.position.set(0, 5, 0)
    scene.add(dim, bright)
    scene.updateMatrixWorld(true)

    const out = new THREE.Vector3()
    expect(findDominantLightWorldPos(scene, out)).toBe(true)
    expect(out.toArray()).toEqual([0, 5, 0])
  })

  it('accounts for nested group transforms when reading world position', () => {
    const scene = new THREE.Scene()
    const group = new THREE.Group()
    group.position.set(10, 0, 0)
    const light = new THREE.PointLight(0xffffff, 5)
    light.position.set(0, 2, 0)
    group.add(light)
    scene.add(group)
    scene.updateMatrixWorld(true)

    const out = new THREE.Vector3()
    findDominantLightWorldPos(scene, out)
    expect(out.toArray()).toEqual([10, 2, 0])
  })

  it('projects a DirectionalLight to a far virtual point along -direction', () => {
    const scene = new THREE.Scene()
    const light = new THREE.DirectionalLight(0xffffff, 3)
    light.position.set(0, 0, 0)
    light.target.position.set(0, 0, -1)            // shines along -Z
    scene.add(light, light.target)
    scene.updateMatrixWorld(true)

    const out = new THREE.Vector3()
    expect(findDominantLightWorldPos(scene, out)).toBe(true)
    // dir = (0,0,-1); virtual = pos + dir * -1e5 = (0, 0, 1e5)
    expect(out.z).toBeGreaterThan(1e4)
    expect(out.x).toBeCloseTo(0)
    expect(out.y).toBeCloseTo(0)
  })

  it('prefers a brighter PointLight over a dimmer DirectionalLight', () => {
    const scene = new THREE.Scene()
    const dir   = new THREE.DirectionalLight(0xffffff, 1)
    const pt    = new THREE.PointLight(0xffffff, 5)
    pt.position.set(7, 7, 7)
    scene.add(dir, pt)
    scene.updateMatrixWorld(true)

    const out = new THREE.Vector3()
    findDominantLightWorldPos(scene, out)
    expect(out.toArray()).toEqual([7, 7, 7])
  })

  it('ignores invisible lights', () => {
    const scene = new THREE.Scene()
    const off   = new THREE.PointLight(0xffffff, 100)
    off.visible = false
    off.position.set(99, 99, 99)
    const on    = new THREE.PointLight(0xffffff, 1)
    on.position.set(0, 1, 0)
    scene.add(off, on)
    scene.updateMatrixWorld(true)

    const out = new THREE.Vector3()
    findDominantLightWorldPos(scene, out)
    expect(out.toArray()).toEqual([0, 1, 0])
  })
})
