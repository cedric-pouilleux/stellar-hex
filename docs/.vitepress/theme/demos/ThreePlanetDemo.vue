<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Vanilla Three.js demo — rocky planet with atmosphere and cloud shell.
 * Controls are teleported into the aside portal so they appear in the right column.
 * All WebGL code runs client-side only (wrapped by <ClientOnly> in Markdown).
 */

const container    = ref<HTMLDivElement>()
const showControls = ref(false)
let cleanup: (() => void) | null = null

// Reactive control values — watchers push changes directly to shader uniforms.
const cloudCoverage = ref(0.35)
const cloudSpeed    = ref(1.0)
const cloudOpacity  = ref(1.0)
const cloudColor    = ref('#ffffff')

let uCoverage: { value: number }                          | null = null
let uSpeed:    { value: number }                          | null = null
let uOpacity:  { value: number }                          | null = null
let uColor:    { value: { set(hex: string): void } }      | null = null

watch(cloudCoverage, v => { if (uCoverage) uCoverage.value = v })
watch(cloudSpeed,    v => { if (uSpeed)    uSpeed.value    = v })
watch(cloudOpacity,  v => { if (uOpacity)  uOpacity.value  = v })
watch(cloudColor,    v => { if (uColor)    uColor.value.set(v) })

onMounted(async () => {
  const [
    THREE,
    {
      useBody,
      DEFAULT_TILE_SIZE,
      buildAtmosphereShell,
      buildCloudShell,
      atmosphereRadius,
      cloudShellRadius,
      auraParamsFor,
    },
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

  // Pre-computed virtual sun position: directional light projected 1e5 units out.
  const sunVirtualPos = new THREE.Vector3()
    .copy(sun.position).normalize().multiplyScalar(1e5)

  const config = {
    type:                'rocky' as const,
    name:                'demo-earth',
    radius:              1,
    temperatureMin:      -20,
    temperatureMax:      35,
    liquidCoverage:      0.6,
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

  const atmoThick = config.atmosphereThickness ?? 0
  const liquid    = config.liquidCoverage ?? 0
  const coverage  = atmoThick >= 0.15 && liquid >= 0.10
    ? Math.min(0.75, liquid * 0.55 + atmoThick * 0.20)
    : null
  const frozen = config.temperatureMax <= 0
  const clouds = coverage != null
    ? buildCloudShell({
        radius:         cloudShellRadius(config, frozen),
        coverage,
        frozen,
        getSunWorldPos: () => sunVirtualPos,
      })
    : null

  if (clouds) {
    body.group.add(clouds.mesh)
    const mat = clouds.mesh.material as import('three').ShaderMaterial
    uCoverage = mat.uniforms.uCoverage
    uSpeed    = mat.uniforms.uCloudSpeed
    uOpacity  = mat.uniforms.uCloudOpacity
    uColor    = mat.uniforms.uCloudColor
    showControls.value = true
  }

  let animId: number
  let last = performance.now()

  const loop = () => {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const dt  = (now - last) / 1000
    last      = now

    body.group.rotation.y += dt * 0.2
    body.tick(dt)
    atmo.tick(dt)
    clouds?.tick(dt)
    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    atmo.dispose()
    clouds?.dispose()
    renderer.dispose()
    el.removeChild(renderer.domElement)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div ref="container" class="three-demo" />

  <Teleport v-if="showControls" to="#demo-controls-portal">
    <div class="ctrl-panel">
      <p class="ctrl-panel__title">Clouds</p>

      <label class="ctrl">
        <span class="ctrl__name">Coverage</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="cloudCoverage"
            @input="cloudCoverage = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ cloudCoverage.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Speed</span>
        <div class="ctrl__row">
          <input
            type="range" min="0.1" max="4" step="0.1"
            :value="cloudSpeed"
            @input="cloudSpeed = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ cloudSpeed.toFixed(1) }}</span>
        </div>
      </label>

      <label class="ctrl">
        <span class="ctrl__name">Opacity</span>
        <div class="ctrl__row">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="cloudOpacity"
            @input="cloudOpacity = +($event.target as HTMLInputElement).value"
          />
          <span class="ctrl__val">{{ cloudOpacity.toFixed(2) }}</span>
        </div>
      </label>

      <label class="ctrl ctrl--color">
        <span class="ctrl__name">Color</span>
        <input
          type="color"
          :value="cloudColor"
          @input="cloudColor = ($event.target as HTMLInputElement).value"
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
