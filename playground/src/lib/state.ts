import { reactive, ref, watchEffect } from 'vue'
import * as THREE from 'three'
import type { BodyConfig, RingVariation, SphereDetailQuality } from '@lib'
import { BODY_PARAMS, getDefaultParams, type LibBodyType } from '@lib'
import type { DigOptions } from './useTileDig'
import {
  liquidColorFromType,
  type SurfaceLiquidType,
} from './liquidCatalog'
import {
  assignResourceMix, extractGasVolatiles, T_avgK,
  partitionPhases, pickDominantVolatile,
  computeLiquidCoverage, volatileMassByPhase,
} from './resourceMix'
import { volatileState } from './volatileCatalog'
import { deriveBandColorsFromMix } from './atmoBands'
import type { GasPatternKind } from './gasPatterns'
import { DEMO_RESOURCES, resourceLayer } from './resourceDemo'
import { registerResourceVisual } from './paint/resourceVisualRegistry'

/** Local mirror of the shader `ParamMap` — not re-exported from `@lib/core`. */
export type ParamMap = Record<string, number | string | number[] | boolean>

/**
 * Playground-side extension of {@link BodyConfig} carrying the caller's
 * thermal metadata. The lib is climate-agnostic and no longer reads any
 * temperature field; the playground keeps `temperatureMin/Max` here so
 * its own helpers (palette anchors, lava colour, gas turbulence…) can
 * derive caller-driven values that get pushed back into the lib config
 * via {@link BodyVisualProfile} fields.
 */
export type PlaygroundBodyConfig = BodyConfig & {
  /** Coldest equilibrium temperature (°C). Caller metadata only. */
  temperatureMin: number
  /** Warmest equilibrium temperature (°C). Caller metadata only. */
  temperatureMax: number
}

/** Shared body type — drives both the shader preview and the hex body. */
export const bodyType = ref<LibBodyType>('rocky')

/** Physical body config — edited by the right pane, consumed by `useBody`. */
export const bodyConfig = reactive<PlaygroundBodyConfig>({
  type:                 'rocky',
  name:                 'playground',
  radius:               3,
  temperatureMin:       -20,
  temperatureMax:       30,
  rotationSpeed:        0.02,
  axialTilt:            0.41,
  atmosphereThickness:  0.6,
  liquidState:          'liquid',
  liquidColor:          '#2878d0',
  hasCracks:            false,
  hasLava:              false,
  hasRings:             false,
  mass:                 1.0,
  spectralType:         'G',
})

/**
 * Playground-owned chemistry metadata that does not belong on the lib's
 * `BodyConfig` (which stays vocabulary-free). Currently a single field —
 * the substance tag backing `bodyConfig.liquidColor`.
 */
export interface PlaygroundLibMetadata {
  /** Substance backing `bodyConfig.liquidColor` — UI-only tag. */
  liquidType: SurfaceLiquidType | undefined
}

export const playgroundLibMeta = reactive<PlaygroundLibMetadata>({
  liquidType: 'water',
})

/**
 * Per-resource UI state — covers every entry of `DEMO_RESOURCES` (sol + atmo).
 * `ResourceControls` mutates this reactive map; `runDistribution` / `paintBody`
 * read from it on each rebuild via the four accessors below.
 *
 *   - `enabled`     → when `false`, the resource is skipped during distribution.
 *   - `color`       → overrides the catalogue tint in the paint registry.
 *   - `patternKind` → swaps the pattern kind (default params per kind).
 *   - `weight`      → 0..1 scalar applied to the pattern peak (sol) or to the
 *                     gas-mix share (atmo), so the user can tune each
 *                     resource's effective coverage independently.
 */
export interface ResourceUIState {
  enabled:     boolean
  color:       number
  patternKind: GasPatternKind
  weight:      number
}

/** Reactive per-resource UI state map, keyed by resource id. */
export const resourceUIState = reactive<Record<string, ResourceUIState>>(
  Object.fromEntries(
    DEMO_RESOURCES.map(r => [r.id, {
      enabled:     true,
      color:       r.color,
      patternKind: r.pattern.kind,
      weight:      1,
    }]),
  ),
)

/**
 * Derived view — set of resource ids currently disabled. Passed to
 * `runDistribution` so disabled entries never land on a tile.
 */
