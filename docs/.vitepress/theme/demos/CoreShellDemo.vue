<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Three.js demo — Earth-like planet with a pre-excavated cluster of
 * tiles that exposes the molten core. The core's procedural fire
 * shader + point light "leak" through the mined tiles.
 *
 * Click any tile to mine it (configurable radius). Toggle the liquid
 * shell, scale the dig radius, or reset the planet to the seed state.
 */

const container     = ref<HTMLDivElement>()
const minedCount    = ref(0)
const liquidVisible = ref(true)
const digRadius     = ref(1)

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

let setLiquid: ((visible: boolean) => void) | null = null
let mineAt:    ((tileId: number) => void) | null = null
let resetWorld: (() => void) | null = null
let cleanup:   (() => void) | null = null

watch(liquidVisible, v => setLiquid?.(v))

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
  const { useBody, buildNeighborMap, getNeighbors } = lib

  const el     = container.value!
  const width  = el.clientWidth
  const height = 460

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(0, 0.6, 4.0)

  scene.add(new THREE.AmbientLight(0xffffff, 0.4))
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.8)
  sun.position.set(5, 3, 4)
  scene.add(sun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.autoRotate = true
  orbit.autoRotateSpeed = 0.4
  orbit.minDistance = 1.8
  orbit.maxDistance = 8

  const config = {
    type:                'planetary', surfaceLook: 'terrain' as const,
    name:                'core-demo',
    radius:               1.4,
    rotationSpeed:        0,
    axialTilt:            0.3,
    reliefFlatness:       0.55,
    atmosphereThickness:  0.25,
    coreRadiusRatio:      0.55,
    liquidState:         'liquid' as const,
    liquidCoverage:       0.4,
    liquidColor:         '#175da1',
  }

  // Smaller-than-default tile size — denser hex grid so the dig pattern
  // reads as a real crater instead of a few coarse facets.
  const TILE_SIZE = 0.035

  const body = useBody(config, TILE_SIZE)
  scene.add(body.group)

  body.interactive.activate()
  body.view.set('surface')

  setLiquid = (visible) => body.liquid.setVisible(visible)

  // Snapshot the initial sol heights so the reset button can replay
  // the seed state — `updateTileSolHeight` mutates in place and the
  // lib does not retain history.
  const coreR          = body.getCoreRadius()
  const initialHeights = new Map<number, number>()
  for (const tile of body.sim.tiles) {
    const pos = body.tiles.sol.getTilePosition(tile.id)
    if (pos) initialHeights.set(tile.id, pos.length() - coreR)
  }

  // Neighbour map (precomputed once) — drives both the pre-excavation
  // BFS and the runtime dig-radius expansion.
  const nMap = buildNeighborMap(body.sim.tiles)

  function tilesWithinRadius(start: number, radius: number): Set<number> {
    const seen  = new Set<number>([start])
    let frontier = [start]
    for (let r = 1; r < radius; r++) {
      const next: number[] = []
      for (const id of frontier) {
        for (const n of getNeighbors(id, nMap)) {
          if (!seen.has(n)) { seen.add(n); next.push(n) }
        }
      }
      frontier = next
    }
    return seen
  }

  let preExcavated = false
  function preExcavate() {
    if (preExcavated) return
    preExcavated = true
    try {
      const sim    = body.sim
      const seaLvl = sim.seaLevelElevation
      let centreId: number | null = null
      for (const [id, state] of sim.tileStates) {
        if (state.elevation > seaLvl) { centreId = id; break }
      }
      if (centreId == null) return
      const seen    = new Set<number>()
      const queue: number[] = [centreId]
      const updates = new Map<number, number>()
      while (queue.length && updates.size < 28) {
        const cur = queue.shift()!
        if (seen.has(cur)) continue
        seen.add(cur)
        const s = sim.tileStates.get(cur)
        if (s && s.elevation > seaLvl) {
          updates.set(cur, 0)
          for (const n of getNeighbors(cur, nMap)) queue.push(n)
        }
      }
      if (updates.size > 0) {
        body.tiles.sol.updateTileSolHeight(updates)
        minedCount.value += updates.size
      }
    } catch (err) {
      console.warn('[CoreShellDemo] pre-excavation skipped:', err)
    }
  }

  mineAt = (tileId: number) => {
    const ids = tilesWithinRadius(tileId, digRadius.value)
    const updates = new Map<number, number>()
    for (const id of ids) updates.set(id, 0)
    body.tiles.sol.updateTileSolHeight(updates)
    minedCount.value += updates.size
  }

  resetWorld = () => {
    body.tiles.sol.updateTileSolHeight(initialHeights)
    minedCount.value = 0
  }

  const raycaster = new THREE.Raycaster()
  const pointer   = new THREE.Vector2()
  function onClick(e: PointerEvent) {
    const r = el.getBoundingClientRect()
    pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
    pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const ref = body.interactive.queryHover(raycaster)
    if (ref?.layer === 'sol') mineAt?.(ref.tileId)
  }
  renderer.domElement.addEventListener('click', onClick)

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
    if (!preExcavated) preExcavate()
    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    renderer.domElement.removeEventListener('click', onClick)
    orbit.dispose()
    body.dispose()
    renderer.dispose()
    el.removeChild(renderer.domElement)
  }
})

