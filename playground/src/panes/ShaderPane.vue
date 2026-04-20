<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { useBody, type LibBodyType, type BodyConfig } from '@lib'
import type { ParamMap } from '../lib/state'
import { installOrbitCamera, applyCamera } from '../lib/orbitCamera'
import { startRenderLoop } from '../lib/renderLoop'
import { createBodySpin } from '../lib/bodySpin'
import { attachBodyRings, detachBodyRings, mergeRingVariation } from '../lib/bodyRings'
import { attachBodyShells, type BodyShellsHandle } from '../lib/bodyAtmosphere'
import { syncRingShadowSun } from '../lib/ringShadowSunSync'
import { findDominantLightWorldPos } from '@lib'
import type { BodyRingsHandle, RingVariation } from '@lib'
import { ringOverrides } from '../lib/state'
import { cloudShaderParams } from '../lib/cloudShader'
import { atmosphereShaderParams } from '../lib/atmosphereShader'

const props = defineProps<{
  type:     LibBodyType
  params:   ParamMap
  config:   BodyConfig
  tileSize: number
  /** Bumped when a structural change (type switch, seed, rings...) forces a rebuild. */
  rebuildKey: number
}>()

const hostEl = ref<HTMLDivElement | null>(null)
const fps    = ref(0)

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

const spin = createBodySpin()

// Apply user shader overrides to the current smooth-sphere material.
// Uses `planetMaterial.setParams`, which is a live-update path (no rebuild).
function applyShaderOverrides() {
  const pm = (body as any)?.planetMaterial
  pm?.setParams?.({ ...props.params })
}

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
    console.error('[ShaderPane] useBody failed:', e)
    return
  }
  // Intentionally do NOT activate interactive mode — we only want the
  // smooth-sphere display mesh so the shader is visible full-surface
  // (vertex-color blended with biome palette, oceans included).
  scene.add(body.group)
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
  applyShaderOverrides()
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

// Live-update shader params without rebuilding the body.
watch(
  () => ({ ...props.params }),
  () => applyShaderOverrides(),
  { deep: true },
)
</script>

<template>
  <div class="view" ref="hostEl">
    <div class="badge">SHADER · {{ type }}</div>
    <div class="fps">{{ fps }} fps</div>
  </div>
</template>
