<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Three.js demo — gas giant with live shader parameter controls.
 * Band structure, turbulence and cloud layer are fully driven by GPU uniforms
 * and can be updated without rebuilding the material.
 */

const container = ref<HTMLDivElement>()
const mounted   = ref(false)
let cleanup: (() => void) | null = null

// Bandes
const bandCount      = ref(8)
const bandSharpness  = ref(0.30)
const turbulence     = ref(0.50)
const jetStream      = ref(0.40)
// Nuages
const cloudAmount = ref(0.0)
const cloudColor  = ref('#e8eaf0')
// Animation
const animSpeed = ref(0.30)

let planetMaterial: any = null

watch(bandCount,     v => planetMaterial?.setParams({ bandCount: v }))
watch(bandSharpness, v => planetMaterial?.setParams({ bandSharpness: v }))
watch(turbulence,    v => planetMaterial?.setParams({ turbulence: v }))
watch(jetStream,     v => planetMaterial?.setParams({ jetStream: v }))
watch(cloudAmount,   v => planetMaterial?.setParams({ cloudAmount: v }))
watch(cloudColor,    v => planetMaterial?.setParams({ cloudColor: v }))
watch(animSpeed,     v => planetMaterial?.setParams({ animSpeed: v }))

onMounted(async () => {
  const [THREE, { useBody, DEFAULT_TILE_SIZE }] = await Promise.all([
    import('three'),
    import('@cedric-pouilleux/stellar-hex/core'),
  ])

  const el     = container.value!
  const width  = el.clientWidth
  const height = 400

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
  camera.position.set(0, 0, 3.5)

  scene.add(new THREE.AmbientLight(0xffffff, 0.15))
  const sun = new THREE.DirectionalLight(0xffffff, 2.0)
  sun.position.set(5, 2, 3)
  scene.add(sun)

  const config = {
    type:           'gaseous' as const,
    name:           'gas-body-demo',
    radius:         1,
    temperatureMin: 90,
    temperatureMax: 130,
    rotationSpeed:  0.004,
    axialTilt:      0.05,
  }

  const body = useBody(config, DEFAULT_TILE_SIZE)
  body.group.rotation.z = config.axialTilt
  scene.add(body.group)

  planetMaterial = (body as any).planetMaterial

  // Sync initial slider values from computed physics params
  const p = planetMaterial?.params
  if (p) {
    if (typeof p.bandCount     === 'number') bandCount.value     = Math.round(p.bandCount)
    if (typeof p.bandSharpness === 'number') bandSharpness.value = +p.bandSharpness.toFixed(2)
    if (typeof p.turbulence    === 'number') turbulence.value    = +p.turbulence.toFixed(2)
    if (typeof p.jetStream     === 'number') jetStream.value     = +p.jetStream.toFixed(2)
    if (typeof p.cloudAmount   === 'number') cloudAmount.value   = +p.cloudAmount.toFixed(2)
    if (typeof p.cloudColor    === 'string') cloudColor.value    = p.cloudColor
    if (typeof p.animSpeed     === 'number') animSpeed.value     = +p.animSpeed.toFixed(2)
  }

  mounted.value = true

  let animId: number
  let last = performance.now()

  const loop = () => {
    animId    = requestAnimationFrame(loop)
    const now = performance.now()
    const dt  = (now - last) / 1000
    last      = now

    body.group.rotation.y += dt * 0.15
    body.tick(dt)
    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    renderer.dispose()
    el.removeChild(renderer.domElement)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div ref="container" class="three-demo" />

  <Teleport v-if="mounted" to="#demo-controls-portal">
    <div class="ctrl-panel">
      <p class="ctrl-panel__title">Bandes</p>

      <label class="ctrl">
        <span class="ctrl__name">Nombre de bandes</span>
        <div class="ctrl__row">
          <input
            type="range" min="2" max="24" step="1"
            :value="bandCount"
            @input="bandCount = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ bandCount }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Netteté</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="bandSharpness"
            @input="bandSharpness = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ bandSharpness.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Turbulence</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="turbulence"
            @input="turbulence = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ turbulence.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Courants-jets</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="jetStream"
            @input="jetStream = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ jetStream.toFixed(2) }}</span>
        </div>
      </label>
    </div>

    <div class="ctrl-panel">
      <p class="ctrl-panel__title">Nuages</p>

      <label class="ctrl">
        <span class="ctrl__name">Couverture</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="cloudAmount"
            @input="cloudAmount = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ cloudAmount.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl ctrl--color">
        <span class="ctrl__name">Couleur</span>
        <input
          type="color"
          :value="cloudColor"
          @input="cloudColor = ($event.target as HTMLInputElement).value"
        />
      </label>
    </div>

    <div class="ctrl-panel">
      <p class="ctrl-panel__title">Animation</p>

      <label class="ctrl">
        <span class="ctrl__name">Vitesse</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="2" step="0.01"
            :value="animSpeed"
            @input="animSpeed = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ animSpeed.toFixed(2) }}</span>
        </div>
      </label>
    </div>
  </Teleport>
</template>

<style scoped>
.three-demo {
  width: 100%;
  height: 400px;
}
</style>
