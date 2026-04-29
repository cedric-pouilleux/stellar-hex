import { effectScope, reactive, ref, watchEffect } from 'vue'
import * as THREE from 'three'
import type {
  BodyConfig, PlanetConfig, StarConfig, BodyVariation, RingVariation, SphereDetailQuality,
  BodyNoiseProfile, MetallicBand, ColorInput, SpectralType, SurfaceLook,
} from '@lib'
import { BODY_PARAMS, generateBodyVariation, getDefaultParams, type LibBodyType } from '@lib'
import type { DigOptions } from './useTileDig'
import {
  liquidColorFromType,
  type SurfaceLiquidType,
} from './liquidCatalog'
import {
  assignResourceMix, T_avgK,
  partitionPhases, pickDominantVolatile,
  computeLiquidCoverage, volatileMassByPhase,
} from './resourceMix'
import { volatileState, VOLATILE_IDS, type VolatileId } from './volatileCatalog'
import { deriveBandColorsFromMix } from './atmoBands'
import { patternForKind, type GasPatternKind } from './gasPatterns'
import { DEMO_RESOURCES, resourceLayer, type ResourceLayer, type ResourceSpec } from './resourceDemo'
import { customResources, resolveExtraResources } from './extraResources'
import { registerResourceVisual } from './paint/resourceVisualRegistry'

/** Local mirror of the shader `ParamMap` — not re-exported from `@lib/core`. */
export type ParamMap = Record<string, number | string | number[] | boolean>

/**
 * Playground-side editing shape for a body. Carries the caller's thermal
 * metadata (`temperatureMin/Max`) plus a **wide** view of every body-shape
 * field — planet-only knobs like `surfaceLook` and star-only knobs like
 * `spectralType` coexist as optional so the right-pane controls keep their
 * values across type switches without having to swap the reactive object
 * shape. The lib's strict {@link BodyConfig} discriminated union is
 * recovered at handoff via {@link toLibBodyConfig}.
 *
 * The lib stays climate-agnostic — it never reads `temperatureMin/Max`
 * directly. The playground derives palette anchors, lava colour, gas
 * turbulence… from those and writes the resolved values back onto the
 * appropriate lib fields ({@link PlanetVisualProfile}, {@link BodyVariation}).
 */
export interface PlaygroundBodyConfig extends BodyNoiseProfile {
  // ── Identity (discriminant kept editable) ────────────────────────
  type:                 'planetary' | 'star'
  name:                 string
  surfaceLook?:         SurfaceLook
  spectralType?:        SpectralType
  // ── Shared physics ──────────────────────────────────────────────
  radius:               number
  rotationSpeed:        number
  axialTilt:            number
  mass?:                number
  coreRadiusRatio?:     number
  // ── Planet-only physics (kept editable across switches) ─────────
  atmosphereThickness?: number
  atmosphereOpacity?:   number
  gasMassFraction?:     number
  liquidState?:         'liquid' | 'frozen' | 'none'
  liquidCoverage?:      number
  // ── Visual profile (planet) ─────────────────────────────────────
  liquidColor?:         ColorInput
  bandColors?: {
    colorA: ColorInput
    colorB: ColorInput
    colorC: ColorInput
    colorD: ColorInput
  }
  terrainColorLow?:     ColorInput
  terrainColorHigh?:    ColorInput
  metallicBands?: readonly [MetallicBand, MetallicBand, MetallicBand, MetallicBand]
  hasRings?:            boolean
  // ── Playground extras ───────────────────────────────────────────
  /** Coldest equilibrium temperature (°C). Caller metadata only. */
  temperatureMin: number
  /** Warmest equilibrium temperature (°C). Caller metadata only. */
  temperatureMax: number
}

/**
 * Project the wide editing shape onto the lib's strict
 * {@link BodyConfig} discriminated union. Branch-irrelevant fields are
 * dropped at the boundary so the lib never sees a star with `surfaceLook`
 * or a planet with `spectralType`.
 */
