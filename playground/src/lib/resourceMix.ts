/**
 * Deterministic resource assignment + body-type classifier.
 *
 * Given only the physical input `(temperatureMin, temperatureMax, radius, mass)`,
 * the assignment function produces a **mix** — a weight-per-resource map that
 * covers both the catalogue-driven solid resources (`DEMO_RESOURCES`) and the
 * volatiles (`VOLATILES`). Weights are raw affinity scores normalised to sum
 * to `1`.
 *
 * Downstream:
 *   - {@link classifyBodyType} inspects phase buckets (metallic / mineral /
 *     gas-phase volatiles) to emit `'rocky' | 'metallic' | 'gaseous'`.
 *   - {@link pickSurfaceLiquid} picks the dominant liquid-phase volatile so
 *     callers can drive `BodyConfig.liquidColor` off the physics.
 *   - {@link extractGasVolatiles} isolates the gas-phase volatile weights so
 *     PR 4 can blend their `gasColor` stops into `bandColors` for the atmo.
 *
 * Pure module — no Vue dependency, trivially testable.
 */

import { DEMO_RESOURCES, type ResourcePhase } from './resourceCatalog'
import {
  VOLATILES,
  VOLATILE_IDS,
  volatileState,
  type Volatile,
  type VolatileId,
} from './volatileCatalog'

// ── Input / output shapes ─────────────────────────────────────────

/**
 * Physical input consumed by the assignment. Intentionally a strict subset
 * of {@link BodyConfig} — the classifier must only depend on what physics
 * actually constrains, not on caller-owned visual fields.
 */
export interface AssignmentInput {
  /** Coldest equilibrium temperature (°C). */
  tempMin: number
  /** Warmest equilibrium temperature (°C). */
  tempMax: number
  /** Visual radius in world units. */
  radius:  number
  /** Mass in Earth masses. Defaults to `1` at the call site when omitted. */
  mass:    number
}

/** Raw weight per resource id — keys come from both `DEMO_RESOURCES` and `VOLATILES`. */
export type ResourceMix = Record<string, number>

/** Derived body type emitted by {@link classifyBodyType}. */
export type DerivedBodyType = 'rocky' | 'metallic' | 'gaseous'

/** Aggregated phase weights — see {@link phaseWeights}. */
export interface PhaseWeights {
  /** Sum of weights over resources whose `phase === 'metallic'`. */
  metallic: number
  /** Sum of weights over resources whose `phase === 'mineral'`. */
  mineral:  number
  /**
   * Sum of weights over volatiles currently in gas phase at the body's
   * average temperature. Liquid- and solid-phase volatiles DO NOT contribute
   * — they become surface layers, not bulk classification drivers.
   */
  gas:      number
}

// ── Affinity functions ────────────────────────────────────────────
//
// Each entry below returns a raw non-negative score for its resource given
// the physical input. The numbers are heuristic — calibrated so the classic
// solar-system archetypes land on the expected classification:
//
//   Mercury-like (small, hot, m≈0.05)        → metallic
//   Earth-like   (m≈1, T≈15°C)               → rocky, liquid H₂O
//   Mars-like    (small, m≈0.1, T≈-60°C)     → rocky, solid H₂O + CO₂
//   Titan-like   (m≈0.02, T≈-180°C)          → rocky, liquid CH₄
//   Jupiter-like (m≈318, T≈-110°C)           → gaseous, H₂He dominant

type AffinityFn = (p: AssignmentInput) => number

/** Average surface temperature in °C (mean of min/max). */
export function T_avg(p: { tempMin: number; tempMax: number }): number {
  return (p.tempMin + p.tempMax) / 2
}

/** Average surface temperature in K — the canonical input for volatile phase tests. */
export function T_avgK(p: { tempMin: number; tempMax: number }): number {
  return T_avg(p) + 273.15
}

