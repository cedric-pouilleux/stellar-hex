<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import BodyViewBar, { type ViewMode } from './BodyViewBar.vue'
import { setBodyCoreVisible } from './bodyCoreVisibility'
import { paintAtmoSample }    from './paintAtmoSample'

/**
 * Three.js demo — gas giant with banded atmosphere, jet streams and
 * procedural rings. View toggle: Shader / Atmosphère.
 */

const container = ref<HTMLDivElement>()
const mode      = ref<ViewMode>('shader')

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

let applyMode: ((m: ViewMode) => void) | null = null
let cleanup:   (() => void) | null = null

watch(mode, m => applyMode?.(m))

onMounted(async () => {
  const [THREE, { OrbitControls }, { useBody, DEFAULT_TILE_SIZE }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@cedric-pouilleux/stellex-js/core'),
  ])

  const el = container.value!
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(el.clientWidth, 400)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, el.clientWidth / 400, 0.1, 100)
  camera.position.set(0, 0.6, 3.5)

  scene.add(new THREE.AmbientLight(0xffffff, 0.15))
  const sun = new THREE.DirectionalLight(0xffffff, 2.0)
  sun.position.set(5, 2, 3)
  scene.add(sun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.autoRotate = true
  orbit.autoRotateSpeed = 0.5
  orbit.minDistance = 1.6
  orbit.maxDistance = 8

  const body = useBody({
    type:           'planetary', surfaceLook: 'bands',
    name:           'gas-body-demo',
    radius:          1,
    rotationSpeed:   0,
    axialTilt:       0.05,
    hasRings:        true,
    // Explicit radial partition: ~20 % core, ~30 % sol band, ~50 % atmo.
    // The sol band is what visually hides the inner core when no tile
    // has been mined down — without it the core sphere shows through
    // the atmo backdrop on the gas giant.
    coreRadiusRatio:     0.2,
    atmosphereThickness: 0.5,
  }, DEFAULT_TILE_SIZE)
  scene.add(body.group)
  setBodyCoreVisible(body, false)
  paintAtmoSample(body)

  applyMode = (m) => {
    if (m === 'shader') { body.view.set('shader'); body.interactive.deactivate(); setBodyCoreVisible(body, false) }
    else {
      body.interactive.activate()
      body.view.set(m === 'atmo' ? 'atmosphere' : 'surface')
      // `sol` view exposes the inner core through the playable hex
      // shell — useful here to visualise the rocky core sitting under
      // the gas envelope. Atmo view hides it again.
      setBodyCoreVisible(body, m === 'sol')
    }
  }

  await body.warmup(renderer, camera, {
    onProgress: (info: { label: string; progress: number }) => {
      loadingLabel.value = info.label
      loadingRatio.value = info.progress
    },
  })
  loading.value = false

  let animId: number
  let last = performance.now()
  const loop = () => {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const dt = (now - last) / 1000
    last = now
    orbit.update()
    body.tick(dt)
    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    orbit.dispose()
    body.dispose()
    renderer.dispose()
    el.removeChild(renderer.domElement)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div class="demo-wrap">
    <div ref="container" class="demo-canvas">
      <div v-if="loading" class="hex-loader">
        <div class="hex-loader__label">{{ loadingLabel }}</div>
        <div class="hex-loader__bar">
          <div class="hex-loader__fill" :style="{ width: (loadingRatio * 100) + '%' }" />
        </div>
      </div>
    </div>
    <BodyViewBar :body-type="'gaseous'" v-model:mode="mode" />
  </div>
</template>

<style scoped>
.demo-wrap   { width: 100%; }
.demo-canvas { position: relative; width: 100%; height: 400px; }

.hex-loader {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: rgba(8, 8, 15, 0.65);
  backdrop-filter: blur(2px);
  z-index: 2;
}

.hex-loader__label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.04em;
}

.hex-loader__bar {
  width: 220px;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.hex-loader__fill {
  height: 100%;
  background: linear-gradient(90deg, #4ea3ff, #a78bff);
  transition: width 120ms ease-out;
}
</style>
