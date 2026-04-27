import { describe, it, expect } from 'vitest'
import { VOLATILES } from './volatileCatalog'
import {
  assignResourceMix,
  classifyBodyType,
  phaseWeights,
  extractGasVolatiles,
  pickSurfaceLiquid,
  partitionPhases,
  canRetainAtmosphere,
  evapFraction,
  pickDominantSolid,
  pickDominantVolatile,
  computeLiquidCoverage,
  type AssignmentInput,
} from './resourceMix'

// ── Archetype fixtures ────────────────────────────────────────────
// Rough analogues of real solar-system bodies — the affinity curves are
// tuned so each archetype lands on the expected classification + dominant
// volatile. If a real-world number shifts, the curve likely needs a tweak.

/** Mercury — small, hot, iron-rich (rocky core dominated). */
const MERCURY: AssignmentInput = { tempMin: -180, tempMax: 430, radius: 0.38, mass: 0.055 }
/** Earth — temperate, liquid water, rocky baseline. Uses the annual-mean
 *  habitable range (roughly polar winter to tropical summer) so `T_avg ≈ 15 °C`
 *  sits firmly in the H₂O liquid window. */
const EARTH: AssignmentInput   = { tempMin:    0, tempMax:  30, radius: 1,    mass: 1 }
/** Mars — cold rocky, solid H₂O + CO₂ atmosphere. */
const MARS: AssignmentInput    = { tempMin: -143, tempMax:  35, radius: 0.53, mass: 0.107 }
/** Titan — ultra-cold, methane lakes, N₂ atmosphere. */
const TITAN: AssignmentInput   = { tempMin: -183, tempMax: -178, radius: 0.40, mass: 0.022 }
/** Jupiter — gas giant, H₂/He dominant. */
const JUPITER: AssignmentInput = { tempMin: -148, tempMax: -108, radius: 11,   mass: 318 }

function T_avgK(p: AssignmentInput): number {
  return (p.tempMin + p.tempMax) / 2 + 273.15
}

// ── assignResourceMix ─────────────────────────────────────────────

describe('assignResourceMix — normalisation', () => {
  it('returns weights summing to 1 on every archetype', () => {
    for (const body of [MERCURY, EARTH, MARS, TITAN, JUPITER]) {
      const mix  = assignResourceMix(body)
      const sum  = Object.values(mix).reduce((s, v) => s + v, 0)
      expect(sum).toBeCloseTo(1, 6)
    }
  })

  it('assigns the same mix for the same input (deterministic)', () => {
    expect(assignResourceMix(EARTH)).toEqual(assignResourceMix(EARTH))
  })

  it('never emits negative weights', () => {
    const mix = assignResourceMix(EARTH)
    for (const [, w] of Object.entries(mix)) expect(w).toBeGreaterThanOrEqual(0)
  })
})

// ── classifyBodyType — classical archetypes ──────────────────────

describe('classifyBodyType — solar-system archetypes', () => {
  it('Mercury-like (small, hot, iron-rich) → metallic', () => {
    const mix = assignResourceMix(MERCURY)
    expect(classifyBodyType(mix, T_avgK(MERCURY))).toBe('metallic')
  })

  it('Earth-like (temperate, rocky) → rocky', () => {
    const mix = assignResourceMix(EARTH)
    expect(classifyBodyType(mix, T_avgK(EARTH))).toBe('rocky')
  })

  it('Mars-like (cold, rocky) → rocky', () => {
    const mix = assignResourceMix(MARS)
    expect(classifyBodyType(mix, T_avgK(MARS))).toBe('rocky')
  })

  it('Titan-like (ultra-cold moon) → rocky (methane ocean does NOT promote to gaseous)', () => {
    const mix = assignResourceMix(TITAN)
    expect(classifyBodyType(mix, T_avgK(TITAN))).toBe('rocky')
  })

  it('Jupiter-like (massive, cold) → gaseous', () => {
    const mix = assignResourceMix(JUPITER)
    expect(classifyBodyType(mix, T_avgK(JUPITER))).toBe('gaseous')
  })
})

// ── phaseWeights — liquid volatiles must not count as gas ─────────