export function disabledResourceIds(): Set<string> {
  const out = new Set<string>()
  for (const [id, s] of Object.entries(resourceUIState)) if (!s.enabled) out.add(id)
  return out
}

/**
 * Derived view — record of pattern-kind overrides. Only entries that differ
 * from the catalogue default are emitted; distribution code falls back to
 * the spec default for missing entries.
 */
export function resourcePatternOverrides(): Partial<Record<string, GasPatternKind>> {
  const out: Partial<Record<string, GasPatternKind>> = {}
  for (const r of DEMO_RESOURCES) {
    const ui = resourceUIState[r.id]
    if (ui && ui.patternKind !== r.pattern.kind) out[r.id] = ui.patternKind
  }
  return out
}

/**
 * Derived view — per-resource weight overrides. Only entries whose weight
 * differs from the neutral `1` are emitted; distribution code applies the
 * default scaling otherwise.
 */
export function resourceWeights(): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {}
  for (const r of DEMO_RESOURCES) {
    const ui = resourceUIState[r.id]
    if (ui && ui.weight !== 1) out[r.id] = ui.weight
  }
  return out
}

/**
 * Live total amount per resource id, summed across every tile of the active
 * body (both sol and atmo layers). Updated by every render pane after each
 * rebuild so the resources column can surface real-time figures.
 */
export const totalResources = ref<Map<string, number>>(new Map())

/**
 * Paint registry sync — re-registers every catalogued resource's visual
 * entry (colour + PBR hints) whenever the reactive UI state changes. The
 * pipeline reads colours from the registry at blend time, so this keeps
 * colour edits live across rebuilds without an explicit re-register call.
 *
 * `colorBlend` defaults depend on the layer:
 *   - sol  → 0.90 (mineral blend with the base palette)
 *   - atmo → 0.98 (near-pure gas tint, winner-takes-all assignment)
 */
// One effect per resource so editing a single colour re-registers ONLY that
// resource's visual — a shared loop would re-fire all 12 entries on every
// keystroke since Vue tracks any reactive read inside `watchEffect`.
for (const spec of DEMO_RESOURCES) {
  const layer = resourceLayer(spec.phase)
  watchEffect(() => {
    const ui = resourceUIState[spec.id]
    if (!ui) return
    registerResourceVisual(spec.id, {
      color:             new THREE.Color(ui.color),
      roughness:         spec.roughness ?? 0.6,
      metalness:         spec.metalness ?? 0.0,
      colorBlend:        layer === 'atmo' ? 0.98 : 0.9,
      emissive:          spec.emissive ? new THREE.Color(ui.color) : undefined,
      emissiveIntensity: spec.emissive ?? 0,
    })
  })
}


/**
 * Map a volatile id back to the legacy `SurfaceLiquidType` tag used by
 * `LiquidControls` — only the four substances the legacy catalogue ships
 * are mapped (CO₂ sublimates, H₂He stays gaseous, neither makes it to the
 * surface as a liquid).
 */
function volatileToSurfaceType(volatileId: string): SurfaceLiquidType | undefined {
  if (volatileId === 'h2o') return 'water'
  if (volatileId === 'ch4') return 'methane'
  if (volatileId === 'nh3') return 'ammonia'
  if (volatileId === 'n2')  return 'nitrogen'
  return undefined
}

