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

type RangeMap = Record<string, ParamRange>

export const SHADER_RANGES: {
  rocky:    RangeMap
  gas:      RangeMap
  metallic: RangeMap
  star:     RangeMap
} = {

  rocky: {
    seed:          { min: 0,     max: 1000, step: 1    },
    noiseFreq:     { min: 0.5,   max: 2.0,  step: 0.05 },
    roughness:     { min: 0,     max: 1,    step: 0.01 },
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

  gas: {
    seed:          { min: 0,   max: 1000, step: 1    },
    noiseFreq:     { min: 0.5, max: 2.0,  step: 0.05 },
    bandCount:     { min: 2,   max: 24,   step: 1    },
    bandSharpness: { min: 0,   max: 1,    step: 0.01 },
    bandWarp:      { min: 0,   max: 1,    step: 0.01 },
    turbulence:    { min: 0,   max: 1,    step: 0.01 },
    cloudDetail:   { min: 0,   max: 1,    step: 0.01 },
    jetStream:     { min: 0,   max: 1,    step: 0.01 },
    animSpeed:     { min: 0,   max: 2,    step: 0.01 },
    cloudAmount:   { min: 0,   max: 1,    step: 0.01 },
  },

  metallic: {
    noiseFreq:    { min: 0.5,  max: 2.0,  step: 0.05 },
    metalness:    { min: 0.0,  max: 1.0,  step: 0.01 },
    roughness:    { min: 0.50, max: 1.00, step: 0.01 },
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
    cloudAmount:         { min: 0,    max: 1,     step: 0.01 },
    coronaSize:          { min: 0,    max: 0.5,   step: 0.01 },
    pulsation:           { min: 0,    max: 1,     step: 0.01 },
  },
}