onBeforeUnmount(() => cleanup?.())

function onReset() {
  resetWorld?.()
}
</script>

<template>
  <div class="core-demo">
    <div ref="container" class="core-canvas">
      <div v-if="loading" class="hex-loader">
        <div class="hex-loader__label">{{ loadingLabel }}</div>
        <div class="hex-loader__bar">
          <div class="hex-loader__fill" :style="{ width: (loadingRatio * 100) + '%' }" />
        </div>
      </div>
      <p class="core-hint">Cliquez une tuile pour creuser · {{ minedCount }} tuiles minées</p>
    </div>
    <div class="core-bar">
      <label class="core-toggle">
        <input
          type="checkbox"
          :checked="!liquidVisible"
          @change="liquidVisible = !((($event.target) as HTMLInputElement).checked)"
        />
        <span class="core-toggle__track"><span class="core-toggle__dot" /></span>
        Cacher le liquide
      </label>
      <label class="core-slider">
        Taille du trou
        <input
          type="range"
          min="1"
          max="4"
          step="1"
          :value="digRadius"
          @input="digRadius = parseInt((($event.target) as HTMLInputElement).value, 10)"
        />
        <span class="core-slider__val">{{ digRadius }}</span>
      </label>
      <button type="button" class="core-reset" @click="onReset">
        Réinitialiser
      </button>
    </div>
  </div>
</template>

<style scoped>
.core-demo  { width: 100%; }
.core-canvas {
  position: relative;
  width: 100%;
  height: 460px;
  background: #08080f;
}
.core-hint {
  position: absolute;
  bottom: 0.5rem;
  left: 0.75rem;
  margin: 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.65);
  font-family: var(--vp-font-family-mono);
  pointer-events: none;
}
.core-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.7rem 0.75rem;
  background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
}
.core-toggle,
.core-slider {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 0.78rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  cursor: pointer;
  user-select: none;
}
.core-toggle input { display: none; }
.core-toggle__track {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--vp-c-divider);
  transition: background 0.2s;
}
.core-toggle__dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.core-toggle input:checked + .core-toggle__track {
  background: var(--vp-c-brand-1);
}
.core-toggle input:checked + .core-toggle__track .core-toggle__dot {
  transform: translateX(16px);
}
.core-slider input[type="range"] {
  width: 90px;
}
.core-slider__val {
  display: inline-block;
  min-width: 1ch;
  text-align: center;
  color: var(--vp-c-text-1);
}
.core-reset {
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.core-reset:hover {
  background: var(--vp-c-brand-1);
  color: #fff;
  border-color: var(--vp-c-brand-1);
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
