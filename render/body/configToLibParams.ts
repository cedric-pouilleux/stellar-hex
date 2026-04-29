import type { BodyConfig, PlanetConfig, StarConfig } from '../../types/body.types'
import type { BodyVariation } from './bodyVariation'
import { SHADER_RANGES } from '../../shaders'
import type { ParamMap } from '../../shaders/BodyMaterial'
import {
  shiftColor,
  rockyColors,
  rockyCrackColor,
  gasColorPalette,
  metallicShaderColors,
} from './bodyColorDeriver'
import { clamp, lerp } from '../../internal/math'
import { SPECTRAL_KELVIN, hasSurfaceLiquid } from '../../physics/body'
import { strategyFor } from './bodyTypeStrategy'
import { continentSeedFromName } from '../../internal/continents'

// Shorthand aliases — single source of truth for all param bounds
const RR = SHADER_RANGES.rocky
const MR = SHADER_RANGES.metallic

// ── Seed derivation ───────────────────────────────────────────────────────────

function seedFromName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 1000
  return h
}

/** @internal — exported for the body-type strategy table. Not part of the public API. */
export function rockyShaderParams(
  config:   PlanetConfig,
  variation?: BodyVariation,
): ParamMap {
  const atmo    = config.atmosphereThickness ?? 0
  // Surface-liquid presence still influences atmospheric/erosion baselines
  // (a wet world's air carries water cycles), but the substance + climate
  // model that decides "wet vs dry" is caller-owned via `liquidState`.
  const hasLiquid = hasSurfaceLiquid(config)
  const liquid  = hasLiquid ? 0.5 : 0
  const mass    = config.mass ?? 1.0

  // Physics baselines — derived from atmo / liquid / mass only. Thermal
  // weathering (crater erosion, lava amount) is caller-driven now: the
  // caller pushes `hasLava` / `hasCracks` and the variation values that
  // reflect its own chemistry/climate model.
  const physRoughness    = clamp(0.85 - liquid * 0.35 - atmo * 0.15, 0.30, 0.90)
  const physHeight       = clamp(0.75 - mass * 0.08 - atmo * 0.35,  0.15, 0.75)
  const craterErosion    = clamp(atmo * 0.85 + liquid * 0.40, 0, 1)

  // Apply variation multipliers on top of physics baselines
  const roughness    = clamp(physRoughness    * (variation?.roughnessMod     ?? 1), 0.10, 1.00)
  const heightScale  = clamp(physHeight       * (variation?.heightMod        ?? 1), 0.05, 1.00)
  const craterDensity = clamp(lerp(RR.craterDensity.min, RR.craterDensity.max, 1 - craterErosion) * (variation?.craterDensityMod ?? 1), RR.craterDensity.min, RR.craterDensity.max)
  const craterCount   = clamp(lerp(RR.craterCount.min,   RR.craterCount.max,   1 - craterErosion) * (variation?.craterCountMod  ?? 1), RR.craterCount.min,   RR.craterCount.max)
  const craterDepth   = 1.0
  const waveAmount    = variation?.waveAmount ?? 0

  // Colors — physics selects palette family (needed early for crackColor)
  const base     = rockyColors(config)

  // Colors — variation shifts warm/cool + brightness within the palette family
  const colorMix = variation?.colorMix  ?? 0.5
  const lum      = variation?.luminance ?? 1.0
  const colorA   = shiftColor(base.colorA, colorMix, lum)
  const colorB   = shiftColor(base.colorB, colorMix, lum)

  // Cracks / lava are pure visual effects — intensity 0 disables the layer
  // entirely. The caller (game logic) pushes a value > 0 when it wants the
  // planet to display the effect; the lib has no opinion on when that
  // should be.
  const crackIntensity = variation?.crackIntensity ?? 0
  const crackAmount    = crackIntensity <= 0 ? 0
    : lerp(RR.crackAmount.min, RR.crackAmount.max, crackIntensity)

  const crackColor  = rockyCrackColor(colorA, colorB)
  const crackWidth  = clamp(variation?.crackWidth ?? 0.20, RR.crackWidth.min, RR.crackWidth.max)
  const crackScale  = clamp(variation?.crackScale ?? 2.00, RR.crackScale.min, RR.crackScale.max)
  const crackDepth  = clamp(variation?.crackDepth ?? 0.70, RR.crackDepth.min, RR.crackDepth.max)

  const lavaIntensity = variation?.lavaIntensity ?? 0
  const lavaAmount    = lavaIntensity <= 0 ? 0
    : clamp(lavaIntensity, 0, 0.80)
  const lavaEmissive  = variation?.lavaEmissive ?? 1.5
  const lavaColor     = variation?.lavaColor    ?? '#cc2200'

  // Continent layer — same values consumed by `BodySimulation.noiseAt` so
  // the GPU `liquidLandMask` matches the CPU tile classification on the
  // shoreline. `continentAmount = 0` (default) leaves the legacy behaviour.
  const continentSeed = continentSeedFromName(config.name)

  return {
    noiseSeed:  variation?.noiseSeed ?? [0, 0, 0],
    noiseFreq:  variation?.noiseFreq ?? 1.0,
    roughness,  heightScale,
    craterDensity, craterCount, craterDepth,
    crackAmount,   crackColor,  crackWidth, crackScale, crackDepth,
    lavaAmount,    lavaColor,   lavaEmissive,
    colorA,        colorB,
    waveAmount,
    waveScale: variation?.waveScale ?? 1.2,
    continentAmount: config.continentAmount ?? 0,
    continentScale:  config.continentScale  ?? 1,
    continentSeed,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAS
// ─────────────────────────────────────────────────────────────────────────────

/** @internal — exported for the body-type strategy table. Not part of the public API. */
export function gasShaderParams(config: PlanetConfig, variation?: BodyVariation): ParamMap {
  const rot   = config.rotationSpeed
  const mass  = config.mass ?? 1.0

  // Band count and animation keep their physics basis (rotation speed is the driver)
  const bandCount  = clamp(Math.round(3 + rot * 60), 3, 20)
  const animSpeed  = clamp(rot * 6 + 0.10, 0.10, 2.00)

  // Atmospheric look — caller-driven via the variation. Defaults match the
  // mid-range value of each slider so a body without an explicit variation
  // still reads as a balanced gas giant rather than dead-flat.
  const turbulence    = variation?.gasTurbulence    ?? 0.50
  const cloudDetail   = variation?.gasCloudDetail   ?? 0.40
  const bandSharpness = variation?.gasBandSharpness ?? clamp(0.10 + mass * 0.12, 0.10, 0.65)
  const bandWarp      = variation?.gasBandWarp      ?? 0.30
  const jetStream     = variation?.gasJetStream     ?? clamp(0.15 + rot * 6 * 0.55, 0.10, 0.90)

  // Cloud layer — purely visual
  const cloudAmount = variation?.gasCloudAmount ?? 0
  const cloudColor  = variation?.gasCloudColor  ?? '#e8eaf0'

  // Palette — physics preset + variation warm/cool shift + luminance
  const basePalette = gasColorPalette(config)
  const mix = variation?.gasColorMix  ?? 0.5
  const lum = variation?.gasLuminance ?? 1.0
  const palette = {
    colorA: shiftColor(basePalette.colorA, mix, lum),
    colorB: shiftColor(basePalette.colorB, mix, lum * 0.92),
    colorC: shiftColor(basePalette.colorC, mix, lum * 0.96),
    colorD: shiftColor(basePalette.colorD, mix, lum * 0.94),
  }

  return {
    bandCount,    animSpeed,
    bandSharpness, bandWarp, turbulence, cloudDetail, jetStream,
    cloudAmount,  cloudColor,
    ...palette,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAR
// ─────────────────────────────────────────────────────────────────────────────

/** @internal — exported for the body-type strategy table. Not part of the public API. */
export function starShaderParams(config: StarConfig): ParamMap {
  const T_k = SPECTRAL_KELVIN[config.spectralType] ?? 5778
  const rot  = config.rotationSpeed
  const animSpeed           = clamp(rot * 40 + 0.50, 0.30, 3.00)
  const granulationContrast = T_k < 4000 ? 0.85 : T_k < 6000 ? 0.65 : lerp(0.65, 0.30, (T_k - 6000) / 10000)
  const convectionScale     = clamp(config.radius / 2.5, 0.50, 3.50)
  const pulsation           = config.spectralType === 'M' ? 0.60 : config.spectralType === 'K' ? 0.45 : 0.25
  const coronaSize          = config.spectralType === 'O' || config.spectralType === 'B' ? 0.25 : 0.15
  const cloudAmount         = T_k < 4000 ? 0.75 : T_k < 6500 ? 0.55 : 0.35
  return { animSpeed, granulationContrast, convectionScale, pulsation, coronaSize, cloudAmount }
}

// ─────────────────────────────────────────────────────────────────────────────
// METALLIC
// ─────────────────────────────────────────────────────────────────────────────

/** @internal — exported for the body-type strategy table. Not part of the public API. */
export function metallicShaderParams(config: PlanetConfig, variation?: BodyVariation): ParamMap {
  // Caller-owned palette anchors — variation shifts warm/cool + luminance within the family.
  // `metallicShaderColors` reads the deep+peak stops from `config.metallicBands` (or falls
  // back to a neutral grey pair when the caller omits them).
  const { baseA, baseB } = metallicShaderColors(config)
  const colorMix = variation?.colorMix  ?? 0.5
  const lum      = variation?.luminance ?? 1.0
  const colorA   = shiftColor(baseA, colorMix, lum)
  const colorB   = shiftColor(baseB, colorMix, lum)

  // Roughness — neutral baseline (0.65) modulated by variation. Thermal
  // weathering used to tilt the baseline up; that derivation now lives
  // caller-side via `variation.roughnessMod`.
  const physRoughness = clamp(0.65, MR.roughness.min, MR.roughness.max)
  const roughness     = clamp(physRoughness * (variation?.roughnessMod ?? 1), MR.roughness.min, MR.roughness.max)

  // Cracks — intensity 0 disables the layer; caller pushes > 0 to display.
  const crackIntensity = variation?.crackIntensity ?? 0
  const crackAmount    = crackIntensity <= 0 ? 0
    : lerp(MR.crackAmount.min, MR.crackAmount.max, crackIntensity)
  const crackColor  = variation?.crackColor ?? baseB
  const crackWidth  = clamp(variation?.crackWidth ?? 0.15, MR.crackWidth.min, MR.crackWidth.max)
  const crackScale  = clamp(variation?.crackScale ?? 2.0,  MR.crackScale.min, MR.crackScale.max)
  const crackDepth  = clamp(variation?.crackDepth ?? 0.70, MR.crackDepth.min, MR.crackDepth.max)

  // Lava — intensity 0 disables; caller pushes a value > 0 for molten flows.
  // `lavaColor` lives on `variation` now (was `config.lavaColor`); when the
  // caller leaves it at the seeded default, we fall back to the metallic peak
  // stop (baseB) so the lava reads as molten metal rather than dark red.
  const lavaIntensity = variation?.lavaIntensity ?? 0
  const lavaAmount    = lavaIntensity <= 0 ? 0
    : clamp(lavaIntensity, MR.lavaAmount.min, MR.lavaAmount.max)
  const lavaEmissive  = clamp(variation?.lavaEmissive ?? 1.5, MR.lavaEmissive.min, MR.lavaEmissive.max)
  const lavaColor     = variation?.lavaColor ?? baseB
  const lavaScale     = clamp(variation?.lavaScale ?? 0.60, MR.lavaScale.min, MR.lavaScale.max)
  const lavaWidth     = clamp(variation?.lavaWidth ?? 0.08, MR.lavaWidth.min, MR.lavaWidth.max)

  const metalness = variation?.metalness ?? 0.90

  return {
    noiseSeed: variation?.noiseSeed ?? [0, 0, 0],
    noiseFreq: variation?.noiseFreq ?? 1.0,
    colorA,    colorB,
    roughness, metalness,
    crackAmount, crackDepth, crackColor, crackWidth, crackScale,
    crackBlend: variation?.crackBlend ?? 0,
    lavaAmount,  lavaColor,  lavaEmissive, lavaScale, lavaWidth,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives lib shader params from a BodyConfig + optional visual variation.
 * When variation is provided, all shader parameters are covered.
 * When omitted, physics alone drives all params.
 *
 * Rocky bodies read their palette anchors from `config.terrainColorLow` /
 * `config.terrainColorHigh`. Callers compute the anchors themselves and
 * write them back onto the config before calling this function (see the
 * playground's `deriveTemperatureAnchors` for a temperature-driven default
 * reference implementation).
 *
 * Per-type assembly (defaults, special fields like `temperature` for stars)
 * lives in {@link strategyFor} — this function is now a thin wrapper that
 * resolves the seed and forwards to the strategy's `buildShaderParams`.
 *
 * @param config    - Body configuration.
 * @param variation - Optional deterministic visual variation.
 */
export function configToLibParams(
  config:    BodyConfig,
  variation?: BodyVariation,
): ParamMap {
  const seed = seedFromName(config.name)
  return strategyFor(config).buildShaderParams(config, seed, variation)
}
