import { describe, expect, it } from 'vitest'
import { viewModeForHold } from './heroPlanetView'

describe('viewModeForHold', () => {
  it('returns surface while the left button is held', () => {
    expect(viewModeForHold(0)).toBe('surface')
  })

  it('returns atmosphere while the right button is held', () => {
    expect(viewModeForHold(2)).toBe('atmosphere')
  })

  it('falls back to shader for the middle button', () => {
    expect(viewModeForHold(1)).toBe('shader')
  })

  it('falls back to shader for any unknown button code', () => {
    expect(viewModeForHold(3)).toBe('shader')
    expect(viewModeForHold(-1)).toBe('shader')
  })
})
