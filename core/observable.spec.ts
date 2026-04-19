import { describe, it, expect, vi } from 'vitest'
import { createObservable } from './observable'

describe('createObservable', () => {
  it('stores the initial value and reflects reads via `.value`', () => {
    const obs = createObservable(42)
    expect(obs.value).toBe(42)
  })

  it('updates `.value` and notifies subscribers when the value changes', () => {
    const obs = createObservable<string | null>(null)
    const fn  = vi.fn()
    obs.subscribe(fn)

    obs.value = 'hello'

    expect(obs.value).toBe('hello')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('hello')
  })

  it('skips notification when the new value is strictly identical (Object.is)', () => {
    const obs = createObservable(7)
    const fn  = vi.fn()
    obs.subscribe(fn)

    obs.value = 7
    obs.value = 7

    expect(fn).not.toHaveBeenCalled()
  })

  it('notifies all active subscribers in insertion order', () => {
    const obs = createObservable(0)
    const order: string[] = []
    obs.subscribe(() => order.push('a'))
    obs.subscribe(() => order.push('b'))
    obs.subscribe(() => order.push('c'))

    obs.value = 1

    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('returns an unsubscribe function that stops further notifications', () => {
    const obs   = createObservable(0)
    const fn    = vi.fn()
    const unsub = obs.subscribe(fn)

    obs.value = 1
    expect(fn).toHaveBeenCalledTimes(1)

    unsub()
    obs.value = 2
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
