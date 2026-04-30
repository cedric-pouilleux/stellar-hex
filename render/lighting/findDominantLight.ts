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

const _tmpTargetWP = new THREE.Vector3()
const _tmpDir      = new THREE.Vector3()

/**
 * Writes the world-space position of a single light into `out`. For point
 * lights, it's the literal world position. For directional lights, a virtual
 * point is projected far behind the light along its shine axis so that
 * `normalize(out - fragWorldPos)` yields a near-parallel direction —
 * matching the expectation of shaders that model the sun as a point source.
 *
 * Used by `useBody` and `buildBodyRings` to resolve a caller-supplied
 * `sunLight` into the same world-space sun position the auto-discovery path
 * (`findDominantLightWorldPos`) produces.
 */
export function resolveLightWorldPos(
  light: THREE.PointLight | THREE.DirectionalLight,
  out:   THREE.Vector3,
): void {
  const dirLight = light as THREE.DirectionalLight
  if (dirLight.isDirectionalLight && dirLight.target) {
    light.getWorldPosition(out)
    dirLight.target.getWorldPosition(_tmpTargetWP)
    _tmpDir.copy(_tmpTargetWP).sub(out).normalize()
    out.addScaledVector(_tmpDir, -1e5)
    return
  }
  light.getWorldPosition(out)
}

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
  resolveLightWorldPos(best as THREE.PointLight | THREE.DirectionalLight, out)
  return true
}
