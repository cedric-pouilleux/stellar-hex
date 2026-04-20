<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { useBody, resolveTileHeight } from '@lib'
import type { BodyConfig, BiomeType } from '@lib'
import { getBodyResourceBridge } from '@lib'
import { installOrbitCamera, applyCamera } from '../lib/orbitCamera'
import { startRenderLoop } from '../lib/renderLoop'
import { createBodySpin } from '../lib/bodySpin'
import { attachBodyRings, detachBodyRings, mergeRingVariation } from '../lib/bodyRings'
import { attachBodyShells, type BodyShellsHandle } from '../lib/bodyAtmosphere'
import { syncRingShadowSun } from '../lib/ringShadowSunSync'
import { findDominantLightWorldPos } from '@lib'
import type { BodyRingsHandle, RingVariation } from '@lib'
import { hoverInfo, ringOverrides, type HoverInfo } from '../lib/state'
import { cloudShaderParams } from '../lib/cloudShader'
import { atmosphereShaderParams } from '../lib/atmosphereShader'

const props = defineProps<{
  config:   BodyConfig
  tileSize: number
  /** Bumping this forces a full body rebuild (type switch, seed change, rings toggle...). */
  rebuildKey: number
}>()

const hostEl    = ref<HTMLDivElement | null>(null)
const fps       = ref(0)
const tileCount = ref(0)

let renderer: THREE.WebGLRenderer | null = null
let scene:    THREE.Scene | null = null
let camera:   THREE.PerspectiveCamera | null = null
let body:     ReturnType<typeof useBody> | null = null
let rings:    BodyRingsHandle | null = null
let shells:   BodyShellsHandle | null = null
let baseRingVariation: RingVariation | null = null
let stopLoop: (() => void) | null = null
let stopCamera: (() => void) | null = null
let ro:       ResizeObserver | null = null

const raycaster = new THREE.Raycaster()
const pointer   = new THREE.Vector2()
let  pointerIn  = false

const spin = createBodySpin()

// Screen-space pointer position used to anchor the hover tooltip next to
// the cursor. Separate from `pointer` (NDC) so we don't re-derive it per frame.
const tooltipX = ref(0)
const tooltipY = ref(0)

function rebuildBody() {
  if (!scene) return
  if (body) {
    if (rings)  { detachBodyRings(body.group, rings); rings = null }
    if (shells) { shells.dispose(); shells = null }
    scene.remove(body.group)
    body.dispose?.()
    body = null
  }
  try {
    body = useBody(props.config, props.tileSize)
  } catch (e) {
    console.error('useBody failed:', e)
    return
  }
  scene.add(body.group)
  tileCount.value = (body as any).tileCount ?? 0
  // Flip the body to interactive mode so tile hover becomes available.
  body.activateInteractive?.()
  baseRingVariation = body.variation?.rings ?? null
  const merged = baseRingVariation ? mergeRingVariation(baseRingVariation, ringOverrides) : null
  rings = attachBodyRings(
    body.group,
    props.config.radius,
    props.config.rotationSpeed,
    merged,
  )
  shells = attachBodyShells(body.group, props.config)
  shells.setCloudsEnabled(cloudShaderParams.enabled)
  shells.setAtmosphereEnabled(atmosphereShaderParams.enabled)
  shells.setAtmosphereParams({
    intensity: atmosphereShaderParams.intensityOverride,
    power:     atmosphereShaderParams.powerOverride,
    color:     atmosphereShaderParams.colorOverride,
  })
}

function buildHoverInfo(tileId: number): HoverInfo | null {
  if (!body) return null
  const sim = (body as any).sim
  if (!sim) return null
  const state = sim.tileStates.get(tileId)
  if (!state) return null

  const height = resolveTileHeight(props.config, sim.seaLevelElevation, state.elevation)

  const bridge = getBodyResourceBridge()
  const res    = sim.resourceMap.get(tileId) as Map<string, number> | undefined
  const resources: HoverInfo['resources'] = []
  if (res) {
    for (const [id, amount] of res.entries()) {
      const disp = bridge?.getResourceDisplay(id)
      resources.push({ id, label: disp?.label ?? id, amount, color: disp?.color ?? 0x9aa3b0 })
    }
    resources.sort((a, b) => b.amount - a.amount)
  }

  return {
    tileId,
    biome:     state.biome ? bridge?.getBiomeLabel(state.biome as BiomeType) ?? state.biome : undefined,
    elevation: state.elevation,
    height,
    resources,
  }
}

