/**
 * Type + parameter schema for the planet-shaders library.
 *
 * Each parameter is a {@link ParamDef} carrying its **type, range and
 * default** — the schema needed to drive shader uniforms and to back
 * a control panel. Display strings (labels, group names, select-option
 * names, type icons) are deliberately absent: they are i18n / UI
 * concerns owned by the caller. A reference dictionary lives in the
 * playground (`playground/src/lib/paramLabels.ts`).
 *
 * Numeric `min/max/step` come from `shaderRanges.ts` (single source of
 * truth across shader code, schema and tests).
 */

import { SHADER_RANGES } from './shaderRanges'

/**
 * Shader-side body-type identifier. Same string set as
 * `BodyConfig['type']` — the two types are kept structurally distinct so
 * the shader catalogue can evolve independently from the public config
 * surface (e.g. add a render-only `'preview'` type without touching
 * `BodyConfig`).
 */
export type LibBodyType = 'rocky' | 'gaseous' | 'metallic' | 'star'

/**
 * Definition of a single shader parameter — either a numeric slider
 * (`min/max/step`), a colour picker (`type: 'color'`) or an enum select
 * (`type: 'select'` + `optionCount`). Display strings (`label`, option
 * names) are NOT carried by the schema; callers map `paramKey` to a
 * label of their choosing.
 */
export interface ParamDef {
  type?:    'color' | 'select'
  min?:     number
  max?:     number
  step?:    number
  default:  number | string | number[]
  /**
   * Number of valid options for a `type: 'select'` parameter. The shader
   * receives the selected index in `[0, optionCount - 1]`. Caller-side
   * UIs map each index to a display string (see playground's
   * `SELECT_OPTION_LABELS`).
   */
  optionCount?: number
}

/**
 * Full shader-parameter catalogue keyed by body type. Each body type maps
 * to a flat record of `paramName → {@link ParamDef}`. Authoritative
 * schema for any external control panel.
 */
export type BodyParamsMap = Record<LibBodyType, Record<string, ParamDef>>

const R = SHADER_RANGES

/**
 * Shader parameter catalogue for every supported body type. The
 * structure mirrors {@link BodyParamsMap}; it is the single source of
 * truth for default values and UI bounds across the library.
 */
