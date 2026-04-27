/**
 * Type + parameter definitions for the planet-shaders library.
 *
 * Each parameter follows one of these schemas:
 *   - Numeric slider : `{ label, min, max, step, default }`
 *   - Color          : `{ label, type: 'color', default }` — default is a #hex string
 *   - Select         : `{ label, type: 'select', options, default }` — default is an index
 *
 * Numeric `min/max/step` come from `shaderRanges.ts` (single source of truth).
 * `BODY_GROUPS` groups keys for UI display — it has no effect on the shaders.
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
 * Definition of a single shader parameter — a slider (numeric + bounds),
 * a colour picker (`type: 'color'`) or a dropdown (`type: 'select'` with
 * `options`). Consumed by UI panels to render the right control.
 */
export interface ParamDef {
  label:    string
  type?:    'color' | 'select'
  min?:     number
  max?:     number
  step?:    number
  default:  number | string | number[]
  options?: string[]
}

/**
 * Full shader-parameter catalogue keyed by body type. Each body type maps
 * to a flat record of `paramName → {@link ParamDef}`. Exposed as the
 * authoritative schema for any external control panel.
 */
export type BodyParamsMap = Record<LibBodyType, Record<string, ParamDef>>

const R = SHADER_RANGES

// ── Available types ───────────────────────────────────────────────────────────

/**
 * User-facing catalogue of supported body types — used to populate UI
 * selectors. The `id` field is the source of truth; `label`/`icon` are
 * cosmetic.
 */
export const BODY_TYPES: Array<{ id: LibBodyType; label: string; icon: string }> = [
  { id: 'rocky',    label: 'Rocheuse',   icon: '🪨' },
  { id: 'gaseous',  label: 'Gazeuse',    icon: '🟠' },
  { id: 'metallic', label: 'Métallique', icon: '🔮' },
  { id: 'star',     label: 'Étoile',     icon: '⭐' },
]

// ── Parameters by type ────────────────────────────────────────────────────────

/**
 * Shader parameter catalogue for every supported body type. The
 * structure mirrors {@link BodyParamsMap}; it is the single source of
 * truth for default values and UI bounds across the library.
 */
