import type * as THREE from 'three'

/**
 * Heuristically toggles the inner-core mesh visibility on a body.
 *
 * The lib's `body.view.set(...)` controls the core only via the
 * `'surface' | 'atmosphere'` enum. Demos that expose a "shader" mode
 * (smooth sphere with no relief) need to hide the core too — otherwise
 * the core's point light leaks through the smooth sphere as a glow.
 *
 * Detection: the core mesh is the *only* mesh in the body group that
 * carries a PointLight as a direct child (the lib parents the core's
 * pulsating light to the mesh in `buildCoreMesh.ts`). This signal is
 * unique and stable, unlike material-based heuristics that can collide
 * with other shader meshes (smooth sphere, atmo shell).
 *
 * @param body    - Body handle returned by `useBody`.
 * @param visible - `true` to show the core, `false` to hide it (and its light).
 */
export function setBodyCoreVisible(
  body: { group: THREE.Group },
  visible: boolean,
): void {
  for (const child of body.group.children) {
    const mesh = child as THREE.Mesh
    if (!('isMesh' in mesh) || !mesh.isMesh) continue

    let lightChild: THREE.PointLight | null = null
    for (const sub of mesh.children) {
      if ((sub as THREE.PointLight).isLight) {
        lightChild = sub as THREE.PointLight
        break
      }
    }
    if (!lightChild) continue

    mesh.visible        = visible
    lightChild.visible  = visible
    return
  }
}
