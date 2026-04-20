/**
 * Tiny framework-agnostic observable primitive used by the Vue-free core
 * of `features/body`.
 *
 * Shape is deliberately compatible with Vue's `Ref<T>` so reads via `.value`
 * behave the same. Reactivity is delivered via explicit `subscribe()` — Vue
 * adapters wrap the observable into a real `Ref<T>` at the boundary so that
 * `computed()` / `watch()` establish proper Vue dependencies.
 */

export interface Observable<T> {
  readonly value: T
  subscribe(fn: (value: T) => void): () => void
}

/**
 * Writable variant of `Observable<T>` — exposes a settable `value` so the
 * producer can push updates. Consumers should depend on `Observable<T>`
 * when they only need to read.
 */
export interface MutableObservable<T> extends Observable<T> {
  value: T
}

/**
 * Creates a mutable observable initialised with `initial`. Setters compare
 * with `Object.is` so assigning the same value is a no-op (no listener spam).
 */
export function createObservable<T>(initial: T): MutableObservable<T> {
  let current = initial
  const listeners = new Set<(value: T) => void>()

  return {
    get value() {
      return current
    },
    set value(next: T) {
      if (Object.is(next, current)) return
      current = next
      for (const fn of listeners) fn(next)
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
  }
}
