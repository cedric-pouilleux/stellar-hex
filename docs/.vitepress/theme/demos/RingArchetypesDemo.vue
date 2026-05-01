<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Three.js demo — four side-by-side gas giants showcasing distinct
 * ring archetypes. Each canvas mounts its own scene to keep the
 * demo self-contained and disposable.
 */

interface ArchetypeSpec {
  name:       string
  archetype:  'broad' | 'shepherd' | 'dusty' | 'double'
}

const specs: ArchetypeSpec[] = [
  { name: 'jovian-broad',  archetype: 'broad'    },
  { name: 'uranian-thin',  archetype: 'shepherd' },
  { name: 'dusty-halo',    archetype: 'dusty'    },
  { name: 'double-bands',  archetype: 'double'   },
]

const containers = ref<HTMLDivElement[]>([])

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

let cleanups: Array<() => void> = []

onMounted(async () => {
  const [THREE, lib] = await Promise.all([
    import('three'),
    import('@cedric-pouilleux/stellar-hex/core'),
  ])
  const { useBody, DEFAULT_TILE_SIZE, buildBodyRings, ARCHETYPE_PROFILES } = lib

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

    const width  = el.clientWidth
    const height = el.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 1.2, 6)
    camera.lookAt(0, 0, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 0.3))
    const sun = new THREE.DirectionalLight(0xffffff, 2.0)
    sun.position.set(4, 3, 4)
    scene.add(sun)

    const config = {
      type:           'planetary', surfaceLook: 'bands' as const,
      name:           spec.name,
      radius:          1.2,
      rotationSpeed:   0.002,
      axialTilt:       0.15,
      hasRings:        true,
    }

    const body = useBody(config, DEFAULT_TILE_SIZE)
    scene.add(body.group)

    const baseVariation = body.variation.rings
    if (baseVariation) {
      const planetWorldPos = new THREE.Vector3()
      const rings = buildBodyRings({
        radius:        config.radius,
        rotationSpeed: config.rotationSpeed,
        variation: {
          ...baseVariation,
          archetype: spec.archetype,
          profile:   ARCHETYPE_PROFILES[spec.archetype],
        },
        planetWorldPos,
        sunLight:      sun,
      })
      body.group.add(rings.carrier)

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
          body.group.getWorldPosition(planetWorldPos)
          rings.tick(dt)
          renderer.render(scene, camera)
        }
        loop()

        cleanups.push(() => {
          cancelAnimationFrame(animId)
          body.group.remove(rings.carrier)
          rings.dispose()
          body.dispose()
          renderer.dispose()
          el.removeChild(renderer.domElement)
        })
      }

      cells.push({ body, renderer, camera, startLoop })
    }
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
  <div class="rings-grid">
    <div
      v-for="(spec, i) in specs"
      :key="spec.name"
      class="rings-cell"
    >
      <div :ref="(el) => { if (el) containers[i] = el as HTMLDivElement }" class="rings-canvas" />
      <p class="rings-label">{{ spec.archetype }}</p>
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
.rings-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 1px;
  background: var(--vp-c-divider);
  height: 400px;
}
.rings-cell {
  position: relative;
  background: #08080f;
}
.rings-canvas {
  width: 100%;
  height: 100%;
}
.rings-label {
  position: absolute;
  bottom: 0.5rem;
  left: 0.75rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: rgba(255,255,255,0.6);
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