const SOLID_AFFINITIES: Record<string, AffinityFn> = {
  // Iron — ubiquitous but concentrates on small *hot* bodies (differentiated
  // planetesimals, Mercury-class). Faded out on gas giants. The small-body
  // boost is gated on `T > 0` so cold worlds like Mars / Titan don't get
  // pushed into the metallic bucket — their differentiation is incomplete.
  iron: (p) => {
    const T = T_avg(p)
    const tempBoost  = T > 0   ? 1 + (T - 0) / 300 : 0.9
    const smallBoost = p.mass < 0.3 && T > 0 ? 1.8 : 1
    const gasDecay   = p.mass > 5   ? 0.05 : 1
    return 0.22 * tempBoost * smallBoost * gasDecay
  },

  // Copper — trace base, slightly boosted on hot differentiated bodies.
  copper: (p) => {
    const T = T_avg(p)
    const hotBoost = T > 50 ? 1.2 : 1
    return 0.06 * hotBoost * (p.mass > 5 ? 0.1 : 1)
  },

  // Gold — truly trace. Tiny constant contribution when not a gas giant.
  gold: (p) => (p.mass > 5 ? 0.005 : 0.02),

  // Silicon — the terrestrial default. Strong on any rocky world, negligible
  // above the sub-Neptune threshold (becomes a trace core contribution).
  silicon: (p) => (p.mass > 5 ? 0.04 : 0.32),

  // Sulfur — volcanic marker. Boosted at Venus-to-Io temperatures (+100 °C).
  sulfur: (p) => {
    const T = T_avg(p)
    const base = p.mass > 5 ? 0.03 : 0.06
    return base + (T > 80 ? Math.min(0.18, (T - 80) / 400) : 0)
  },
}

const VOLATILE_AFFINITIES: Record<VolatileId, AffinityFn> = {
  // H₂ / He — the gas-giant driver. Retained only by massive bodies; affinity
  // ramps up sharply past ~5 Earth masses. Jupiter-class (m ≈ 318) saturates.
  h2he: (p) => {
    if (p.mass < 3) return 0
    return Math.min(3, (p.mass - 3) * 0.10)
  },

  // Water — ubiquitous molecule. Constant presence regardless of phase; the
  // phase classifier (via `volatileState`) decides whether it contributes to
  // the gas bucket at classification time.
  h2o: () => 0.16,

  // Methane — significant only when the coldest temperatures overlap the
  // CH₄ stability window (< ~180 K ≈ -93 °C).
  ch4: (p) => (p.tempMin < -90 ? 0.14 : p.tempMin < -30 ? 0.03 : 0.005),

  // Ammonia — narrow cold window, less abundant than methane.
  nh3: (p) => (p.tempMin < -30 ? 0.06 : 0),

  // Nitrogen — ubiquitous but thin. Needs at least Mars-class mass to retain.
  n2: (p) => (p.mass >= 0.1 ? 0.06 : 0.01),

  // Carbon dioxide — steady contribution on rocky bodies with atmosphere.
  co2: (p) => (p.mass > 5 ? 0.02 : 0.08),
}

// ── Assignment ────────────────────────────────────────────────────

/**
 * Deterministically assigns a normalised resource mix from physical input.
 * Output weights always sum to `1` (unless every affinity is zero, which
 * the heuristics above prevent in practice).
 */
export function assignResourceMix(input: AssignmentInput): ResourceMix {
  const raw: ResourceMix = {}

  for (const [id, fn] of Object.entries(SOLID_AFFINITIES)) {
    const w = Math.max(0, fn(input))
    if (w > 0) raw[id] = w
  }
  for (const id of VOLATILE_IDS) {
    const w = Math.max(0, VOLATILE_AFFINITIES[id](input))
    if (w > 0) raw[id] = w
  }

  const total = Object.values(raw).reduce((s, v) => s + v, 0)
  if (total <= 0) return raw

  const mix: ResourceMix = {}
  for (const [id, w] of Object.entries(raw)) mix[id] = w / total
  return mix
}

// ── Classification ────────────────────────────────────────────────

/** Map from `DEMO_RESOURCES` id to its declared phase. */
const DEMO_PHASE_BY_ID = new Map<string, ResourcePhase>(
  DEMO_RESOURCES.map(r => [r.id, r.phase]),
)

