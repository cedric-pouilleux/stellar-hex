/**
 * Single source of truth for all numeric shader param ranges.
 * Drives both the UI slider bounds (params.ts) and the variation generator.
 *
 * Each entry: `{ min, max, step }`.
 * Color and select params are not listed here (no numeric range needed).
 */

export interface ParamRange {
  min:  number
  max:  number
  step: number
}

/** Map of numeric shader uniforms to their `{ min, max, step }` bounds. */
export type RangeMap = Record<string, ParamRange>

/**
 * Authoritative `{ min, max, step }` bounds for every numeric shader
 * parameter, keyed by body type. Drives UI sliders, the variation
 * generator, and any test fixture that needs to stay within the valid
 * range of a given uniform.
 */
export const SHADER_RANGES: {
  rocky:    RangeMap
  gaseous:  RangeMap
  metallic: RangeMap
  star:     RangeMap
} = {

  rocky: {
    seed:            { min: 0,     max: 1000, step: 1    },
    noiseFreq:       { min: 0.5,   max: 4.0,  step: 0.05 },
    roughness:       { min: 0,     max: 1,    step: 0.01 },
    turbulence:      { min: 0,     max: 1,    step: 0.01 },
    colorMix:        { min: 0,     max: 1,    step: 0.01 },
    craterColorMix:  { min: 0,     max: 1,    step: 0.01 },
    craterDensity: { min: 1.00,  max: 1.50, step: 0.01 },
    craterCount:   { min: 0,     max: 9,    step: 1    },
    heightScale:   { min: 0,     max: 1,    step: 0.01 },
    crackAmount:   { min: 0.50,  max: 1.00, step: 0.01 },
    crackScale:    { min: 1.00,  max: 4.00, step: 0.1  },
    crackWidth:    { min: 0.10,  max: 0.50, step: 0.01 },
    crackDepth:    { min: 0.50,  max: 1.00, step: 0.01 },
    lavaAmount:    { min: 0,     max: 1,    step: 0.01 },
    lavaEmissive:  { min: 0,     max: 3,    step: 0.01 },
    waveAmount:    { min: 0,     max: 1,    step: 0.01 },
    waveScale:     { min: 0.5,   max: 2.5,  step: 0.1  },
  },

  gaseous: {
    seed:          { min: 0,   max: 1000, step: 1    },
    noiseFreq:     { min: 0.5, max: 2.0,  step: 0.05 },
    bandCount:     { min: 0,   max: 24,   step: 1    },
    bandSharpness: { min: 0,   max: 1,    step: 0.01 },
    bandWarp:      { min: 0,   max: 1,    step: 0.01 },
    turbulence:    { min: 0,   max: 1,    step: 0.01 },
    cloudDetail:   { min: 0,   max: 1,    step: 0.01 },
    jetStream:     { min: 0,   max: 1,    step: 0.01 },
    animSpeed:     { min: 0,   max: 2,    step: 0.01 },
    cloudAmount:      { min: 0,   max: 1,    step: 0.01 },
    stormStrength:    { min: 0,   max: 1,    step: 0.01 },
    stormSize:        { min: 0.3, max: 2.5,  step: 0.05 },
    stormEyeStrength: { min: 0,   max: 1,    step: 0.01 },
  },

  metallic: {
    noiseFreq:      { min: 0.5,  max: 4.0,  step: 0.05 },
    metalness:      { min: 0.0,  max: 1.0,  step: 0.01 },
    roughness:      { min: 0.50, max: 1.00, step: 0.01 },
    turbulence:     { min: 0,    max: 1,    step: 0.01 },
    colorMix:       { min: 0,    max: 1,    step: 0.01 },
    craterDensity:  { min: 1.00, max: 1.50, step: 0.01 },
    craterCount:    { min: 0,    max: 9,    step: 1    },
    craterColorMix: { min: 0,    max: 1,    step: 0.01 },
    crackAmount:  { min: 0.50, max: 1.00, step: 0.01 },
    crackScale:   { min: 1.60, max: 5.00, step: 0.10 },
    crackWidth:   { min: 0.10, max: 0.40, step: 0.01 },
    crackDepth:   { min: 0.50, max: 1.00, step: 0.01 },
    lavaAmount:   { min: 0.10, max: 0.50, step: 0.01 },
    lavaScale:    { min: 0.30, max: 1.00, step: 0.05 },
    lavaWidth:    { min: 0.02, max: 0.30, step: 0.01 },
    lavaEmissive: { min: 0.80, max: 2.80, step: 0.05 },
  },

  star: {
    seed:                { min: 0,    max: 1000,  step: 1    },
    temperature:         { min: 2500, max: 40000, step: 100  },
    animSpeed:           { min: 0,    max: 3,     step: 0.01 },
    convectionScale:     { min: 0.05, max: 4,     step: 0.05 },
    granulationContrast: { min: 0,    max: 1,     step: 0.01 },
    boilAmount:          { min: 0,    max: 0.6,   step: 0.01 },
    cloudAmount:         { min: 0,    max: 1,     step: 0.01 },
    cloudScale:          { min: 0.3,  max: 4,     step: 0.05 },
    filamentScale:       { min: 1,    max: 16,    step: 0.1  },
    filamentAmount:      { min: 0,    max: 0.8,   step: 0.01 },
    spotPenumbraShift:   { min: 0.2,  max: 1,     step: 0.01 },
    spotUmbraShift:      { min: 0.1,  max: 0.9,   step: 0.01 },
    spotPenumbraBoost:   { min: 0,    max: 2,     step: 0.01 },
    spotUmbraBoost:      { min: 0,    max: 1,     step: 0.01 },
    colorDarkShift:      { min: 0.2,  max: 1.2,   step: 0.01 },
    colorMidShift:       { min: 0.4,  max: 1.4,   step: 0.01 },
    colorBrightShift:    { min: 0.6,  max: 1.8,   step: 0.01 },
    colorDarkBoost:      { min: 0,    max: 1,     step: 0.01 },
    colorMidBoost:       { min: 0,    max: 2.5,   step: 0.01 },
    colorBrightBoost:    { min: 0,    max: 3,     step: 0.01 },
    limbDarkening:       { min: 0,    max: 1,     step: 0.01 },
    coronaIntensity:     { min: 0,    max: 8,     step: 0.05 },
    coronaSize:          { min: 0,    max: 0.5,   step: 0.01 },
    pulsation:           { min: 0,    max: 1,     step: 0.01 },
  },
}
