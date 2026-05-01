<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Three.js demo — a tiny solar system: one star + three orbiting bodies.
 * Showcases caller-driven orbits (the lib has no orbital mechanics) and
 * shared lighting via a single point light at the star's position.
 */

const container = ref<HTMLDivElement>()

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

let cleanup: (() => void) | null = null

onMounted(async () => {
  const [THREE, ctrl, lib] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@cedric-pouilleux/stellar-hex/core'),
  ])
  const { OrbitControls } = ctrl
  const { useBody, DEFAULT_TILE_SIZE } = lib

  const el     = container.value!
  const width  = el.clientWidth
  const height = 420

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200)
  camera.position.set(0, 9, 18)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true

  // Single source of truth for the system's lighting: the same PointLight
  // instance illuminates the molten core add-on AND drives the per-body
  // shader light direction (passed via `sunLight` to each `useBody`).
  const sun = new THREE.PointLight(0xfff1cc, 4.5, 0, 0)
  sun.position.set(0, 0, 0)
  scene.add(sun)

  const star = useBody({
    type:           'star',
    name:           'system-sun',
    radius:          1.2,
    spectralType:   'G',
    rotationSpeed:   0.003,
    axialTilt:       0,
  }, DEFAULT_TILE_SIZE)
  scene.add(star.group)

  const planets = [
    {
      body: useBody({
        type:                'planetary', surfaceLook: 'terrain' as const,
        name:                'rocky-1',
        radius:               0.45,
        rotationSpeed:        0.02,
        axialTilt:            0.4,
        reliefFlatness:       0.55,
        atmosphereThickness:  0.5,
        liquidState:         'liquid' as const,
        liquidColor:         '#1d4d8c',
      }, DEFAULT_TILE_SIZE, { sunLight: sun }),
      orbitRadius: 4.5,
      orbitSpeed:  0.30,
      phase:       0,
    },
    {
      body: useBody({
        type:           'planetary', surfaceLook: 'metallic' as const,
        name:           'metal-2',
        radius:          0.6,
        rotationSpeed:   0.012,
        axialTilt:       0.2,
        reliefFlatness:  0.55,
      }, DEFAULT_TILE_SIZE, { sunLight: sun }),
      orbitRadius: 7.0,
      orbitSpeed:  0.18,
      phase:       1.5,
    },
    {
      body: useBody({
        type:           'planetary', surfaceLook: 'bands' as const,
        name:           'jovian-3',
        radius:          1.0,
        rotationSpeed:   0.005,
        axialTilt:       0.05,
        hasRings:        true,
      }, DEFAULT_TILE_SIZE, { sunLight: sun }),
      orbitRadius: 11.0,
      orbitSpeed:  0.10,
      phase:       3.2,
    },
  ]
  planets.forEach(p => scene.add(p.body.group))

  // Warm up every body in parallel — `KHR_parallel_shader_compile` lets the
  // GPU driver link all programs concurrently. Aggregate progress is the
  // average of the latest per-body ratios.
  const allBodies = [star, ...planets.map(p => p.body)]
  const ratios: number[] = allBodies.map(() => 0)
  await Promise.all(allBodies.map((b, i) =>
    b.warmup(renderer, camera, {
      onProgress: (info: { label: string; progress: number }) => {
        ratios[i] = info.progress
        loadingLabel.value = info.label
        loadingRatio.value = ratios.reduce((s, x) => s + x, 0) / ratios.length
      },
    })
  ))
  loading.value = false

  let animId: number
  let last    = performance.now()
  let elapsed = 0

  const loop = () => {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const dt  = (now - last) / 1000
    last = now
    elapsed += dt

    star.tick(dt)
    for (const p of planets) {
      const angle = p.phase + elapsed * p.orbitSpeed
      p.body.group.position.set(
        Math.cos(angle) * p.orbitRadius,
        0,
        Math.sin(angle) * p.orbitRadius,
      )
      // Tick after the orbital placement so the planet→sun direction
      // computed inside `tick()` reads the up-to-date world position.
      p.body.tick(dt)
    }
    orbit.update()
    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    star.dispose()
    planets.forEach(p => p.body.dispose())
    orbit.dispose()
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
.three-demo { position: relative; width: 100%; height: 420px; }

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
