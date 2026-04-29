<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import {
  useBody, resolveTileHeight, resolveTileLevel,
  DEFAULT_CORE_RADIUS_RATIO, terrainBandLayout, resolveTerrainLevelCount,
  resolveAtmosphereThickness,
  hasSurfaceLiquid, buildSolidShell, buildNeighborMap,
} from '@lib'
import type { Body, PlanetBody, SolidShellHandle } from '@lib'
import { toLibBodyConfig, type PlaygroundBodyConfig } from '../lib/state'
import {
  generateDemoDistribution,
  getDemoResourceRules,
  getDemoResourceDisplay,
  sumDistributionTotals,
} from '../lib/resourceDemo'
import { paintBody } from '../lib/paint/paintBody'
import { createGameBodyState, type GameBodyState } from '../game/GameBodyState'
import { classifyBiome, biomeLabel } from '../lib/biomes'
import { installOrbitCamera, applyCamera } from '../lib/orbitCamera'
import { startRenderLoop } from '../lib/renderLoop'
import { createBodySpin } from '../lib/bodySpin'
import { attachBodyRings, detachBodyRings, mergeRingVariation } from '../lib/bodyRings'
import { syncRingShadowSun } from '../lib/ringShadowSunSync'
import { findDominantLightWorldPos } from '@lib'
import type { BodyRingsHandle, RingVariation } from '@lib'
import {
  hoverInfo, ringOverrides, digOptions, lastDigMutation,
  resourcePatternOverrides, disabledResourceIds, resourceWeights,
  totalResources, atmoTileColorMix,
  sphereDetail, shaderQuality, resolveShaderPixelRatio,
  buildPlaygroundVariation,
  type HoverInfo, type HoverResource,
} from '../lib/state'
import { playgroundGraphicsUniforms } from '../lib/playgroundUniforms'
import { viewMode } from '../lib/viewMode'
import { seaLevelFraction } from '../lib/seaLevel'
import { useTileDig } from '../lib/useTileDig'
import {
  hoverCursorParams,
  resolveHoverCursorConfig,
} from '../lib/hoverCursorParams'

// Pointer travel above this many CSS pixels between down and up is treated
// as a camera drag and suppresses the dig — keeps orbit gestures from
// accidentally carving the planet at the end of a swipe.
const CLICK_SLOP_PX   = 4

const props = defineProps<{
  config:   PlaygroundBodyConfig
  tileSize: number
  /** Bumping this forces a full body rebuild (type switch, seed change, rings toggle...). */
  rebuildKey: number
  /**
   * When `false`, the render step short-circuits and pointer pick loops
   * are skipped. The body instance stays alive (dig state preserved) so
   * toggling back returns to the same planet and same craters.
   */
  active:   boolean
}>()

const hostEl    = ref<HTMLDivElement | null>(null)
const fps       = ref(0)
const tileCount = ref(0)

/**
 * Lib-shape projection of the playground's wide editing config — recovers
 * the strict {@link BodyConfig} union the lib expects (drops cross-branch
 * fields). Re-derived on every dependent change so any reactive read of
 * the underlying `props.config` propagates automatically.
 */
const libConfig = computed(() => toLibBodyConfig(props.config))

let renderer:        THREE.WebGLRenderer | null = null
let scene:           THREE.Scene | null = null
let camera:          THREE.PerspectiveCamera | null = null
let ambientLight:    THREE.AmbientLight | null = null
let directionalLight: THREE.DirectionalLight | null = null
let body:            Body | null = null

/**
 * Narrows the current body to {@link PlanetBody} for sites that touch
 * planet-only namespaces (liquid, view, atmoShell, sol mutations).
 * Returns `null` on stars or when no body is mounted — caller-side skips
 * the action silently, which preserves the legacy UX where stars showed
 * up in the hex pane without exposing planet-only controls.
 */
function planet(): PlanetBody | null {
  return body?.kind === 'planet' ? body : null
}
let rings:           BodyRingsHandle | null = null
let solidShell:      SolidShellHandle | null = null
// Mutable Vector3 refreshed each frame from the dominant directional
// light — wired by reference into the rings shader (via `attachBodyRings`)
// and the per-frame shadow sync (`syncRingShadowSun`).
const sunWorldPos = new THREE.Vector3()
/**
 * Per-tile state of the frozen ice cap when active. `top` and `base` are
 * in the same band space the lib's simulation uses; `top - base` is the
 * remaining ice column over the underlying mineral tile. Empty when the
 * body's `liquidState !== 'frozen'`.
 */
const iceColumns = new Map<number, { top: number; base: number }>()
/** Tile-neighbour adjacency, scoped to the active body. Used to expand
 *  the cone-shaped destruction frontier (BFS) on both the ice cap and
 *  the sol — built unconditionally on rebuild, frozen or not, otherwise
 *  the dig collapses to a single-tile descent on non-frozen bodies. */
let neighborMap: Map<number, readonly number[]> = new Map()
let baseRingVariation: RingVariation | null = null
let stopLoop: (() => void) | null = null
let stopCamera: (() => void) | null = null
let ro:       ResizeObserver | null = null

const raycaster = new THREE.Raycaster()
const pointer   = new THREE.Vector2()
let  pointerIn  = false

// Hover updates are throttled to ~30 Hz. The full chain triggered on a tile
// change (`buildHoverInfo` → Vue reactivity on `hoverInfo` → tooltip DOM
// re-render → `body.hover.setTile` → border rebuild + `hoverLocalPos`
// reactive broadcast) runs every visible frame otherwise, and 30 Hz feels
// synchronous to the eye while halving the cost of cursor travel.
const HOVER_UPDATE_MIN_MS = 33
let   lastHoverCheckMs    = 0

let dig: ReturnType<typeof useTileDig>['dig'] | null = null
let pointerDownPos: { x: number; y: number } | null = null

/**
 * Game-side wrapper around the lib body. Owns the mutable current state
 * (elevation + per-tile resources) on top of the lib's frozen baseline,
 * so dig mutations become persistable overrides and hover reads a merged
 * view rather than the raw sim.
 */
let gameState: GameBodyState | null = null

/**
 * After a successful dig the clicked hex is shorter than its neighbours, so
 * the next raycast from the same cursor position would land on a taller
 * adjacent tile and visibly steal the hover ring from the crater. We pin the
 * hovered id to the dug tile until the pointer actually moves — the next
 * `pointermove` naturally clears the lock and the raycast resumes.
 */
