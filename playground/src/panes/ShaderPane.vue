<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { useBody, type LibBodyType, type PlanetBody, DEFAULT_CORE_RADIUS_RATIO, terrainBandLayout, resolveTerrainLevelCount, resolveAtmosphereThickness } from '@lib'
import { toLibBodyConfig, type PlaygroundBodyConfig } from '../lib/state'
import type { ParamMap } from '../lib/state'
import { installOrbitCamera, applyCamera } from '../lib/orbitCamera'
import { startRenderLoop } from '../lib/renderLoop'
import { createBodySpin } from '../lib/bodySpin'
import { attachBodyRings, detachBodyRings, mergeRingVariation } from '../lib/bodyRings'
import { syncRingShadowSun } from '../lib/ringShadowSunSync'
import { findDominantLightWorldPos } from '@lib'
import type { BodyRingsHandle, RingVariation } from '@lib'
import { buildPlaygroundVariation } from '../lib/state'
import {
  ringOverrides, lastDigMutation,
  resourcePatternOverrides, disabledResourceIds, resourceWeights,
  totalResources, atmoTileColorMix,
  sphereDetail, shaderQuality, resolveShaderPixelRatio,
} from '../lib/state'
import { playgroundGraphicsUniforms } from '../lib/playgroundUniforms'
import { seaLevelFraction } from '../lib/seaLevel'
import { generateDemoDistribution, getDemoResourceRules, sumDistributionTotals } from '../lib/resourceDemo'
import { paintBody } from '../lib/paint/paintBody'

const props = defineProps<{
  type:     LibBodyType
  params:   ParamMap
  config:   PlaygroundBodyConfig
  tileSize: number
  /** Bumped when a structural change (type switch, seed, rings...) forces a rebuild. */
  rebuildKey: number
  /**
   * When `false`, the render step short-circuits: no scene update, no draw
   * call. The pane keeps its WebGL context + body instance so toggling
   * back is instant.
   */
  active:   boolean
}>()

const hostEl = ref<HTMLDivElement | null>(null)
const fps    = ref(0)

/**
 * Lib-shape projection of the playground's wide editing config — recovers
 * the strict {@link BodyConfig} union the lib expects (drops cross-branch
 * fields). Re-derived on every dependent change so any reactive read of
 * the underlying `props.config` propagates automatically.
 */
const libConfig = computed(() => toLibBodyConfig(props.config))

let renderer: THREE.WebGLRenderer | null = null
let scene:    THREE.Scene | null = null
let camera:   THREE.PerspectiveCamera | null = null
let body:     ReturnType<typeof useBody> | null = null

/**
 * Narrows the current body to {@link PlanetBody} for sites that touch
 * planet-only namespaces (atmo shell, liquid corona, sol mutations).
 * Returns `null` on stars or when no body is mounted.
 */
function planet(): PlanetBody | null {
  return body?.kind === 'planet' ? body : null
}
let rings:    BodyRingsHandle | null = null
// Promoted to component scope — kept around for ring-shadow sync (the sun
// world position is refreshed each frame from the dominant scene light).
let sun: THREE.DirectionalLight | null = null
let sunWorldPos: THREE.Vector3 | null = null
let baseRingVariation: RingVariation | null = null
let stopLoop: (() => void) | null = null
let stopCamera: (() => void) | null = null
let ro:       ResizeObserver | null = null

const spin = createBodySpin()

/**
 * Cloud-pattern presets — combine `bandiness`, `turbulence`, `storms` and
 * `bandFreq` of the atmo shell so the user picks an identity in one click
 * (Vénus voilée, Jupiter banded, Terre cycloned). Index aligns with the
 * `cloudPattern` shader-param `options` order in `BODY_PARAMS.rocky`.
 */
