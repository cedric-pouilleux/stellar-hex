<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Three.js demo — four bodies along a temperature axis. Each cell shows
 * how the lib's default palette anchors and atmospheric tint shift with
 * temperature without any other config change.
 */

interface TempSpec {
  name:        string
  label:       string
  /** Caller-derived palette anchors � the lib reads these directly. */
  colorLow:    string
  colorHigh:   string
  liquidState: 'liquid' | 'frozen'
}

// Caller-side temperature → palette mapping. The lib is climate-agnostic;
// each demo cell pre-resolves its own `terrainColorLow/High` from its
// thermal class and pushes the result into `BodyConfig`.
const specs: TempSpec[] = [
  { name: 't-glacial', label: '−110 °C glaciaire', colorLow: '#404a58', colorHigh: '#d8e4f0', liquidState: 'frozen' },
  { name: 't-cold',    label: '−20 °C froid',      colorLow: '#3a3a40', colorHigh: '#aab0bc', liquidState: 'liquid' },
  { name: 't-temp',    label: '+25 °C tempéré',    colorLow: '#2c2820', colorHigh: '#8a8270', liquidState: 'liquid' },
  { name: 't-hot',     label: '+200 °C torride',   colorLow: '#3a1808', colorHigh: '#c08040', liquidState: 'liquid' },
]

const containers = ref<HTMLDivElement[]>([])

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

let cleanups: Array<() => void> = []

onMounted(async () => {
  const [THREE, { useBody, DEFAULT_TILE_SIZE }] = await Promise.all([
    import('three'),
    import('@cedric-pouilleux/stellex-js/core'),
  ])

  type Cell = {
    body:     ReturnType<typeof useBody>
    renderer: InstanceType<typeof THREE.WebGLRenderer>
    camera:   InstanceType<typeof THREE.PerspectiveCamera>
    startLoop: () => void
  }

  const cells: Cell[] = []

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]
    const el   = containers.value[i]
    if (!el) continue

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 100)
    camera.position.set(0, 0, 4.4)

    scene.add(new THREE.AmbientLight(0xffffff, 0.3))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(4, 3, 5)
    scene.add(sun)

    const body = useBody({
      type:                'planetary', surfaceLook: 'terrain',
      name:                spec.name,
      radius:               1.4,
      rotationSpeed:        0.005,
      axialTilt:            0.3,
      reliefFlatness:       0.55,
      // Sol band ~80 % of the silhouette, atmosphere ~20 %.
      atmosphereThickness:  0.2,
      liquidState:          spec.liquidState,
      liquidColor:         '#1d4d8c',
      terrainColorLow:     spec.colorLow,
      terrainColorHigh:    spec.colorHigh,
    }, DEFAULT_TILE_SIZE)
    scene.add(body.group)

    const startLoop = () => {
      let animId: number
      let last = performance.now()
      const loop = () => {
        animId = requestAnimationFrame(loop)
        const now = performance.now()
        const dt  = (now - last) / 1000
        last = now
        body.group.rotation.y += dt * 0.3
        body.tick(dt)
        renderer.render(scene, camera)
      }
      loop()

      cleanups.push(() => {
        cancelAnimationFrame(animId)
        body.dispose()
        renderer.dispose()
        el.removeChild(renderer.domElement)
      })
    }

    cells.push({ body, renderer, camera, startLoop })
  }

  // Pre-compile every cell's shaders in parallel — `KHR_parallel_shader_compile`
  // links all programs concurrently. Aggregate progress is the average of the
  // latest per-cell ratios.
  const ratios: number[] = cells.map(() => 0)
  await Promise.all(cells.map((c, i) =>
    c.body.warmup(c.renderer, c.camera, {
      onProgress: (info: { label: string; progress: number }) => {
        ratios[i] = info.progress
        loadingLabel.value = info.label
        loadingRatio.value = ratios.reduce((s, x) => s + x, 0) / ratios.length
      },
    })
  ))
  loading.value = false

  cells.forEach(c => c.startLoop())
})

onBeforeUnmount(() => {
  cleanups.forEach(c => c())
  cleanups = []
})
</script>

<template>
  <div class="temp-grid">
    <div v-for="(spec, i) in specs" :key="spec.name" class="temp-cell">
      <div :ref="(el) => { if (el) containers[i] = el as HTMLDivElement }" class="temp-canvas" />
      <p class="temp-label">{{ spec.label }}</p>
    </div>
    <div v-if="loading" class="hex-loader">
      <div class="hex-loader__label">{{ loadingLabel }}</div>
      <div class="hex-loader__bar">
        <div class="hex-loader__fill" :style="{ width: (loadingRatio * 100) + '%' }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.temp-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 1px;
  background: var(--vp-c-divider);
  height: 400px;
}
.temp-cell {
  position: relative;
  background: #08080f;
}
.temp-canvas { width: 100%; height: 100%; }
.temp-label {
  position: absolute;
  bottom: 0.5rem;
  left: 0.75rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  color: rgba(255,255,255,0.65);
  margin: 0;
}

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
