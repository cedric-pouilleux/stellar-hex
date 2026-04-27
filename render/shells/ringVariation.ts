import type { BodyConfig, BodyType } from '../../types/body.types'
import { strategyFor } from '../body/bodyTypeStrategy'

/**
 * Deterministic visual variation for a planet's ring system.
 *
 * A single annular mesh is painted using a macroscopic radial profile (8 opacity
 * samples, lerp-interpolated) combined with 1D micro-banding noise. The profile
 * is drawn from a rich archetype pool — the combination of archetype choice,
 * per-sample jitter, palette swaps and noise parameters produces hundreds of
 * visually distinct looks (thin shepherd bands, solid dense bands, icy halos,
 * dusty outer rings, …) without bespoke shaders.
 */
export interface RingVariation {
  /** Inner edge radius as a multiple of the planet visual radius. */
  innerRatio:   number
  /** Outer edge radius as a multiple of the planet visual radius. */
  outerRatio:   number
  /** Inner-edge tint (radial gradient start). */
  colorInner:   string
  /** Outer-edge tint (radial gradient end). */
  colorOuter:   string
  /** 8 opacity samples along the radial axis (t=0 at inner edge, t=1 at outer edge). */
  profile:      readonly [number, number, number, number, number, number, number, number]
  /** Micro-banding frequency (number of fine rings visible across the strip). */
  bandFreq:     number
  /** Micro-banding contrast [0..1]. Higher = sharper bright/dark alternation. */
  bandContrast: number
  /** Dustiness [0..1] — blend toward a diffuse uniform field (halo/nebulous look). */
  dustiness:    number
  /** Grain amount [0..1] — amplitude of the 2D high-frequency speckle/grain layer. */
  grainAmount:  number
  /** Grain frequency — radial scale of the speckle pattern (higher = finer grain). */
  grainFreq:    number
  /** Global alpha multiplier [0..1]. */
  opacity:      number
  /** Strength of the low-frequency azimuthal lobes [0..1]. Higher = more angular asymmetry. */
  lobeStrength: number
  /**
   * Keplerian differential rotation [0..1]. At 0 the ring rotates as a rigid
   * block (texture locked to the mesh); at 1 each radial band drifts at its
   * own Kepler rate (ω ∝ r^-3/2), so outer bands visibly lag behind inner
   * ones over time — producing Saturn-like shear spirals.
   */
  keplerShear:  number
  /** Seed used by the 1D hash-noise in the shader — keeps patterns deterministic. */
  noiseSeed:    number
  /** Archetype label — purely informational, useful for tests / debug. */
  archetype:    RingArchetype
}

/**
 * Named ring-shape archetype. Each archetype maps to a fixed 8-sample
 * radial opacity envelope in {@link ARCHETYPE_PROFILES}, which the ring
 * shader then jitters per body for variety.
 */
export type RingArchetype =
  | 'broad'        // wide Saturn-like envelope
  | 'double'       // two bright bands, dark gap between
  | 'narrow'       // single bright band with soft shoulders
  | 'dusty'        // diffuse nebulous halo
  | 'triple'       // three bright bands
  | 'outer'        // bright outer edge, faint inner
  | 'shepherd'     // very thin single peak (Uranus-style)
  | 'quadruple'    // four alternating bands
  | 'skewedIn'     // bright inside, fading outward
  | 'skewedOut'    // faint inside, bright outside
  | 'dense'        // near-uniform solid band (pleine)
  | 'sparse'       // irregular sparse spikes

/**
 * Eight-sample radial opacity envelope (inner → outer). Passed verbatim to
 * the ring shader which interpolates between the samples along the ring
 * strip.
 */
export type Profile8 = readonly [number, number, number, number, number, number, number, number]

// ── Archetype profiles (macroscopic opacity envelope) ────────────────────────
// Each entry is sampled along t∈[0,1] from inner to outer edge of the ring strip.

/**
 * Lookup table of 8-sample radial opacity envelopes keyed by
 * {@link RingArchetype}. Values are in [0, 1] and are sampled from inner to
 * outer edge of the ring strip. Shared between the generator and tests.
 */