export const BODY_PARAMS: BodyParamsMap = {

  // Rocky planet: FBM terrain, craters, cracks, lava, clouds
  rocky: {
    seed:           { ...R.rocky.seed,          default: 42 },
    noiseSeed:      { default: [0, 0, 0] },
    noiseFreq:      { ...R.rocky.noiseFreq,     default: 1.0 },
    terrainArchetype: { type: 'select', optionCount: 4, default: 0 },
    roughness:      { ...R.rocky.roughness,     default: 0.7 },
    turbulence:     { ...R.rocky.turbulence,    default: 0   },
    craterDensity:  { ...R.rocky.craterDensity, default: 1.2 },
    craterCount:    { ...R.rocky.craterCount,   default: 5   },
    heightScale:    { ...R.rocky.heightScale,   default: 0.6 },
    colorA:         { type: 'color',            default: '#5c3d2e' },
    colorB:         { type: 'color',            default: '#b08060' },
    colorMix:       { ...R.rocky.colorMix,      default: 0.30 },
    craterColor:    { type: 'color',            default: '#2a1810' },
    craterColorMix: { ...R.rocky.craterColorMix, default: 0.50 },
    crackAmount:    { ...R.rocky.crackAmount,   default: 0.50 },
    crackScale:     { ...R.rocky.crackScale,    default: 2.0  },
    crackWidth:     { ...R.rocky.crackWidth,    default: 0.20 },
    crackDepth:     { ...R.rocky.crackDepth,    default: 0.70 },
    crackColor:     { type: 'color',            default: '#1a0f08' },
    crackBlend:     { type: 'select', optionCount: 5, default: 0 },
    lavaAmount:     { ...R.rocky.lavaAmount,    default: 0.0 },
    lavaColor:      { type: 'color',            default: '#ff3300' },
    lavaEmissive:   { ...R.rocky.lavaEmissive,  default: 1.5 },
    waveAmount:     { ...R.rocky.waveAmount,    default: 0.0 },
    waveColor:      { type: 'color',            default: '#d0d8e8' },
    waveScale:      { ...R.rocky.waveScale,     default: 1.2 },
    waveSpeed:      { min: 0, max: 3, step: 0.05, default: 1.0 },
    // Cloud pattern preset — combines `bandiness`, `turbulence`, `storms`
    // and `bandFreq` of the atmo shell in one click. Forwarded
    // playground-side. Indices map (in order) to: dispersed, cyclones,
    // veil — caller-owned labels.
    cloudPattern:   { type: 'select', optionCount: 3, default: 0 },
    // Atmosphere — atmo-shell uniforms forwarded live (no rebuild):
    //   tint     → atmoShell.setParams({ tint })
    //   opacity  → atmoShell.setOpacity()
    //   colorMix → atmoShell.setParams({ tileColorMix })
    atmoTint:       { type: 'color',            default: '#aaccff' },
    atmoOpacity:    { min: 0, max: 1, step: 0.01, default: 0.45 },
    atmoColorMix:   { min: 0, max: 1, step: 0.01, default: 0.85 },
  },

  // Gas giant: latitudinal bands, turbulence, deep spots, clouds
  gaseous: {
    seed:              { ...R.gaseous.seed,          default: 123 },
    noiseSeed:         { default: [0, 0, 0] },
    noiseFreq:         { ...R.gaseous.noiseFreq,     default: 1.0 },
    // Bands
    bandCount:         { ...R.gaseous.bandCount,     default: 8 },
    bandSharpness:     { ...R.gaseous.bandSharpness, default: 0.3 },
    bandWarp:          { ...R.gaseous.bandWarp,      default: 0.3 },
    turbulence:        { ...R.gaseous.turbulence,    default: 0.5 },
    cloudDetail:       { ...R.gaseous.cloudDetail,   default: 0.4 },
    jetStream:         { ...R.gaseous.jetStream,     default: 0.4 },
    // Palette
    colorA:            { type: 'color',              default: '#e8c090' },
    colorB:            { type: 'color',              default: '#a05030' },
    colorC:            { type: 'color',              default: '#d4844a' },
    colorD:            { type: 'color',              default: '#c8784a' },
    animSpeed:         { ...R.gaseous.animSpeed,     default: 0.3 },
    // High-altitude clouds
    cloudAmount:       { ...R.gaseous.cloudAmount,   default: 0.0 },
    cloudColor:        { type: 'color',              default: '#e8eaf0' },
    cloudBlend:        { type: 'select', optionCount: 5, default: 0 },
    // Inner corona — additive fresnel glow at the silhouette.
    coronaStrength:    { min: 0, max: 2, step: 0.05, default: 0.6 },
    coronaColor:       { type: 'color',              default: '#ffd9a8' },
    // Storms — 3 deterministic vortices. Position hashed from `seed`;
    // colour / size / eye intensity driven by sliders.
    stormStrength:     { ...R.gaseous.stormStrength,    default: 0.0 },
    stormColor:        { type: 'color',                 default: '#f0a060' },
    stormSize:         { ...R.gaseous.stormSize,        default: 1.0 },
    stormEyeStrength:  { ...R.gaseous.stormEyeStrength, default: 0.35 },
  },

  // Metallic planet: procedural patterns, PBR reflections, cracks
  metallic: {
    noiseSeed:    { default: [0, 0, 0] },
    noiseFreq:    { ...R.metallic.noiseFreq,    default: 1.0 },
    terrainArchetype: { type: 'select', optionCount: 4, default: 0 },
    metalness:    { ...R.metallic.metalness,    default: 0.9 },
    roughness:    { ...R.metallic.roughness,    default: 0.65 },
    turbulence:   { ...R.metallic.turbulence,   default: 0    },
    colorA:         { type: 'color',                default: '#1a1a20' },
    colorB:         { type: 'color',                default: '#606880' },
    colorMix:       { ...R.metallic.colorMix,       default: 0.30 },
    craterDensity:  { ...R.metallic.craterDensity,  default: 1.2 },
    craterCount:    { ...R.metallic.craterCount,    default: 5   },
    craterColor:    { type: 'color',                default: '#0a0a10' },
    craterColorMix: { ...R.metallic.craterColorMix, default: 0.50 },
    crackAmount:  { ...R.metallic.crackAmount,  default: 0.50 },
    crackScale:   { ...R.metallic.crackScale,   default: 2.0 },
    crackWidth:   { ...R.metallic.crackWidth,   default: 0.15 },
    crackDepth:   { ...R.metallic.crackDepth,   default: 0.7 },
    crackColor:   { type: 'color',              default: '#606880' },
    crackBlend:   { type: 'select', optionCount: 5, default: 0 },
    lavaAmount:   { ...R.metallic.lavaAmount,   default: 0.20 },
    lavaScale:    { ...R.metallic.lavaScale,    default: 0.60 },
    lavaWidth:    { ...R.metallic.lavaWidth,    default: 0.08 },
    lavaColor:    { type: 'color',              default: '#ff6600' },
    lavaEmissive: { ...R.metallic.lavaEmissive, default: 1.5 },
    // Atmosphere — same as rocky, forwarded live to the atmo shell.
    atmoTint:     { type: 'color',              default: '#aaccff' },
    atmoOpacity:  { min: 0, max: 1, step: 0.01, default: 0.30 },
    atmoColorMix: { min: 0, max: 1, step: 0.01, default: 0.85 },
  },

  // Star: convective granulation, corona, pulsation, spectral temperature
  star: {
    seed:                { ...R.star.seed,                default: 1 },
    temperature:         { ...R.star.temperature,         default: 5778 },
    animSpeed:           { ...R.star.animSpeed,           default: 1.0 },
    convectionScale:     { ...R.star.convectionScale,     default: 1.5 },
    granulationContrast: { ...R.star.granulationContrast, default: 0.65 },
    cloudAmount:         { ...R.star.cloudAmount,         default: 0.55 },
    cloudBlend:          { type: 'select', optionCount: 5, default: 2 },
    coronaSize:          { ...R.star.coronaSize,          default: 0.15 },
    pulsation:           { ...R.star.pulsation,           default: 0.3 },
  },
}

/**
 * Returns a `{ key: defaultValue }` map for every parameter of a planet type.
 */
export function getDefaultParams(type: LibBodyType): Record<string, number | string | number[]> {
  const defs = BODY_PARAMS[type]
  const out: Record<string, number | string | number[]> = {}
  for (const [key, cfg] of Object.entries(defs)) {
    out[key] = cfg.default
  }
  return out
}