let lockedHoverId: number | null = null

/**
 * Incremented each time the body is rebuilt. Used to invalidate `hoverInfo`
 * when a rebuild changes the sim under a stationary cursor — otherwise the
 * tooltip stays pinned to the previous sim's biome/height and diverges from
 * the rendered mesh (e.g. black ocean tile showing a stale "forest" biome).
 */
let bodyVersion = 0

const spin = createBodySpin()

// Screen-space pointer position used to anchor the hover tooltip next to
// the cursor. Separate from `pointer` (NDC) so we don't re-derive it per frame.
const tooltipX = ref(0)
const tooltipY = ref(0)

// `true` while the cursor sits over a tile mined down to the core (lava
// window). Drives the `not-allowed` cursor in the template — the dig is
// physically a no-op there and the tooltip is suppressed too.
const hoveringConsumed = ref(false)

function rebuildBody() {
  if (!scene) return
  // Stale lock would reference a tile id that may no longer exist after the
  // rebuild (e.g. subdivision change, type switch).
  lockedHoverId = null
  if (body) {
    if (rings)      { detachBodyRings(body.group, rings); rings = null }
    if (solidShell) { body.group.remove(solidShell.group); solidShell.dispose(); solidShell = null }
    iceColumns.clear()
    neighborMap = new Map()
    scene.remove(body.group)
    body.dispose?.()
    body      = null
    dig       = null
    gameState = null
  }
  try {
    const cfg = libConfig.value
    body = useBody(cfg, props.tileSize, {
      graphicsUniforms: playgroundGraphicsUniforms,
      quality:          { sphereDetail: sphereDetail.value },
      variation:        buildPlaygroundVariation(cfg),
      hoverCursor:      resolveHoverCursorConfig(hoverCursorParams),
    })
    pushAtmoVisualParams()
  } catch (e) {
    console.error('useBody failed:', e)
    return
  }
  // Game-side state wrapper: takes over ownership of current elevation +
  // per-tile resources. The lib body stays the immutable baseline. Dig
  // mutations flow through the state so they become persistable overrides.
  // The reactive resource overrides (pattern + enabled toggle) flow through
  // here so each rebuild picks up the user's latest UI choices without any
  // extra plumbing.
  // Adjacency map drives the cone BFS expansion in `onPointerUp`. Built
  // unconditionally so non-frozen bodies still get a multi-tile cone
  // (without it, BFS finds no peers and the dig collapses to the clicked
  // tile alone — symptom: "no radius, descends one by one").
  neighborMap = buildNeighborMap(body.sim.tiles)
  scene.add(body.group)
  tileCount.value = (body as any).tileCount ?? 0
  // Flip the body to interactive mode so tile hover becomes available.
  body.interactive.activate()
  baseRingVariation = body.variation?.rings ?? null
  const merged = baseRingVariation ? mergeRingVariation(baseRingVariation, ringOverrides) : null
  rings = attachBodyRings(
    body.group,
    props.config.radius,
    props.config.rotationSpeed,
    merged,
    sunWorldPos,
  )

  // ── Planet-only build path ────────────────────────────────────────
  // Game-side state, resource paint, view toggle and frozen ice cap all
  // live on the planet branch — stars expose neither a layered sol mesh
  // nor a liquid surface, so this whole block is skipped on `kind: 'star'`.
  // The user still sees the star's hex mesh + interactive hover above.
  const planetBody = planet()
  if (planetBody) {
    // Game-side state wrapper: takes over ownership of current elevation +
    // per-tile resources. The lib body stays the immutable baseline. Dig
    // mutations flow through the state so they become persistable overrides.
    const distribution = generateDemoDistribution(planetBody.sim, {
      temperatureMin:    props.config.temperatureMin,
      temperatureMax:    props.config.temperatureMax,
      patternOverrides:  resourcePatternOverrides(),
      disabledResources: disabledResourceIds(),
      weights:           resourceWeights(),
    })
    gameState = createGameBodyState(planetBody, distribution)
    // Publish per-resource totals so the resources column can display them
    // in real time. Recomputed on every rebuild — UI/sliders bump rebuildKey
    // already, so the figure stays in sync with what the user sees.
    totalResources.value = sumDistributionTotals(distribution)
    // Layered paint: sol overlay for metals / minerals, atmo overlay for gases.
    // The pipeline routes each resource to its correct layer based on `phase`.
    paintBody(planetBody, distribution, getDemoResourceRules())
    // Default the active layer based on the surface look — `'bands'` bodies
    // start on the atmosphere (their visible surface), every other look
    // starts on the sol. The user can flip the layer at any time via
    // PaneToggles, and the watcher below propagates the choice into
    // `body.view.set`.
    if (props.config.surfaceLook === 'bands' && viewMode.value !== 'atmosphere') {
      viewMode.value = 'atmosphere'
    } else if (props.config.surfaceLook !== 'bands' && viewMode.value !== 'surface') {
      viewMode.value = 'surface'
    }
    planetBody.view.set(viewMode.value)
    applySeaLevel(seaLevelFraction.value)
    // Frozen surface → mount a stacked hex ice cap on every submerged tile.
    // The cap top sits at sea level, walls extend down to each tile's own
    // ground elevation. Mining the cap (handled below in the digger adapter)
    // exposes the underlying mineral tile band by band.
    if (planetBody.config.liquidState === 'frozen' && planetBody.sim.seaLevelElevation > -1) {
      // Cap top tracks the *live* sea level (slider-driven) instead of
      // the sim-derived `seaLevelElevation`, which only reflects the
      // initial coverage. Aligns with the user's mental "calotte = niveau
      // de l'eau" anchor when the slider has moved.
      const targetSeaBand = liveSeaLevelBand()
      const submergedTiles: Array<(typeof planetBody.sim.tiles)[number]> = []
      const baseElevation  = new Map<number, number>()
      for (const tile of planetBody.sim.tiles) {
        const state = planetBody.sim.tileStates.get(tile.id)
        if (!state) continue
        if (state.elevation < targetSeaBand) {
          submergedTiles.push(tile)
          baseElevation.set(tile.id, state.elevation)
          iceColumns.set(tile.id, { top: targetSeaBand, base: state.elevation })
        }
      }
      if (submergedTiles.length > 0) {
        solidShell = buildSolidShell({
          tiles:         submergedTiles,
          baseElevation,
          topElevation:  targetSeaBand,
          palette:       planetBody.palette,
          bodyRadius:    planetBody.getSurfaceRadius(),
          coreRadius:    planetBody.getCoreRadius(),
          color:         planetBody.config.liquidColor ?? 0xc8e8f4,
          roughness:     0.75,
          metalness:     0.05,
        })
        planetBody.group.add(solidShell.group)
      }
    }
  }

  // Wire the digger to the game state adapter — elevation reads/writes go
  // through the override layer so persistence + hover stay in sync. When
  // an ice cap covers the tile the digger sees the cap top; lowering past
  // the cap base transparently transitions onto the mineral floor.
  // No-op on stars (sol-height digging is a no-op on their body shape).
  // Wire the digger only when the body carries a layered sol mesh + a
  // gameState — both are absent on stars (`gameState` stays null on the
  // star branch above), so this whole block degrades to a no-op.
  if (gameState) {
    const state = gameState
    dig = useTileDig({
      config:       libConfig.value,
      sim:          { tiles: body.sim.tiles },
      getElevation: (id) => {
        const ice = iceColumns.get(id)
        // Ice cap visible above the floor → digger acts on the cap top.
        if (ice && ice.top > ice.base) return ice.top
        return state.getTile(id)?.elevation
      },
      setElevation: (id, newElevation) => {
        const ice = iceColumns.get(id)
        if (ice && ice.top > ice.base) {
          // Any descent into the column wipes the cap entirely, then the
          // sol underneath is dug by the same `drop` magnitude the dig
          // pipeline asked for. This keeps the cone visually uniform
          // between ice and sol clicks: no half-retracted cap can be
          // left poking into the freshly dug zone, and the sol below a
          // destroyed cap descends consistently with the rest of the
          // cone (a sol-only tile in the same ring would lose the same
          // number of bands).
          if (newElevation < ice.top) {
            const drop = ice.top - newElevation
            solidShell?.removeTile(id)
            ice.top = ice.base
            const currentSol = state.getTile(id)?.elevation ?? ice.base
            state.setElevation(id, Math.max(0, currentSol - drop))
          }
          return
        }
        // No ice (or already mined out) → straight ground dig.
        state.setElevation(id, newElevation)
      },
    }).dig
  } else {
    dig = null
  }
  bodyVersion++
}

