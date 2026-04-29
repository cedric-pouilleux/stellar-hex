/**
 * Custom resource catalogue + add/remove flow tests.
 *
 * Exercises both the leaf store (`extraResources.ts`) and the higher-level
 * helpers in `state.ts` (`addCustomResource`, `removeCustomResource`,
 * `allResources`) so a regression on either side surfaces here.
 */
import { afterEach, describe, it, expect } from 'vitest'
import {
  customResources,
  resolveExtraResources,
} from './extraResources'
import { DEMO_RESOURCES } from './resourceCatalog'
import {
  addCustomResource,
  removeCustomResource,
  allResources,
  resourceUIState,
} from './state'

afterEach(() => {
  // Clean every custom entry between tests — tests share the module-level
  // reactive ref, so leftover entries would leak across cases.
  for (const r of [...customResources.value]) removeCustomResource(r.id)
})

describe('extraResources', () => {
  it('starts empty', () => {
    expect(customResources.value).toEqual([])
    expect(resolveExtraResources()).toEqual(DEMO_RESOURCES)
  })
})

describe('addCustomResource', () => {
  it('appends a sol resource and seeds its UI state', () => {
    const id = addCustomResource({
      layer:       'sol',
      label:       'Tritium',
      color:       0xff66cc,
      patternKind: 'cluster',
    })
    expect(id).toBe('tritium')
    const spec = customResources.value.find(r => r.id === id)
    expect(spec).toBeDefined()
    expect(spec!.phase).toBe('mineral')
    expect(spec!.color).toBe(0xff66cc)
    expect(resourceUIState[id]).toEqual({
      enabled:     true,
      color:       0xff66cc,
      patternKind: 'cluster',
      weight:      1,
    })
  })

  it('appends an atmo resource on the gas phase', () => {
    const id = addCustomResource({
      layer:       'atmo',
      label:       'Phosphine',
      color:       0x88ff66,
      patternKind: 'scatter',
    })
    const spec = customResources.value.find(r => r.id === id)
    expect(spec!.phase).toBe('gas')
  })

  it('generates a unique id when the slug collides', () => {
    const a = addCustomResource({ layer: 'sol', label: 'Iron',  color: 0x111111, patternKind: 'cluster' })
    const b = addCustomResource({ layer: 'sol', label: 'Iron',  color: 0x222222, patternKind: 'cluster' })
    expect(a).not.toBe(b)
    expect(b).toMatch(/^iron-\d+$/)
  })

  it('falls back to "custom" when the label is symbol-only', () => {
    const id = addCustomResource({ layer: 'sol', label: '!!!', color: 0x000000, patternKind: 'cluster' })
    expect(id.startsWith('custom')).toBe(true)
  })
})

describe('removeCustomResource', () => {
  it('removes the spec and drops its UI state', () => {
    const id = addCustomResource({ layer: 'sol', label: 'Foo', color: 0x000, patternKind: 'cluster' })
    expect(resourceUIState[id]).toBeDefined()
    removeCustomResource(id)
    expect(customResources.value.find(r => r.id === id)).toBeUndefined()
    expect(resourceUIState[id]).toBeUndefined()
  })

  it('is a no-op for unknown / shipped ids', () => {
    const before = [...customResources.value]
    removeCustomResource('iron')
    removeCustomResource('does-not-exist')
    expect(customResources.value).toEqual(before)
  })
})

describe('allResources', () => {
  it('returns shipped + custom in that order', () => {
    addCustomResource({ layer: 'sol', label: 'Bar', color: 0x000, patternKind: 'cluster' })
    const all = allResources()
    expect(all.length).toBe(DEMO_RESOURCES.length + 1)
    for (let i = 0; i < DEMO_RESOURCES.length; i++) {
      expect(all[i].id).toBe(DEMO_RESOURCES[i].id)
    }
    expect(all[all.length - 1].id).toBe('bar')
  })
})
