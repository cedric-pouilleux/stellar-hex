import { seededPrng } from '../../internal/prng'
import type { BodyConfig } from '../../types/body.types'
import { generateRingVariation, type RingVariation } from '../shells/ringVariation'
import { strategyFor } from './bodyTypeStrategy'

/**
 * Complete visual variation for a planet — covers every shader parameter
 * exposed by the procedural materials. Generated once from a deterministic
 * seed (`config.name`) so appearance is identical across sessions and
 * across server / client.
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

// Rocky and metallic share the same crack-colour generation range. Rocky's
// final colour is later recomputed from the caller-supplied terrain anchors
// (see `rockyCrackColor` in `bodyColorDeriver`); the sample drawn here only
// feeds the metallic path, but is still drawn unconditionally so the PRNG
// sequence stays stable across types.
const CRACK_COLOR_RANGE: ColorRange = [[0x00, 0x00, 0x00], [0xff, 0xff, 0xff]]

// Jovian warm haze — neutral default. Callers that want composition-accurate
// haze override `variation.gasCloudColor` directly after `generateBodyVariation`.
const GAS_CLOUD_DEFAULT_RANGE: ColorRange = [[0xd0, 0xb8, 0x90], [0xf0, 0xe0, 0xc0]]

/**
 * Generate complete deterministic visual variation for a planet.
 * Every shader parameter consumed by the procedural materials is covered.
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
  const ranges  = strategyFor(config.type).variationRanges

  const cloudColor = randomColor(rng, GAS_CLOUD_DEFAULT_RANGE)

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

    // Cracks — per-type ranges live on the body strategy.
    crackIntensity: rng(),  // 0–1 lerp factor between crackAmount min and max
    crackWidth:     r(ranges.crackWidth[0], ranges.crackWidth[1]),
    crackScale:     r(ranges.crackScale[0], ranges.crackScale[1]),
    crackDepth:     r(0.50, 1.00),
    crackColor:     randomColor(rng, CRACK_COLOR_RANGE),
    crackBlend:     ranges.pickCrackBlend(rng),

    // Metallic surface purity
    metalness:      rng(),

    // Lava — per-type scale range lives on the body strategy.
    lavaIntensity:  r(0.20, 1.00),
    lavaEmissive:   r(0.80, 2.80),
    lavaScale:      r(ranges.lavaScale[0], ranges.lavaScale[1]),
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