/**
 * Aggregates the mix into the three classification buckets:
 *   - `metallic` — resources declared `phase: 'metallic'`
 *   - `mineral`  — resources declared `phase: 'mineral'`
 *   - `gas`      — volatiles currently in gas phase at the body's `T_avgK`
 *
 * Volatiles in liquid / solid phase DO NOT contribute: those become surface
 * layers (oceans, ice caps), not bulk drivers of the body type. A mass of
 * liquid methane on Titan does not turn Titan into a gas giant.
 */
export function phaseWeights(mix: ResourceMix, T_avg_K: number): PhaseWeights {
  let metallic = 0, mineral = 0, gas = 0

  for (const [id, w] of Object.entries(mix)) {
    // Volatiles are gated on their actual phase at the body's temperature:
    // liquid methane on Titan must NOT contribute to the gas bucket, even
    // though it's catalogued as `phase: 'gas'` in the resource catalogue.
    const vol = VOLATILES[id as VolatileId]
    if (vol) {
      if (volatileState(vol, T_avg_K) === 'gas') gas += w
      continue
    }
    const demoPhase = DEMO_PHASE_BY_ID.get(id)
    if (demoPhase === undefined) continue
    if (demoPhase === 'metallic') metallic += w
    else if (demoPhase === 'mineral') mineral += w
    else /* demoPhase === 'gas' (non-volatile catalogue leftover) */ gas += w
  }

  return { metallic, mineral, gas }
}

/**
 * Classifies the body from its mix + average temperature. The rule:
 *   - `gaseous`  when `gas > metallic + mineral`
 *   - `metallic` when `metallic > mineral` (and not gaseous)
 *   - `rocky`    otherwise (default)
 *
 * `T_avg_K` decides which volatiles land in the gas bucket — a cold Titan-like
 * body can have significant H₂O but it's locked as ice, so it stays rocky.
 */
export function classifyBodyType(mix: ResourceMix, T_avg_K: number): DerivedBodyType {
  const w = phaseWeights(mix, T_avg_K)
  if (w.gas > w.metallic + w.mineral) return 'gaseous'
  if (w.metallic > w.mineral) return 'metallic'
  return 'rocky'
}

// ── Volatile helpers ──────────────────────────────────────────────

/**
 * Returns the gas-phase volatiles only, re-normalised so their weights sum
 * to `1`. PR 4 will feed this to the atmosphere band-colour derivation.
 * Returns `{}` when the body has no gas volatiles at this temperature.
 */
export function extractGasVolatiles(mix: ResourceMix, T_avg_K: number): Record<VolatileId, number> {
  const out = {} as Record<VolatileId, number>
  let total = 0
  for (const id of VOLATILE_IDS) {
    const w = mix[id]
    if (!w) continue
    if (volatileState(VOLATILES[id], T_avg_K) !== 'gas') continue
    out[id] = w
    total += w
  }
  if (total > 0) {
    for (const id of VOLATILE_IDS) if (out[id] !== undefined) out[id] /= total
  }
  return out
}

/**
 * Picks the dominant volatile in liquid phase — the one that should paint
 * the body's ocean. Returns `undefined` when no volatile is liquid at the
 * given temperature (dry world, or everything is frozen / vaporised).
 */
export function pickSurfaceLiquid(
  mix:     ResourceMix,
  T_avg_K: number,
): { volatile: Volatile; weight: number } | undefined {
  let best: { volatile: Volatile; weight: number } | undefined
  for (const id of VOLATILE_IDS) {
    const w = mix[id]
    if (!w) continue
    const vol = VOLATILES[id]
    if (volatileState(vol, T_avg_K) !== 'liquid') continue
    if (!best || w > best.weight) best = { volatile: vol, weight: w }
  }
  return best
}