export const BODY_PARAMS: BodyParamsMap = {

  // Rocky planet: FBM terrain, craters, cracks, lava, clouds
  rocky: {
    seed:           { label: 'Seed',              ...R.rocky.seed,          default: 42 },
    noiseSeed:      { label: 'Noise seed',        default: [0, 0, 0] },
    noiseFreq:      { label: 'Noise freq',        ...R.rocky.noiseFreq,     default: 1.0 },
    roughness:      { label: 'Rugosité terrain',  ...R.rocky.roughness,     default: 0.7 },
    craterDensity:  { label: 'Densité cratères',  ...R.rocky.craterDensity, default: 1.2 },
    craterCount:    { label: 'Nombre cratères',   ...R.rocky.craterCount,   default: 5   },
    heightScale:    { label: 'Relief',            ...R.rocky.heightScale,   default: 0.6 },
    colorA:         { label: 'Couleur foncée',    type: 'color',            default: '#5c3d2e' },
    colorB:         { label: 'Couleur claire',    type: 'color',            default: '#b08060' },
    crackAmount:    { label: 'Fissures',          ...R.rocky.crackAmount,   default: 0.50 },
    crackScale:     { label: 'Échelle fissures',  ...R.rocky.crackScale,    default: 2.0  },
    crackWidth:     { label: 'Largeur fissures',  ...R.rocky.crackWidth,    default: 0.20 },
    crackDepth:     { label: 'Prof. fissures',    ...R.rocky.crackDepth,    default: 0.70 },
    crackColor:     { label: 'Couleur fissures',  type: 'color',            default: '#1a0f08' },
    crackBlend:     { label: 'Mode fusion fiss.', type: 'select', options: ['Mix', 'Screen', 'Overlay', 'Add', 'Soft Light'], default: 0 },
    lavaAmount:     { label: 'Lave',              ...R.rocky.lavaAmount,    default: 0.0 },
    lavaColor:      { label: 'Couleur lave',      type: 'color',            default: '#ff3300' },
    lavaEmissive:   { label: 'Émission lave',     ...R.rocky.lavaEmissive,  default: 1.5 },
    waveAmount:     { label: 'Vagues',            ...R.rocky.waveAmount,    default: 0.0 },
    waveColor:      { label: 'Couleur vagues',    type: 'color',            default: '#d0d8e8' },
    waveScale:      { label: 'Échelle vagues',    ...R.rocky.waveScale,     default: 1.2 },
  },

  // Gas giant: latitudinal bands, turbulence, deep spots, clouds
  gaseous: {
    seed:              { label: 'Seed',               ...R.gaseous.seed,          default: 123 },
    noiseSeed:         { label: 'Noise seed',         default: [0, 0, 0] },
    noiseFreq:         { label: 'Noise freq',         ...R.gaseous.noiseFreq,     default: 1.0 },
    // Bands
    bandCount:         { label: 'Nb bandes',          ...R.gaseous.bandCount,     default: 8 },
    bandSharpness:     { label: 'Netteté bandes',     ...R.gaseous.bandSharpness, default: 0.3 },
    bandWarp:          { label: 'Ondulation bandes',  ...R.gaseous.bandWarp,      default: 0.3 },
    turbulence:        { label: 'Turbulence',         ...R.gaseous.turbulence,    default: 0.5 },
    cloudDetail:       { label: 'Détail nuages',      ...R.gaseous.cloudDetail,   default: 0.4 },
    jetStream:         { label: 'Courants-jets',      ...R.gaseous.jetStream,     default: 0.4 },
    // Palette
    colorA:            { label: 'Bande claire',       type: 'color',              default: '#e8c090' },
    colorB:            { label: 'Bande foncée',       type: 'color',              default: '#a05030' },
    colorC:            { label: 'Accent / tempête',   type: 'color',              default: '#d4844a' },
    colorD:            { label: 'Bande interméd.',    type: 'color',              default: '#c8784a' },
    animSpeed:         { label: 'Vitesse rotation',   ...R.gaseous.animSpeed,     default: 0.3 },
    // High-altitude clouds
    cloudAmount:       { label: 'Nuages',             ...R.gaseous.cloudAmount,   default: 0.0 },
    cloudColor:        { label: 'Couleur nuages',     type: 'color',              default: '#e8eaf0' },
    cloudBlend:        { label: 'Mode fusion nuages', type: 'select', options: ['Mix', 'Screen', 'Overlay', 'Add', 'Soft Light'], default: 0 },
    // Inner corona — additive fresnel glow at the silhouette.
    coronaStrength:    { label: 'Intensité couronne', min: 0, max: 2, step: 0.05, default: 0.6 },
    coronaColor:       { label: 'Couleur couronne',   type: 'color',              default: '#ffd9a8' },
  },

  // Metallic planet: procedural patterns, PBR reflections, cracks
  metallic: {
    noiseSeed:    { label: 'Noise seed',       default: [0, 0, 0] },
    noiseFreq:    { label: 'Noise freq',       ...R.metallic.noiseFreq,    default: 1.0 },
    metalness:    { label: 'Métalicité',       ...R.metallic.metalness,    default: 0.9 },
    roughness:    { label: 'Rugosité',         ...R.metallic.roughness,    default: 0.65 },
    colorA:       { label: 'Métal (base)',     type: 'color',              default: '#1a1a20' },
    colorB:       { label: 'Métal (accent)',   type: 'color',              default: '#606880' },
    crackAmount:  { label: 'Fissures',         ...R.metallic.crackAmount,  default: 0.50 },
    crackScale:   { label: 'Échelle fissures', ...R.metallic.crackScale,   default: 2.0 },
    crackWidth:   { label: 'Largeur fissures', ...R.metallic.crackWidth,   default: 0.15 },
    crackDepth:   { label: 'Prof. fissures',   ...R.metallic.crackDepth,   default: 0.7 },
    crackColor:   { label: 'Couleur fissures', type: 'color',              default: '#606880' },
    crackBlend:   { label: 'Mode fusion fiss.',type: 'select', options: ['Mix', 'Screen', 'Overlay', 'Add', 'Soft Light'], default: 0 },
    lavaAmount:   { label: 'Lave',             ...R.metallic.lavaAmount,   default: 0.20 },
    lavaScale:    { label: 'Échelle lave',     ...R.metallic.lavaScale,    default: 0.60 },
    lavaWidth:    { label: 'Largeur canaux',   ...R.metallic.lavaWidth,    default: 0.08 },
    lavaColor:    { label: 'Couleur lave',     type: 'color',              default: '#ff6600' },
    lavaEmissive: { label: 'Émission lave',    ...R.metallic.lavaEmissive, default: 1.5 },
  },

  // Star: convective granulation, corona, pulsation, spectral temperature
  star: {
    seed:                { label: 'Seed',                ...R.star.seed,                default: 1 },
    temperature:         { label: 'Température (K)',     ...R.star.temperature,         default: 5778 },
    animSpeed:           { label: 'Vitesse',             ...R.star.animSpeed,           default: 1.0 },
    convectionScale:     { label: 'Échelle granulation', ...R.star.convectionScale,     default: 1.5 },
    granulationContrast: { label: 'Contraste granul.',   ...R.star.granulationContrast, default: 0.65 },
    cloudAmount:         { label: 'Couche nuageuse',     ...R.star.cloudAmount,         default: 0.55 },
    cloudBlend:          { label: 'Fusion nuages',       type: 'select', options: ['Mix', 'Screen', 'Overlay', 'Add', 'Soft Light'], default: 2 },
    coronaSize:          { label: 'Corona',              ...R.star.coronaSize,          default: 0.15 },
    pulsation:           { label: 'Pulsation',           ...R.star.pulsation,           default: 0.3 },
  },
}