export const ARCHETYPE_PROFILES: Record<RingArchetype, Profile8> = {
  broad:     [0.15, 0.55, 0.85, 1.00, 0.92, 0.70, 0.40, 0.10],
  double:    [0.92, 0.70, 0.15, 0.05, 0.10, 0.85, 0.75, 0.25],
  narrow:    [0.00, 0.05, 0.25, 0.95, 1.00, 0.55, 0.10, 0.00],
  dusty:     [0.30, 0.45, 0.55, 0.60, 0.55, 0.50, 0.40, 0.25],
  triple:    [0.85, 0.20, 0.75, 0.15, 0.85, 0.20, 0.75, 0.10],
  outer:     [0.05, 0.10, 0.20, 0.30, 0.45, 0.95, 0.80, 0.20],
  shepherd:  [0.00, 0.00, 0.10, 0.30, 0.95, 0.35, 0.05, 0.00],
  quadruple: [0.85, 0.25, 0.80, 0.20, 0.75, 0.20, 0.70, 0.15],
  skewedIn:  [0.98, 0.82, 0.62, 0.42, 0.28, 0.16, 0.08, 0.03],
  skewedOut: [0.03, 0.08, 0.16, 0.28, 0.42, 0.62, 0.82, 0.98],
  dense:     [0.72, 0.88, 0.96, 1.00, 0.98, 0.92, 0.82, 0.68],
  sparse:    [0.12, 0.70, 0.08, 0.65, 0.10, 0.55, 0.08, 0.40],
}

/**
 * Canonical ordered list of all ring archetypes. Used by the generator to
 * uniformly pick an archetype from a PRNG draw; exposed for tests and
 * gallery displays.
 */
export const RING_ARCHETYPES: readonly RingArchetype[] = [
  'broad', 'double', 'narrow', 'dusty', 'triple', 'outer',
  'shepherd', 'quadruple', 'skewedIn', 'skewedOut', 'dense', 'sparse',
]

/**
 * Probability (per planet type) that a body carrying `hasRings=true` actually
 * produces a `RingVariation`. Physics flag is the gate; these weights merely
 * bias the *appearance* distribution given a candidate planet.
 *
 * These could eventually be consumed by the seed generator to decide
 * `hasRings` itself — today the flag is set externally.
 */
export const RING_SPAWN_WEIGHTS: Record<BodyType, number> = {
  gaseous:  0.30,
  rocky:    0.06,
  metallic: 0.04,
  star:     0.00,
}

// ── Color helpers ────────────────────────────────────────────────────────────

type RGBRange = [from: [number, number, number], to: [number, number, number]]

function pickArchetype(r: () => number): RingArchetype {
  const i = Math.floor(r() * RING_ARCHETYPES.length)
  return RING_ARCHETYPES[Math.min(i, RING_ARCHETYPES.length - 1)]
}

function typePaletteRanges(type: BodyType): { inner: RGBRange, outer: RGBRange } {
  switch (type) {
    case 'gaseous':
      // Icy/silicate debris — warm ochre core fading to pale cream.
      return {
        inner: [[0xc8, 0xa0, 0x60], [0xe8, 0xc4, 0x80]],
        outer: [[0xe0, 0xd0, 0xb0], [0xff, 0xf2, 0xd8]],
      }
    case 'rocky':
      // Rocky debris — charcoal to dusty brown.
      return {
        inner: [[0x50, 0x48, 0x42], [0x78, 0x6a, 0x5a]],
        outer: [[0x88, 0x78, 0x68], [0xb0, 0x9a, 0x7c]],
      }
    case 'metallic':
      // Metallic rubble — bronze to pale gold.
      return {
        inner: [[0x6a, 0x4c, 0x28], [0x9a, 0x72, 0x3a]],
        outer: [[0xc0, 0x9a, 0x58], [0xe8, 0xc8, 0x88]],
      }
    default:
      return {
        inner: [[0x80, 0x80, 0x80], [0xb0, 0xb0, 0xb0]],
        outer: [[0xb0, 0xb0, 0xb0], [0xe0, 0xe0, 0xe0]],
      }
  }
}

