/**
 * Pure body-orientation math + a small stateful accumulator.
 *
 * Body rotation is **always cosmetic** in this lib: a server-authoritative
 * MMO does not observe a planet's spin, so there is no driveable orientation
 * mode. Spin / axial-tilt is integrated locally on the client, on the
 * caller's chosen time source. Splitting the math from the time source
 * keeps that flexibility:
 *
 * | Use case                | Data            | Integration | Time source     |
 * |-------------------------|-----------------|-------------|-----------------|
 * | Demo / preview          | `BodyConfig`    | local       | render loop     |
 * | Replay / scrub UI       | `BodyConfig`    | local       | replay clock    |
 *
 * This module exposes:
 *   - {@link computeBodyQuaternion} — pure: `(spinAngle, axialTilt) → Q`.
 *   - {@link createBodyMotion} — small accumulator handle: owns the spin
 *     angle, `tick(dt)` advances it. The caller decides when to call
 *     `tick`, so pause / speed-multiplier / replay-scrub all become
 *     caller-side concerns instead of lib state.
 *
 * Orbital placement is deliberately out of scope: where a body sits in
 * world space is a game-domain concern (server simulation, scripted path,
 * scene composition). The lib only describes the body's own physical
 * orientation.
 */

import * as THREE from 'three'

// ── Shared scratch buffers ────────────────────────────────────────────────
// Module-level scratch — write/read in a single expression, no reentrancy
// risk in the body-motion math (no recursive calls). Saves ~2 quaternion
// allocations per frame per body, which adds up at MMO body counts.
const _tiltQuat = new THREE.Quaternion()
const _spinQuat = new THREE.Quaternion()
const Y_AXIS    = new THREE.Vector3(0, 1, 0)
const Z_AXIS    = new THREE.Vector3(0, 0, 1)

/**
 * Composes the body's world quaternion from its spin angle and axial tilt.
 *
 * The order is `Q = Q_tilt(Z) * Q_spin(Y)` — spin is applied **first** in
 * the local frame, then the tilt rotates the spinning sphere around the
 * Z axis. Reversing the order would tilt the pole first and rotate around
 * world-Y, making the pole trace a cone (visible "tumble").
 *
 * @param spinAngle - Accumulated self-rotation around the local Y axis (rad).
 * @param axialTilt - Body's axial tilt around the local Z axis (rad).
 * @param out       - Quaternion to write into. Returned for fluent chaining.
 */
export function computeBodyQuaternion(
  spinAngle: number,
  axialTilt: number,
  out:       THREE.Quaternion,
): THREE.Quaternion {
  _tiltQuat.setFromAxisAngle(Z_AXIS, axialTilt)
  _spinQuat.setFromAxisAngle(Y_AXIS, spinAngle)
  return out.copy(_tiltQuat).multiply(_spinQuat)
}

/** Body orientation inputs read by {@link createBodyMotion}. */
export interface BodyMotionInput {
  /** Self-rotation speed around the local Y axis (rad/s). */
  rotationSpeed: number
  /** Axial tilt around the local Z axis (rad). */
  axialTilt:     number
}

/**
 * Stateful handle returned by {@link createBodyMotion}. Owns the spin
 * angle accumulator and writes the resulting orientation onto a target
 * `THREE.Group`.
 */
export interface BodyMotionHandle {
  /** Accumulated self-rotation angle (rad). Mutable for replay / scrub. */
  spinAngle:  number
  /**
   * Advances {@link spinAngle} by the elapsed `dt`. The caller decides
   * whether and when to call this — passing `0` (or skipping the call
   * entirely) freezes the body's rotation, which is how "pause" is
   * expressed without the lib needing to know about pause.
   */
  tick: (dt: number) => void
  /**
   * Writes the current orientation onto a `THREE.Group`. Only the
   * quaternion is touched — the group's world position is left untouched
   * so the caller stays in charge of placing the body in the scene.
   */
  applyTo: (group: THREE.Group) => void
}

/**
 * Small accumulator for body self-rotation.
 *
 * Stateful (owns `spinAngle`) but framework-agnostic — no Vue, no TresJS,
 * no render-loop coupling. The caller drives `tick(dt)` from whichever
 * clock is authoritative (render loop, server tick, replay scrub, …).
 * Calling `applyTo(group)` writes the resulting quaternion onto the
 * body's `THREE.Group`.
 *
 * @param input - Body orientation physics (`rotationSpeed`, `axialTilt`).
 */
export function createBodyMotion(input: BodyMotionInput): BodyMotionHandle {
  let spinAngle = 0

  const _quat = new THREE.Quaternion()

  function tick(dt: number): void {
    spinAngle += input.rotationSpeed * dt
  }

  function applyTo(group: THREE.Group): void {
    computeBodyQuaternion(spinAngle, input.axialTilt, _quat)
    group.quaternion.copy(_quat)
  }

  return {
    get spinAngle()  { return spinAngle },
    set spinAngle(v: number) { spinAngle = v },
    tick,
    applyTo,
  }
}
