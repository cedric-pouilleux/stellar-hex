<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Three.js demo — playable atmosphere band.
 *
 * Mounts a rocky body in interactive hex mode + atmosphere view: the
 * sol prisms are hidden and the demo renders the *atmo band* of the
 * LayeredInteractiveMesh instead. Each hex on screen is a tile of the
 * atmospheric shell — hover to inspect, click to "pollute" (paint).
 *
 * Switch back to the surface view to see the relief; both share the
 * same tile ids, so a paint applied here keeps its identity across
 * views.
 */

interface TileInfo { id: number, elevation: number }

const container  = ref<HTMLDivElement>()
const tooltip    = ref<TileInfo | null>(null)
const tipPos     = ref({ x: 0, y: 0 })
const view       = ref<'sol' | 'atmo'>('atmo')

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

let setView: ((v: 'sol' | 'atmo') => void) | null = null
let cleanup: (() => void) | null = null

import { watch } from 'vue'
watch(view, v => setView?.(v))

onMounted(async () => {
  const [
    THREE,
    { OrbitControls },
    lib,
  ] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@cedric-pouilleux/stellar-hex/core'),
  ])
  const { useBody, DEFAULT_TILE_SIZE } = lib

  const el     = container.value!
  const width  = el.clientWidth
  const height = 460

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
  camera.position.set(0, 0.4, 3.5)

  scene.add(new THREE.AmbientLight(0xffffff, 0.35))
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.0)
  sun.position.set(5, 3, 4)
  scene.add(sun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.autoRotate = true
  orbit.autoRotateSpeed = 0.4
  orbit.minDistance = 1.6
  orbit.maxDistance = 8

  const body = useBody({
    type:                'planetary', surfaceLook: 'terrain',
    name:                'atmo-playable',
    radius:               1,
    rotationSpeed:        0,
    axialTilt:            0.3,
    reliefFlatness:       0.55,
    atmosphereThickness:  0.7,
    liquidState:         'liquid',
    liquidColor:         '#175da1',
  }, DEFAULT_TILE_SIZE)
  scene.add(body.group)

  // Initial climate-band overlay so the atmo grid reads as differentiated
  // tiles right away — the click-to-pollute action overwrites cells on top.
  const { paintAtmoSample } = await import('./paintAtmoSample')
  paintAtmoSample(body)

  body.interactive.activate()
  body.view.set('atmosphere')

  setView = (v) => {
    body.view.set(v === 'atmo' ? 'atmosphere' : 'surface')
  }

  // Hover & paint atmo tiles.
  const raycaster = new THREE.Raycaster()
  const pointer   = new THREE.Vector2()
  let pointerIn   = false
  const TINT      = { r: 0.95, g: 0.45, b: 0.85 }

  function onPointerMove(e: PointerEvent) {
    const r = el.getBoundingClientRect()
    pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
    pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
    tipPos.value = { x: e.clientX - r.left + 14, y: e.clientY - r.top + 14 }
    pointerIn = true
  }
  function onPointerLeave() {
    pointerIn = false
    tooltip.value = null
    body.hover.setTile(null)
  }
  function onClick() {
    raycaster.setFromCamera(pointer, camera)
    const ref = body.interactive.queryHover(raycaster)
    if (ref?.layer === 'atmo' && body.tiles.atmo) {
      body.tiles.atmo.applyOverlay(new Map([[ref.tileId, TINT]]))
    }
  }
  renderer.domElement.addEventListener('pointermove',  onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)
  renderer.domElement.addEventListener('click',        onClick)

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

    if (pointerIn) {
      raycaster.setFromCamera(pointer, camera)
      const ref = body.interactive.queryHover(raycaster)
      body.hover.setBoardTile(ref)
      if (ref != null) {
        const id    = ref.tileId
        const state = ref.layer === 'sol' ? body.sim.tileStates.get(id) : null
        if (state) tooltip.value = { id, elevation: state.elevation }
      } else {
        tooltip.value = null
      }
    } else {
      tooltip.value = null
    }

    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    renderer.domElement.removeEventListener('pointermove',  onPointerMove)
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
    renderer.domElement.removeEventListener('click',        onClick)
    orbit.dispose()
    body.dispose()
    renderer.dispose()
    el.removeChild(renderer.domElement)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div class="atmo-demo">
    <div ref="container" class="atmo-canvas">
      <div v-if="loading" class="hex-loader">
        <div class="hex-loader__label">{{ loadingLabel }}</div>
        <div class="hex-loader__bar">
          <div class="hex-loader__fill" :style="{ width: (loadingRatio * 100) + '%' }" />
        </div>
      </div>
      <div
        v-if="tooltip"
        class="atmo-tip"
        :style="{ left: tipPos.x + 'px', top: tipPos.y + 'px' }"
      >
        <div class="atmo-tip__row"><span class="k">Tile</span><span class="v">#{{ tooltip.id }}</span></div>
        <div class="atmo-tip__row"><span class="k">Élév.</span><span class="v">{{ tooltip.elevation }}</span></div>
      </div>
      <p class="atmo-hint">Survol = info · Clic = peindre la tuile atmo</p>
    </div>

    <div class="atmo-bar">
      <div class="atmo-track">
        <div
          class="atmo-pill"
          :style="{ transform: view === 'atmo' ? 'translateX(0)' : 'translateX(calc(100% + 6px))' }"
        />
        <button class="atmo-btn" :class="{ on: view === 'atmo' }" @click="view = 'atmo'">⬢ Atmosphère</button>
        <button class="atmo-btn" :class="{ on: view === 'sol'  }" @click="view = 'sol'">⬢ Sol</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.atmo-demo  { width: 100%; }
.atmo-canvas {
  position: relative;
  width: 100%;
  height: 460px;
  background: #08080f;
}
.atmo-hint {
  position: absolute;
  bottom: 0.5rem;
  left: 0.75rem;
  margin: 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.65);
  font-family: var(--vp-font-family-mono);
  pointer-events: none;
}
.atmo-tip {
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
.atmo-tip__row { display: flex; justify-content: space-between; gap: 1rem; line-height: 1.7; }
.atmo-tip .k { color: rgba(255, 255, 255, 0.45); }
.atmo-tip .v { color: rgba(255, 255, 255, 0.9); text-align: right; }
.atmo-bar {
  display: flex;
  justify-content: center;
  padding: 0.7rem 0.75rem;
  background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
}
.atmo-track {
  position: relative;
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.08);
}
.atmo-pill {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 6px);
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: 0;
}
.atmo-btn {
  position: relative;
  z-index: 1;
  font-size: 0.78rem;
  font-family: var(--vp-font-family-mono);
  padding: 0.4rem 1.1rem;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: color 0.2s;
  white-space: nowrap;
}
.atmo-btn:hover { color: var(--vp-c-text-1); }
.atmo-btn.on   { color: #fff; font-weight: 500; }

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
