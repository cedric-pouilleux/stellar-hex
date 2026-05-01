/**
 * Local label dictionaries for the shader control panel.
 *
 * The lib's `BODY_PARAMS` carries only the schema (key, type, range,
 * default, optionCount) — display strings are caller-owned. This file
 * provides the English labels the playground's UI consumes.
 */

import type { LibBodyType } from '@lib'

/** Body-type chip (selector button) — display label + emoji icon. */
export interface BodyTypeDisplay {
  id:    LibBodyType
  label: string
  icon:  string
}

/** Ordered list of body-type chips driving the type selector. */
export const BODY_TYPE_CHIPS: readonly BodyTypeDisplay[] = [
  { id: 'rocky',    label: 'Rocky',    icon: '🪨' },
  { id: 'gaseous',  label: 'Gaseous',  icon: '🟠' },
  { id: 'metallic', label: 'Metallic', icon: '🔮' },
  { id: 'star',     label: 'Star',     icon: '⭐' },
]

/** UI grouping of param keys under collapsible sections, per body type. */
export interface ParamGroup {
  label: string
  keys:  readonly string[]
}

/**
 * UI-only grouping of parameter keys into collapsible sections per body
 * type. Drives the shader control panel's structure; has no effect on
 * GLSL uniforms.
 */
export const BODY_GROUP_LABELS: Record<LibBodyType, readonly ParamGroup[]> = {
  rocky: [
    { label: 'Noise',       keys: ['seed', 'noiseFreq', 'turbulence', 'colorA', 'colorB', 'colorMix'] },
    { label: 'Terrain',     keys: ['terrainArchetype', 'roughness', 'heightScale'] },
    { label: 'Craters',     keys: ['craterDensity', 'craterCount', 'craterColor', 'craterColorMix'] },
    { label: 'Cracks',      keys: ['crackAmount', 'crackScale', 'crackWidth', 'crackDepth', 'crackColor', 'crackBlend'] },
    { label: 'Lava',        keys: ['lavaAmount', 'lavaColor', 'lavaEmissive'] },
    { label: 'Atmosphere',  keys: ['atmoTint', 'atmoOpacity', 'atmoColorMix', 'waveAmount', 'waveColor', 'waveScale', 'waveSpeed', 'cloudPattern'] },
  ],
  gaseous: [
    { label: 'Base',    keys: ['seed', 'noiseFreq'] },
    { label: 'Bands',   keys: ['bandCount', 'bandSharpness', 'bandWarp', 'turbulence', 'jetStream'] },
    { label: 'Colors',  keys: ['colorA', 'colorB', 'colorC', 'colorD'] },
    { label: 'Clouds',  keys: ['cloudAmount', 'cloudColor', 'cloudBlend'] },
    { label: 'Storms',  keys: ['stormStrength', 'stormColor', 'stormSize', 'stormEyeStrength'] },
    { label: 'Corona',  keys: ['coronaStrength', 'coronaColor'] },
  ],
  metallic: [
    { label: 'Noise',    keys: ['seed', 'noiseFreq', 'turbulence', 'colorA', 'colorB', 'colorMix'] },
    { label: 'Surface',  keys: ['terrainArchetype', 'metalness', 'roughness'] },
    { label: 'Craters',  keys: ['craterDensity', 'craterCount', 'craterColor', 'craterColorMix'] },
    { label: 'Cracks',   keys: ['crackAmount', 'crackScale', 'crackWidth', 'crackDepth', 'crackColor', 'crackBlend'] },
    { label: 'Lava',     keys: ['lavaAmount', 'lavaScale', 'lavaWidth', 'lavaColor', 'lavaEmissive'] },
    { label: 'Atmosphere', keys: ['atmoTint', 'atmoOpacity', 'atmoColorMix'] },
  ],
  star: [
    { label: 'Base',        keys: ['seed', 'temperature', 'animSpeed'] },
    { label: 'Surface palette', keys: [
      'colorDarkShift', 'colorMidShift', 'colorBrightShift',
      'colorDarkBoost', 'colorMidBoost', 'colorBrightBoost',
    ] },
    { label: 'Granulation', keys: [
      'convectionScale', 'granulationContrast',
      'boilEnabled', 'boilAmount',
    ] },
    { label: 'Sunspots',    keys: [
      'cloudAmount', 'cloudBlend', 'cloudScale',
      'filamentEnabled', 'filamentScale', 'filamentAmount',
      'penumbraEnabled', 'spotPenumbraShift', 'spotPenumbraBoost',
      'umbraEnabled',    'spotUmbraShift',    'spotUmbraBoost',
    ] },
    { label: 'Effects',     keys: ['limbDarkening', 'coronaSize', 'coronaIntensity', 'pulsation'] },
  ],
}

