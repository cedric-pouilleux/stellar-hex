<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Interactive hexagonal tile demo — activates the hex mesh and wires up
 * tile hover (elevation + height tooltip) via queryHover / setHover.
 * All WebGL code runs client-side only (wrapped by <ClientOnly> in Markdown).
 */

interface TileInfo {
  tileId:    number
  elevation: string
  height:    string
}

const container = ref<HTMLDivElement>()
const tooltip   = ref<TileInfo | null>(null)
const tipPos    = ref({ x: 0, y: 0 })

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

let cleanup: (() => void) | null = null

onMounted(async () => {
  const [
    THREE,
    { OrbitControls },
    { useBody, DEFAULT_TILE_SIZE, resolveTileHeight },
  ] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@cedric-pouilleux/stellexjs/core'),
  ])

  const el     = container.value!
  const width  = el.clientWidth
  const height = 400

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(0, 0, 4)

  scene.add(new THREE.AmbientLight(0x404857, 0.6))
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.5)
  sun.position.set(6, 4, 5)
  scene.add(sun)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping  = true
  controls.dampingFactor  = 0.08
  controls.minDistance    = 2
  controls.maxDistance    = 12

  const config = {
    type:                'planetary', surfaceLook: 'terrain' as const,
    name:                'demo-hex',
    radius:              1,
    rotationSpeed:       0,
    axialTilt:           0,
    reliefFlatness:       0.55,
    atmosphereThickness: 0.7,
  }

  const body = useBody(config, DEFAULT_TILE_SIZE)
  body.interactive.activate()
  scene.add(body.group)

  // Pre-compile every shader before the first render — keeps the main
  // thread responsive while the GPU driver links programs in the
  // background (uses `KHR_parallel_shader_compile` when available).
  await body.warmup(renderer, camera, {
    onProgress: (info: { label: string; progress: number }) => {
      loadingLabel.value = info.label
      loadingRatio.value = info.progress
    },
  })
  loading.value = false

  const sim         = (body as any).sim
  const raycaster   = new THREE.Raycaster()
  const pointer     = new THREE.Vector2()
  let   pointerIn   = false

  function onPointerMove(e: PointerEvent) {
    const r = el.getBoundingClientRect()
    pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
    pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
    tipPos.value = { x: e.clientX - r.left + 14, y: e.clientY - r.top + 14 }
    pointerIn = true
  }
  function onPointerLeave() {
    pointerIn       = false
    tooltip.value   = null
    body.hover.setTile(null)
  }

  renderer.domElement.addEventListener('pointermove',  onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)

  let animId: number
  let elapsed = 0

  const tick = (dt: number) => {
    elapsed += dt
    body.tick(dt)
    controls.update()

    if (pointerIn) {
      raycaster.setFromCamera(pointer, camera)
      const ref = body.interactive.queryHover(raycaster)
      body.hover.setBoardTile(ref)
      const id  = ref?.layer === 'sol' ? ref.tileId : null

      if (id != null && sim) {
        const state = sim.tileStates.get(id)
        if (state) {
          const h = resolveTileHeight(config, state.elevation)
          tooltip.value = {
            tileId:    id,
            elevation: state.elevation.toFixed(3),
            height:    h.toFixed(3),
          }
        }
      } else {
        tooltip.value = null
      }
    }

    renderer.render(scene, camera)
  }

  let last = performance.now()
  const loop = () => {
    animId  = requestAnimationFrame(loop)
    const now = performance.now()
    tick((now - last) / 1000)
    last = now
  }
  loop()

  const ro = new ResizeObserver(() => {
    const w = el.clientWidth
    renderer.setSize(w, height)
    camera.aspect = w / height
    camera.updateProjectionMatrix()
  })
  ro.observe(el)

  cleanup = () => {
    cancelAnimationFrame(animId)
    ro.disconnect()
    controls.dispose()
    renderer.domElement.removeEventListener('pointermove',  onPointerMove)
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
    renderer.dispose()
    el.removeChild(renderer.domElement)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div ref="container" class="hex-demo">
    <div v-if="loading" class="hex-loader">
      <div class="hex-loader__label">{{ loadingLabel }}</div>
      <div class="hex-loader__bar">
        <div class="hex-loader__fill" :style="{ width: (loadingRatio * 100) + '%' }" />
      </div>
    </div>
    <div
      v-if="tooltip"
      class="hex-tooltip"
      :style="{ left: tipPos.x + 'px', top: tipPos.y + 'px' }"
    >
      <div class="hex-tooltip__row">
        <span class="hex-tooltip__k">Tile</span>
        <span class="hex-tooltip__v">#{{ tooltip.tileId }}</span>
      </div>
      <div class="hex-tooltip__row">
        <span class="hex-tooltip__k">Elev.</span>
        <span class="hex-tooltip__v">{{ tooltip.elevation }}</span>
      </div>
      <div class="hex-tooltip__row">
        <span class="hex-tooltip__k">Height</span>
        <span class="hex-tooltip__v">{{ tooltip.height }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hex-demo {
  position: relative;
  width: 100%;
  height: 400px;
  background: #08080f;
  border-radius: 8px;
  overflow: hidden;
}

.hex-tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(10, 10, 20, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-family: var(--vp-font-family-mono);
  backdrop-filter: blur(6px);
  min-width: 130px;
}

.hex-tooltip__row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  line-height: 1.7;
}

.hex-tooltip__k {
  color: rgba(255, 255, 255, 0.45);
}

.hex-tooltip__v {
  color: rgba(255, 255, 255, 0.9);
  text-align: right;
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