const CLOUD_PRESETS: ReadonlyArray<{
  bandiness:  number
  turbulence: number
  storms:     number
  bandFreq:   number
}> = [
  // 0 — Dispersé : cumulus FBm classique. Reproduit l'ancien comportement
  // exactement (turbulence haute, bandiness faible).
  { bandiness: 0.20, turbulence: 0.70, storms: 0.10, bandFreq: 4.0 },
  // 1 — Cyclones : Terre / Saturne — 3 vortex marqués. Storms fortement
  // boosté pour que _stormField soit visible dans cloudWeight.
  { bandiness: 0.00, turbulence: 0.50, storms: 0.90, bandFreq: 4.0 },
  // 2 — Voile : Vénus opaque — couverture dense uniforme. Turbulence
  // basse pour que coverageLo chute à 0.20 (couverture quasi totale).
  { bandiness: 0.00, turbulence: 0.10, storms: 0.00, bandFreq: 2.0 },
]

/** Type-narrowing helpers — keep `applyShaderOverrides` readable. */
function pickNum(o: Record<string, unknown>, k: string): number | undefined {
  const v = o[k]; return typeof v === 'number' ? v : undefined
}
function pickStr(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k]; return typeof v === 'string' ? v : undefined
}

/**
 * Pushes the current shader-param snapshot into the live material(s).
 *
 * Two destinations:
 *   1. Smooth-sphere `planetMaterial` — receives every param via `setParams`,
 *      mapping `camelCase` → `uCamelCase` uniforms.
 *   2. Atmo shell — receives the subset that drives the halo / cloud layer
 *      (cloud cover, halo tint/opacity/colorMix, pattern preset). No-op when
 *      the body has no shell (gas / metallic without atmo / star).
 *
 * Live-update path — no body rebuild. The `atmoColorMix` value is mirrored
 * into the shared `atmoTileColorMix` ref so HexaPane picks up the change too.
 */
function applyShaderOverrides() {
  const pm = (body as any)?.planetMaterial
  pm?.setParams?.({ ...props.params })

  const params     = props.params as Record<string, unknown>
  const patternIdx = pickNum(params, 'cloudPattern') ?? 0
  const preset     = CLOUD_PRESETS[patternIdx] ?? CLOUD_PRESETS[0]
  const shell      = planet()?.atmoShell
  shell?.setParams({
    cloudAmount: pickNum(params, 'waveAmount'),
    cloudColor:  pickStr(params, 'waveColor'),
    cloudScale:  pickNum(params, 'waveScale'),
    driftSpeed:  pickNum(params, 'waveSpeed'),
    tint:        pickStr(params, 'atmoTint'),
    bandiness:   preset.bandiness,
    turbulence:  preset.turbulence,
    storms:      preset.storms,
    bandFreq:    preset.bandFreq,
  })
  const opacity = pickNum(params, 'atmoOpacity')
  if (opacity !== undefined) shell?.setOpacity(opacity)
  // Mirror into the shared ref so HexaPane's watcher picks up the change too
  // (both panes paint into the same atmo shell concept).
  const colorMix = pickNum(params, 'atmoColorMix')
  if (colorMix !== undefined) atmoTileColorMix.value = colorMix
}

