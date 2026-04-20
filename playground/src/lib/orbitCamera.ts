import * as THREE from 'three'
import { applyCamera, cameraState, rotateCamera, zoomCamera } from './cameraSync'

/**
 * Installs pointer/wheel handlers that feed the shared {@link cameraState} so
 * every pane mounting this helper drives — and follows — the same orbit.
 * The caller still owns `applyCamera()` in its own render loop; this helper
 * is strictly input.
 */
export function installOrbitCamera(
  _camera: THREE.PerspectiveCamera,
  dom: HTMLElement,
  opts: { minDist?: number; maxDist?: number; initialDistance?: number } = {},
) {
  const minDist = opts.minDist ?? 1
  const maxDist = opts.maxDist ?? 50
  if (opts.initialDistance !== undefined && cameraState.version === 0) {
    cameraState.radius = opts.initialDistance
  }

  let dragging = false
  let lastX = 0, lastY = 0

  function onDown(e: PointerEvent) {
    dragging = true
    lastX = e.clientX; lastY = e.clientY
    dom.setPointerCapture(e.pointerId)
  }
  function onMove(e: PointerEvent) {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX; lastY = e.clientY
    rotateCamera(dx * 0.005, dy * 0.005)
  }
  function onUp(e: PointerEvent) {
    dragging = false
    try { dom.releasePointerCapture(e.pointerId) } catch {}
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault()
    zoomCamera(Math.exp(e.deltaY * 0.0015), minDist, maxDist)
  }

  dom.addEventListener('pointerdown', onDown)
  dom.addEventListener('pointermove', onMove)
  dom.addEventListener('pointerup',   onUp)
  dom.addEventListener('wheel',       onWheel, { passive: false })

  return {
    dispose() {
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerup',   onUp)
      dom.removeEventListener('wheel',       onWheel)
    },
  }
}

export { applyCamera, cameraState }
