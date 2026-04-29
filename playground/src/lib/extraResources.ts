/**
 * Runtime-extensible resource catalogue, kept as a leaf module so both
 * `state.ts` (UI side) and `resourceDemo.ts` (distribution side) can read
 * from it without creating a circular dependency.
 *
 * Mutations flow through `state.ts` (`addCustomResource` /
 * `removeCustomResource`); this module only exposes the reactive ref + a
 * non-reactive accessor for non-component callers.
 */
import { ref } from 'vue'
import { DEMO_RESOURCES, type ResourceSpec } from './resourceCatalog'

/**
 * Reactive list of user-added resources. Empty by default; mutated by
 * `state.ts#addCustomResource` and consumed by every iteration site that
 * needs to surface user-added entries (UI listing, paint registry sync,
 * sol & atmo distribution).
 */
export const customResources = ref<ResourceSpec[]>([])

/**
 * Convenience accessor returning the merged catalogue (shipped + custom).
 * Use this from any iteration site that should pick up runtime additions.
 */
export function resolveExtraResources(): ResourceSpec[] {
  return DEMO_RESOURCES.concat(customResources.value)
}