export function toLibBodyConfig(p: PlaygroundBodyConfig): BodyConfig {
  const noise: BodyNoiseProfile = {
    noiseScale:       p.noiseScale,
    noiseOctaves:     p.noiseOctaves,
    noisePersistence: p.noisePersistence,
    noiseLacunarity:  p.noiseLacunarity,
    noisePower:       p.noisePower,
    noiseRidge:       p.noiseRidge,
    continentAmount:  p.continentAmount,
    continentScale:   p.continentScale,
    reliefFlatness:   p.reliefFlatness,
  }
  if (p.type === 'star') {
    const star: StarConfig = {
      type:            'star',
      name:            p.name,
      spectralType:    p.spectralType ?? 'G',
      radius:          p.radius,
      rotationSpeed:   p.rotationSpeed,
      axialTilt:       p.axialTilt,
      mass:            p.mass,
      coreRadiusRatio: p.coreRadiusRatio,
      ...noise,
    }
    return star
  }
  const planet: PlanetConfig = {
    type:                'planetary',
    name:                p.name,
    surfaceLook:         p.surfaceLook,
    radius:              p.radius,
    rotationSpeed:       p.rotationSpeed,
    axialTilt:           p.axialTilt,
    mass:                p.mass,
    coreRadiusRatio:     p.coreRadiusRatio,
    atmosphereThickness: p.atmosphereThickness,
    atmosphereOpacity:   p.atmosphereOpacity,
    gasMassFraction:     p.gasMassFraction,
    liquidState:         p.liquidState,
    liquidCoverage:      p.liquidCoverage,
    liquidColor:         p.liquidColor,
    bandColors:          p.bandColors,
    terrainColorLow:     p.terrainColorLow,
    terrainColorHigh:    p.terrainColorHigh,
    metallicBands:       p.metallicBands,
    hasRings:            p.hasRings,
    ...noise,
  }
  return planet
}

/** Shared body type — drives both the shader preview and the hex body. */
/**
 * UI mode label — keeps the legacy four-button switcher (rocky / gaseous /
 * metallic / star). Maps to `bodyConfig.{type, surfaceLook}` via the helpers
 * below; the lib itself does not see this value.
 */
export const bodyType = ref<LibBodyType>('rocky')

/**
 * Per-mode default atmosphere thickness — caller-side convention now that
 * the lib no longer caps by type. Values match the legacy lib caps so the
 * playground keeps the same visual proportions:
 *
 *   - terrain  : 0.20 — sol dominates, thin halo above (~80% silhouette is sol)
 *   - bands    : 0.80 — atmo dominates, sol is a slim core shell
 *   - metallic : 0.05 — barely an exosphere by default (slider can grow it)
 *   - star     : 0    — stars carry no atmo shell
 */
const DEFAULT_ATMO_BY_MODE: Record<LibBodyType, number> = {
  rocky:    0.20,
  gaseous:  0.80,
  metallic: 0.05,
  star:     0,
}

/**
 * Per-mode default atmosphere opacity — controls whether the atmo shell is
 * mounted (`> 0`) and how strongly it shows in the shader / surface view.
 * The lib's `defaultAtmosphereOpacity` is `0` for metallic (legacy "no halo
 * by default") so an explicit caller-side value is needed to make the shell
 * visible without forcing the user to discover the slider.
 *
 *   - terrain  : 0.45 — translucent halo, blue marble look
 *   - bands    : 1.00 — opaque envelope, smooth sphere = atmosphere
 *   - metallic : 0.30 — visible halo, lets the user see the shell exists
 *   - star     : 0    — stars never carry an atmo shell
 */
const DEFAULT_ATMO_OPACITY_BY_MODE: Record<LibBodyType, number> = {
  rocky:    0.45,
  gaseous:  1.00,
  metallic: 0.30,
  star:     0,
}

/** UI label → physics defaults projection consumed by the lib. */
export function configFromUiMode(mode: LibBodyType): {
  type:                'planetary' | 'star'
  surfaceLook:         SurfaceLook | undefined
  atmosphereThickness: number
  atmosphereOpacity:   number
} {
  const atmosphereThickness = DEFAULT_ATMO_BY_MODE[mode]
  const atmosphereOpacity   = DEFAULT_ATMO_OPACITY_BY_MODE[mode]
  switch (mode) {
    case 'rocky':    return { type: 'planetary', surfaceLook: 'terrain',  atmosphereThickness, atmosphereOpacity }
    case 'gaseous':  return { type: 'planetary', surfaceLook: 'bands',    atmosphereThickness, atmosphereOpacity }
    case 'metallic': return { type: 'planetary', surfaceLook: 'metallic', atmosphereThickness, atmosphereOpacity }
    case 'star':     return { type: 'star',      surfaceLook: undefined,  atmosphereThickness, atmosphereOpacity }
  }
}

/**
 * Inverse projection — used to restore the UI label from the body config.
 * Accepts both the lib's strict {@link BodyConfig} and the playground's
 * wide {@link PlaygroundBodyConfig} (where `surfaceLook` is just an
 * editable optional, regardless of `type`).
 */