/**
 * Returns the sea level in band space matching the current slider position.
 * On dry bodies (no surface liquid) returns `-1` so downstream consumers
 * keep the existing "no waterline" semantic.
 */
function liveSeaLevelBand(): number {
  const cfg = libConfig.value
  if (!hasSurfaceLiquid(cfg)) return -1
  const bandCount = resolveTerrainLevelCount(
    cfg.radius,
    cfg.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO,
    resolveAtmosphereThickness(cfg),
  )
  return seaLevelFraction.value * bandCount
}

function buildHoverInfo(target: HoverTarget): HoverInfo | null {
  if (!body || !gameState) return null
  const tileId = target.tileId

  // Liquid surface — the user is pointing at the translucent liquid shell.
  // The tooltip surfaces both the liquid layer (waterline-anchored) and
  // the mineral floor underneath (the actual submerged sol tile) in one
  // hover so the player can read what's below the surface without having
  // to dig first.
  if (target.kind === 'liquid') {
    const view = gameState.getTile(tileId)
    if (!view) return null
    const seaBand   = liveSeaLevelBand()
    const waterline = Math.round(seaBand)
    // The liquid surface IS the ocean biome by definition — short-circuit
    // `classifyBiome`, which would otherwise mislabel a tile sitting
    // exactly at the rounded waterline as land (`elevation < seaLevelElev`
    // is strict).
    const surfaceBio = biomeLabel('ocean')
    // Mined-out floor (elevation 0) means the underwater tile has been
    // dug down to the molten core — surface that explicitly instead of
    // letting the classifier label it as deep ocean.
    const seabedBio = view.elevation === 0
      ? 'Noyau'
      : biomeLabel(classifyBiome(view.elevation, seaBand, libConfig.value, {
          min: props.config.temperatureMin,
          max: props.config.temperatureMax,
        }))
    const seabedHeight = resolveTileHeight(libConfig.value, view.elevation)
    const seabedLevel  = resolveTileLevel(seaBand, view.elevation)
    const display      = getDemoResourceDisplay()
    const seabedRes: HoverResource[] = []
    for (const [id, amount] of view.solResources.entries()) {
      // Below-water deposits are valid (we're submerged), so don't filter.
      const disp = display.getResourceDisplay(id)
      seabedRes.push({ id, label: disp?.label ?? id, amount, color: disp?.color ?? 0x9aa3b0 })
    }
    seabedRes.sort((a, b) => b.amount - a.amount)
    return {
      tileId,
      kind:           'liquid',
      biome:          surfaceBio,
      elevation:      waterline,
      height:         resolveTileHeight(libConfig.value, waterline),
      level:          0,
      solResources:   [],
      atmoResources: [],
      seabed: {
        biome:        seabedBio,
        elevation:    view.elevation,
        height:       seabedHeight,
        level:        seabedLevel,
        solResources: seabedRes,
      },
      bodyVersion,
    }
  }

  // Atmo board — own hexasphere, ids unrelated to sol. Read the resource
  // distribution off the dedicated getter and skip every sol-side concept
  // (elevation, biome, height, level).
  if (target.kind === 'atmo') {
    const atmoView = gameState.getAtmoTile(tileId)
    if (!atmoView) return null
    const display = getDemoResourceDisplay()
    const atmoResources: HoverInfo['atmoResources'] = []
    for (const [id, amount] of atmoView.resources.entries()) {
      const disp = display.getResourceDisplay(id)
      atmoResources.push({ id, label: disp?.label ?? id, amount, color: disp?.color ?? 0x9aa3b0 })
    }
    atmoResources.sort((a, b) => b.amount - a.amount)
    return {
      tileId,
      kind:           'atmo',
      biome:          undefined,
      elevation:      null,
      height:         null,
      level:          null,
      solResources:   [],
      atmoResources,
      bodyVersion,
    }
  }

  const view = gameState.getTile(tileId)
  if (!view) return null
  // Tiles mined down to the core have nothing meaningful to read back —
  // no biome, no resources, just the molten interior. (Ice tiles never
  // reach here: their underlying sol still carries an elevation > 0.)
  if (view.elevation === 0 && target.kind === 'sol') return null

  const seaBand = liveSeaLevelBand()
  // For an ice tile the user is pointing AT the cap top, not at the
  // mineral floor — so the displayed elevation/height reflect the cap
  // surface (the waterline) instead of the buried sol.
  const displayElevation = target.kind === 'ice' ? Math.round(seaBand) : view.elevation
  const height  = resolveTileHeight(libConfig.value, displayElevation)
  const level   = resolveTileLevel(seaBand, displayElevation)

  // Per-tile resources come from the game state — split by render layer so the
  // hover panel can surface them in separate "Surface" vs "Atmosphere" sections.
  const rules = getDemoResourceRules()
  const display = getDemoResourceDisplay()
  const submerged = seaBand >= 0 && view.elevation < seaBand

  function collect(bucket: ReadonlyMap<string, number>): HoverInfo['solResources'] {
    const out: HoverInfo['solResources'] = []
    for (const [id, amount] of bucket.entries()) {
      // Surface-liquid deposits (historical "water" markers) are meaningful
      // only below the waterline — filter when the slider moved a tile above.
      if (!submerged && rules.isSurfaceLiquid(id)) continue
      const disp = display.getResourceDisplay(id)
      out.push({ id, label: disp?.label ?? id, amount, color: disp?.color ?? 0x9aa3b0 })
    }
    out.sort((a, b) => b.amount - a.amount)
    return out
  }

  // Tooltip surfaces only the layer the user is currently inspecting. The
  // raycaster's BVH is already isolated to that layer (driven by `viewMode`
  // through `body.view.set`), so listing the other layer's resources would
  // be misleading — the user can't act on them from this view. Toggling
  // `viewMode` (PaneToggles) flips both the active grid AND the tooltip.
  const showAtmo      = viewMode.value === 'atmosphere'
  // On an ice cap the underlying sol is still submerged; the user is
  // pointing at the cap itself, so we hide the sol resources (they are
  // unreachable until the cap is destroyed).
  const solResources  = (showAtmo || target.kind === 'ice') ? [] : collect(view.solResources)
  const atmoResources = showAtmo ? collect(view.atmoResources) : []

  const biome = target.kind === 'ice'
    ? 'Frozen surface'
    : biomeLabel(classifyBiome(view.elevation, seaBand, libConfig.value, {
        min: props.config.temperatureMin,
        max: props.config.temperatureMax,
      }))

  return {
    tileId,
    kind:      target.kind,
    biome,
    elevation: displayElevation,
    height,
    level,
    solResources,
    atmoResources,
    bodyVersion,
  }
}

