<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Vanilla Three.js demo — rocky planet with atmosphere shell only (no clouds).
 * Controls are teleported into the aside portal so they appear in the right column.
 * All WebGL code runs client-side only (wrapped by <ClientOnly> in Markdown).
 */

const container = ref<HTMLDivElement>()
const mounted   = ref(false)
let cleanup: (() => void) | null = null

// Reactive control values — watchers push changes directly to shader uniforms.
const atmoIntensity = ref(0.49)
const atmoPower     = ref(4.0)
const atmoOpacity   = ref(1.0)
const atmoColor     = ref('#7799bb')

let uIntensity: { value: number }                     | null = null
let uPower:     { value: number }                     | null = null
let uOpacity:   { value: number }                     | null = null
let uColor:     { value: { set(hex: string): void } } | null = null

watch(atmoIntensity, v => { if (uIntensity) uIntensity.value = v })
watch(atmoPower,     v => { if (uPower)     uPower.value     = v })
watch(atmoOpacity,   v => { if (uOpacity)   uOpacity.value   = v })
watch(atmoColor,     v => { if (uColor)     uColor.value.set(v) })

onMounted(async () => {
  const [
    THREE,
    { useBody, DEFAULT_TILE_SIZE, buildAtmosphereShell, atmosphereRadius, auraParamsFor },
  ] = await Promise.all([
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.25))
  const sun = new THREE.DirectionalLight(0xffffff, 2.5)
  sun.position.set(5, 3, 3)
  scene.add(sun)

  const config = {
    type:                'rocky' as const,
    name:                'demo-atmo',
    radius:              1,
    temperatureMin:      -20,
    temperatureMax:      35,
    liquidCoverage:      0,
    rotationSpeed:       0.004,
    axialTilt:           0.41,
    atmosphereThickness: 0.7,
  }

  const body = useBody(config, DEFAULT_TILE_SIZE)
  body.group.rotation.z = config.axialTilt
  scene.add(body.group)

  const aura = auraParamsFor(config)
  const atmo = buildAtmosphereShell({
    radius:    atmosphereRadius(config),
    litBySun:  true,
    color:     aura.color,
    intensity: aura.intensity,
    power:     aura.power,
  })
  body.group.add(atmo.mesh)

  const mat = atmo.mesh.material as import('three').ShaderMaterial
  uIntensity = mat.uniforms.uIntensity
  uPower     = mat.uniforms.uPower
  uOpacity   = mat.uniforms.uAtmoOpacity
  uColor     = mat.uniforms.uColor
  // Sync initial control values to actual computed aura values.
  atmoIntensity.value = aura.intensity
  atmoPower.value     = aura.power
  atmoColor.value     = aura.color

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
    atmo.tick(dt)
    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    atmo.dispose()
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
      <p class="ctrl-panel__title">Atmosphere</p>

      <label class="ctrl">
        <span class="ctrl__name">Intensity</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="2" step="0.01"
            :value="atmoIntensity"
            @input="atmoIntensity = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ atmoIntensity.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Power</span>
        <div class="ctrl__row">
          <input
            type="range" min="1" max="8" step="0.1"
            :value="atmoPower"
            @input="atmoPower = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ atmoPower.toFixed(1) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Opacity</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="atmoOpacity"
            @input="atmoOpacity = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ atmoOpacity.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl ctrl--color">
        <span class="ctrl__name">Color</span>
        <input
          type="color"
          :value="atmoColor"
          @input="atmoColor = ($event.target as HTMLInputElement).value"
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
