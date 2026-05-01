<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Three.js demo — G-class star (Sun-like). Temperature drives the
 * blackbody colour; granulation, corona and pulsation come for free.
 * Drag to rotate, scroll to zoom.
 */

const container = ref<HTMLDivElement>()

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

let cleanup: (() => void) | null = null

onMounted(async () => {
  const [THREE, { OrbitControls }, { useBody, DEFAULT_TILE_SIZE }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@cedric-pouilleux/stellex-js/core'),
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

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.autoRotate = true
  orbit.autoRotateSpeed = 0.4
  orbit.minDistance = 2
  orbit.maxDistance = 10

  const body = useBody({
    type:           'star',
    name:           'star-body-demo',
    radius:          1,
    spectralType:   'G',
    rotationSpeed:   0,
    axialTilt:       0,
  }, DEFAULT_TILE_SIZE)
  scene.add(body.group)

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
    const dt  = (now - last) / 1000
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
  <div ref="container" class="three-demo">
    <div v-if="loading" class="hex-loader">
      <div class="hex-loader__label">{{ loadingLabel }}</div>
      <div class="hex-loader__bar">
        <div class="hex-loader__fill" :style="{ width: (loadingRatio * 100) + '%' }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.three-demo { position: relative; width: 100%; height: 400px; }

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