/**
 * Discriminated hover target — liquid surface, ice cap, sol tile and
 * atmo tile are distinct entities. The liquid layer is the translucent
 * shell laid over submerged tiles; under it sits a sol tile (the
 * mineral sea floor) which the tooltip surfaces alongside.
 */
type HoverTarget =
  | { kind: 'liquid'; tileId: number }
  | { kind: 'ice';    tileId: number }
  | { kind: 'sol';    tileId: number }
  | { kind: 'atmo';   tileId: number }

/**
 * Computes the radial offset (above the body's surface radius) at which
 * the ice cap's TOP face sits for a given tile. Used to anchor the hover
 * ring on the cap's upper face — must read the tile's *current* `ice.top`
 * (not the live sea-level band), otherwise a cap that has been lowered by
 * a previous dig would still display its hover ring at the original
 * waterline. Returns `0` when the body is not mounted or the tile has no
 * standing cap (caller short-circuits).
 *
 * Mirrors `bandToWorldHeight` in `buildSolidShell` — both must agree so
 * the ring lines up exactly with the prism cap.
 */
function iceCapOffsetFromRadius(tileId: number): number {
  if (!body) return 0
  const ice = iceColumns.get(tileId)
  if (!ice || ice.top <= ice.base) return 0
  const palette = body.palette
  const N = palette.length
  if (N === 0) return 0
  const clamped = Math.max(0, Math.min(N - 1, ice.top))
  const lo = Math.floor(clamped)
  const hi = Math.min(N - 1, lo + 1)
  const frac = clamped - lo
  const capHeight = palette[lo].height + (palette[hi].height - palette[lo].height) * frac
  return body.getCoreRadius() + capHeight - body.getSurfaceRadius()
}

/** Cosine threshold for a face to count as a "top" face — i.e. its
 *  outward-facing normal aligned with the radial direction. ≥ 0.5 means
 *  the angle between the normal and the radial axis is at most 60°,
 *  which cleanly separates the (radial) cap top from the (tangential)
 *  side walls of an extruded prism. */
const ICE_TOP_NORMAL_COS = 0.5

const _hitNormalScratch = new THREE.Vector3()
const _hitRadialScratch = new THREE.Vector3()

/**
 * Resolves what the current raycaster is pointing at, prioritising the
 * frozen ice cap (when present) over the underlying sol mesh. The cap
 * lives outside `body.interactive`, so without this dispatch a click on
 * a frozen tile falls through to the sol underneath and the user can
 * never select / destroy the ice itself.
 *
 * Side walls of the cap are explicitly excluded — only the top face
 * counts as a valid ice hover. Hovering a wall falls through to the sol
 * (matches the user expectation: "hover only on the hexagon's face, not
 * on its sides").
 *
 * `body.group.updateWorldMatrix` is called explicitly because the raycast
 * may run before the next render frame (i.e. before Three.js auto-syncs
 * world matrices), which can cause `intersectObject` to miss the cap mesh
 * entirely on the first interaction after a rebuild.
 */