function onPointerMove(e: PointerEvent) {
  if (!hostEl.value) return
  const r = hostEl.value.getBoundingClientRect()
  pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
  pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
  tooltipX.value = e.clientX - r.left
  tooltipY.value = e.clientY - r.top
  pointerIn = true
}
function onPointerLeave() {
  pointerIn = false
  hoverInfo.value = null
  body?.setHover?.(null)
}

onMounted(() => {
  const host = hostEl.value!
  // Two panes render in parallel — cap DPR at 1 to keep fragment cost down on
  // high-DPI screens. `antialias: true` already cleans up edges cheaply.
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(host.clientWidth, host.clientHeight)
  renderer.setClearColor(0x050608, 1)
  host.appendChild(renderer.domElement)

  scene  = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, host.clientWidth / host.clientHeight, 0.05, 400)

  scene.add(new THREE.AmbientLight(0x404857, 0.6))
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.0)
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

  renderer.domElement.addEventListener('pointermove',  onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)

  rebuildBody()

  const camTarget = new THREE.Vector3()
  const sunWorldPos = new THREE.Vector3()
  stopLoop = startRenderLoop(
    (dt) => {
      if (!renderer || !scene || !camera) return
      applyCamera(camera, camTarget)
      if (body) {
        body.tick(dt)
        spin.update(dt, body.group, props.config.rotationSpeed, props.config.axialTilt)
        rings?.tick(dt)
        shells?.tick(dt)
        if (rings && findDominantLightWorldPos(scene, sunWorldPos)) {
          syncRingShadowSun(body.group, sunWorldPos)
        }
      }

      if (pointerIn && body && camera) {
        raycaster.setFromCamera(pointer, camera)
        const id = body.queryHover?.(raycaster) ?? null
        if (id !== (hoverInfo.value?.tileId ?? null)) {
          const info = id != null ? buildHoverInfo(id) : null
          hoverInfo.value = info
          body.setHover?.(id)
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
    if (rings)  { detachBodyRings(body.group, rings); rings = null }
    if (shells) { shells.dispose(); shells = null }
    scene.remove(body.group); body.dispose?.()
  }
  renderer?.domElement.removeEventListener('pointermove',  onPointerMove)
  renderer?.domElement.removeEventListener('pointerleave', onPointerLeave)
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

// Live coverage override — patches the cloud shell uniform without rebuild.
watch(
  () => cloudShaderParams.coverageOverride,
  (v) => { if (typeof v === 'number') shells?.setCloudCoverage(v) },
)

watch(() => cloudShaderParams.enabled, (v) => shells?.setCloudsEnabled(v))

watch(() => atmosphereShaderParams.enabled, (v) => shells?.setAtmosphereEnabled(v))
watch(
  () => [
    atmosphereShaderParams.intensityOverride,
    atmosphereShaderParams.powerOverride,
    atmosphereShaderParams.colorOverride,
  ],
  () => shells?.setAtmosphereParams({
    intensity: atmosphereShaderParams.intensityOverride,
    power:     atmosphereShaderParams.powerOverride,
    color:     atmosphereShaderParams.colorOverride,
  }),
)
</script>

<script lang="ts">
function hex(n: number) { return '#' + n.toString(16).padStart(6, '0') }
</script>

<template>
  <div class="view" ref="hostEl">
    <div class="badge">HEXA · {{ config.type }} · {{ tileCount }} tiles</div>
    <div class="fps">{{ fps }} fps</div>

    <div
      v-if="hoverInfo"
      class="tile-tooltip"
      :style="{ left: `${tooltipX + 12}px`, top: `${tooltipY + 12}px` }"
    >
      <div class="row-kv">
        <span class="k">Tile</span><span class="v">#{{ hoverInfo.tileId }}</span>
      </div>
      <div class="row-kv">
        <span class="k">Biome</span><span class="v">{{ hoverInfo.biome ?? '—' }}</span>
      </div>
      <div class="row-kv">
        <span class="k">Elev.</span><span class="v">{{ hoverInfo.elevation.toFixed(3) }}</span>
      </div>
      <div class="row-kv">
        <span class="k">Height</span><span class="v">{{ hoverInfo.height.toFixed(3) }}</span>
      </div>
      <template v-if="hoverInfo.resources.length">
        <div class="tooltip-sep"></div>
        <div v-for="r in hoverInfo.resources" :key="r.id" class="resource-bar">
          <span :style="{ color: hex(r.color) }">{{ r.label }}</span>
          <div class="bar"><span :style="{ width: (r.amount * 100).toFixed(1) + '%' }"></span></div>
          <span class="amt">{{ (r.amount * 100).toFixed(0) }}%</span>
        </div>
      </template>
    </div>
  </div>
</template>
