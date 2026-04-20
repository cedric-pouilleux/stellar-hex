import * as THREE from 'three'

/**
 * Shared spherical coords driving both preview cameras. Stored at module scope
 * (outside Vue reactivity) so pointer/wheel events from either pane write
 * here directly, and every other pane's camera re-reads on the next frame.
 *
 * `version` increments on every mutation so panes that observe the store can
 * apply the update lazily inside their render loop instead of listening to
 * events — one source of truth, zero lifecycle coupling.
 */
export interface CameraState {
  theta:   number
  phi:     number
  radius:  number
  version: number
}

export const cameraState: CameraState = {
  theta:  0,
  phi:    Math.PI / 2 - 0.25,
  radius: 10,
  version: 0,
}

export function rotateCamera(dTheta: number, dPhi: number) {
  cameraState.theta -= dTheta
  cameraState.phi   = Math.max(0.05, Math.min(Math.PI - 0.05, cameraState.phi - dPhi))
  cameraState.version++
}

export function zoomCamera(factor: number, minDist: number, maxDist: number) {
  cameraState.radius = Math.max(minDist, Math.min(maxDist, cameraState.radius * factor))
  cameraState.version++
}

const _v = new THREE.Vector3()
const _s = new THREE.Spherical()

/** Applies the shared camera state to a local camera + target point. */
export function applyCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3) {
  _s.set(cameraState.radius, cameraState.phi, cameraState.theta)
  _v.setFromSpherical(_s)
  camera.position.copy(target).add(_v)
  camera.lookAt(target)
}