/**
 * Per-key display label. Lookup falls back to the raw `paramKey` when
 * a key is missing — keeps the UI unbroken when the shader catalogue
 * grows ahead of the dictionary.
 */
export const PARAM_LABELS: Record<string, string> = {
  // Shared
  seed:                 'Seed',
  noiseSeed:            'Noise seed',
  noiseFreq:            'Noise freq',
  turbulence:           'Turbulence',
  colorA:               'Color A',
  colorB:               'Color B',
  colorC:               'Color C',
  colorD:               'Color D',
  colorMix:             'Color mix',
  animSpeed:            'Anim speed',

  // Rocky / Metallic
  terrainArchetype:     'Pattern',
  roughness:            'Roughness',
  heightScale:          'Relief',
  metalness:            'Metalness',

  // Craters
  craterDensity:        'Crater density',
  craterCount:          'Crater count',
  craterColor:          'Crater color',
  craterColorMix:       'Crater mix',

  // Cracks
  crackAmount:          'Cracks',
  crackScale:           'Crack scale',
  crackWidth:           'Crack width',
  crackDepth:           'Crack depth',
  crackColor:           'Crack color',
  crackBlend:           'Crack blend',

  // Lava
  lavaAmount:           'Lava',
  lavaScale:            'Lava scale',
  lavaWidth:            'Lava width',
  lavaColor:            'Lava color',
  lavaEmissive:         'Lava emission',

  // Rocky atmosphere / clouds
  waveAmount:           'Clouds',
  waveColor:            'Cloud color',
  waveScale:            'Cloud scale',
  waveSpeed:            'Cloud speed',
  cloudPattern:         'Cloud pattern',

  // Atmo shell
  atmoTint:             'Halo color',
  atmoOpacity:          'Halo opacity',
  atmoColorMix:         'Halo mix',

  // Gaseous
  bandCount:            'Band count',
  bandSharpness:        'Band sharpness',
  bandWarp:             'Band warp',
  cloudDetail:          'Cloud detail',
  jetStream:            'Jet stream',
  cloudAmount:          'Clouds',
  cloudColor:           'Cloud color',
  cloudBlend:           'Cloud blend',
  coronaStrength:       'Corona strength',
  coronaColor:          'Corona color',
  stormStrength:        'Storm strength',
  stormColor:           'Storm color',
  stormSize:            'Storm size',
  stormEyeStrength:     'Storm eye',

  // Star
  temperature:          'Temperature (K)',
  convectionScale:      'Granulation scale',
  granulationContrast:  'Granulation contrast',
  boilEnabled:          'Boil layer',
  boilAmount:           'Boil amount',
  cloudScale:           'Spot scale',
  filamentEnabled:      'Filament layer',
  filamentScale:        'Filament scale',
  filamentAmount:       'Filament amount',
  penumbraEnabled:      'Halo layer',
  umbraEnabled:         'Core layer',
  spotPenumbraShift:    'Halo temperature',
  spotUmbraShift:       'Core temperature',
  spotPenumbraBoost:    'Halo brightness',
  spotUmbraBoost:       'Core brightness',
  colorDarkShift:       'Dark hue (T×)',
  colorMidShift:        'Mid hue (T×)',
  colorBrightShift:     'Bright hue (T×)',
  colorDarkBoost:       'Dark brightness',
  colorMidBoost:        'Mid brightness',
  colorBrightBoost:     'Bright brightness',
  limbDarkening:        'Limb darkening',
  coronaSize:           'Corona',
  coronaIntensity:      'Corona intensity',
  pulsation:            'Pulsation',
}

/**
 * Per-key option labels for `type: 'select'` parameters. Indices align
 * with the schema's `optionCount`. Missing entries fall back to the
 * index value — keeps the UI rendering stable when a select grows
 * ahead of the dictionary.
 */
export const SELECT_OPTION_LABELS: Record<string, readonly string[]> = {
  terrainArchetype: ['Smooth (FBM)', 'Ridged', 'Billow', 'Hybrid'],
  crackBlend:       ['Mix', 'Screen', 'Overlay', 'Add', 'Soft Light'],
  cloudBlend:       ['Mix', 'Screen', 'Overlay', 'Add', 'Soft Light'],
  cloudPattern:     ['Dispersed', 'Cyclones', 'Veil'],
}

/**
 * Lookup a param's display label, falling back to the raw key when not
 * present in the dictionary.
 */
export function paramLabel(key: string): string {
  return PARAM_LABELS[key] ?? key
}

/**
 * Lookup the option labels for a select param. Returns an `n`-long array
 * (where `n` = `optionCount`); missing entries fall back to the index.
 */
export function selectOptionLabels(key: string, count: number): readonly string[] {
  const known = SELECT_OPTION_LABELS[key]
  if (known && known.length >= count) return known.slice(0, count)
  return Array.from({ length: count }, (_, i) => known?.[i] ?? String(i))
}
