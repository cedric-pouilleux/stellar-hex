import * as THREE from 'three'

/**
 * The lib's `injectRingShadow` patches planet materials with a
 * `uRingSunWorldPos` uniform defaulting to world origin. In the main app the
 * star sits at the origin so that default is correct; in the playground the
 * dominant light is a `DirectionalLight` offset from the body, so we need to
 * refresh the uniform each frame to a virtual far-point along the light
 * direction (matching `findDominantLight`'s convention).
 *
 * Walks the body group, finds every `ShaderMaterial` carrying the ring-shadow
 * uniform, and points them at the supplied virtual sun. Cheap — materials
 * rarely change and the traversal stops at the first level of children for
 * smooth-sphere / gas / metallic setups.
 */

export function syncRingShadowSun(
  root:           THREE.Object3D,
  sunWorldPos:    THREE.Vector3,
): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | THREE.ShaderMaterial[] | undefined
    if (!m) return
    const list = Array.isArray(m) ? m : [m]
    for (const mat of list) {
      const uni = (mat as THREE.ShaderMaterial).uniforms?.uRingSunWorldPos
      if (uni?.value instanceof THREE.Vector3) uni.value.copy(sunWorldPos)
    }
  })
}
