import { seededPrng } from '../core/prng'
import type { BodyConfig } from '../types/body.types'
import { generateRingVariation, type RingVariation } from './ringVariation'

/**
 * Complete visual variation for a planet — covers every shader parameter
 * exposed in the playground. Generated once from a shaderSeed (uint32 stored
 * in backend) so appearance is identical across sessions.
 *
 * Physics (BodyConfig) sets whether features exist and their maximum values.
 * Variation sets the exact visual expression within those constraints.
 */
export interface BodyVariation {
  // ── Shared noise ──────────────────────────────────────────────────
  noiseSeed:  [number, number, number]
  noiseFreq:  number   // 0.65–1.55

  // ── Rocky / Metallic: terrain shape ───────────────────────────────
  /** Multiplier on physics roughness — makes surface smoother or rougher. */
  roughnessMod:     number   // 0.60–1.40
  /** Multiplier on physics heightScale — flatter or more dramatic relief. */
  heightMod:        number   // 0.50–1.50
  /** Multiplier on physics craterDensity. */
  craterDensityMod: number   // 0.30–1.70
  /** Multiplier on physics craterCount. */
  craterCountMod:   number   // 0.40–1.60
  /** Direct randomized wave layer amount — independent from physics. */
  waveAmount:   number   // 0.0–1.0
  /** Direct randomized wave scale — independent from physics. */
  waveScale:    number   // 0.5–2.5
  /** Color temperature shift: 0=cooler, 0.5=neutral, 1=warmer. Applied to colorA/colorB. */
  colorMix:         number   // 0..1
  /** Overall brightness for rocky/metallic palette. */
  luminance:        number   // 0.80–1.20

  // ── Rocky / Metallic: cracks ────────────────────────────────────────
  /** 0–1 lerp factor between crackAmount min and max (when hasCracks=true). */
  crackIntensity: number   // 0..1
  crackWidth:     number   // rocky: 0.10–0.50 / metallic: 0.10–0.40
  crackScale:     number   // rocky: 1.00–4.00 / metallic: 1.60–5.00
  crackDepth:     number   // rocky: 0.50–1.00 / metallic: 0.50–1.00
  crackColor:     string   // rocky: physics-informed / metallic: black→white
  crackBlend:     number   // rocky: 0–4 / metallic: 0 (mix) or 4 (soft light)

  // ── Metallic: surface purity ────────────────────────────────────────
  /** Direct metalness value — oxidisation / surface purity variation. */
  metalness:      number   // 0.0–1.0

  // ── Rocky / Metallic: lava ──────────────────────────────────────────
  lavaIntensity:  number
  lavaEmissive:   number   // 0.80–2.80
  lavaScale:      number   // 0.30–2.50
  lavaWidth:      number   // 0.02–0.30

  // ── Gas: band structure ────────────────────────────────────────────
  gasBandSharpness: number   // 0.10–0.65
  gasBandWarp:      number   // 0.05–0.55
  gasJetStream:     number   // 0.10–0.90
  gasTurbulence:    number   // 0.10–0.90
  gasCloudDetail:   number   // 0.10–0.75

  // ── Gas: colors ───────────────────────────────────────────────────
  gasColorMix:      number   // 0..1 warm/cool shift within preset
  gasLuminance:     number   // 0.70–1.30

  // ── Gas: clouds ───────────────────────────────────────────────────
  gasCloudAmount:   number   // 0.0–0.65
  gasCloudColor:    string   // #hex

  // ── Rings ─────────────────────────────────────────────────────────
  /** Ring system when `config.hasRings` is true; null otherwise. */
  rings:            RingVariation | null
}

// ── Color helpers ─────────────────────────────────────────────────────────────

type ColorRange = [from: [number, number, number], to: [number, number, number]]

function randomColor(r: () => number, [from, to]: ColorRange): string {
  const t   = r()
  const ch  = (a: number, b: number) => Math.round(a + (b - a) * t)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return '#' + hex(ch(from[0], to[0])) + hex(ch(from[1], to[1])) + hex(ch(from[2], to[2]))
}

