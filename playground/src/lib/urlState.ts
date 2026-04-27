/**
 * Two-way binding between the URL hash and a small subset of the playground
 * state — just enough to share a body seed + type via a copy/paste link.
 *
 * Hash format: `#seed=<name>&type=<libtype>`. Unknown keys are ignored so we
 * can extend the payload later without breaking old links.
 */

import { watch } from 'vue'
import type { LibBodyType } from '@lib'
import { bodyConfig, bodyType, rebuildKey } from './state'

const VALID_TYPES: readonly LibBodyType[] = ['rocky', 'gaseous', 'metallic', 'star']

/** Decodes the current hash into a `{ seed?, type? }` tuple — tolerant of missing keys. */
function readHash(): { seed?: string; type?: LibBodyType } {
  const h = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : ''
  if (!h) return {}
  const params = new URLSearchParams(h)
  const seed   = params.get('seed') ?? undefined
  const rawT   = params.get('type')
  const type   = rawT && (VALID_TYPES as readonly string[]).includes(rawT) ? (rawT as LibBodyType) : undefined
  return { seed, type }
}

/** Serialises state back to a hash string (no leading `#`). */
function encodeHash(seed: string, type: LibBodyType): string {
  const p = new URLSearchParams()
  p.set('seed', seed)
  p.set('type', type)
  return p.toString()
}

/**
 * Loads state from the current hash (if any) and wires a one-way watcher
 * that keeps the hash updated as the user edits the seed / type. Silent no-op
 * in non-browser environments (SSR, tests).
 *
 * @returns Disposer that detaches the watchers.
 */
export function installUrlStateSync(): () => void {
  if (typeof window === 'undefined') return () => {}

  // Hydrate from hash on boot — only fields that were explicitly present.
  const initial = readHash()
  if (initial.seed) bodyConfig.name = initial.seed
  if (initial.type) {
    bodyType.value = initial.type
    bodyConfig.type = initial.type
  }
  if (initial.seed || initial.type) rebuildKey.value++

  // Push updates back to the hash — history.replaceState avoids cluttering
  // the back/forward stack with every keystroke.
  const stop = watch(
    () => [bodyConfig.name, bodyType.value] as const,
    ([name, t]) => {
      const next = '#' + encodeHash(name, t)
      if (location.hash !== next) history.replaceState(null, '', next)
    },
    { immediate: true },
  )

  // React to user-driven hash edits (paste a link in a live tab).
  const onHash = () => {
    const h = readHash()
    if (h.seed && h.seed !== bodyConfig.name) bodyConfig.name = h.seed
    if (h.type && h.type !== bodyType.value) {
      bodyType.value = h.type
      bodyConfig.type = h.type
      rebuildKey.value++
    }
  }
  window.addEventListener('hashchange', onHash)

  return () => {
    stop()
    window.removeEventListener('hashchange', onHash)
  }
}