describe('phaseWeights', () => {
  it('Titan in its native cold state: methane is liquid, does NOT count as gas', () => {
    const mix    = assignResourceMix(TITAN)
    const cold   = phaseWeights(mix, T_avgK(TITAN))
    // The CH₄ weight exists on Titan; it must be absent from the gas bucket.
    const naiveGas = Object.entries(mix)
      .filter(([id]) => id === 'ch4' || id === 'h2he')
      .reduce((s, [, w]) => s + w, 0)
    expect(cold.gas).toBeLessThan(naiveGas)
  })

  it('Same body heated above all boil points: every volatile falls into the gas bucket', () => {
    const mix = assignResourceMix(TITAN)
    const hot = phaseWeights(mix, 1000)  // way above any volatile boilK
    const naiveVolatileSum = ['h2he', 'h2o', 'ch4', 'nh3', 'n2', 'co2']
      .reduce((s, id) => s + (mix[id] ?? 0), 0)
    expect(hot.gas).toBeCloseTo(naiveVolatileSum, 6)
  })
})

// ── pickSurfaceLiquid ─────────────────────────────────────────────

describe('pickSurfaceLiquid', () => {
  it('Earth → water is liquid, wins the surface', () => {
    const mix = assignResourceMix(EARTH)
    const liq = pickSurfaceLiquid(mix, T_avgK(EARTH))
    expect(liq?.volatile.id).toBe('h2o')
  })

  it('Titan → methane wins over water (water is frozen solid at 95 K)', () => {
    const mix = assignResourceMix(TITAN)
    const liq = pickSurfaceLiquid(mix, T_avgK(TITAN))
    expect(liq?.volatile.id).toBe('ch4')
  })

  it('Mercury → nothing is liquid on the surface (dry)', () => {
    const mix = assignResourceMix(MERCURY)
    // Dayside of Mercury: all volatiles are gas. `pickSurfaceLiquid` returns
    // undefined when nothing is liquid at the body's temperature.
    const liq = pickSurfaceLiquid(mix, T_avgK(MERCURY))
    expect(liq).toBeUndefined()
  })

  it('Jupiter → nothing is liquid (H₂/He is gas, H₂O is gas at 170 K? no — gaseous body, no surface)', () => {
    const mix = assignResourceMix(JUPITER)
    const liq = pickSurfaceLiquid(mix, T_avgK(JUPITER))
    // At 165 K: H₂O is solid (< 273), CH₄ is gas (> 112), NH₃ is solid (< 195).
    // No volatile is in liquid phase at this temperature → undefined.
    expect(liq).toBeUndefined()
  })
})

// ── extractGasVolatiles ───────────────────────────────────────────

describe('extractGasVolatiles', () => {
  it('Jupiter → H₂He + CH₄ dominate the gas bucket and re-normalise to 1', () => {
    const mix = assignResourceMix(JUPITER)
    const gas = extractGasVolatiles(mix, T_avgK(JUPITER))
    const sum = Object.values(gas).reduce((s, v) => s + v, 0)
    expect(sum).toBeCloseTo(1, 6)
    expect(gas.h2he ?? 0).toBeGreaterThan(0.5)  // dominant gas-giant volatile
  })

  it('Earth → gas bucket is N₂ + CO₂ + H₂O (all in gas phase at 15 °C)', () => {
    const mix = assignResourceMix(EARTH)
    const gas = extractGasVolatiles(mix, T_avgK(EARTH))
    // At 288 K: h2o > boilK? No — boilK is 373. So h2o is LIQUID, not in this bucket.
    //          n2 is gas (77 K boil). co2 is gas (sublimates at 195 K).
    expect(gas.h2o).toBeUndefined()
    expect(gas.n2 ?? 0).toBeGreaterThan(0)
    expect(gas.co2 ?? 0).toBeGreaterThan(0)
  })

  it('returns {} when no volatile is gaseous at the given temperature', () => {
    // A hypothetical ultra-cold body where even H₂He would be solid — 1 K.
    const mix = assignResourceMix({ tempMin: -272, tempMax: -272, radius: 1, mass: 1 })
    const gas = extractGasVolatiles(mix, 1)
    expect(Object.keys(gas)).toHaveLength(0)
  })
})