function crackColorRange(config: BodyConfig): ColorRange {
  if (config.type === 'metallic') {
    // Metallic crack color: full black-to-white range driven by variation
    return [[0x00, 0x00, 0x00], [0xff, 0xff, 0xff]]
  }
  // Rocky crack color is computed from resource composition in configToLibParams —
  // this value is generated only to keep the PRNG sequence consistent.
  return [[0x00, 0x00, 0x00], [0xff, 0xff, 0xff]]
}

function gasCloudColorRange(config: BodyConfig): ColorRange {
  const comp = config.gasComposition
  if (!comp)                   return [[0xd0, 0xb8, 0x90], [0xf0, 0xe0, 0xc0]]  // warm haze
  if ((comp.CH4 ?? 0) > 0.30) return [[0xa0, 0xd8, 0xf0], [0xd0, 0xf0, 0xff]]  // ice/blue haze
  if ((comp.NH3 ?? 0) > 0.25) return [[0xe8, 0xe8, 0xd0], [0xff, 0xff, 0xf0]]  // pale ammonia
  return                       [[0xd0, 0xb8, 0x90], [0xf0, 0xe0, 0xc0]]         // jovian warm haze
}

/**
 * Generate complete deterministic visual variation for a planet.
 * Every shader parameter visible in the playground is covered.
 *
 * The variation is seeded purely from `config.name` — a body's visual identity
 * (rings, cracks, band offsets, noise domain) is intrinsic to the same seed
 * that drives its terrain and simulation, so two bodies with the same name
 * always render identically.
 *
 * @param config - Planet physics config (informs palette ranges + feature gates).
 */
export function generateBodyVariation(config: BodyConfig): BodyVariation {
  const rng     = seededPrng('var:' + config.name)
  const r       = (min: number, max: number) => min + rng() * (max - min)
  const ri      = (min: number, max: number) => Math.floor(r(min, max + 1))  // inclusive integer

  const cloudColor = randomColor(rng, gasCloudColorRange(config))

  return {
    // Shared noise
    noiseSeed:      [r(-50, 50), r(-50, 50), r(-50, 50)],
    noiseFreq:      r(0.65, 1.55),

    // Rocky / Metallic terrain shape
    roughnessMod:     r(0.60, 1.40),
    heightMod:        r(0.50, 1.50),
    craterDensityMod: r(0.30, 1.70),
    craterCountMod:   r(0.40, 1.60),
    waveAmount:   r(0.0,  1.00),
    waveScale:    r(0.5,  2.50),
    colorMix:         rng(),
    luminance:        r(0.80, 1.20),

    // Cracks — metallic uses tighter/different ranges
    crackIntensity: rng(),  // 0–1 lerp factor between crackAmount min and max
    crackWidth:     config.type === 'metallic' ? r(0.10, 0.40) : r(0.10, 0.50),
    crackScale:     config.type === 'metallic' ? r(1.60, 5.00) : r(1.00, 4.00),
    crackDepth:     r(0.50, 1.00),
    crackColor:     randomColor(rng, crackColorRange(config)),
    crackBlend:     config.type === 'metallic' ? (rng() > 0.5 ? 4 : 0) : ri(0, 4),

    // Metallic surface purity
    metalness:      rng(),

    // Lava
    lavaIntensity:  r(0.20, 1.00),
    lavaEmissive:   r(0.80, 2.80),
    lavaScale:      config.type === 'metallic' ? r(0.30, 1.00) : r(0.30, 2.50),
    lavaWidth:      r(0.02, 0.30),

    // Gas band structure
    gasBandSharpness: r(0.10, 0.65),
    gasBandWarp:      r(0.05, 0.55),
    gasJetStream:     r(0.10, 0.90),
    gasTurbulence:    r(0.10, 0.90),
    gasCloudDetail:   r(0.10, 0.75),

    // Gas colors
    gasColorMix:      rng(),
    gasLuminance:     r(0.70, 1.30),

    // Gas clouds
    gasCloudAmount:   r(0.0, 0.65),
    gasCloudColor:    cloudColor,

    // Rings — generator always draws its PRNG values so enabling/disabling
    // `hasRings` never shifts the rest of the planet's appearance.
    rings:            generateRingVariation(config, rng),
  }
}
