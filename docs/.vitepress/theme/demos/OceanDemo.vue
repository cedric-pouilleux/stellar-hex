<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import BodyViewBar, { type ViewMode } from './BodyViewBar.vue'
import { setBodyCoreVisible } from './bodyCoreVisibility'
import { paintAtmoSample }    from './paintAtmoSample'

/**
 * Three.js demo — rocky planet with a 60% water ocean coverage.
 * View toggle: Shader / Sol / Atmosphère.
 *
 * Hover behaviour: the lib's `hoverCursor` config wires a unified ring +
 * emissive point light. On liquid hovers a seabed-twin floor ring is
 * also drawn (auto-dimmed to opacity 0.20, tinted red on core-window
 * tiles); the emissive point light is muted on sol hovers so the
 * playable terrain stays flat-lit.
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
  camera.position.set(0, 0.6, 4.6)

  scene.add(new THREE.AmbientLight(0xffffff, 0.25))
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.5)
  sun.position.set(5, 3, 4)
  scene.add(sun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.autoRotate = true
  orbit.autoRotateSpeed = 0.6
  orbit.minDistance = 2.2
  orbit.maxDistance = 10

  const body = useBody({
    type:                'planetary', surfaceLook: 'terrain',
    name:                'ocean-demo',
    radius:               1.4,
    rotationSpeed:        0,
    axialTilt:            0.3,
    reliefFlatness:       0.55,
    atmosphereThickness:  0.25,
    liquidState:         'liquid',
    liquidCoverage:       0.6,
    liquidColor:         '#175da1',
  }, DEFAULT_TILE_SIZE, {
    hoverCursor: {
      ring:     { color: 0xffffff },
      emissive: { color: 0xffffff, intensity: 1.5, size: 0.6 },
    },
  })
  scene.add(body.group)
  setBodyCoreVisible(body, false)
  paintAtmoSample(body)

  // ── Hover dispatch (lib's queryHover handles sol/liquid/atmo) ──
  const raycaster = new THREE.Raycaster()
  const pointer   = new THREE.Vector2()
  let pointerSet  = false

  const onPointerMove = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect()
    pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
    pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
    pointerSet = true
  }
  renderer.domElement.addEventListener('pointermove', onPointerMove)

  applyMode = (m) => {
    if (m === 'shader') { body.view.set('shader'); body.interactive.deactivate(); setBodyCoreVisible(body, false) }
    else {
      body.interactive.activate()
      body.view.set(m === 'atmo' ? 'atmosphere' : 'surface')
      setBodyCoreVisible(body, true)
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
    if (pointerSet && mode.value !== 'shader') {
      raycaster.setFromCamera(pointer, camera)
      body.hover.setBoardTile(body.interactive.queryHover(raycaster))
    }
    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
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
    <BodyViewBar :body-type="'rocky'" v-model:mode="mode" />
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
