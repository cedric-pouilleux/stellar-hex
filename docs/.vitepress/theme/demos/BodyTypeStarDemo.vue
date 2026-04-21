<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Three.js demo — star with live shader parameter controls.
 * Temperature drives the blackbody color (kelvin → RGB). All surface
 * effects (granulation, corona, pulsation) are uniform-driven.
 */

const container = ref<HTMLDivElement>()
const mounted   = ref(false)
let cleanup: (() => void) | null = null

// Base
const temperature = ref(5778)
const animSpeed   = ref(1.0)
// Granulation
const convectionScale      = ref(1.5)
const granulationContrast  = ref(0.65)
const cloudAmount          = ref(0.55)
// Effets
const coronaSize = ref(0.15)
const pulsation  = ref(0.30)

let planetMaterial: any = null

watch(temperature,          v => planetMaterial?.setParams({ temperature: v }))
watch(animSpeed,            v => planetMaterial?.setParams({ animSpeed: v }))
watch(convectionScale,      v => planetMaterial?.setParams({ convectionScale: v }))
watch(granulationContrast,  v => planetMaterial?.setParams({ granulationContrast: v }))
watch(cloudAmount,          v => planetMaterial?.setParams({ cloudAmount: v }))
watch(coronaSize,           v => planetMaterial?.setParams({ coronaSize: v }))
watch(pulsation,            v => planetMaterial?.setParams({ pulsation: v }))

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
  camera.position.set(0, 0, 4)

  scene.add(new THREE.AmbientLight(0xffffff, 0.05))

  const config = {
    type:           'star' as const,
    name:           'star-body-demo',
    radius:         1,
    temperatureMin: 5000,
    temperatureMax: 5778,
    spectralType:   'G' as const,
    rotationSpeed:  0.002,
    axialTilt:      0,
  }

  const body = useBody(config, DEFAULT_TILE_SIZE)
  scene.add(body.group)

  planetMaterial = (body as any).planetMaterial

  // Sync initial slider values from computed physics params
  const p = planetMaterial?.params
  if (p) {
    if (typeof p.temperature         === 'number') temperature.value         = Math.round(p.temperature)
    if (typeof p.animSpeed           === 'number') animSpeed.value           = +p.animSpeed.toFixed(2)
    if (typeof p.convectionScale     === 'number') convectionScale.value     = +p.convectionScale.toFixed(2)
    if (typeof p.granulationContrast === 'number') granulationContrast.value = +p.granulationContrast.toFixed(2)
    if (typeof p.cloudAmount         === 'number') cloudAmount.value         = +p.cloudAmount.toFixed(2)
    if (typeof p.coronaSize          === 'number') coronaSize.value          = +p.coronaSize.toFixed(2)
    if (typeof p.pulsation           === 'number') pulsation.value           = +p.pulsation.toFixed(2)
  }

  mounted.value = true

  let animId: number
  let last = performance.now()

  const loop = () => {
    animId    = requestAnimationFrame(loop)
    const now = performance.now()
    const dt  = (now - last) / 1000
    last      = now

    body.group.rotation.y += dt * 0.1
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
      <p class="ctrl-panel__title">Base</p>

      <label class="ctrl">
        <span class="ctrl__name">Température (K)</span>
        <div class="ctrl__row">
          <input
            type="range" min="2500" max="40000" step="100"
            :value="temperature"
            @input="temperature = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ temperature.toLocaleString() }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Vitesse</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="3" step="0.01"
            :value="animSpeed"
            @input="animSpeed = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ animSpeed.toFixed(2) }}</span>
        </div>
      </label>
    </div>

    <div class="ctrl-panel">
      <p class="ctrl-panel__title">Granulation</p>

      <label class="ctrl">
        <span class="ctrl__name">Échelle</span>
        <div class="ctrl__row">
          <input
            type="range" min="0.05" max="4" step="0.05"
            :value="convectionScale"
            @input="convectionScale = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ convectionScale.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Contraste</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="granulationContrast"
            @input="granulationContrast = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ granulationContrast.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Couche nuageuse</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="cloudAmount"
            @input="cloudAmount = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ cloudAmount.toFixed(2) }}</span>
        </div>
      </label>
    </div>

    <div class="ctrl-panel">
      <p class="ctrl-panel__title">Effets</p>

      <label class="ctrl">
        <span class="ctrl__name">Corona</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="0.5" step="0.01"
            :value="coronaSize"
            @input="coronaSize = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ coronaSize.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Pulsation</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="pulsation"
            @input="pulsation = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ pulsation.toFixed(2) }}</span>
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