function queryHoverTarget(): HoverTarget | null {
  if (!body) return null
  body.group.updateWorldMatrix(true, true)
  // Liquid shell takes priority — it sits on top of the sol mesh and
  // is visually the surface the user sees first. Top-fan-only geometry
  // means every triangle is a hex top face, so no normal filtering is
  // needed (unlike the ice cap whose walls must be rejected).
  if (body.kind === 'planet') {
    const liquid = body.liquid.getRaycastState()
    if (liquid && liquid.mesh.visible) {
      const hits = raycaster.intersectObject(liquid.mesh, false)
      for (const hit of hits) {
        const fi = hit.faceIndex
        if (fi == null) continue
        const tileId = liquid.faceToTileId[fi]
        if (tileId === undefined) continue
        return { kind: 'liquid', tileId }
      }
    }
  }
  if (solidShell && solidShell.mesh.visible && solidShell.faceToTileId.length > 0) {
    const hits = raycaster.intersectObject(solidShell.mesh, false)
    for (const hit of hits) {
      const fi = hit.faceIndex
      if (fi == null) continue
      // Reject side-wall hits — only the cap's top hex face counts.
      if (hit.face) {
        _hitNormalScratch.copy(hit.face.normal).transformDirection(solidShell.mesh.matrixWorld)
        _hitRadialScratch.copy(hit.point).normalize()
        if (_hitNormalScratch.dot(_hitRadialScratch) < ICE_TOP_NORMAL_COS) continue
      }
      const tileId = solidShell.faceToTileId[fi]
      if (tileId === undefined) continue
      const col = iceColumns.get(tileId)
      // Skip collapsed prisms — their triangles are degenerate but the
      // raycaster can still hit a near-zero-area sliver in pathological
      // angles. Falling through lets the sol take over for that tile.
      if (col && col.top > col.base) return { kind: 'ice', tileId }
    }
  }
  // Fall through to sol — but a sol tile that still has a standing cap
  // is occluded by the cap from the user's perspective: hovering its
  // walls (rejected above) or pointing through its top should NOT
  // select the buried mineral floor. Return null so the cursor reads
  // as "no selection" until the cap is mined out.
  const ref = body.interactive.queryHover(raycaster)
  // Only sol-board hits are routed through the ice column logic — atmo
  // hits flow through `tiles.atmo` (caller-side handling) and never reach
  // this branch in surface view.
  if (ref == null || ref.layer !== 'sol') return null
  const id  = ref.tileId
  const col = iceColumns.get(id)
  if (col && col.top > col.base) return null
  return { kind: 'sol', tileId: id }
}

function onPointerMove(e: PointerEvent) {
  if (!hostEl.value) return
  const r = hostEl.value.getBoundingClientRect()
  pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
  pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
  tooltipX.value = e.clientX - r.left
  tooltipY.value = e.clientY - r.top
  pointerIn = true
  // User actually moved the cursor — release the post-dig focus lock so the
  // raycast can resume its normal pick.
  lockedHoverId = null
}
function onPointerLeave() {
  pointerIn = false
  pointerDownPos = null
  lockedHoverId = null
  hoverInfo.value = null
  hoveringConsumed.value = false
  body?.hover.setBoardTile(null)
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  pointerDownPos = { x: e.clientX, y: e.clientY }
}

/**
 * Tries to convert a left-click into a dig action. Bail if the user dragged
 * (orbit gesture), if no body is mounted, or if the ray missed the surface.
 *
 * Repeated clicks without a cursor move re-hit the previously-dug tile as
 * long as it is still standing — the freshly carved crater sits lower than
 * its neighbours, so a naive raycast from the unchanged cursor position
 * would otherwise jump to a taller neighbour and the user would end up
 * digging a ring of holes instead of deepening the one they actually
 * picked. When the locked tile has bottomed out (elevation 0) we fall back
 * to the raycast so the next click can naturally target a new hex.
 */
function onPointerUp(e: PointerEvent) {
  if (e.button !== 0 || !pointerDownPos) return
  const dx = e.clientX - pointerDownPos.x
  const dy = e.clientY - pointerDownPos.y
  pointerDownPos = null
  if (dx * dx + dy * dy > CLICK_SLOP_PX * CLICK_SLOP_PX) return
  if (!body || !camera || !hostEl.value || !dig || !gameState) return

  const r = hostEl.value.getBoundingClientRect()
  pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
  pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1

  // Prefer the post-dig focus lock so spam-clicks keep hitting the same hex
  // the user originally picked. Only honour it when the tile is still
  // standing — a consumed tile (elev 0) must let the raycast take over.
  let target: HoverTarget | null = null
  if (lockedHoverId != null) {
    // Re-evaluate the locked tile's kind on each click: the same hex can
    // host a standing cap (kind='ice'), the exposed sol after the cap is
    // gone (kind='sol'), or be fully mined out (no lock anymore).
    const lockedCol = iceColumns.get(lockedHoverId)
    const stillIce  = lockedCol && lockedCol.top > lockedCol.base
    const stillSol  = (gameState.getTile(lockedHoverId)?.elevation ?? 0) > 0
    if (stillIce || stillSol) {
      target = { kind: stillIce ? 'ice' : 'sol', tileId: lockedHoverId }
    }
  }
  if (!target) {
    raycaster.setFromCamera(pointer, camera)
    target = queryHoverTarget()
  }
  if (!target) return

  // Cone destruction with drop-relative descent. Each ring k of the
  // hex grid descends by `drop = centerDrop - k` bands from each
  // tile's current top — same formula as the lib's `useTileDig`, so
  // the radius is respected regardless of how varied the underlying
  // terrain is (a tile that is already low keeps descending instead
  // of being skipped). For frozen caps whose top sits uniformly at
  // seaLevel, drop-relative naturally yields the "same height per
  // ring" outcome the user expects.
  //
  // All sol mutations are batched into a single `setElevations` call
  // so the BVH refit fires once for the whole dig (avoids the per-tile
  // stutter on dense bodies).
  const id          = target.tileId
  const opts        = digOptions

  const touched     = new Set<number>()
  const visited     = new Set<number>([id])
  let frontier: number[] = [id]
  const solUpdates  = new Map<number, number>()

  for (let ring = 0; ring <= opts.radius; ring++) {
    const drop = opts.centerDrop - ring
    if (drop <= 0) break
    for (const tid of frontier) {
      const ice = iceColumns.get(tid)
      const hasIce = !!ice && ice.top > ice.base
      const currentTop = hasIce ? ice!.top : (gameState.getTile(tid)?.elevation ?? 0)
      const newTop = Math.max(0, currentTop - drop)
      if (newTop === currentTop) continue
      if (hasIce && ice) {
        if (newTop >= ice.base) {
          // Cap retracts by `drop` bands.
          const consumed = ice.top - newTop
          solidShell?.lowerTile(tid, consumed)
          ice.top = newTop
        } else {
          // Drop punches through the cap — destroy it, then dig the
          // underlying sol by the leftover bands.
          solidShell?.removeTile(tid)
          ice.top = ice.base
          const overflow   = ice.base - newTop
          const currentSol = gameState.getTile(tid)?.elevation ?? ice.base
          solUpdates.set(tid, Math.max(0, currentSol - overflow))
        }
      } else {
        // Sol-only descent.
        solUpdates.set(tid, newTop)
      }
      touched.add(tid)
    }
    if (ring === opts.radius) break
    const next: number[] = []
    for (const tid of frontier) {
      for (const peer of neighborMap.get(tid) ?? []) {
        if (visited.has(peer)) continue
        visited.add(peer)
        next.push(peer)
      }
    }
    frontier = next
  }

  if (solUpdates.size > 0) gameState.setElevations(solUpdates)
  if (touched.size === 0) return
  // Pin the hover to the dug tile: the next raycast from the unchanged
  // cursor position would otherwise land on a taller neighbour whose cap is
  // now in front of the crater. Cleared as soon as the pointer moves.
  lockedHoverId = id
  // Re-evaluate kind from the post-dig ice column state: a cap that
  // survived the click stays 'ice', a cap that got fully consumed flips
  // to 'sol' (and the ring snaps down to the exposed mineral floor).
  const postDigCol = iceColumns.get(id)
  const postKind: HoverTarget['kind'] =
    postDigCol && postDigCol.top > postDigCol.base ? 'ice' : 'sol'
  hoverInfo.value = buildHoverInfo({ kind: postKind, tileId: id })
  body.hover.setTile(
    id,
    postKind === 'ice' ? { capOffsetFromRadius: iceCapOffsetFromRadius(id) } : undefined,
  )

  // Broadcast the mutation so the ShaderPane can mirror it into its own
  // simulation and repaint its smooth-sphere preview — otherwise only
  // this pane's body sees the dig and the shader view stays pristine.
  const elevations = new Map<number, number>()
  for (const tid of touched) {
    const view = gameState.getTile(tid)
    if (view) elevations.set(tid, view.elevation)
  }
  const prev = lastDigMutation.value?.version ?? 0
  lastDigMutation.value = { elevations, version: prev + 1 }
}

