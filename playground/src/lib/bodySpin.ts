import * as THREE from 'three'

/**
 * Creates a self-rotation controller for a body group in the playground.
 *
 * Accumulates spin angle over time and applies the quaternion
 * `Q = tilt(Z) * spin(Y)` to the group each frame. The spin-before-tilt
 * order matches {@link "../../../scene/BodyController.vue"}: tilting first
 * would make the pole trace a cone instead of rotating around its own axis.
 *
 * @returns An `update` function to call each frame with `dt`, the target
 *          `group`, and the current `rotationSpeed` / `axialTilt` (radians).
 */
export function createBodySpin() {
  let spinAngle = 0
  const _tiltQuat = new THREE.Quaternion()
  const _spinQuat = new THREE.Quaternion()
  const _yAxis    = new THREE.Vector3(0, 1, 0)
  const _zAxis    = new THREE.Vector3(0, 0, 1)

  function update(
    dt:            number,
    group:         THREE.Group,
    rotationSpeed: number,
    axialTilt:     number,
  ) {
    spinAngle += rotationSpeed * dt
    _tiltQuat.setFromAxisAngle(_zAxis, axialTilt)
    _spinQuat.setFromAxisAngle(_yAxis, spinAngle)
    group.quaternion.copy(_tiltQuat).multiply(_spinQuat)
  }

  return { update }
}
