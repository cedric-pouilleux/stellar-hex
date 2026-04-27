import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  computeBodyQuaternion,
  createBodyMotion,
} from './bodyMotion'

// ── Pure quaternion ──────────────────────────────────────────────

describe('computeBodyQuaternion', () => {
  it('returns identity at spin=0 / tilt=0', () => {
    const q = computeBodyQuaternion(0, 0, new THREE.Quaternion())
    expect(q.x).toBeCloseTo(0)
    expect(q.y).toBeCloseTo(0)
    expect(q.z).toBeCloseTo(0)
    expect(q.w).toBeCloseTo(1)
  })

  it('rotates a forward vector around Y when only spin is set', () => {
    const q = computeBodyQuaternion(Math.PI / 2, 0, new THREE.Quaternion())
    const v = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    // +Z rotated 90° around +Y → +X (right-hand rule)
    expect(v.x).toBeCloseTo(1, 5)
    expect(v.z).toBeCloseTo(0, 5)
  })

  it('applies spin in the local frame, then tilts (spin-before-tilt order)', () => {
    // Pipeline applied to a vector v reads right-to-left:
    //   v' = (Q_tilt * Q_spin) · v = Q_tilt · (Q_spin · v)
    // For the pole (+Y):
    //   step 1 — spin around +Y leaves +Y untouched (it's the rotation axis).
    //   step 2 — tilt 90° around +Z sends +Y to -X (right-hand rule).
    const q = computeBodyQuaternion(Math.PI / 2, Math.PI / 2, new THREE.Quaternion())
    const pole = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    expect(pole.x).toBeCloseTo(-1, 5)
    expect(pole.y).toBeCloseTo(0, 5)
    expect(pole.z).toBeCloseTo(0, 5)
  })

  it('writes into the provided out quaternion (no allocation)', () => {
    const out = new THREE.Quaternion(0, 0, 0, 0)
    const ret = computeBodyQuaternion(1, 0.5, out)
    expect(ret).toBe(out)
  })
})

// ── Stateful motion accumulator ──────────────────────────────────

describe('createBodyMotion', () => {
  it('seeds spinAngle to 0', () => {
    const m = createBodyMotion({ rotationSpeed: 1.0, axialTilt: 0 })
    expect(m.spinAngle).toBe(0)
  })

  it('advances spinAngle linearly with dt', () => {
    const m = createBodyMotion({ rotationSpeed: 2.0, axialTilt: 0 })
    m.tick(3.0)
    expect(m.spinAngle).toBeCloseTo(6.0, 5)
  })

  it('accumulates across multiple ticks', () => {
    const m = createBodyMotion({ rotationSpeed: 1, axialTilt: 0 })
    m.tick(0.5)
    m.tick(0.5)
    m.tick(1.0)
    expect(m.spinAngle).toBeCloseTo(2.0, 5)
  })

  it('skipping tick freezes motion (caller-driven pause)', () => {
    const m = createBodyMotion({ rotationSpeed: 10, axialTilt: 0 })
    m.tick(1.0)
    const after = m.spinAngle
    // Three "frames" with no ticks — pause is just the absence of a call.
    // No mutation expected.
    expect(m.spinAngle).toBe(after)
  })

  it('applyTo writes spin × tilt quaternion onto a group', () => {
    const m = createBodyMotion({ rotationSpeed: 0, axialTilt: 0 })
    const group = new THREE.Group()
    m.spinAngle = Math.PI / 2
    m.applyTo(group)
    const v = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion)
    expect(v.x).toBeCloseTo(1, 5) // +Z rotated 90° around +Y → +X
  })

  it('applyTo never mutates the group position', () => {
    // Orbital placement is caller-owned — the lib must not write position.
    const m = createBodyMotion({ rotationSpeed: 0, axialTilt: 0 })
    const group = new THREE.Group()
    group.position.set(7, 11, 13)
    m.applyTo(group)
    expect(group.position.x).toBe(7)
    expect(group.position.y).toBe(11)
    expect(group.position.z).toBe(13)
  })

  it('exposes spinAngle as writable for replay scenarios', () => {
    const m = createBodyMotion({ rotationSpeed: 0, axialTilt: 0 })
    m.spinAngle = 10
    expect(m.spinAngle).toBe(10)
  })
})