function rebuildBody() {
  if (!scene) return
  if (body) {
    if (rings)  { detachBodyRings(body.group, rings); rings = null }
    scene.remove(body.group)
    body.dispose?.()
    body = null
  }
  try {
    const cfg = libConfig.value
    body = useBody(cfg, props.tileSize, {
      graphicsUniforms: playgroundGraphicsUniforms,
      quality:          { sphereDetail: sphereDetail.value },
      variation:        buildPlaygroundVariation(cfg),
    })
    const p = planet()
    p?.atmoShell?.setParams({ tileColorMix: atmoTileColorMix.value })
  } catch (e) {
    console.error('[ShaderPane] useBody failed:', e)
    return
  }
  // Game-side paint pass on top of the lib's palette bake — matches the
  // HexaPane pipeline so both panes share the eventual render path. Runs
  // once per rebuild; no-op on the smooth sphere (applyTileOverlay only
  // writes the layered interactive mesh) until phase 4 adds the
  // paintSmoothSphere hook.
  // Layered paint — `paintBody` dispatches sol / atmo buckets internally so
  // the shader preview reflects the same distribution as HexaPane.
  const distribution = generateDemoDistribution(body.sim, {
    temperatureMin:    props.config.temperatureMin,
    temperatureMax:    props.config.temperatureMax,
    patternOverrides:  resourcePatternOverrides(),
    disabledResources: disabledResourceIds(),
    weights:           resourceWeights(),
  })
  const planetBody = planet()
  if (planetBody) paintBody(planetBody, distribution, getDemoResourceRules())
  // Mirror HexaPane: keep the resources column figures in sync with the
  // shader pane's distribution too — the user may flip panes at any time.
  totalResources.value = sumDistributionTotals(distribution)
  // Intentionally do NOT activate interactive mode — we only want the
  // smooth-sphere display mesh so the shader is visible full-surface
  // (vertex-color blended with biome palette, oceans included).
  scene.add(body.group)
  baseRingVariation = body.variation?.rings ?? null
  const merged = baseRingVariation ? mergeRingVariation(baseRingVariation, ringOverrides) : null
  // Mutable Vector3 refreshed from the dominant directional light's position
  // before every render (see the loop below). Wired by reference into both
  // the rings shader (via `attachBodyRings`) and the per-frame shadow sync.
  sunWorldPos = new THREE.Vector3()
  rings = attachBodyRings(
    body.group,
    props.config.radius,
    props.config.rotationSpeed,
    merged,
    sunWorldPos,
  )

  // The shader pane is the **non-interactive** preview — flip into the
  // dedicated `'shader'` view so the smooth sphere + procedural atmo
  // shell take over from the interactive hex grids that `useBody` mounts
  // by default (`'surface'`). Stars don't carry the surface/atmo/shader
  // distinction — their default mesh is already the right preview.
  planet()?.view.set('shader')

  applyShaderOverrides()
  applySeaLevel(seaLevelFraction.value)
}

/**
 * Maps the slider fraction to a world-space sea radius and pushes it into
 * the body. On the smooth-sphere display mesh, `setSeaLevel` repaints
 * submerged vertices with the sea-anchor tone and slides the ocean-mask
 * shader uniform so crack / lava / crater effects stay masked off-shore.
 * Uses the same band-space mapping HexaPane applies, so both panes agree
 * on the waterline radius.
 */
function applySeaLevel(fraction: number): void {
  const p = planet()
  if (!p) return
  const core      = p.getCoreRadius()
  const cfg       = libConfig.value
  const coreRatio = cfg.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO
  const atmoThick = resolveAtmosphereThickness(cfg)
  const bandCount = resolveTerrainLevelCount(cfg.radius, coreRatio, atmoThick)
  const layout    = terrainBandLayout(cfg.radius, coreRatio, bandCount, atmoThick)
  // Map `fraction ∈ [0, 1]` linearly to `band ∈ [0, N]`, then project to
  // world radius via `bandToRadius`. `band = N` sits one `unit` above the
  // tallest tile so fraction=1 fully submerges every surface band.
  p.liquid.setSeaLevel(core + fraction * bandCount * layout.unit)
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

  scene.add(new THREE.AmbientLight(0x404857, 0.6))
  sun = new THREE.DirectionalLight(0xfff1dd, 2.0)
  sun.position.set(6, 4, 6)
  scene.add(sun)

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

  rebuildBody()

  const camTarget = new THREE.Vector3()
  stopLoop = startRenderLoop(
    (dt) => {
      if (!renderer || !scene || !camera) return
      if (!props.active) return
      applyCamera(camera, camTarget)
      if (body) {
        // Refresh the sun-world Vector3 BEFORE the body tick. The ring shadow
        // reads it by reference through `sunWorldPos` — pulled fresh from
        // the scene each frame so directional-light moves track without
        // manual plumbing.
        if (sunWorldPos && !findDominantLightWorldPos(scene, sunWorldPos)) {
          sunWorldPos.set(0, 0, 0)
        }
        body.tick(dt)
        spin.update(dt, body.group, props.config.rotationSpeed, props.config.axialTilt)
        rings?.tick(dt)
        if (rings && sunWorldPos) syncRingShadowSun(body.group, sunWorldPos)
      }
      renderer.render(scene, camera)
    },
    (v) => { fps.value = v },
  )
})

