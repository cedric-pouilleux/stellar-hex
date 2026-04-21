<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Interactive hexagonal tile demo — activates the hex mesh and wires up
 * tile hover (biome + elevation tooltip) via queryHover / setHover.
 * All WebGL code runs client-side only (wrapped by <ClientOnly> in Markdown).
 */

interface TileInfo {
  tileId:    number
  biome:     string
  elevation: string
  height:    string
}

const container = ref<HTMLDivElement>()
const tooltip   = ref<TileInfo | null>(null)
const tipPos    = ref({ x: 0, y: 0 })

let cleanup: (() => void) | null = null

onMounted(async () => {
  const [
    THREE,
    { OrbitControls },
    { useBody, DEFAULT_TILE_SIZE, resolveTileHeight, buildAtmosphereShell, auraParamsFor },
  ] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
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
    type:                'rocky' as const,
    name:                'demo-hex',
    radius:              1,
    temperatureMin:      -20,
    temperatureMax:      35,
    rotationSpeed:       0,
    axialTilt:           0,
    atmosphereThickness: 0.7,
  }

  const body = useBody(config, DEFAULT_TILE_SIZE)
  body.activateInteractive?.()
  scene.add(body.group)

  const auraParams = auraParamsFor(config)
  const atmo = buildAtmosphereShell({
    radius:   1 + config.atmosphereThickness * 0.12,
    litBySun: true,
    color:    auraParams.color,
    intensity: auraParams.intensity,
    power:    auraParams.power,
  })
  body.group.add(atmo.mesh)

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
    body.setHover?.(null)
  }

  renderer.domElement.addEventListener('pointermove',  onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)

  let animId: number
  let elapsed = 0

  const tick = (dt: number) => {
    elapsed += dt
    body.tick(dt)
    atmo.tick(elapsed)
    controls.update()

    if (pointerIn) {
      raycaster.setFromCamera(pointer, camera)
      const id = body.queryHover?.(raycaster) ?? null
      body.setHover?.(id)

      if (id != null && sim) {
        const state = sim.tileStates.get(id)
        if (state) {
          const h = resolveTileHeight(config, sim.seaLevelElevation, state.elevation)
          tooltip.value = {
            tileId:    id,
            biome:     state.biome ?? '—',
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
        <span class="hex-tooltip__k">Biome</span>
        <span class="hex-tooltip__v">{{ tooltip.biome }}</span>
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
</style>
