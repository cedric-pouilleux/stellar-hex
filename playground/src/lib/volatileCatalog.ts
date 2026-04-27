/**
 * Unified volatile catalogue — substances that span multiple physical phases
 * (solid / liquid / gas) within the temperature range of planetary bodies.
 *
 * Each volatile carries its melting and boiling points (in Kelvin) plus one
 * tint per phase. Downstream consumers:
 *   - {@link volatileState} classifies which phase a volatile is in at a given
 *     body temperature.
 *   - The resource-mix classifier (PR 2) sums gas-phase volatile masses to
 *     decide whether a body is gaseous.
 *   - The surface-liquid picker (PR 2/4) chooses the dominant liquid-phase
 *     volatile as the body's ocean colour.
 *   - The atmosphere band derivation (PR 4) pulls gas-phase volatile colours
 *     into the lib's `bandColors` uniform.
 *
 * The lib knows NONE of this. All chemistry vocabulary (`'h2o'`, `'ch4'`, …)
 * lives here; the lib receives only resolved opaque colours.
 */

/** Known volatile substance IDs. Extendable — no lib change required. */
export type VolatileId = 'h2o' | 'ch4' | 'nh3' | 'n2' | 'co2' | 'h2he'

/** A physical phase — determined by the body's temperature versus melt/boil points. */
export type PhysicalPhase = 'solid' | 'liquid' | 'gas'

/**
 * A volatile substance definition. `meltK` and `boilK` express the
 * standard-pressure transition temperatures. Callers that need pressure-aware
 * behaviour can apply their own Clausius-Clapeyron shift on top.
 *
 * Sublimators (CO₂) encode their transition via `meltK === boilK` — the
 * `volatileState` helper skips the liquid window for those.
 */
export interface Volatile {
  id:          VolatileId
  label:       string
  /** Molar mass (g/mol) — reserved for mass-weighted atmospheric mixes. */
  molarMass:   number
  /** Melting point at 1 atm (K). Below this temperature the substance is solid. */
  meltK:       number
  /** Boiling point at 1 atm (K). Above this temperature the substance is gas. */
  boilK:       number
  /** Tint when the substance is frozen solid (ice sheets, frosts). */
  solidColor:  number
  /** Tint when the substance sits as a liquid surface (oceans, lakes). */
  liquidColor: number
  /** Tint when the substance drifts as vapour (atmospheric bands). */
  gasColor:    number
}

/**
 * Reference catalogue — numeric anchors sourced from NIST standard-atmosphere
 * tables (rounded to whole Kelvin). Colours reuse the playground's existing
 * canonical palette so swapping to the unified catalogue produces no visual
 * regression.
 */
export const VOLATILES: Record<VolatileId, Volatile> = {
  h2o: {
    id:          'h2o',
    label:       'Water (H₂O)',
    molarMass:   18.02,
    meltK:       273,
    boilK:       373,
    solidColor:  0xc8e8f4,  // ice
    liquidColor: 0x2878d0,  // Earth ocean
    gasColor:    0x6090c0,  // pale water-blue vapour
  },
  ch4: {
    id:          'ch4',
    label:       'Methane (CH₄)',
    molarMass:   16.04,
    meltK:        91,
    boilK:       112,
    solidColor:  0xb59670,
    liquidColor: 0x7a5828,  // Titan amber
    gasColor:    0x30a8c8,  // Neptune cyan
  },
  nh3: {
    id:          'nh3',
    label:       'Ammonia (NH₃)',
    molarMass:   17.03,
    meltK:       195,
    boilK:       240,
    solidColor:  0xe0d8b8,
    liquidColor: 0x7a9840,  // olive
    gasColor:    0xd0b868,  // pale sulphur-cream
  },
  n2: {
    id:          'n2',
    label:       'Nitrogen (N₂)',
    molarMass:   28.01,
    meltK:        63,
    boilK:        77,
    solidColor:  0xd4d0c8,
    liquidColor: 0xc8b0b8,  // Pluto dusty rose
    gasColor:    0xaac8dc,  // thin-sky pale blue
  },
  co2: {
    // Sublimation — `meltK === boilK` so the liquid window collapses. At 1 atm
    // CO₂ jumps straight between solid (dry ice) and gas.
    id:          'co2',
    label:       'Carbon dioxide (CO₂)',
    molarMass:   44.01,
    meltK:       195,
    boilK:       195,
    solidColor:  0xd0c0a8,
    liquidColor: 0xd0c0a8,
    gasColor:    0xc8a878,  // Mars-like dusty yellow
  },
  h2he: {
    // Hydrogen/helium blend — treated as a single bucket because the two never
    // separate at planetary scales. Effective boiling point is well below any
    // reachable surface temperature, so the helper always reports `'gas'`.
    id:          'h2he',
    label:       'Hydrogen / Helium (H₂ / He)',
    molarMass:   3.0,
    meltK:        14,
    boilK:        20,
    solidColor:  0xe8c090,
    liquidColor: 0xe8c090,
    gasColor:    0xe8b870,  // Jupiter warm tan
  },
}

/** All volatile IDs as an iterable — stable order matches the catalogue above. */
export const VOLATILE_IDS: readonly VolatileId[] =
  Object.keys(VOLATILES) as readonly VolatileId[]

/**
 * Classifies the phase of a volatile at a given body temperature (K).
 *
 *   `T < meltK`            → `'solid'`
 *   `meltK ≤ T < boilK`    → `'liquid'`
 *   `T ≥ boilK`            → `'gas'`
 *
 * Sublimators (`meltK === boilK`) skip the liquid window entirely: any
 * temperature strictly below the transition reports `'solid'`; at or above,
 * `'gas'`.
 */
export function volatileState(vol: Volatile, T_K: number): PhysicalPhase {
  if (vol.meltK === vol.boilK) {
    return T_K < vol.meltK ? 'solid' : 'gas'
  }
  if (T_K < vol.meltK) return 'solid'
  if (T_K < vol.boilK) return 'liquid'
  return 'gas'
}

/** Convenience lookup by ID with a clear error when the ID is unknown. */
export function getVolatile(id: VolatileId): Volatile {
  const vol = VOLATILES[id]
  if (!vol) throw new Error(`Unknown volatile id: ${id}`)
  return vol
}

/**
 * Returns the tint the volatile projects onto the body at `T_K` — the colour
 * matching its current phase. Handy for callers that just need "what does
 * this substance look like here?" without branching on phase themselves.
 */
export function volatileTintAt(vol: Volatile, T_K: number): number {
  const phase = volatileState(vol, T_K)
  if (phase === 'solid')  return vol.solidColor
  if (phase === 'liquid') return vol.liquidColor
  return vol.gasColor
}
