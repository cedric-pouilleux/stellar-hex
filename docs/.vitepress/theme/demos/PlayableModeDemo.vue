<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import BodyViewBar, { type ViewMode } from './BodyViewBar.vue'
import { setBodyCoreVisible } from './bodyCoreVisibility'

/**
 * Three.js demo â€” full "playable" mode showcase.
 *
 *   - OrbitControls (drag/zoom) + permanent auto-rotate
 *   - 3-state view toggle: Shader / Sol (hex) / AtmosphÃ¨re (hex, core visible)
 *   - Hover tooltip + click-to-paint a tile (in hex modes)
 */

interface TileInfo { id: number, elevation: number, height: number }

const container = ref<HTMLDivElement>()
const tooltip   = ref<TileInfo | null>(null)
const tipPos    = ref({ x: 0, y: 0 })
const mode      = ref<ViewMode>('shader')

let applyMode: ((m: ViewMode) => void) | null = null
let cleanup:   (() => void) | null = null

watch(mode, m => applyMode?.(m))

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
  const {
    useBody,
    DEFAULT_TILE_SIZE,
    resolveTileHeight,
  } = lib

  const el     = container.value!
  const width  = el.clientWidth
  const height = 460

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
  camera.position.set(0, 0.4, 3.6)

  scene.add(new THREE.AmbientLight(0xffffff, 0.25))
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.5)
  sun.position.set(5, 3, 4)
  scene.add(sun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping   = true
  orbit.minDistance     = 1.6
  orbit.maxDistance     = 8
  orbit.autoRotate      = true
  orbit.autoRotateSpeed = 0.6

  const config = {
    type:                'rocky' as const,
    name:                'playable-demo',
    radius:               1,
    rotationSpeed:        0,
    axialTilt:            0.41,
    reliefFlatness:       0.55,
    atmosphereThickness:  0.6,
    liquidState:         'liquid' as const,
    liquidCoverage:       0.55,
    liquidColor:         '#175da1',
  }

  const body = useBody(config, DEFAULT_TILE_SIZE)
  body.group.rotation.z = config.axialTilt
  scene.add(body.group)
  setBodyCoreVisible(body, false)

  applyMode = (m) => {
    if (m === 'shader') {
      body.view.set('atmosphere')
      body.interactive.deactivate()
      setBodyCoreVisible(body, false)
    } else {
      body.interactive.activate()
      body.view.set(m === 'atmo' ? 'atmosphere' : 'surface')
      setBodyCoreVisible(body, true)
    }
  }

  // Hover & paint
  const raycaster = new THREE.Raycaster()
  const pointer   = new THREE.Vector2()
  let pointerIn   = false
  const GOLD      = { r: 1.0, g: 0.76, b: 0.29 }

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
    if (mode.value === 'shader') return
    raycaster.setFromCamera(pointer, camera)
    const id = body.interactive.queryHover(raycaster)
    if (id != null) body.tiles.applyTileOverlay('sol', new Map([[id, GOLD]]))
  }
  renderer.domElement.addEventListener('pointermove',  onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)
  renderer.domElement.addEventListener('click',        onClick)

  let animId: number
  let last = performance.now()
  const loop = () => {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const dt  = (now - last) / 1000
    last = now

    orbit.update()
    body.tick(dt)
    clouds?.tick(dt)

    if (pointerIn && mode.value !== 'shader') {
      raycaster.setFromCamera(pointer, camera)
      const id = body.interactive.queryHover(raycaster)
      body.hover.setTile(id)
      if (id != null) {
        const state = body.sim.tileStates.get(id)
        if (state) {
          tooltip.value = {
            id,
            elevation: state.elevation,
            height:    resolveTileHeight(config, state.elevation),
          }
        }
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
    clouds?.dispose()
    body.dispose()
    renderer.dispose()
    el.removeChild(renderer.domElement)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div class="play-demo">
    <div ref="container" class="play-canvas">
      <div
        v-if="tooltip"
        class="play-tip"
        :style="{ left: tipPos.x + 'px', top: tipPos.y + 'px' }"
      >
        <div class="play-tip__row"><span class="k">Tile</span><span class="v">#{{ tooltip.id }}</span></div>
        <div class="play-tip__row"><span class="k">Ã‰lÃ©v.</span><span class="v">{{ tooltip.elevation }}</span></div>
        <div class="play-tip__row"><span class="k">Hauteur</span><span class="v">{{ tooltip.height.toFixed(3) }}</span></div>
      </div>
      <p v-if="mode !== 'shader'" class="play-hint">Survol = info tuile Â· Clic = peindre</p>
    </div>

    <BodyViewBar :body-type="'rocky'" v-model:mode="mode" />
  </div>
</template>

<style scoped>
.play-demo { width: 100%; }
.play-canvas {
  position: relative;
  width: 100%;
  height: 460px;
  background: #08080f;
}
.play-hint {
  position: absolute;
  bottom: 0.5rem;
  left: 0.75rem;
  margin: 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.55);
  font-family: var(--vp-font-family-mono);
  pointer-events: none;
}
.play-tip {
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
.play-tip__row { display: flex; justify-content: space-between; gap: 1rem; line-height: 1.7; }
.play-tip .k { color: rgba(255, 255, 255, 0.45); }
.play-tip .v { color: rgba(255, 255, 255, 0.9); text-align: right; }
</style>