onMounted(() => {
  const host = hostEl.value!
  // Two panes render in parallel — cap DPR at 1 to keep fragment cost down on
  // high-DPI screens. `antialias: true` already cleans up edges cheaply.
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(resolveShaderPixelRatio(shaderQuality.value))
  renderer.setSize(host.clientWidth, host.clientHeight)
  renderer.setClearColor(0x050608, 1)
  host.appendChild(renderer.domElement)

  scene  = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.05, 400)

  // Lights are tuned per view by `applyLightingForView`: playable views
  // (Sol / Atmosphere) raise ambient and lower the directional sun so
  // the shaded hemisphere stays readable for clicks; Shader view keeps
  // a contrasty rig for the realistic day/night terminator look.
  ambientLight = new THREE.AmbientLight(0x404857, 0.6)
  scene.add(ambientLight)
  directionalLight = new THREE.DirectionalLight(0xfff1dd, 2.0)
  directionalLight.position.set(6, 4, 6)
  scene.add(directionalLight)
  applyLightingForView()

  const orbit = installOrbitCamera(camera, renderer.domElement, { minDist: 3, maxDist: 60, initialDistance: 10 })
  stopCamera = orbit.dispose

  ro = new ResizeObserver(() => {
    if (!renderer || !camera || !host) return
    const w = host.clientWidth, h = host.clientHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  })
  ro.observe(host)

  renderer.domElement.addEventListener('pointermove',  onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)
  renderer.domElement.addEventListener('pointerdown',  onPointerDown)
  renderer.domElement.addEventListener('pointerup',    onPointerUp)

  rebuildBody()

  const camTarget = new THREE.Vector3()
  stopLoop = startRenderLoop(
    (dt) => {
      if (!renderer || !scene || !camera) return
      if (!props.active) return
      applyCamera(camera, camTarget)
      if (body) {
        body.tick(dt)
        spin.update(dt, body.group, props.config.rotationSpeed, props.config.axialTilt)
        // Refresh the dominant-light position BEFORE `rings.tick` — the
        // ring shader reads `sunWorldPos` by reference, so the new value
        // must be in place by render time. Same vector feeds the body's
        // surface shadow sync below.
        if (rings) {
          if (findDominantLightWorldPos(scene, sunWorldPos)) {
            syncRingShadowSun(body.group, sunWorldPos)
          }
          rings.tick(dt)
        }
      }

      const nowMs = performance.now()
      if (pointerIn && body && camera && nowMs - lastHoverCheckMs >= HOVER_UPDATE_MIN_MS) {
        lastHoverCheckMs = nowMs
        // Atmosphere view — atmo board hover. Routes the raycast through
        // `setBoardTile` (paints the atmo tile under the cursor) and
        // populates the same `hoverInfo` slot the sol path uses, so the
        // tooltip surfaces the atmo tile id + atmo resources.
        if (viewMode.value === 'atmosphere') {
          raycaster.setFromCamera(pointer, camera)
          const ref = body.interactive.queryHover(raycaster)
          body.hover.setBoardTile(ref)
          const atmoTarget: HoverTarget | null = ref?.layer === 'atmo'
            ? { kind: 'atmo', tileId: ref.tileId }
            : null
          const id          = atmoTarget?.tileId ?? null
          const currentId   = hoverInfo.value?.tileId ?? null
          const currentKind = hoverInfo.value?.kind   ?? null
          if (id !== currentId || currentKind !== 'atmo') {
            hoverInfo.value = atmoTarget ? buildHoverInfo(atmoTarget) : null
          }
          renderer.render(scene, camera)
          return
        }
        // Post-dig focus lock short-circuits the raycast so the freshly dug
        // tile keeps the hover ring even when a taller neighbour is now in
        // front of the crater. Cleared by `pointermove` — see `lockedHoverId`.
        let target: HoverTarget | null
        if (lockedHoverId != null) {
          target = { kind: 'sol', tileId: lockedHoverId }
        } else {
          raycaster.setFromCamera(pointer, camera)
          target = queryHoverTarget()
        }
        // Mined-out *sol* tiles are core windows — no surface to highlight.
        // Ice tiles never reach this state (they're either a real cap or
        // have been cleared back to sol).
        const isConsumed = target?.kind === 'sol'
          && (body as any).sim?.tileStates?.get(target.tileId)?.elevation === 0
        hoveringConsumed.value = isConsumed
        const effectiveTarget = isConsumed ? null : target
        const id           = effectiveTarget?.tileId ?? null
        const currentId    = hoverInfo.value?.tileId      ?? null
        const currentKind  = hoverInfo.value?.kind        ?? null
        const currentVer   = hoverInfo.value?.bodyVersion ?? -1
        const stale        = currentVer !== bodyVersion
        const kindChanged  = effectiveTarget?.kind !== currentKind
        if (id !== currentId || kindChanged || (id != null && stale)) {
          const info = effectiveTarget ? buildHoverInfo(effectiveTarget) : null
          hoverInfo.value = info
          if (id !== currentId || kindChanged) {
            // Map the playground's HoverTarget kinds to the lib's BoardTileRef
            // layers (ice = sol with cap-offset override; liquid stays liquid).
            const opts = effectiveTarget?.kind === 'ice' && id != null
              ? { capOffsetFromRadius: iceCapOffsetFromRadius(id) }
              : undefined
            const ref = effectiveTarget && id != null
              ? { layer: effectiveTarget.kind === 'ice' ? 'sol' as const : effectiveTarget.kind, tileId: id }
              : null
            body.hover.setBoardTile(ref, opts)
          }
        }
      }

      renderer.render(scene, camera)
    },
    (v) => { fps.value = v },
  )
})

