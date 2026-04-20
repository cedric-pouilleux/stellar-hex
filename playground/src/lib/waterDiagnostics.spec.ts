import { describe, it, expect } from 'vitest'
import type { BodyConfig } from '@lib'
import { liquidAccent, liquidLabel, resolveWaterState } from './waterDiagnostics'

function rocky(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    type:           'rocky',
    name:           'test',
    radius:         1,
    rotationSpeed:  0.01,
    axialTilt:      0,
    temperatureMin: -10,
    temperatureMax: 30,
    ...overrides,
  }
}

describe('resolveWaterState', () => {
  it('picks liquid water on a temperate rocky world', () => {
    const s = resolveWaterState(rocky())
    expect(s.liquidType).toBe('water')
    expect(s.hasLiquid).toBe(true)
    expect(s.hasSurfaceBody).toBe(true)
  })

  it('picks liquid methane on a Titan-like world', () => {
    const s = resolveWaterState(rocky({ temperatureMin: -185, temperatureMax: -170 }))
    expect(s.liquidType).toBe('methane')
    expect(s.hasLiquid).toBe(true)
  })

  it('returns a frozen surface for a sub-zero world with no liquid window', () => {
    const s = resolveWaterState(rocky({ temperatureMin: -40, temperatureMax: -10 }))
    expect(s.hasLiquid).toBe(false)
    expect(s.hasSurfaceBody).toBe(true)
    expect(s.liquidType).toBe('water') // frozen water ice
  })

  it('returns a dry profile for non-rocky bodies', () => {
    const s = resolveWaterState(rocky({ type: 'gaseous' }))
    expect(s.liquidType).toBeUndefined()
    expect(s.hasLiquid).toBe(false)
    expect(s.hasSurfaceBody).toBe(false)
  })
})

describe('liquidLabel', () => {
  it('labels liquid water with its chemical formula', () => {
    expect(liquidLabel({ liquidType: 'water', hasLiquid: true, hasSurfaceBody: true })).toContain('Water')
  })
  it('flags a frozen liquid in the label', () => {
    expect(liquidLabel({ liquidType: 'ammonia', hasLiquid: false, hasSurfaceBody: true })).toMatch(/frozen/i)
  })
  it('falls back to "Dry" when no surface body is possible', () => {
    expect(liquidLabel({ liquidType: undefined, hasLiquid: false, hasSurfaceBody: false })).toBe('Dry')
  })
  it('falls back to "Frozen surface" when the body hosts ice but no liquid', () => {
    expect(liquidLabel({ liquidType: undefined, hasLiquid: false, hasSurfaceBody: true })).toBe('Frozen surface')
  })
})

describe('liquidAccent', () => {
  it('returns distinct colours per liquid kind', () => {
    const state = (t: any) => ({ liquidType: t, hasLiquid: true, hasSurfaceBody: true })
    const colours = ['water', 'ammonia', 'methane', 'nitrogen'].map(t => liquidAccent(state(t)))
    expect(new Set(colours).size).toBe(4)
  })
  it('returns a neutral grey for dry worlds', () => {
    expect(liquidAccent({ liquidType: undefined, hasLiquid: false, hasSurfaceBody: false })).toBe('#5a6370')
  })
})