// Cross-type exotic palettes — sampled rarely for occasional strikingly
// different rings (icy moon rings around a rocky planet, rose-dust around a
// metallic body, …). Each entry is a single range reused for inner/outer so
// the ring stays tonally coherent but clearly off-palette.
const EXOTIC_PALETTES: readonly RGBRange[] = [
  [[0x8a, 0xb8, 0xe0], [0xd4, 0xec, 0xff]],   // icy blue
  [[0xc4, 0x7a, 0x9a], [0xf0, 0xb4, 0xc6]],   // rose-pink
  [[0x4c, 0x6e, 0x58], [0x8a, 0xa8, 0x80]],   // muted forest
  [[0x78, 0x58, 0xa0], [0xc0, 0x98, 0xd8]],   // violet haze
  [[0x9a, 0x48, 0x2a], [0xd4, 0x84, 0x54]],   // rust red
  [[0x58, 0x58, 0x60], [0x9c, 0x9c, 0xa6]],   // ashen grey
  [[0xb8, 0xa8, 0x40], [0xe8, 0xdc, 0x90]],   // sulfuric yellow
  [[0x3a, 0x90, 0x8c], [0x80, 0xc8, 0xc2]],   // teal
]

function mixColor(r: () => number, range: RGBRange): string {
  const t   = r()
  const ch  = (a: number, b: number) => Math.round(a + (b - a) * t)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  const [from, to] = range
  return '#' + hex(ch(from[0], to[0])) + hex(ch(from[1], to[1])) + hex(ch(from[2], to[2]))
}

function pickExotic(r: () => number): RGBRange {
  const i = Math.floor(r() * EXOTIC_PALETTES.length)
  return EXOTIC_PALETTES[Math.min(i, EXOTIC_PALETTES.length - 1)]
}

// ── Range bounds (exposed for tests) ─────────────────────────────────────────

/** Probability the ring is drawn in thin/shepherd mode rather than wide. */
const THIN_MODE_CHANCE = 0.18
/** Probability the palette is drawn from the exotic pool rather than per-type. */
const EXOTIC_PALETTE_CHANCE = 0.22

/**
 * Numeric bounds used by {@link generateRingVariation}. Exposed so test
 * fixtures and UI sliders can share the exact `[min, max]` bounds without
 * hard-coding duplicates.
 */
export const RING_RANGES = {
  innerRatio:   { min: 1.10, max: 1.75 },
  /** Thin-mode thickness added on top of innerRatio. */
  thinThick:    { min: 0.05, max: 0.35 },
  /** Wide-mode thickness added on top of innerRatio. */
  wideThick:    { min: 0.40, max: 2.50 },
  opacity:      { min: 0.28, max: 0.95 },
  bandFreq:     { min: 3,    max: 48  },
  bandContrast: { min: 0.08, max: 0.85 },
  dustiness:    { min: 0.00, max: 0.90 },
  grainAmount:  { min: 0.20, max: 0.95 },
  grainFreq:    { min: 90,   max: 520 },
  lobeStrength: { min: 0.06, max: 0.42 },
  keplerShear:  { min: 0.00, max: 1.00 },
} as const

// ── Generator ────────────────────────────────────────────────────────────────

/**
 * Generates a ring variation from the shared planet PRNG. Draws the same
 * number of random values regardless of `hasRings`, so enabling/disabling
 * the flag never drifts the rest of the planet appearance.
 *
 * @param config - Planet physics config (drives palette + rejects star bodies).
 * @param rng    - Planet-scoped PRNG (same instance as planetVariation).
 * @returns      - A fully-populated RingVariation, or null when rings are disabled.
 */