onBeforeUnmount(() => {
  stopLoop?.(); stopCamera?.(); ro?.disconnect()
  if (body && scene) {
    if (rings)      { detachBodyRings(body.group, rings); rings = null }
    if (solidShell) { body.group.remove(solidShell.group); solidShell.dispose(); solidShell = null }
    iceColumns.clear()
    scene.remove(body.group); body.dispose?.()
  }
  renderer?.domElement.removeEventListener('pointermove',  onPointerMove)
  renderer?.domElement.removeEventListener('pointerleave', onPointerLeave)
  renderer?.domElement.removeEventListener('pointerdown',  onPointerDown)
  renderer?.domElement.removeEventListener('pointerup',    onPointerUp)
  renderer?.dispose()
  renderer?.domElement.remove()
})

// Debounced so slider drags don't trigger a full `useBody` per frame.
// ~120 ms coalesces the drag into one or two rebuilds on release.
let rebuildTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => { rebuildTimer = null; rebuildBody() }, 120)
}
watch(() => props.config,     scheduleRebuild, { deep: true })
watch(() => props.tileSize,   scheduleRebuild)
watch(() => props.rebuildKey, scheduleRebuild)

// Live ring tweaks — update uniforms without rebuilding the whole body.
watch(
  () => ({ ...ringOverrides }),
  () => {
    if (!rings || !baseRingVariation) return
    rings.updateVariation(mergeRingVariation(baseRingVariation, ringOverrides))
  },
  { deep: true },
)

// Backdrop values when the playable hex grid is on screen (Sol /
// Atmosphere views) — hardcoded low so the atmosphere stays subtle
// regardless of the user's Shader-view sliders. Those only apply when
// `viewMode === 'shader'`.
const BACKDROP_ATMO_OPACITY   = 0.2
const BACKDROP_ATMO_COLOR_MIX = 0.0

// Lighting profile per view. Playable raises ambient + lowers the sun
// so the dark hemisphere stays readable; Shader keeps a contrasty rig
// for the realistic day/night terminator look.
const AMBIENT_PLAYABLE     = 2.5
const AMBIENT_SHADER       = 0.6
const DIRECTIONAL_PLAYABLE = 0.7
const DIRECTIONAL_SHADER   = 2.0

function applyLightingForView(): void {
  const isShader = viewMode.value === 'shader'
  if (ambientLight)     ambientLight.intensity     = isShader ? AMBIENT_SHADER     : AMBIENT_PLAYABLE
  if (directionalLight) directionalLight.intensity = isShader ? DIRECTIONAL_SHADER : DIRECTIONAL_PLAYABLE
}

function pushAtmoVisualParams(): void {
  const p = planet()
  if (!p) return
  const isShader = viewMode.value === 'shader'
  if (p.atmoShell) {
    p.atmoShell.setOpacity(isShader
      ? (props.config.atmosphereOpacity ?? 0.55)
      : BACKDROP_ATMO_OPACITY)
    p.atmoShell.setParams({
      tileColorMix: isShader ? atmoTileColorMix.value : BACKDROP_ATMO_COLOR_MIX,
    })
  }
}

watch(viewMode, (mode) => {
  planet()?.view.set(mode)
  pushAtmoVisualParams()
  applyLightingForView()
})

// Live cursor tuning — every reactive change in `hoverCursorParams` is
// pushed into the body without rebuild via `body.hover.updateCursor`.
watch(
  () => ({
    ring:      { ...hoverCursorParams.ring },
    floorRing: { ...hoverCursorParams.floorRing },
    emissive:  { ...hoverCursorParams.emissive },
    column:    { ...hoverCursorParams.column },
  }),
  () => body?.hover.updateCursor(resolveHoverCursorConfig(hoverCursorParams)),
  { deep: true },
)

watch(() => props.config.atmosphereOpacity, pushAtmoVisualParams)
watch(atmoTileColorMix,                     pushAtmoVisualParams)

/**
 * Map the normalised sea-level fraction to a world-space radius and push
 * it into the layered interactive mesh.
 *
 * The fraction is interpreted in band space (`band = fraction * bandCount`)
 * and converted to world units via the canonical band layout so tile prism
 * tops and the waterline share the same unit — a tile with elevation band
 * `b` whose cap sits at `core + b * unit` is submerged exactly when
 * `fraction * bandCount > b`.
 */