/** Hex-string `#RRGGBB` from a 0xRRGGBB integer (used for `liquidColor`). */
function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`
}

/**
 * Auto-derive the liquid presentation from the body's chemistry mix.
 * Drives `liquidState`, `liquidColor`, `liquidCoverage` and the playground-
 * side `liquidType` tag.
 *
 * Decision rule (binary, anchored on the **dominant volatile by mass**):
 *   - dominant volatile is in liquid phase at T → `liquid` (its liquidColor)
 *   - dominant volatile is in solid phase  at T → `frozen` (its solidColor)
 *   - dominant volatile is in gas phase    at T → `none` (no surface)
 *   - no volatile in mix                       → `none`
 *
 * Anchoring on the dominant volatile (rather than "any liquid wins") is
 * crucial for archetypes like Mars: H₂O is the dominant volatile and is
 * solid at T ≈ 219 K → planet reads as frozen. The trace NH₃ that
 * happens to be in its liquid window (-78 °C to -33 °C) does NOT promote
 * the surface to liquid — it would steal the visual identity from the
 * frozen water that actually covers the planet.
 *
 * Non-rocky bodies are skipped (App.vue clears the liquid fields on type
 * change, so the lib already renders dry).
 */
watchEffect(() => {
  if (bodyConfig.type !== 'rocky') return

  const physics = {
    tempMin: bodyConfig.temperatureMin,
    tempMax: bodyConfig.temperatureMax,
    radius:  bodyConfig.radius,
    mass:    bodyConfig.mass ?? 1,
  }
  const mix       = assignResourceMix(physics)
  const partition = partitionPhases(mix, physics)
  const T_K       = T_avgK(physics)
  const volMass   = volatileMassByPhase(partition.bySubstance)

  const dominant = pickDominantVolatile(mix)
  if (!dominant) {
    bodyConfig.liquidState    = 'none'
    bodyConfig.liquidColor    = undefined
    bodyConfig.liquidCoverage = 0
    playgroundLibMeta.liquidType = undefined
    return
  }

  const phase = volatileState(dominant.volatile, T_K)
  if (phase === 'liquid') {
    bodyConfig.liquidState    = 'liquid'
    bodyConfig.liquidColor    = hexColor(dominant.volatile.liquidColor)
    bodyConfig.liquidCoverage = computeLiquidCoverage(volMass.liquid)
    playgroundLibMeta.liquidType = volatileToSurfaceType(dominant.volatile.id)
  } else if (phase === 'solid') {
    bodyConfig.liquidState    = 'frozen'
    bodyConfig.liquidColor    = hexColor(dominant.volatile.solidColor)
    // Coverage drives the ice-cap horizontal extent — sized off the mass
    // of frozen volatiles so a body with little ice gets a thin cap, a
    // body with a lot of ice approaches a full sheet.
    bodyConfig.liquidCoverage = computeLiquidCoverage(volMass.solid)
    playgroundLibMeta.liquidType = volatileToSurfaceType(dominant.volatile.id)
  } else {
    // Dominant is gaseous — surface is dry, gases handled by `bandColors`.
    bodyConfig.liquidState    = 'none'
    bodyConfig.liquidColor    = undefined
    bodyConfig.liquidCoverage = 0
    playgroundLibMeta.liquidType = undefined
  }
})

/**
 * Manual override fallback — when the user picks a substance via
 * `LiquidControls`, this watcher resolves the colour through the legacy
 * playground catalogue. It runs *after* the auto-derive watcher in tick
 * order, so a manual `liquidType` edit takes precedence until the next
 * temperature/mass mutation re-derives.
 */
watchEffect(() => {
  const resolved = liquidColorFromType(
    playgroundLibMeta.liquidType,
    bodyConfig.liquidState ?? 'none',
  )
  if (resolved !== undefined) bodyConfig.liquidColor = resolved
})

/**
 * Band colours — physics-driven pipeline. For gaseous bodies, the volatile
 * mix (assigned from `radius` + `mass` + temperature via `assignResourceMix`)
 * is filtered to its gas-phase component (`extractGasVolatiles`) at the body's
 * average temperature, then blended into the lib's 4-stop `bandColors` via
 * `deriveBandColorsFromMix`. Non-gaseous bodies clear the field so the shader
 * falls back to its neutral default.
 */
watchEffect(() => {
  if (bodyConfig.type !== 'gaseous') {
    bodyConfig.bandColors = undefined
    return
  }
  const physics = {
    tempMin: bodyConfig.temperatureMin,
    tempMax: bodyConfig.temperatureMax,
    radius:  bodyConfig.radius,
    mass:    bodyConfig.mass ?? 1,
  }
  const mix    = assignResourceMix(physics)
  const gasMix = extractGasVolatiles(mix, T_avgK(physics))
  bodyConfig.bandColors = deriveBandColorsFromMix(gasMix)
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

/**
 * Atmospheric corona headroom forwarded to `useBody({ coronaHeadroom })`.
 * Slider lives in `BodyControls` (rocky only) — see lib for the clamp.
 */
export const coronaHeadroom = ref(0.05)

/**
 * Strength of painted-tile colour over the procedural tint on the
 * rocky atmoShell. Live-pushed via `body.atmoShell?.setParams({ tileColorMix })`.
 */
export const atmoTileColorMix = ref(0.85)

/**
 * Outer liquid-corona opacity on rocky bodies that carry a surface
 * liquid. Live-pushed via `body.liquidCorona?.setOpacity(...)`.
 */
export const liquidCoronaOpacity = ref(0.3)

/**
 * Render-quality preset for spherical meshes (smooth sphere, liquid sphere,
 * atmo / liquid coronas, core, effect layer). `'high'` bumps the icosphere
 * detail of every spherical mesh by one subdivision — visibly smoother
 * silhouettes at the cost of ≈ 4× tris on those meshes. Forwarded to
 * `useBody({ quality: { sphereDetail } })` and triggers a rebuild on edit.
 */
export const sphereDetail = ref<SphereDetailQuality>('standard')

/**
 * Shader-quality preset — drives the renderer pixel ratio so shaders read
 * sharper on retina screens. Std=1 (legacy), HD=min(dpr, 1.5),
 * Ultra=min(dpr, 2). Pure caller-side knob — the lib doesn't own the
 * renderer, so this stays in playground state.
 */
export type ShaderQuality = 'standard' | 'high' | 'ultra'
export const shaderQuality = ref<ShaderQuality>('standard')

/**
 * Maps a shader-quality preset to a renderer pixel ratio, clamped by the
 * device's actual `devicePixelRatio` so non-retina screens stay at 1.
 */
export function resolveShaderPixelRatio(quality: ShaderQuality): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  switch (quality) {
    case 'high':  return Math.min(dpr, 1.5)
    case 'ultra': return Math.min(dpr, 2)
    default:      return 1
  }
}

/** Single row in the hover resource list. */
export interface HoverResource {
  id:     string
  label:  string
  amount: number
  color:  number
}

/** Hover snapshot produced by the hexa pane, consumed by the info panel. */
export interface HoverInfo {
  tileId:    number
  /**
   * What the cursor is actually pointing at. A frozen-liquid surface
   * stacks an ice cap on top of the underlying mineral tile — both are
   * separate entities for gameplay (the cap is mineable as ice; the
   * mineral tile is reachable only after the cap is destroyed). The
   * `'ice'` kind tells the panel + click handler to treat them as such.
   */
  kind:      'ice' | 'sol'
  biome:     string | undefined
  elevation: number
  height:    number
  /** Signed terrain level — `0` is the first band above sea level (shoreline). */
  level:     number
  /** Sol-layer resources (metals + minerals). */
  solResources:  HoverResource[]
  /** Atmo-layer resources (gases). */
  atmoResources: HoverResource[]
  /** Build generation of the source `useBody` — bumped on each rebuild so the
   *  hover loop can detect stale tooltips when the body rebuilds under a
   *  stationary cursor. */
  bodyVersion: number
}
export const hoverInfo = ref<HoverInfo | null>(null)

/** Rebuild counter — bumped whenever a prop requires a full useBody rebuild. */
export const rebuildKey = ref(0)

/**
 * Which pane currently fills the centre viewport. The playground used to
 * show shader preview + hex body side-by-side; it now stacks them and
 * toggles between them from the topbar to avoid the cost of running two
 * WebGL contexts at once.
 */
export const activePane = ref<'shader' | 'hexa'>('hexa')

/**
 * Last dig mutation — shared between HexaPane (producer) and ShaderPane
 * (consumer). The shader pane owns a separate `useBody` instance, so it
 * mirrors this mutation into its own `sim.tileStates` and repaints the
 * smooth-sphere preview. Using a plain incrementing counter alongside the
 * payload ensures Vue fires the watcher even when the same Map reference
 * is reused.
 */
export interface DigMutation {
  /** New `elevation` band per mutated tile id. */
  elevations: Map<number, number>
  /** Strictly increasing — drives watcher firing on identical maps. */
  version: number
}
export const lastDigMutation = ref<DigMutation | null>(null)

/**
 * Live dig knobs consumed by the hex pane click handler. Reactive so the
 * `DigControls` pane can mutate `centerDrop` / `radius` live and the next
 * click picks up the new values without a rebuild. Defaults match the
 * historical hard-coded "mine" impact.
 */
export const digOptions = reactive<DigOptions>({
  centerDrop: 2,
  radius:     1,
})

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

