import type { BodyConfig }    from '../types/body.types'
import type { BodyVariation } from './bodyVariation'
import { getDefaultParams, SHADER_RANGES } from '../shaders'
import type { ParamMap } from '../shaders/BodyMaterial'
import {
  hexToRgb,
  rgbToHex,
  shiftColor,
  rockyColors,
  rockyCrackColor,
  gasColorPalette,
  metallicColors,
} from './bodyColorDeriver'
import { clamp, lerp } from '../core/math'
import { SPECTRAL_KELVIN } from '../config/defaults'

// Shorthand aliases — single source of truth for all param bounds
const RR = SHADER_RANGES.rocky
const MR = SHADER_RANGES.metallic

// Crater erosion temperature window (°C): planets whose average surface
// temperature sits in this band have weather cycles active enough to erase
// impact craters, cracks and lava patches.
const CRATER_EROSION_T_MIN = -20
const CRATER_EROSION_T_MAX =  50

// ── Type mapping ──────────────────────────────────────────────────────────────

export function bodyTypeToLibType(type: BodyConfig['type']): 'rocky' | 'gas' | 'metallic' | 'star' {
  return type === 'gaseous' ? 'gas' : (type as 'rocky' | 'metallic' | 'star')
}

// ── Seed derivation ───────────────────────────────────────────────────────────

function seedFromName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 1000
  return h
}