// ── partitionPhases ───────────────────────────────────────────────

describe('partitionPhases', () => {
  it('Earth → water mostly liquid + tiny vapour, atmosphere retained', () => {
    const mix    = assignResourceMix(EARTH)
    const split  = partitionPhases(mix, EARTH)
    const h2o    = split.bySubstance.h2o
    expect(h2o.solid).toBe(0)
    expect(h2o.liquid).toBeGreaterThan(0)
    expect(h2o.gas).toBeGreaterThan(0)
    // Vapour stays a tiny fraction of the H₂O mass (well under 5 %).
    expect(h2o.gas).toBeLessThan(h2o.liquid * 0.05)
  })

  it('Mars → water locked in solid phase (T_avg ≈ -54 °C)', () => {
    const mix   = assignResourceMix(MARS)
    const split = partitionPhases(mix, MARS)
    const h2o   = split.bySubstance.h2o
    expect(h2o.solid).toBeGreaterThan(0)
    expect(h2o.liquid).toBe(0)
    expect(h2o.gas).toBe(0)
  })

  it('low-mass body without atmosphere keeps the gas bucket empty', () => {
    // Below the retention cutoff (mass < 0.1) → every would-be gas is reclassified.
    const noAtmo: AssignmentInput = { tempMin: -10, tempMax: 30, radius: 0.4, mass: 0.05 }
    const mix    = assignResourceMix(noAtmo)
    const split  = partitionPhases(mix, noAtmo)
    expect(split.totalGas).toBe(0)
  })

  it('hot small body without atmosphere condenses pure-gas volatiles into liquid', () => {
    // T_avg = 300 °C ≈ 573 K, above every volatile boil point. mass < 0.1 → no atmo.
    const hotSmall: AssignmentInput = { tempMin: 200, tempMax: 400, radius: 0.4, mass: 0.05 }
    const mix    = assignResourceMix(hotSmall)
    const split  = partitionPhases(mix, hotSmall)
    expect(split.totalGas).toBe(0)
    expect(split.totalLiquid).toBeGreaterThan(0)
  })

  it('per-substance phase fractions sum back to the original mix entry', () => {
    const mix    = assignResourceMix(EARTH)
    const split  = partitionPhases(mix, EARTH)
    for (const [id, m] of Object.entries(mix)) {
      const phased = split.bySubstance[id]
      expect(phased).toBeDefined()
      expect(phased.solid + phased.liquid + phased.gas).toBeCloseTo(m, 8)
    }
  })

  it('aggregate totals equal Σ bySubstance phases', () => {
    const mix    = assignResourceMix(EARTH)
    const split  = partitionPhases(mix, EARTH)
    let s = 0, l = 0, g = 0
    for (const phased of Object.values(split.bySubstance)) {
      s += phased.solid; l += phased.liquid; g += phased.gas
    }
    expect(split.totalSolid).toBeCloseTo(s, 8)
    expect(split.totalLiquid).toBeCloseTo(l, 8)
    expect(split.totalGas).toBeCloseTo(g, 8)
  })

  it('non-volatile catalogued resources stay 100 % solid', () => {
    const mix    = assignResourceMix(EARTH)
    const split  = partitionPhases(mix, EARTH)
    if (mix.iron !== undefined) {
      const ironPhased = split.bySubstance.iron
      expect(ironPhased.solid).toBeCloseTo(mix.iron, 8)
      expect(ironPhased.liquid).toBe(0)
      expect(ironPhased.gas).toBe(0)
    }
  })
})

// ── canRetainAtmosphere ───────────────────────────────────────────

describe('canRetainAtmosphere', () => {
  it('Earth-class body retains', () => {
    expect(canRetainAtmosphere(1)).toBe(true)
  })

  it('Mars-class body retains at the boundary (mass = 0.1)', () => {
    expect(canRetainAtmosphere(0.1)).toBe(true)
  })

  it('asteroid-class body does not retain (mass = 0.01)', () => {
    expect(canRetainAtmosphere(0.01)).toBe(false)
  })
})

// ── evapFraction ──────────────────────────────────────────────────