// ── UI groups ─────────────────────────────────────────────────────────────────
// Used by `ControlPanel` to organise sliders into collapsible sections.
// Has no effect on GLSL uniforms.

/**
 * UI-only grouping of parameter keys into collapsible sections per body
 * type. Consumed by control-panel components to organise sliders; has
 * no effect on GLSL uniforms.
 */
export const BODY_GROUPS: Record<LibBodyType, Array<{ label: string; keys: string[] }>> = {
  rocky: [
    { label: 'Terrain',  keys: ['seed', 'noiseFreq', 'roughness', 'heightScale'] },
    { label: 'Cratères', keys: ['craterDensity', 'craterCount'] },
    { label: 'Couleurs', keys: ['colorA', 'colorB'] },
    { label: 'Fissures', keys: ['crackAmount', 'crackScale', 'crackWidth', 'crackDepth', 'crackColor', 'crackBlend'] },
    { label: 'Lave',     keys: ['lavaAmount', 'lavaColor', 'lavaEmissive'] },
    { label: 'Turbulence', keys: ['waveAmount', 'waveColor', 'waveScale'] },
  ],
  gaseous: [
    { label: 'Base',     keys: ['seed', 'noiseFreq'] },
    { label: 'Bandes',   keys: ['bandCount', 'bandSharpness', 'bandWarp', 'turbulence', 'cloudDetail', 'jetStream'] },
    { label: 'Couleurs', keys: ['colorA', 'colorB', 'colorC', 'colorD'] },
    { label: 'Nuages',   keys: ['cloudAmount', 'cloudColor', 'cloudBlend'] },
    { label: 'Couronne', keys: ['coronaStrength', 'coronaColor'] },
  ],
  metallic: [
    { label: 'Surface',  keys: ['seed', 'noiseFreq', 'metalness', 'roughness'] },
    { label: 'Fissures', keys: ['crackAmount', 'crackScale', 'crackWidth', 'crackDepth', 'crackColor', 'crackBlend'] },
    { label: 'Lave',     keys: ['lavaAmount', 'lavaScale', 'lavaWidth', 'lavaColor', 'lavaEmissive'] },
    { label: 'Couleurs', keys: ['colorA', 'colorB'] },
  ],
  star: [
    { label: 'Base',        keys: ['seed', 'temperature', 'animSpeed'] },
    { label: 'Granulation', keys: ['convectionScale', 'granulationContrast', 'cloudAmount', 'cloudBlend'] },
    { label: 'Effets',      keys: ['coronaSize', 'pulsation'] },
  ],
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