// ── Phase partitioning (v1 — KISS, no Clausius-Clapeyron) ────────
//
// Splits the normalised resource mix into three buckets per substance —
// solid mass, liquid mass, gas mass — based on the body's average
// temperature, mass, and atmosphere-retention ability. The result feeds:
//
//   - the lib's `BodyConfig.liquidColor` / `liquidCoverage` (dominant liquid)
//   - the gas-giant `bandColors` (gas-bucket totals)
//   - the frozen-state ice cap colour (dominant solid via `buildSolidShell`)
//
// All three buckets coexist for a single substance whenever the planet
// holds an atmosphere AND the substance sits in its liquid window — a small
// vapour fraction drifts up via {@link evapFraction}, modelling planetary
// humidity without the full Clausius-Clapeyron treatment.

/** Mass distributed across the three phases for a single substance. */
export interface PhasedMass {
  solid:  number
  liquid: number
  gas:    number
}

/** Per-substance phase split — same keys as the input mix. */
export type PhasedMix = Record<string, PhasedMass>

/** Aggregate of {@link partitionPhases} — per-substance map plus phase totals. */
export interface PhasedMixSummary {
  /** Per-substance phase split. */
  bySubstance: PhasedMix
  /** Σ m_solid_v over every substance. Drives the ice cap mass / yield. */
  totalSolid:  number
  /** Σ m_liquid_v over every substance. Drives `BodyConfig.liquidCoverage`. */
  totalLiquid: number
  /** Σ m_gas_v over every substance. Drives atmosphere thickness / band colour weighting. */
  totalGas:    number
}

/**
 * Body-mass cutoff above which the planet retains a meaningful gas
 * envelope. Tuned heuristically: Mars-class (≈ 0.1 Earth masses) is the
 * smallest body that holds a thin permanent atmosphere; below that, gases
 * escape on geological timescales and we model them as fully condensed.
 */
const ATMOSPHERE_RETENTION_MASS = 0.1

/** True when the body is heavy enough to retain a gas envelope. */
export function canRetainAtmosphere(massEarths: number): boolean {
  return massEarths >= ATMOSPHERE_RETENTION_MASS
}

/**
 * Atmospheric humidity proxy — fraction of a liquid-window volatile that
 * sits as vapor. Linear in the liquid window position, capped at 10 % near
 * the boil point. Returns `0` outside the liquid window.
 *
 * Rough calibration:
 *   - Earth water (T ≈ 288 K, melt = 273, boil = 373) → t ≈ 0.15 → ~0.5 %
 *   - Titan methane (T ≈ 94 K, melt = 91, boil = 112) → t ≈ 0.14 → ~0.4 %
 *
 * Approximate but coherent: warmer bodies push more of their liquid into
 * the atmosphere, which feeds back into atmosphere shell visuals.
 */
export function evapFraction(T_avgK: number, v: Volatile): number {
  if (T_avgK < v.meltK)  return 0
  if (T_avgK >= v.boilK) return 0   // pure-gas regime — handled by the partitioner
  if (v.meltK === v.boilK) return 0 // sublimator — no liquid window
  const t = (T_avgK - v.meltK) / (v.boilK - v.meltK)
  return Math.min(0.10, t * t * 0.2)
}

/**
 * Partitions a normalised resource mix into solid/liquid/gas mass per
 * substance. Volatiles are routed by phase rules (see file header);
 * non-volatile catalogued resources stay 100 % solid regardless of T.
 *
 * Pure function — deterministic for a given `(mix, input)` pair.
 */
