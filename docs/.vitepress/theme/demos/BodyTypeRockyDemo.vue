<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Three.js demo — rocky planet with live shader parameter controls.
 * Uses planetMaterial.setParams() to push changes to GPU uniforms without
 * rebuilding the material.
 */

const container = ref<HTMLDivElement>()
const mounted   = ref(false)
let cleanup: (() => void) | null = null

// Terrain
const roughness   = ref(0.70)
const craterCount = ref(5)
// Fissures
const crackAmount = ref(0.50)
const crackColor  = ref('#1a0f08')
// Lave
const lavaAmount   = ref(0.0)
const lavaColor    = ref('#ff3300')
const lavaEmissive = ref(1.5)

let planetMaterial: any = null

watch(roughness,    v => planetMaterial?.setParams({ roughness: v }))
watch(craterCount,  v => planetMaterial?.setParams({ craterCount: v }))
watch(crackAmount,  v => planetMaterial?.setParams({ crackAmount: v }))
watch(crackColor,   v => planetMaterial?.setParams({ crackColor: v }))
watch(lavaAmount,   v => planetMaterial?.setParams({ lavaAmount: v }))
watch(lavaColor,    v => planetMaterial?.setParams({ lavaColor: v }))
watch(lavaEmissive, v => planetMaterial?.setParams({ lavaEmissive: v }))

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

  scene.add(new THREE.AmbientLight(0xffffff, 0.2))
  const sun = new THREE.DirectionalLight(0xffffff, 2.5)
  sun.position.set(5, 3, 3)
  scene.add(sun)

  const config = {
    type:           'rocky' as const,
    name:           'rocky-body-demo',
    radius:         1,
    temperatureMin: -60,
    temperatureMax: 80,
    rotationSpeed:  0.003,
    axialTilt:      0.3,
    hasCracks:      true,
    hasLava:        true,
  }

  const body = useBody(config, DEFAULT_TILE_SIZE)
  body.group.rotation.z = config.axialTilt
  scene.add(body.group)

  planetMaterial = (body as any).planetMaterial

  // Sync initial slider values from computed physics params
  const p = planetMaterial?.params
  if (p) {
    if (typeof p.roughness    === 'number') roughness.value    = +p.roughness.toFixed(2)
    if (typeof p.craterCount  === 'number') craterCount.value  = Math.round(p.craterCount)
    if (typeof p.crackAmount  === 'number') crackAmount.value  = +p.crackAmount.toFixed(2)
    if (typeof p.crackColor   === 'string') crackColor.value   = p.crackColor
    if (typeof p.lavaAmount   === 'number') lavaAmount.value   = +p.lavaAmount.toFixed(2)
    if (typeof p.lavaColor    === 'string') lavaColor.value    = p.lavaColor
    if (typeof p.lavaEmissive === 'number') lavaEmissive.value = +p.lavaEmissive.toFixed(2)
  }

  mounted.value = true

  let animId: number
  let last = performance.now()

  const loop = () => {
    animId    = requestAnimationFrame(loop)
    const now = performance.now()
    const dt  = (now - last) / 1000
    last      = now

    body.group.rotation.y += dt * 0.2
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
      <p class="ctrl-panel__title">Terrain</p>

      <label class="ctrl">
        <span class="ctrl__name">Rugosité</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="roughness"
            @input="roughness = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ roughness.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Nb cratères</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="9" step="1"
            :value="craterCount"
            @input="craterCount = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ craterCount }}</span>
        </div>
      </label>
    </div>

    <div class="ctrl-panel">
      <p class="ctrl-panel__title">Fissures</p>

      <label class="ctrl">
        <span class="ctrl__name">Intensité</span>
        <div class="ctrl__row">
          <input
            type="range" min="0.50" max="1.00" step="0.01"
            :value="crackAmount"
            @input="crackAmount = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ crackAmount.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl ctrl--color">
        <span class="ctrl__name">Couleur</span>
        <input
          type="color"
          :value="crackColor"
          @input="crackColor = ($event.target as HTMLInputElement).value"
        />
      </label>
    </div>

    <div class="ctrl-panel">
      <p class="ctrl-panel__title">Lave</p>

      <label class="ctrl">
        <span class="ctrl__name">Quantité</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="lavaAmount"
            @input="lavaAmount = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ lavaAmount.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Émission</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="3" step="0.01"
            :value="lavaEmissive"
            @input="lavaEmissive = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ lavaEmissive.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl ctrl--color">
        <span class="ctrl__name">Couleur</span>
        <input
          type="color"
          :value="lavaColor"
          @input="lavaColor = ($event.target as HTMLInputElement).value"
        />
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
