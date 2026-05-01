import { ref, watch } from 'vue'

export type ImplMode = 'three' | 'vue'

const STORAGE_KEY = 'stellex-js-impl-mode'

/** Module-level singleton so all DemoBlock instances share the same reactive state. */
const mode = ref<ImplMode>('three')

/** Initialise from localStorage — only runs client-side. */
if (typeof localStorage !== 'undefined') {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'three' || stored === 'vue') mode.value = stored
}

watch(mode, (v) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, v)
})

/**
 * Global implementation-mode switcher shared across all DemoBlock instances.
 * Persists the user's choice in localStorage.
 */
export function useImplMode() {
  return {
    mode,
    setMode: (v: ImplMode) => { mode.value = v },
  }
}