export function uiModeFromConfig(
  config: { type: 'planetary' | 'star'; surfaceLook?: SurfaceLook | undefined },
): LibBodyType {
  if (config.type === 'star') return 'star'
  switch (config.surfaceLook ?? 'terrain') {
    case 'terrain':  return 'rocky'
    case 'bands':    return 'gaseous'
    case 'metallic': return 'metallic'
  }
  return 'rocky'
}

/** Physical body config — edited by the right pane, consumed by `useBody`. */
export const bodyConfig = reactive<PlaygroundBodyConfig>({
  type:                 'planetary',
  surfaceLook:          'terrain',
  name:                 'playground',
  radius:               3,
  temperatureMin:       -20,
  temperatureMax:       30,
  rotationSpeed:        0.02,
  axialTilt:            0.41,
  atmosphereThickness:  DEFAULT_ATMO_BY_MODE.rocky,
  atmosphereOpacity:    DEFAULT_ATMO_OPACITY_BY_MODE.rocky,
  liquidState:          'liquid',
  liquidColor:          '#2878d0',
  hasRings:             false,
  mass:                 1.0,
  spectralType:         'G',
})

/**
 * Playground-side visual-effect toggles. Cracks and lava are pure rendering
 * decisions — the lib carries no flag for them anymore (the variation does).
 * The playground keeps its own UI state here, then folds the result into the
 * `BodyVariation` it pushes to `useBody({ variation })`.
 */
export interface PlaygroundFx {
  cracksEnabled: boolean
  lavaEnabled:   boolean
  /** Lava tint (#hex). Caller picks; default is a neutral dark red. */
  lavaColor:     string
}

export const playgroundFx = reactive<PlaygroundFx>({
  cracksEnabled: false,
  lavaEnabled:   false,
  lavaColor:     '#cc2200',
})

/**
 * Generates a {@link BodyVariation} for the given config and folds the
 * playground-side fx toggles in. Both panes call this before passing the
 * variation to `useBody({ variation })` so the shader preview and the hex
 * body see the same effect intensities.
 */
export function buildPlaygroundVariation(config: BodyConfig): BodyVariation {
  const variation = generateBodyVariation(config)
  if (playgroundFx.cracksEnabled) variation.crackIntensity = 0.6
  if (playgroundFx.lavaEnabled)   variation.lavaIntensity  = 0.5
  variation.lavaColor = playgroundFx.lavaColor
  return variation
}

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
 * Runtime-extensible resource catalogue. Built from the user-driven
 * "+" form in `ResourceControls`; merged with {@link DEMO_RESOURCES} via
 * {@link allResources} at every iteration site (UI listing, paint
 * registry sync, sol & atmo distribution).
 *
 * A custom resource carries the same {@link ResourceSpec} shape as the
 * shipped catalogue so the downstream pipeline does not need a special
 * case. Sol customs land on the mineral phase (so they share the rocky
 * eligibility behaviour); atmo customs land on the gas phase (winner-
 * takes-all in `runAtmoDistribution`).
 *
 * The reactive ref lives in `extraResources.ts` to break a circular
 * import (`resourceDemo` → state would loop); re-exported here so the
 * UI keeps a single import surface.
 */
export { customResources } from './extraResources'

/**
 * Returns the unified catalogue (shipped + custom) — preferred over
 * iterating {@link DEMO_RESOURCES} directly when the caller must surface
 * user-added entries. Plain function (not reactive computed) so it can be
 * called from non-reactive contexts; consumers re-read on every rebuild.
 */
export function allResources(): ResourceSpec[] {
  return resolveExtraResources()
}

/** User-supplied draft turned into a full {@link ResourceSpec} by {@link addCustomResource}. */
export interface CustomResourceDraft {
  layer:       ResourceLayer
  label:       string
  color:       number
  patternKind: GasPatternKind
}

/**
 * Slugifies a label into a kebab-case id. Falls back to `'custom'` when
 * the label collapses to an empty slug (only symbols / accents stripped).
 */
function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'custom'
}

