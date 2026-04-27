import { describe, it, expect } from 'vitest'
// Pre-load `resourceMix` first to avoid the resourceDemo ↔ resourceMix
// circular import: `resourceMix` accesses `DEMO_RESOURCES` at module top
// level, so it must be the entry of the cycle (the runtime path goes
// through `state.ts → resourceMix → resourceDemo`, which has the same
// effect). Importing `resourceDemo` first leaves DEMO_RESOURCES `undefined`
// when `resourceMix` evaluates and crashes the spec on load.
import './resourceMix'
import { sumDistributionTotals } from './resourceDemo'
import type { LayeredDistribution } from './paint/paintBody'

/** Minimal handcrafted distribution — bypasses the body simulation. */
function fixture(): LayeredDistribution {
  return {
    sol: new Map([
      [1, new Map<string, number>([['iron', 0.4], ['copper', 0.2]])],
      [2, new Map<string, number>([['iron', 0.6]])],
    ]),
    atmo: new Map([
      [1, new Map<string, number>([['h2he', 1.0]])],
      [3, new Map<string, number>([['ch4', 1.0]])],
      [4, new Map<string, number>([['ch4', 1.0]])],
    ]),
  }
}

describe('sumDistributionTotals', () => {
  it('sums per-resource amounts across both layers', () => {
    const totals = sumDistributionTotals(fixture())
    expect(totals.get('iron')).toBeCloseTo(1.0)
    expect(totals.get('copper')).toBeCloseTo(0.2)
    expect(totals.get('h2he')).toBeCloseTo(1.0)
    expect(totals.get('ch4')).toBeCloseTo(2.0)
  })

  it('returns an empty map for an empty distribution', () => {
    const totals = sumDistributionTotals({ sol: new Map(), atmo: new Map() })
    expect(totals.size).toBe(0)
  })

  it('omits resources not present on any tile', () => {
    const totals = sumDistributionTotals(fixture())
    expect(totals.has('gold')).toBe(false)
  })
})