function rockyShaderParams(config: BodyConfig, variation?: BodyVariation): ParamMap {
  const atmo    = config.atmosphereThickness ?? 0
  const water   = config.waterCoverage       ?? 0
  const T_avg   = (config.temperatureMin + config.temperatureMax) / 2
  const T_range = config.temperatureMax - config.temperatureMin
  const isWeathered = T_avg >= CRATER_EROSION_T_MIN && T_avg <= CRATER_EROSION_T_MAX
  const mass    = config.mass ?? 1.0

  // Physics baselines
  const physRoughness    = clamp(0.85 - water * 0.35 - atmo * 0.15, 0.30, 0.90)
  const physHeight       = clamp(0.75 - mass * 0.08 - atmo * 0.35,  0.15, 0.75)
  const craterErosion    = clamp(atmo * 0.85 + water * 0.40, 0, 1)

  // Apply variation multipliers on top of physics baselines
  const roughness    = clamp(physRoughness    * (variation?.roughnessMod     ?? 1), 0.10, 1.00)
  const heightScale  = clamp(physHeight       * (variation?.heightMod        ?? 1), 0.05, 1.00)
  const craterDensity = isWeathered ? 0 : clamp(lerp(RR.craterDensity.min, RR.craterDensity.max, 1 - craterErosion) * (variation?.craterDensityMod ?? 1), RR.craterDensity.min, RR.craterDensity.max)
  const craterCount   = isWeathered ? 0 : clamp(lerp(RR.craterCount.min,   RR.craterCount.max,   1 - craterErosion) * (variation?.craterCountMod  ?? 1), RR.craterCount.min,   RR.craterCount.max)
  const craterDepth   = isWeathered ? 0 : 1.0
  const waveAmount    = variation?.waveAmount ?? 0

  // Cracks — disabled in weathered zone, otherwise physics max × variation
  // Colors — physics selects palette family (needed early for crackColor)
  const base     = rockyColors(config)

  // Colors — variation shifts warm/cool + brightness within the palette family
  const colorMix = variation?.colorMix  ?? 0.5
  const lum      = variation?.luminance ?? 1.0
  const colorA   = shiftColor(base.colorA, colorMix, lum)
  const colorB   = shiftColor(base.colorB, colorMix, lum)
  const { lavaColor } = base

  const dryness     = 1 - clamp(water * 1.5 + atmo * 0.5, 0, 1)
  const crackMax    = clamp((T_range / 180) * dryness * 0.7, 0, 1.00)
  const crackAmount = isWeathered || config.hasCracks === false ? 0
    : config.hasCracks === true  ? lerp(RR.crackAmount.min, RR.crackAmount.max, variation?.crackIntensity ?? 0.5)
    : crackMax

  const crackColor  = rockyCrackColor(colorA, colorB)
  const crackWidth  = clamp(variation?.crackWidth ?? 0.20, RR.crackWidth.min, RR.crackWidth.max)
  const crackScale  = clamp(variation?.crackScale ?? 2.00, RR.crackScale.min, RR.crackScale.max)
  const crackDepth  = clamp(variation?.crackDepth ?? 0.70, RR.crackDepth.min, RR.crackDepth.max)

  // Lava — disabled in weathered zone, otherwise physics max × variation
  const lavaMax = T_avg > 200
    ? clamp((T_avg - 200) / 300, 0, 0.80)
    : T_avg > 100 && water < 0.1 && atmo < 0.2
      ? clamp((T_avg - 100) / 200 * 0.35, 0, 0.30)
      : 0
  const lavaAmount  = isWeathered || config.hasLava === false ? 0
    : config.hasLava === true  ? lavaMax * (variation?.lavaIntensity ?? 1)
    : lavaMax
  const lavaEmissive = variation?.lavaEmissive ?? 1.5

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
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAS
// ─────────────────────────────────────────────────────────────────────────────

function gasShaderParams(config: BodyConfig, variation?: BodyVariation): ParamMap {
  const T_eq  = (config.temperatureMin + config.temperatureMax) / 2 + 273
  const comp  = config.gasComposition
  const rot   = config.rotationSpeed
  const mass  = config.mass ?? 1.0

  // Band count and animation keep their physics basis (rotation speed is the driver)
  const bandCount  = clamp(Math.round(3 + rot * 60), 3, 20)
  const animSpeed  = clamp(rot * 6 + 0.10, 0.10, 2.00)

  // Physics turbulence — used only as fallback when no variation
  const isIceGiant  = (comp?.CH4 ?? 0) > 0.30
  const physTurb    = isIceGiant
    ? clamp(0.10 + T_eq / 2000, 0.10, 0.35)
    : clamp(0.15 + T_eq / 800,  0.20, 0.90)

  const turbulence    = variation?.gasTurbulence    ?? physTurb
  const cloudDetail   = variation?.gasCloudDetail   ?? clamp(0.20 + physTurb * 0.55, 0.10, 0.75)
  const bandSharpness = variation?.gasBandSharpness ?? clamp(0.10 + mass * 0.12, 0.10, 0.65)
  const bandWarp      = variation?.gasBandWarp      ?? clamp(physTurb * 0.55, 0.05, 0.55)
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

function starShaderParams(config: BodyConfig): ParamMap {
  const T_k = config.spectralType ? (SPECTRAL_KELVIN[config.spectralType] ?? 5778) : 5778
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

function metallicShaderParams(config: BodyConfig, variation?: BodyVariation): ParamMap {
  const T_avg   = (config.temperatureMin + config.temperatureMax) / 2
  const T_range = config.temperatureMax - config.temperatureMin

  // Composition-driven colors — variation shifts warm/cool + luminance within the family
  const { baseA, baseB } = metallicColors(T_avg)
  const colorMix = variation?.colorMix  ?? 0.5
  const lum      = variation?.luminance ?? 1.0
  const colorA   = shiftColor(baseA, colorMix, lum)
  const colorB   = shiftColor(baseB, colorMix, lum)

  // Roughness — clamped to metallic slider bounds
  const physRoughness = clamp(0.55 + T_range / 280 * 0.40, MR.roughness.min, MR.roughness.max)
  const roughness     = clamp(physRoughness * (variation?.roughnessMod ?? 1), MR.roughness.min, MR.roughness.max)

  // Cracks — only when explicitly set (hasCracks === true)
  const crackAmount = config.hasCracks === true
    ? lerp(MR.crackAmount.min, MR.crackAmount.max, variation?.crackIntensity ?? 0.5)
    : 0
  const crackColor  = variation?.crackColor ?? baseB
  const crackWidth  = clamp(variation?.crackWidth ?? 0.15, MR.crackWidth.min, MR.crackWidth.max)
  const crackScale  = clamp(variation?.crackScale ?? 2.0,  MR.crackScale.min, MR.crackScale.max)
  const crackDepth  = clamp((variation?.crackDepth ?? 0.70) * (0.50 + T_range / 350), MR.crackDepth.min, MR.crackDepth.max)

  // Lava — only when explicitly set (hasLava === true), independent from cracks
  const lavaPhysMax = T_avg > 150 ? clamp((T_avg - 150) / 350, MR.lavaAmount.min, MR.lavaAmount.max) : MR.lavaAmount.min
  const lavaAmount  = config.hasLava === true
    ? clamp(lavaPhysMax * (variation?.lavaIntensity ?? 1), MR.lavaAmount.min, MR.lavaAmount.max)
    : 0
  const lavaEmissive = clamp(variation?.lavaEmissive ?? 1.5, MR.lavaEmissive.min, MR.lavaEmissive.max)
  // Lava color = dominant mineral composition color (baseB), heated to emissive glow
  const [r, g, b]    = hexToRgb(baseB)
  const heatBoost    = T_avg > 200 ? 1.6 : T_avg > 50 ? 1.3 : 1.1
  const lavaColor    = rgbToHex(r * heatBoost, g * heatBoost, b * heatBoost)
  const lavaScale    = clamp(variation?.lavaScale ?? 0.60, MR.lavaScale.min, MR.lavaScale.max)
  const lavaWidth    = clamp(variation?.lavaWidth ?? 0.08, MR.lavaWidth.min, MR.lavaWidth.max)

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
 * When omitted, physics alone drives all params (backward-compatible).
 */
export function configToLibParams(config: BodyConfig, variation?: BodyVariation): ParamMap {
  const seed = seedFromName(config.name)

  if (config.type === 'star') {
    const temperature = config.spectralType ? (SPECTRAL_KELVIN[config.spectralType] ?? 5778) : 5778
    return { ...getDefaultParams('star'), ...starShaderParams(config), seed, temperature }
  }

  if (config.type === 'gaseous') {
    return {
      ...getDefaultParams('gas'),
      ...gasShaderParams(config, variation),
      noiseSeed: variation?.noiseSeed ?? [0, 0, 0],
      noiseFreq: variation?.noiseFreq ?? 1.0,
      seed,
    }
  }

  if (config.type === 'metallic') {
    return { ...getDefaultParams('metallic'), ...metallicShaderParams(config, variation), seed }
  }

  // rocky
  return { ...getDefaultParams('rocky'), ...rockyShaderParams(config, variation), seed }
}
