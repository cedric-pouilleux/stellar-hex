import { describe, it, expect } from 'vitest'
import type { BodyConfig } from '@lib'
import { liquidAccent, liquidLabel, resolveLiquidState } from './liquidDiagnostics'

function rocky(overrides: Partial<BodyConfig> = {}): BodyConfig {
  return {
    type:           'rocky',
    name:           'test',
    radius:         1,
    rotationSpeed:  0.01,
    axialTilt:      0,
    temperatureMin: -10,
    temperatureMax: 30,
    liquidType:     'water',
    liquidState:    'liquid',
    liquidCoverage: 0.5,
    ...overrides,
  }
}

describe('resolveLiquidState', () => {
  it('reflects the caller-picked liquid type and state', () => {
    const s = resolveLiquidState(rocky())
    expect(s.liquidType).toBe('water')
    expect(s.hasLiquid).toBe(true)
    expect(s.hasSurfaceBody).toBe(true)
  })

  it('passes through any recognised liquid type regardless of temperature', () => {
    const s = resolveLiquidState(rocky({
      temperatureMin: 80, temperatureMax: 120,
      liquidType: 'methane', liquidState: 'liquid',
    }))
    expect(s.liquidType).toBe('methane')
    expect(s.hasLiquid).toBe(true)
  })

  it('reports a frozen surface when the caller sets liquidState = frozen', () => {
    const s = resolveLiquidState(rocky({ liquidType: 'water', liquidState: 'frozen' }))
    expect(s.hasLiquid).toBe(false)
    expect(s.hasSurfaceBody).toBe(true)
    expect(s.liquidType).toBe('water')
  })

  it('returns a dry profile when liquidState is none', () => {
    const s = resolveLiquidState(rocky({ liquidType: undefined, liquidState: 'none' }))
    expect(s.liquidType).toBeUndefined()
    expect(s.hasLiquid).toBe(false)
    expect(s.hasSurfaceBody).toBe(false)
  })

  it('returns a dry profile for non-rocky bodies', () => {
    const s = resolveLiquidState(rocky({ type: 'gaseous' }))
    expect(s.liquidType).toBeUndefined()
    expect(s.hasLiquid).toBe(false)
    expect(s.hasSurfaceBody).toBe(false)
  })

  it('ignores unknown liquid tags', () => {
    const s = resolveLiquidState(rocky({ liquidType: 'plasma' }))
    expect(s.liquidType).toBeUndefined()
    expect(s.hasSurfaceBody).toBe(true)
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