onBeforeUnmount(() => {
  stopLoop?.(); stopCamera?.(); ro?.disconnect()
  if (body && scene) {
    if (rings)  { detachBodyRings(body.group, rings); rings = null }
    scene.remove(body.group); body.dispose?.()
  }
  renderer?.dispose()
  renderer?.domElement.remove()
})

// Structural rebuild only — non-structural config tweaks (radius, temperature,
// gas composition…) are pushed through `planetMaterial.setParams` below via
// the `props.params` watcher, so the shader preview updates live without
// paying the full `useBody` cost. `rebuildKey` is bumped by the App whenever
// a real structural change occurs (type switch, rings/cracks/lava toggles).
let rebuildTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => { rebuildTimer = null; rebuildBody() }, 120)
}
watch(() => props.tileSize,   scheduleRebuild)
watch(() => props.rebuildKey, scheduleRebuild)
watch(() => props.type,       scheduleRebuild)

// Live ring tweaks — update uniforms without rebuilding the whole body.
watch(
  () => ({ ...ringOverrides }),
  () => {
    if (!rings || !baseRingVariation) return
    rings.updateVariation(mergeRingVariation(baseRingVariation, ringOverrides))
  },
  { deep: true },
)

// Live-update shader params without rebuilding the body.
watch(
  () => ({ ...props.params }),
  () => applyShaderOverrides(),
  { deep: true },
)

// Live sea-level tracking — slider moves reflect instantly on the smooth
// sphere (vertex colour repaint + ocean-mask shader uniform) without a
// body rebuild.
watch(seaLevelFraction, applySeaLevel)

// Live atmoShell + liquid-corona tweaks — push uniforms without rebuild.
watch(() => props.config.atmosphereOpacity, (v) => {
  if (typeof v === 'number') planet()?.atmoShell?.setOpacity(v)
})
watch(atmoTileColorMix, (v) => planet()?.atmoShell?.setParams({ tileColorMix: v }))

// Live shader-quality preset → renderer pixel ratio. `setSize` repushes the
// canvas drawing buffer dimensions so the new ratio takes effect on the
// next frame; no rebuild needed.
watch(shaderQuality, (q) => {
  if (!renderer) return
  const host = hostEl.value
  renderer.setPixelRatio(resolveShaderPixelRatio(q))
  if (host) renderer.setSize(host.clientWidth, host.clientHeight)
})

/**
 * Mirror every HexaPane dig into the shader-pane body so the smooth-sphere
 * preview tracks the same terrain. The two panes own separate `useBody`
 * instances for isolation, so the mutation has to be replayed explicitly;
 * once propagated, `repaintSmoothSphere` re-reads `sim.tileStates` and the
 * dug tiles appear as localised dips on the shader view.
 */
watch(
  () => lastDigMutation.value?.version,
  () => {
    const p = planet()
    const mutation = lastDigMutation.value
    if (!p || !mutation) return
    // `tileStates` is exposed as a ReadonlyMap — the underlying container
    // is a real Map and we need to write to it to propagate the dig.
    const states = p.sim.tileStates as Map<number, { tileId: number; elevation: number }>
    for (const [tid, elev] of mutation.elevations) {
      states.set(tid, { tileId: tid, elevation: elev })
    }
    // Smooth sphere is the only mesh currently on screen in the shader
    // pane — repainting it is enough for the dig to be visible.
    p.tiles.repaintSmoothSphere()
  },
)
</script>

<template>
  <div class="view" ref="hostEl">
    <div class="badge">SHADER · {{ type }}</div>
    <div class="fps">{{ fps }} fps</div>
  </div>
</template>
