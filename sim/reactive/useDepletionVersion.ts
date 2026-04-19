import { ref, type Ref } from 'vue'
import { depletionObservable } from '../tileDepletion'

/**
 * Vue adapter for the framework-agnostic `depletionObservable`.
 *
 * Exposes a reactive `Ref<number>` that mirrors the observable — Vue
 * `computed()` and `watch()` can depend on it as usual. The subscription is
 * registered once at module load; it persists for the lifetime of the page
 * (the depletion layer is a global singleton with matching lifetime).
 */
export const depletionVersion: Ref<number> = ref(depletionObservable.value)

depletionObservable.subscribe(value => {
  depletionVersion.value = value
})
