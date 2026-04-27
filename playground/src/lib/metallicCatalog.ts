/**
 * Temperature-driven composition catalogue for metallic bodies.
 *
 * Picks a 4-band `(deep, plain, high, peak)` tuple from the body's mean
 * equilibrium temperature. The tuple is fed straight to
 * `BodyConfig.metallicBands`, which the lib's `buildMetallicPalette` then
 * consumes to produce the final palette — colour, metalness, roughness,
 * peak height and volcanic emissive all flow from here.
 *
 * The catalogue ranges across five climate presets keyed by average
 * surface temperature (°C):
 *   - `-150°C` : iron-oxide rust (frozen iron)
 *   - `-40°C`  : cold gunmetal
 *   - `+15°C`  : chrome / polished steel
 *   - `+120°C` : copper-bronze
 *   - `+400°C` : molten iron (volcanic peaks)
 *
 * Lives in the playground because "iron oxide", "rust", "chrome", "copper"
 * and "molten" are domain vocabulary — the lib stays free of any
 * composition assumption.
 */

import * as THREE from 'three'
import type { BodyConfig, MetallicBand } from '@lib'
import { c, tempLerp, numLerp } from './colorUtils'

// ── Composition anchors (temperature → colour) ────────────────────

/** Crater-floor colours — darkest band, ~2× darker than plains. */
const M_DEEP: readonly [number, THREE.Color][] = [
  [-150, c(0x3a1a10)],  // dark frozen iron rust
  [ -40, c(0x242830)],  // dark cold gunmetal
  [  15, c(0x1e2228)],  // dark chrome shadow
  [ 120, c(0x2a1c08)],  // dark copper shadow
  [ 400, c(0x160400)],  // near-black molten base
]

/** Plains colours — primary surface tone, sets the overall look of the planet. */
const M_PLAIN: readonly [number, THREE.Color][] = [
  [-150, c(0x7a3820)],  // iron oxide warm brown
  [ -40, c(0x505860)],  // cold dark steel
  [  15, c(0x686e76)],  // steel grey (reference ball mid-tone)
  [ 120, c(0x8a6030)],  // copper-bronze
  [ 400, c(0x903010)],  // hot dark iron
]

/** Highland colours — noticeably lighter than plains, clear visual step up. */
const M_HIGH: readonly [number, THREE.Color][] = [
  [-150, c(0xa85040)],  // rust highlight
  [ -40, c(0x7a8898)],  // steel blue-grey
  [  15, c(0x949ca8)],  // light steel
  [ 120, c(0xc08840)],  // bright copper / gold
  [ 400, c(0xd85010)],  // bright hot orange
]

/** Peak colours — brightest band with strong specular response. */
const M_PEAK: readonly [number, THREE.Color][] = [
  [-150, c(0xd07858)],  // pale rust peak
  [ -40, c(0xa8b4c0)],  // polished steel peak
  [  15, c(0xc4ccd4)],  // chrome / near-silver
  [ 120, c(0xe8c060)],  // bright gold peak
  [ 400, c(0xff6820)],  // molten peak
]

/**
 * Peak elevation schedule keyed by temperature. Tuned to produce sharper
 * relief than rocky bodies — cold iron worlds keep tall jagged peaks;
 * molten worlds have low, rounded summits.
 */
const M_PEAK_HEIGHT: readonly [number, number][] = [
  [-150, 0.160], [-40, 0.130], [15, 0.120], [120, 0.100], [400, 0.060],
]

/** Threshold above which the planet's peaks glow as freshly-cooled lava. */
const VOLCANIC_TEMP_THRESHOLD = 200

// ── Metalness / roughness modulators ──────────────────────────────

/**
 * Compose the four-band metalness ladder for a given mean temperature.
 * Rust (cold) drops metalness slightly; hot surfaces stay polished.
 */
function metalnessLadder(rustFactor: number): [number, number, number, number] {
  return [
    0.55 + (1 - rustFactor) * 0.15,
    0.75 + (1 - rustFactor) * 0.12,
    0.88 + (1 - rustFactor) * 0.09,
    Math.min(1.00, 0.93 + (1 - rustFactor) * 0.07),
  ]
}

/**
 * Compose the four-band roughness ladder. Rust increases roughness on
 * plains / highlands; hot (molten) surfaces smooth out.
 */
function roughnessLadder(rustFactor: number, hotFactor: number): [number, number, number, number] {
  return [
    0.60 - hotFactor * 0.15,
    Math.max(0.18, 0.38 + rustFactor * 0.20 - hotFactor * 0.10),
    0.22 + rustFactor * 0.18 - hotFactor * 0.08,
    Math.max(0.08, 0.14 + rustFactor * 0.12 - hotFactor * 0.06),
  ]
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Resolves the four-band metallic spec for a body. The mean equilibrium
 * temperature `(temperatureMin + temperatureMax) / 2` drives the
 * colour interpolation + material ladders.
 *
 * Pure function — deterministic for any given `(temperatureMin,
 * temperatureMax)` pair and free of side effects.
 *
 * @param config Body configuration. Only the two temperature fields are read.
 * @returns 4-band tuple ready to write into `BodyConfig.metallicBands`.
 */
export function deriveMetallicBands(
  temperature: { min: number; max: number },
): readonly [MetallicBand, MetallicBand, MetallicBand, MetallicBand] {
  const avg = (temperature.min + temperature.max) / 2

  const colors: [THREE.Color, THREE.Color, THREE.Color, THREE.Color] = [
    tempLerp(M_DEEP,  avg),
    tempLerp(M_PLAIN, avg),
    tempLerp(M_HIGH,  avg),
    tempLerp(M_PEAK,  avg),
  ]

  // 0 = polished (avg ≥ 15°C), 1 = fully oxidised (avg ≤ -40°C)
  const rustFactor = Math.max(0, Math.min(1, (-avg + 15) / 55))
  // 0 at 80°C, 1 at 230°C
  const hotFactor  = Math.max(0, Math.min(1, (avg - 80) / 150))

  const metalness = metalnessLadder(rustFactor)
  const roughness = roughnessLadder(rustFactor, hotFactor)

  const peakHeight   = numLerp(M_PEAK_HEIGHT, avg)
  const isVolcanic   = avg > VOLCANIC_TEMP_THRESHOLD
  const peakEmissive = isVolcanic ? Math.min(1.0, (avg - VOLCANIC_TEMP_THRESHOLD) / 250) : 0

  const peakBand: MetallicBand = {
    color:     '#' + colors[3].getHexString(),
    metalness: metalness[3],
    roughness: roughness[3],
    height:    peakHeight,
    ...(isVolcanic && {
      emissive:          '#ff5500',
      emissiveIntensity: peakEmissive,
    }),
  }

  return [
    {
      color:     '#' + colors[0].getHexString(),
      metalness: metalness[0],
      roughness: roughness[0],
      height:    0,
    },
    {
      color:     '#' + colors[1].getHexString(),
      metalness: metalness[1],
      roughness: roughness[1],
      height:    0.018,
    },
    {
      color:     '#' + colors[2].getHexString(),
      metalness: metalness[2],
      roughness: roughness[2],
      height:    0.060,
    },
    peakBand,
  ]
}
