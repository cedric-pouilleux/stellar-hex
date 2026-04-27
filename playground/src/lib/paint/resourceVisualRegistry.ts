import type * as THREE from 'three'

/**
 * Three.js rendering properties attached to a resource id.
 *
 * Playground-local registry: the lib no longer carries any resource
 * vocabulary. Consumers register their resource visuals here at app
 * startup; the paint pipeline reads them when tinting tiles.
 */
export interface ResourceVisual {
  /** THREE.Color used for per-vertex blending in the hex mesh. */
  color:              THREE.Color
  /** Metalness override when this resource is dominant on a tile (0..1). */
  metalness:          number
  /** Roughness override when this resource is dominant on a tile (0..1). */
  roughness:          number
  /** Optional emissive color (e.g., rare_earth glow, platinum sheen). */
  emissive?:          THREE.Color
  /** Emissive intensity (0..2). */
  emissiveIntensity?: number
  /**
   * Max blend fraction of resource color onto tile (0..1).
   * Kept moderate so the biome base color remains readable.
   */
  colorBlend:         number
}

const registry = new Map<string, ResourceVisual>()

/**
 * Registers the rendering properties for a resource id. Safe to call
 * multiple times — subsequent registrations override previous ones.
 */
export function registerResourceVisual(id: string, visual: ResourceVisual): void {
  registry.set(id, visual)
}

/**
 * Returns the visual rendering properties for a resource, or undefined
 * when no visual has been registered for that id. The paint pipeline
 * falls back to the base palette color when this returns undefined.
 */
export function getResourceVisual(id: string): ResourceVisual | undefined {
  return registry.get(id)
}
