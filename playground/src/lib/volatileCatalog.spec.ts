import { describe, it, expect } from 'vitest'
import {
  VOLATILES,
  VOLATILE_IDS,
  getVolatile,
  volatileState,
  volatileTintAt,
} from './volatileCatalog'

describe('VOLATILES catalogue', () => {
  it('covers h2o / ch4 / nh3 / n2 / co2 / h2he', () => {
    expect(VOLATILE_IDS).toEqual(['h2o', 'ch4', 'nh3', 'n2', 'co2', 'h2he'])
  })

  it('every entry declares non-negative melt/boil anchors', () => {
    for (const id of VOLATILE_IDS) {
      const v = VOLATILES[id]
      expect(v.meltK).toBeGreaterThan(0)
      expect(v.boilK).toBeGreaterThanOrEqual(v.meltK)
    }
  })

  it('every entry declares three distinct phase colours', () => {
    for (const id of VOLATILE_IDS) {
      const v = VOLATILES[id]
      expect(typeof v.solidColor).toBe('number')
      expect(typeof v.liquidColor).toBe('number')
      expect(typeof v.gasColor).toBe('number')
    }
  })
})

describe('volatileState', () => {
  it('reports solid below the melting point (h2o @ 200 K → ice)', () => {
    expect(volatileState(VOLATILES.h2o, 200)).toBe('solid')
  })

  it('reports liquid between melt and boil (h2o @ 300 K → ocean)', () => {
    expect(volatileState(VOLATILES.h2o, 300)).toBe('liquid')
  })

  it('reports gas above the boiling point (h2o @ 400 K → vapour)', () => {
    expect(volatileState(VOLATILES.h2o, 400)).toBe('gas')
  })

  it('ch4 is liquid on a Titan-like 95 K body', () => {
    expect(volatileState(VOLATILES.ch4, 95)).toBe('liquid')
  })

  it('n2 is gas on Earth but liquid on a Pluto-like 70 K body', () => {
    expect(volatileState(VOLATILES.n2, 290)).toBe('gas')
    expect(volatileState(VOLATILES.n2, 70)).toBe('liquid')
  })

  it('co2 sublimates — no liquid window at 1 atm', () => {
    const { meltK } = VOLATILES.co2
    // Anywhere strictly below the transition: solid. At or above: gas.
    expect(volatileState(VOLATILES.co2, meltK - 1)).toBe('solid')
    expect(volatileState(VOLATILES.co2, meltK)).toBe('gas')
    expect(volatileState(VOLATILES.co2, meltK + 50)).toBe('gas')
  })

  it('h2he is gas anywhere a planet can be — never condenses in practice', () => {
    for (const T_K of [50, 90, 273, 500, 1000]) {
      expect(volatileState(VOLATILES.h2he, T_K)).toBe('gas')
    }
  })

  it('boundary: T exactly at meltK counts as liquid (not solid)', () => {
    expect(volatileState(VOLATILES.h2o, VOLATILES.h2o.meltK)).toBe('liquid')
  })

  it('boundary: T exactly at boilK counts as gas (not liquid)', () => {
    expect(volatileState(VOLATILES.h2o, VOLATILES.h2o.boilK)).toBe('gas')
  })
})

describe('volatileTintAt', () => {
  it('returns the phase-appropriate colour for each regime', () => {
    const h2o = VOLATILES.h2o
    expect(volatileTintAt(h2o, 200)).toBe(h2o.solidColor)
    expect(volatileTintAt(h2o, 300)).toBe(h2o.liquidColor)
    expect(volatileTintAt(h2o, 400)).toBe(h2o.gasColor)
  })
})

describe('getVolatile', () => {
  it('returns the entry by id', () => {
    expect(getVolatile('ch4')).toBe(VOLATILES.ch4)
  })

  it('throws on unknown ids', () => {
    // Force an unknown id through the type system to exercise the guard.
    expect(() => getVolatile('unobtainium' as never)).toThrow(/unknown volatile/i)
  })
})