export function generateRingVariation(
  config: BodyConfig,
  rng:    () => number,
): RingVariation | null {
  // Always consume the same draws so PRNG stream stays stable regardless of hasRings.
  const archetype = pickArchetype(rng)
  const base      = ARCHETYPE_PROFILES[archetype]
  // Wider per-sample jitter — opens up inter-archetype variation without losing shape.
  const jitter    = base.map(v => clamp01(v + (rng() - 0.5) * 0.20)) as unknown as Profile8

  const innerRatio = lerp(RING_RANGES.innerRatio.min, RING_RANGES.innerRatio.max, rng())

  // Thin-ring mode produces shepherd-like bands; wide mode covers broad Saturn-like discs.
  // Shepherd archetype always takes the thin path so the profile shape matches the width.
  const thinRoll    = rng()
  const thinMode    = archetype === 'shepherd' || thinRoll < THIN_MODE_CHANCE
  const thick       = thinMode
    ? lerp(RING_RANGES.thinThick.min, RING_RANGES.thinThick.max, rng())
    : lerp(RING_RANGES.wideThick.min, RING_RANGES.wideThick.max, rng())
  const outerRatio  = innerRatio + thick

  // Palette — mostly per-type, occasionally exotic for visual surprise.
  // Both draws (inner/outer) follow the same mode so the ring stays tonally coherent.
  const exoticRoll = rng()
  const useExotic  = exoticRoll < EXOTIC_PALETTE_CHANCE
  let innerRange:  RGBRange
  let outerRange:  RGBRange
  if (useExotic) {
    innerRange = pickExotic(rng)
    outerRange = pickExotic(rng)
  } else {
    const palette = typePaletteRanges(config.type)
    innerRange    = palette.inner
    outerRange    = palette.outer
    // Keep PRNG stream aligned with the exotic branch (2 pickExotic draws).
    rng(); rng()
  }
  const colorInner = mixColor(rng, innerRange)
  const colorOuter = mixColor(rng, outerRange)

  const bandFreq     = lerp(RING_RANGES.bandFreq.min,     RING_RANGES.bandFreq.max,     rng())
  const bandContrast = lerp(RING_RANGES.bandContrast.min, RING_RANGES.bandContrast.max, rng())

  // Dusty archetype biases toward the upper half of the dustiness range.
  const dustinessRaw = rng()
  const dustiness    = archetype === 'dusty'
    ? lerp(0.45, RING_RANGES.dustiness.max, dustinessRaw)
    : lerp(RING_RANGES.dustiness.min, RING_RANGES.dustiness.max, dustinessRaw)

  const grainAmount  = lerp(RING_RANGES.grainAmount.min,  RING_RANGES.grainAmount.max,  rng())
  const grainFreq    = lerp(RING_RANGES.grainFreq.min,    RING_RANGES.grainFreq.max,    rng())
  // Thin rings stay more readable with a slightly higher minimum opacity.
  const opacityRaw   = rng()
  const opacityMin   = thinMode ? 0.50 : RING_RANGES.opacity.min
  const opacity      = lerp(opacityMin, RING_RANGES.opacity.max, opacityRaw)
  const lobeStrength = lerp(RING_RANGES.lobeStrength.min, RING_RANGES.lobeStrength.max, rng())
  const noiseSeed    = Math.floor(rng() * 10_000)
  // Dusty archetype stays visually coherent with a muted shear; shepherd
  // narrow rings also keep low shear so a single band doesn't smear. Other
  // archetypes sample the full range — Saturn-like broad discs benefit most.
  const shearRaw     = rng()
  const keplerShear  = archetype === 'dusty' || archetype === 'shepherd'
    ? lerp(RING_RANGES.keplerShear.min, 0.35, shearRaw)
    : lerp(RING_RANGES.keplerShear.min, RING_RANGES.keplerShear.max, shearRaw)

  // Body types that cannot carry a ring system (currently `star`) opt out
  // through the strategy table — defensive even when `hasRings` is set.
  if (!strategyFor(config.type).canHaveRings || !config.hasRings) return null

  return {
    innerRatio,
    outerRatio,
    colorInner,
    colorOuter,
    profile: jitter,
    bandFreq,
    bandContrast,
    dustiness,
    grainAmount,
    grainFreq,
    opacity,
    lobeStrength,
    keplerShear,
    noiseSeed,
    archetype,
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