export function partitionPhases(
  mix:   ResourceMix,
  input: AssignmentInput,
): PhasedMixSummary {
  const T_K   = T_avgK(input)
  const atmo  = canRetainAtmosphere(input.mass)
  const out: PhasedMix = {}
  let totalSolid = 0, totalLiquid = 0, totalGas = 0

  for (const [id, m] of Object.entries(mix)) {
    if (m <= 0) continue
    const vol = VOLATILES[id as VolatileId]

    let solid = 0, liquid = 0, gas = 0

    if (!vol) {
      // Non-volatile catalogued resource (iron, silicon, …) — always solid.
      solid = m
    } else if (T_K < vol.meltK) {
      // Frozen regime — every gram is locked in solid phase.
      solid = m
    } else if (T_K >= vol.boilK || vol.meltK === vol.boilK) {
      // Pure gas regime (or sublimator above transition).
      if (atmo) gas = m
      else      liquid = m   // no atmosphere → condenses back to surface
    } else {
      // Liquid window — bulk stays liquid; small humidity drifts to gas
      // when the planet retains an atmosphere.
      const evap = atmo ? evapFraction(T_K, vol) : 0
      gas    = m * evap
      liquid = m - gas
    }

    out[id] = { solid, liquid, gas }
    totalSolid  += solid
    totalLiquid += liquid
    totalGas    += gas
  }

  return { bySubstance: out, totalSolid, totalLiquid, totalGas }
}

/**
 * Picks the dominant solid-phase volatile from a partitioned mix — the one
 * that should tint the ice cap built via the lib's `buildSolidShell`.
 * Returns `undefined` when no volatile is solid (warm world).
 *
 * Non-volatile resources are ignored: a planet of pure iron is not "iron-
 * frozen", it is simply a solid body without a frozen liquid envelope.
 */
export function pickDominantSolid(
  partitioned: PhasedMix,
): { volatile: Volatile; weight: number } | undefined {
  let best: { volatile: Volatile; weight: number } | undefined
  for (const id of VOLATILE_IDS) {
    const phased = partitioned[id]
    if (!phased || phased.solid <= 0) continue
    if (!best || phased.solid > best.weight) {
      best = { volatile: VOLATILES[id], weight: phased.solid }
    }
  }
  return best
}

/**
 * Picks the catalogue volatile carrying the largest mass in the mix,
 * **regardless of phase**. This is the right anchor for "what does the
 * surface look like?" — it makes the planet's identity track its bulk
 * composition, not whatever fraction happens to land in a liquid window.
 *
 * For instance, a Mars-like body has water as its dominant volatile but
 * a small NH₃ slice that happens to be in liquid phase at T ≈ 219 K. The
 * dominant volatile (H₂O) is solid → the planet should read as frozen,
 * not as a liquid-NH₃ ocean. This helper returns H₂O so the caller can
 * branch correctly.
 */
export function pickDominantVolatile(
  mix: ResourceMix,
): { volatile: Volatile; weight: number } | undefined {
  let best: { volatile: Volatile; weight: number } | undefined
  for (const id of VOLATILE_IDS) {
    const w = mix[id]
    if (!w) continue
    if (!best || w > best.weight) {
      best = { volatile: VOLATILES[id], weight: w }
    }
  }
  return best
}

/**
 * Aggregates phase masses restricted to the volatile catalogue — useful
 * when sizing a surface effect from "how much of this substance can be in
 * surface form?" without contaminating the result with mineral solids
 * (iron, silicon…) which are always 100 % solid by construction.
 */
export function volatileMassByPhase(
  partitioned: PhasedMix,
): { solid: number; liquid: number; gas: number } {
  let solid = 0, liquid = 0, gas = 0
  for (const id of VOLATILE_IDS) {
    const phased = partitioned[id]
    if (!phased) continue
    solid  += phased.solid
    liquid += phased.liquid
    gas    += phased.gas
  }
  return { solid, liquid, gas }
}

/**
 * Estimates the surface coverage from the total liquid mass fraction — the
 * value to push into `BodyConfig.liquidCoverage`. KISS v1: identity clamp
 * to `[0, 1]`. The mix is already normalised (Σ m_v = 1), so the total
 * liquid fraction is directly comparable across bodies.
 *
 * Calibration check:
 *   - Earth-like (water dominant, all liquid) → ≈ 0.7
 *   - Mars-like (water mostly frozen)         → ≈ 0.05
 *   - Titan-like (CH₄ liquid)                 → ≈ 0.20
 *
 * @param totalLiquidFraction `PhasedMixSummary.totalLiquid`.
 */
export function computeLiquidCoverage(totalLiquidFraction: number): number {
  return Math.max(0, Math.min(1, totalLiquidFraction))
}