/** Builds a unique id from `label` by appending a counter on collision. */
function makeUniqueId(label: string): string {
  const base = slugify(label)
  const taken = new Set<string>()
  for (const r of DEMO_RESOURCES) taken.add(r.id)
  for (const r of customResources.value) taken.add(r.id)
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

/**
 * Appends a custom resource to {@link customResources} and seeds its
 * matching {@link resourceUIState} entry. Returns the generated id so the
 * UI can focus / scroll to the new row.
 */
export function addCustomResource(draft: CustomResourceDraft): string {
  const id      = makeUniqueId(draft.label)
  const phase   = draft.layer === 'sol' ? 'mineral' : 'gas'
  const pattern = patternForKind(draft.patternKind)
  const spec: ResourceSpec = {
    id,
    label:     draft.label,
    color:     draft.color,
    phase,
    pattern,
    roughness: 0.7,
    metalness: 0.0,
  }
  customResources.value = [...customResources.value, spec]
  resourceUIState[id] = {
    enabled:     true,
    color:       draft.color,
    patternKind: draft.patternKind,
    weight:      1,
  }
  return id
}

/** Removes a previously-added custom resource (no-op if `id` is shipped). */
export function removeCustomResource(id: string): void {
  const idx = customResources.value.findIndex(r => r.id === id)
  if (idx < 0) return
  customResources.value = customResources.value.filter(r => r.id !== id)
  delete resourceUIState[id]
}

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
  for (const r of allResources()) {
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
  for (const r of allResources()) {
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
//
// Custom resources are tracked in `visualScopes` so their effect can be
// stopped on removal (otherwise a stale `resourceUIState[id]` access would
// keep firing after the row is gone).
const visualScopes = new Map<string, ReturnType<typeof effectScope>>()

function installResourceVisualWatcher(spec: ResourceSpec): void {
  const layer = resourceLayer(spec.phase)
  const scope = effectScope(true)
  scope.run(() => {
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
  })
  visualScopes.set(spec.id, scope)
}

for (const spec of DEMO_RESOURCES) installResourceVisualWatcher(spec)

// React to custom catalogue mutations: install/dispose the matching
// per-id watcher so colour / pattern edits propagate to the paint registry
// just like for shipped entries.
watchEffect(() => {
  const known = new Set(customResources.value.map(r => r.id))
  for (const spec of customResources.value) {
    if (!visualScopes.has(spec.id)) installResourceVisualWatcher(spec)
  }
  for (const [id, scope] of visualScopes) {
    if (DEMO_RESOURCES.some(r => r.id === id)) continue
    if (!known.has(id)) {
      scope.stop()
      visualScopes.delete(id)
    }
  }
})


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
  if (bodyConfig.surfaceLook !== 'terrain') return

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
 * Band colours — user-driven, decoupled from temperature so the atmo pane
 * follows the resource toggles directly. For gaseous bodies, every enabled
 * volatile contributes its UI weight to the blend; the result is fed into
 * the lib's 4-stop `bandColors` via `deriveBandColorsFromMix`. Non-gaseous
 * bodies clear the field so the shader falls back to its neutral default.
 */
watchEffect(() => {
  if (bodyConfig.surfaceLook !== 'bands') {
    bodyConfig.bandColors = undefined
    return
  }
  const gasMix: Partial<Record<VolatileId, number>> = {}
  for (const id of VOLATILE_IDS) {
    const ui = resourceUIState[id]
    if (!ui || !ui.enabled) continue
    if (ui.weight <= 0) continue
    gasMix[id] = ui.weight
  }
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
 * Strength of painted-tile colour over the procedural tint on the
 * rocky atmoShell. Live-pushed via `body.atmoShell?.setParams({ tileColorMix })`.
 */
export const atmoTileColorMix = ref(0.85)

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
   * What the cursor is actually pointing at. `'liquid'` is the
   * translucent water surface — pointing at it surfaces both the
   * liquid layer and the mineral floor underneath in `seabed`. `'ice'`
   * is the frozen cap stacked over the mineral tile. `'sol'` is the
   * exposed mineral tile itself. `'atmo'` targets the atmosphere
   * board (own hexasphere; tile id unrelated to sol).
   */
  kind:      'liquid' | 'ice' | 'sol' | 'atmo'
  biome:     string | undefined
  /** Sol-only — ground elevation band. `null` on atmo tiles. */
  elevation: number | null
  /** Sol-only — world-space sol cap height. `null` on atmo tiles. */
  height:    number | null
  /** Sol-only — signed terrain level. `null` on atmo tiles. */
  level:     number | null
  /** Sol-layer resources (metals + minerals). */
  solResources:  HoverResource[]
  /** Atmo-layer resources (gases). */
  atmoResources: HoverResource[]
  /**
   * Mineral floor under a `'liquid'` hover — only set when `kind === 'liquid'`.
   * Lets the tooltip render the sea-floor tile's biome / elevation /
   * resources alongside the liquid surface info.
   */
  seabed?: {
    biome:        string | undefined
    elevation:    number
    height:       number
    level:        number
    solResources: HoverResource[]
  }
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