function applySeaLevel(fraction: number): void {
  const p = planet()
  if (!p) return
  const core      = p.getCoreRadius()
  const coreRatio = props.config.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO
  const atmoThick = resolveAtmosphereThickness(props.config)
  const bandCount = resolveTerrainLevelCount(props.config.radius, coreRatio, atmoThick)
  const layout    = terrainBandLayout(props.config.radius, coreRatio, bandCount, atmoThick)
  const seaBand   = fraction * bandCount
  p.liquid.setSeaLevel(core + seaBand * layout.unit)
  // Slide the frozen ice cap with the slider so its top face stays
  // anchored on the canonical waterline. Already-mined tiles stay
  // collapsed; only standing prisms are re-extruded.
  if (solidShell) {
    solidShell.setTopElevation(seaBand)
    for (const ice of iceColumns.values()) {
      if (ice.top > ice.base) ice.top = Math.max(ice.base, seaBand)
    }
  }
  // Refresh the tooltip against the new sea level so biome / relative level
  // update live while the user drags the slider — otherwise the tooltip
  // keeps the classification from the moment the cursor landed on the tile.
  const pinned = hoverInfo.value
  if (pinned) {
    hoverInfo.value = buildHoverInfo({ kind: pinned.kind, tileId: pinned.tileId })
    // Re-anchor the hover ring on the moved cap (ice tile only).
    if (pinned.kind === 'ice') {
      body?.hover.setTile(pinned.tileId, { capOffsetFromRadius: iceCapOffsetFromRadius(pinned.tileId) })
    }
  }
}
watch(seaLevelFraction, applySeaLevel)

// Live shader-quality preset → renderer pixel ratio. `setSize` repushes the
// canvas drawing buffer so the new ratio applies on the next frame.
watch(shaderQuality, (q) => {
  if (!renderer) return
  const host = hostEl.value
  renderer.setPixelRatio(resolveShaderPixelRatio(q))
  if (host) renderer.setSize(host.clientWidth, host.clientHeight)
})
</script>

<script lang="ts">
function hex(n: number) { return '#' + n.toString(16).padStart(6, '0') }
</script>

<template>
  <div class="view" :class="{ 'no-dig': hoveringConsumed }" ref="hostEl">
    <div class="badge">HEXA · {{ config.surfaceLook ?? config.type }} · {{ tileCount }} tiles</div>
    <div class="fps">{{ fps }} fps</div>

    <div
      v-if="hoverInfo"
      class="tile-tooltip"
      :style="{ left: `${tooltipX + 12}px`, top: `${tooltipY + 12}px` }"
    >
      <div class="row-kv">
        <span class="k">Tile</span><span class="v">#{{ hoverInfo.tileId }}{{ hoverInfo.kind === 'atmo' ? ' (atmo)' : '' }}</span>
      </div>
      <template v-if="hoverInfo.kind !== 'atmo'">
        <div class="tooltip-section-title" v-if="hoverInfo.kind === 'liquid'">Liquide</div>
        <div class="row-kv">
          <span class="k">Biome</span><span class="v">{{ hoverInfo.biome ?? '—' }}</span>
        </div>
        <div class="row-kv">
          <span class="k">Level</span><span class="v">{{ (hoverInfo.level ?? 0) >= 0 ? `+${hoverInfo.level}` : hoverInfo.level }}</span>
        </div>
        <div class="row-kv">
          <span class="k">Elev.</span><span class="v">{{ hoverInfo.elevation?.toFixed(3) ?? '—' }}</span>
        </div>
        <div class="row-kv">
          <span class="k">Height</span><span class="v">{{ hoverInfo.height?.toFixed(3) ?? '—' }}</span>
        </div>
      </template>
      <template v-if="hoverInfo.kind === 'liquid' && hoverInfo.seabed">
        <div class="tooltip-sep"></div>
        <div class="tooltip-section-title">Fond océanique</div>
        <div class="row-kv">
          <span class="k">Biome</span><span class="v">{{ hoverInfo.seabed.biome ?? '—' }}</span>
        </div>
        <div class="row-kv">
          <span class="k">Level</span><span class="v">{{ hoverInfo.seabed.level >= 0 ? `+${hoverInfo.seabed.level}` : hoverInfo.seabed.level }}</span>
        </div>
        <div class="row-kv">
          <span class="k">Elev.</span><span class="v">{{ hoverInfo.seabed.elevation.toFixed(3) }}</span>
        </div>
        <div class="row-kv">
          <span class="k">Height</span><span class="v">{{ hoverInfo.seabed.height.toFixed(3) }}</span>
        </div>
        <template v-if="hoverInfo.seabed.solResources.length">
          <div v-for="r in hoverInfo.seabed.solResources" :key="'seabed-' + r.id" class="resource-bar">
            <span :style="{ color: hex(r.color) }">{{ r.label }}</span>
            <div class="bar"><span :style="{ width: (r.amount * 100).toFixed(1) + '%' }"></span></div>
            <span class="amt">{{ (r.amount * 100).toFixed(0) }}%</span>
          </div>
        </template>
      </template>
      <template v-if="hoverInfo.solResources.length">
        <div class="tooltip-sep"></div>
        <div class="tooltip-section-title">Surface</div>
        <div v-for="r in hoverInfo.solResources" :key="'sol-' + r.id" class="resource-bar">
          <span :style="{ color: hex(r.color) }">{{ r.label }}</span>
          <div class="bar"><span :style="{ width: (r.amount * 100).toFixed(1) + '%' }"></span></div>
          <span class="amt">{{ (r.amount * 100).toFixed(0) }}%</span>
        </div>
      </template>
      <template v-if="hoverInfo.atmoResources.length">
        <div class="tooltip-sep"></div>
        <div class="tooltip-section-title">Atmosphère</div>
        <div v-for="r in hoverInfo.atmoResources" :key="'atmo-' + r.id" class="resource-bar">
          <span :style="{ color: hex(r.color) }">{{ r.label }}</span>
          <div class="bar"><span :style="{ width: (r.amount * 100).toFixed(1) + '%' }"></span></div>
          <span class="amt">{{ (r.amount * 100).toFixed(0) }}%</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* `.no-dig` flips the canvas cursor to the universal "forbidden" glyph
   while the user hovers a tile already mined down to the core. The dig
   handler is a no-op there too — the cursor just makes that obvious. */
.view.no-dig,
.view.no-dig :deep(canvas) { cursor: not-allowed; }

.tooltip-section-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8a919b;
  margin: 2px 0 2px;
}
</style>
