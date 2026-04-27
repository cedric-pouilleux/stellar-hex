import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createHoverChannel } from './hoverState'

/**
 * The hover/pin channel was a singleton in earlier revisions, which made
 * multi-body scenes share a single hover slot. The factory pattern is the
 * fix; these tests pin the contract so it cannot regress to a global.
 */
describe('createHoverChannel', () => {
  it('returns a fresh channel with all four refs nulled', () => {
    const channel = createHoverChannel()
    expect(channel.hoverLocalPos.value).toBeNull()
    expect(channel.hoverParentGroup.value).toBeNull()
    expect(channel.pinLocalPos.value).toBeNull()
    expect(channel.pinParentGroup.value).toBeNull()
  })

  it('returns independent instances on every call', () => {
    const a = createHoverChannel()
    const b = createHoverChannel()
    expect(a).not.toBe(b)
    expect(a.hoverLocalPos).not.toBe(b.hoverLocalPos)
    expect(a.hoverParentGroup).not.toBe(b.hoverParentGroup)
    expect(a.pinLocalPos).not.toBe(b.pinLocalPos)
    expect(a.pinParentGroup).not.toBe(b.pinParentGroup)
  })

  it('isolates writes — mutating one channel does not affect another', () => {
    const a = createHoverChannel()
    const b = createHoverChannel()
    const v = new THREE.Vector3(1, 2, 3)
    const g = new THREE.Group()

    a.hoverLocalPos.value    = v
    a.hoverParentGroup.value = g

    expect(b.hoverLocalPos.value).toBeNull()
    expect(b.hoverParentGroup.value).toBeNull()
  })

  it('isolates pin slot independently from hover slot', () => {
    const channel = createHoverChannel()
    const v = new THREE.Vector3(0, 0, 1)
    const g = new THREE.Group()

    channel.pinLocalPos.value    = v
    channel.pinParentGroup.value = g

    // Pin write must not bleed into the hover slot — the popover anchor and
    // the hover ring are tracked independently.
    expect(channel.hoverLocalPos.value).toBeNull()
    expect(channel.hoverParentGroup.value).toBeNull()
  })
})
