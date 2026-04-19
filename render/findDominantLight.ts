/**
 * Scene-graph helper used by Cloud/Rings shells to locate the dominant light
 * source for their custom shader lighting math. Keeps builders completely
 * decoupled from any "sun" or "star" concept passed in from the caller — they
 * just observe whatever the scene exposes.
 */

import * as THREE from 'three'

/** Ascends `obj.parent` chain and returns the top-most ancestor (scene or root). */
export function findSceneRoot(obj: THREE.Object3D): THREE.Object3D {
  let cur: THREE.Object3D = obj
  while (cur.parent) cur = cur.parent
  return cur
}

const _tmpLightWP  = new THREE.Vector3()
const _tmpTargetWP = new THREE.Vector3()
const _tmpDir      = new THREE.Vector3()

/**
 * Writes the world-space position of the brightest `PointLight` or
 * `DirectionalLight` found anywhere under `root` into `out`.
 *
 * For directional lights, a virtual point is projected along `-direction` at a
 * large distance so that `normalize(out - fragWorldPos)` yields a near-parallel
 * light direction — matching the expectation of shaders that model the light as
 * a point source.
 *
 * @returns true when a light was found, false when the scene has none (caller
 *          should leave `out` at its last known value / default).
 */
export function findDominantLightWorldPos(
  root: THREE.Object3D,
  out:  THREE.Vector3,
): boolean {
  let best: THREE.Light | null = null
  let bestIntensity = -Infinity
  root.traverse((o) => {
    const l = o as THREE.Light & { isPointLight?: boolean; isDirectionalLight?: boolean }
    if (!(l.isPointLight || l.isDirectionalLight)) return
    if (!o.visible) return
    if (l.intensity > bestIntensity) {
      best          = l
      bestIntensity = l.intensity
    }
  })

  if (!best) return false
  const b = best as THREE.Light & { isDirectionalLight?: boolean; target?: THREE.Object3D }

  if (b.isDirectionalLight && b.target) {
    // THREE convention: dir = target.position - light.position, normalized.
    b.getWorldPosition(_tmpLightWP)
    b.target.getWorldPosition(_tmpTargetWP)
    _tmpDir.copy(_tmpTargetWP).sub(_tmpLightWP).normalize()
    // Virtual sun: far behind the directional light, in the direction it shines from.
    out.copy(_tmpLightWP).addScaledVector(_tmpDir, -1e5)
    return true
  }

  b.getWorldPosition(out)
  return true
}
