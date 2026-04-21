import { reactive, ref } from 'vue'
import type { BodyConfig, BodyType, RingVariation } from '@lib'
import { BODY_PARAMS, getDefaultParams, type LibBodyType } from '@lib'

/** Local mirror of the shader `ParamMap` — not re-exported from `@lib/core`. */
export type ParamMap = Record<string, number | string | number[] | boolean>

/** Shared body type — drives both the shader preview and the hex body. */
export const bodyType = ref<LibBodyType>('rocky')

/** Physical body config — edited by the right pane, consumed by `useBody`. */
export const bodyConfig = reactive<BodyConfig>({
  type:                 'rocky',
  name:                 'playground',
  radius:               3,
  temperatureMin:       -20,
  temperatureMax:       30,
  rotationSpeed:        0.02,
  axialTilt:            0.41,
  atmosphereThickness:  0.6,
  liquidType:           'water',
  liquidState:          'liquid',
  liquidCoverage:       0.55,
  terrainLevelCount:    20,
  hasCracks:            false,
  hasLava:              false,
  hasRings:             false,
  resourceDensity:      1.0,
  mass:                 1.0,
  spectralType:         'G',
})

/** Shader param map — edited by the left pane, fed to `BodyMaterial.setParams`. */
export const shaderParams = reactive<ParamMap>({ ...getDefaultParams('rocky') })

/**
 * Partial overrides applied on top of the seed-generated `RingVariation`.
 * Only the fields set here override their generated counterpart — leaving
 * a field `undefined` keeps the deterministic (seed-driven) value so the
 * sliders act as surgical tweaks rather than a full reset.
 */
export type RingOverrides = Partial<Pick<RingVariation,
  | 'innerRatio' | 'outerRatio'
  | 'colorInner' | 'colorOuter'
  | 'opacity'    | 'bandFreq'    | 'bandContrast'
  | 'dustiness'  | 'grainAmount' | 'grainFreq'
  | 'lobeStrength' | 'keplerShear'
  | 'archetype'  | 'profile'
>>
export const ringOverrides = reactive<RingOverrides>({})

/** Tile size (world units) used by `useBody`. */
export const tileSize = ref(0.15)

/** Hover snapshot produced by the hexa pane, consumed by the info panel. */
export interface HoverInfo {
  tileId:    number
  biome:     string | undefined
  elevation: number
  height:    number
  /** Signed terrain level — `0` is the first band above sea level (shoreline). */
  level:     number
  resources: Array<{ id: string; label: string; amount: number; color: number }>
  /** Build generation of the source `useBody` — bumped on each rebuild so the
   *  hover loop can detect stale tooltips when the body rebuilds under a
   *  stationary cursor. */
  bodyVersion: number
}
export const hoverInfo = ref<HoverInfo | null>(null)

/** Rebuild counter — bumped whenever a prop requires a full useBody rebuild. */
export const rebuildKey = ref(0)

/**
 * Returns a fresh param map for the given type, reset to defaults.
 * Used when the user switches type so stale keys don't leak across shaders.
 */
export function resetShaderParams(type: LibBodyType): ParamMap {
  const defs = BODY_PARAMS[type]
  const out: ParamMap = {}
  for (const [key, d] of Object.entries(defs)) {
    out[key] = d.default as ParamMap[string]
  }
  return out
}

/** Mapping BodyType <-> LibBodyType (gaseous vs gas). */
export function toLibType(t: BodyType): LibBodyType {
  return t === 'gaseous' ? 'gas' : (t as LibBodyType)
}
export function toBodyType(t: LibBodyType): BodyType {
  return t === 'gas' ? 'gaseous' : (t as BodyType)
}