describe('evapFraction', () => {
  it('returns 0 below the melt point', () => {
    expect(evapFraction(100, VOLATILES.h2o)).toBe(0)
  })

  it('returns 0 above the boil point (handled by the partitioner instead)', () => {
    expect(evapFraction(400, VOLATILES.h2o)).toBe(0)
  })

  it('produces a small positive fraction inside the liquid window', () => {
    const f = evapFraction(288, VOLATILES.h2o)
    expect(f).toBeGreaterThan(0)
    expect(f).toBeLessThan(0.1)
  })

  it('caps at 10 % near the boil point', () => {
    const f = evapFraction(VOLATILES.h2o.boilK - 1, VOLATILES.h2o)
    expect(f).toBeLessThanOrEqual(0.10001)
  })

  it('sublimator volatile has no liquid window → always 0', () => {
    expect(evapFraction(195, VOLATILES.co2)).toBe(0)
  })
})

// ── pickDominantVolatile ──────────────────────────────────────────

describe('pickDominantVolatile', () => {
  it('Earth → water dominates (largest volatile mass)', () => {
    const mix = assignResourceMix(EARTH)
    const dom = pickDominantVolatile(mix)
    expect(dom?.volatile.id).toBe('h2o')
  })

  it('Mars → still water dominant despite NH₃ being the only liquid one', () => {
    // Regression: the auto-derive used to anchor on `pickSurfaceLiquid`,
    // which returns NH₃ (the sole volatile in liquid phase at -54 °C).
    // The right anchor is the **mass** dominant — water, which is solid
    // at this T and should drive the planet into frozen mode.
    const mix = assignResourceMix(MARS)
    const dom = pickDominantVolatile(mix)
    expect(dom?.volatile.id).toBe('h2o')
  })

  it('Jupiter → H₂He dominates the volatile mix', () => {
    const mix = assignResourceMix(JUPITER)
    const dom = pickDominantVolatile(mix)
    expect(dom?.volatile.id).toBe('h2he')
  })

  it('returns undefined when no volatile is in the mix', () => {
    expect(pickDominantVolatile({})).toBeUndefined()
  })
})

// ── pickDominantSolid ─────────────────────────────────────────────

describe('pickDominantSolid', () => {
  it('cold body → frozen water wins as the dominant solid volatile', () => {
    const mix   = assignResourceMix(MARS)
    const split = partitionPhases(mix, MARS)
    const solid = pickDominantSolid(split.bySubstance)
    expect(solid?.volatile.id).toBe('h2o')
  })

  it('warm body without solid volatiles → undefined', () => {
    const mix   = assignResourceMix(EARTH)
    const split = partitionPhases(mix, EARTH)
    const solid = pickDominantSolid(split.bySubstance)
    expect(solid).toBeUndefined()
  })
})

// ── computeLiquidCoverage ────────────────────────────────────────

describe('computeLiquidCoverage', () => {
  it('clamps out-of-range inputs to [0, 1]', () => {
    expect(computeLiquidCoverage(-0.5)).toBe(0)
    expect(computeLiquidCoverage(1.5)).toBe(1)
  })

  it('Earth-like total liquid maps to a non-trivial coverage', () => {
    const mix   = assignResourceMix(EARTH)
    const split = partitionPhases(mix, EARTH)
    const cov   = computeLiquidCoverage(split.totalLiquid)
    expect(cov).toBeGreaterThan(0.05)   // water dominates
    expect(cov).toBeLessThanOrEqual(1)
  })

  it('ultra-cold body (every volatile below its melt point) → coverage = 0', () => {
    // T_avg ≈ 53 K, below every melt point in the catalogue (lowest = N₂ at 63 K).
    // H₂/He stays in gas phase (boil = 20 K) but is reported in `totalGas`,
    // not `totalLiquid`.
    const ultraCold: AssignmentInput = { tempMin: -225, tempMax: -215, radius: 1, mass: 1 }
    const mix    = assignResourceMix(ultraCold)
    const split  = partitionPhases(mix, ultraCold)
    expect(computeLiquidCoverage(split.totalLiquid)).toBe(0)
  })
})
