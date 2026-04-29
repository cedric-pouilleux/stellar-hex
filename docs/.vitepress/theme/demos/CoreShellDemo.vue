<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Three.js demo â€” Earth-like planet with a pre-excavated cluster of
 * tiles that exposes the molten core. The core's procedural fire
 * shader + point light "leak" through the mined tiles.
 *
 * Click any tile to mine it deeper. Toggle "Cacher le liquide" to
 * remove the ocean shell when it covers the excavation cluster.
 */

const container     = ref<HTMLDivElement>()
const minedCount    = ref(0)
const liquidVisible = ref(true)
let setLiquid: ((visible: boolean) => void) | null = null
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
  const { useBody, DEFAULT_TILE_SIZE, buildNeighborMap, getNeighbors } = lib

  const el     = container.value!
  const width  = el.clientWidth
  const height = 460

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(0, 0.4, 3.0)

  scene.add(new THREE.AmbientLight(0xffffff, 0.4))
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.8)
  sun.position.set(5, 3, 4)
  scene.add(sun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.autoRotate = true
  orbit.autoRotateSpeed = 0.4
  orbit.minDistance = 1.4
  orbit.maxDistance = 6

  const config = {
    type:                'planetary', surfaceLook: 'terrain' as const,
    name:                'core-demo',
    radius:               1,
    rotationSpeed:        0,
    axialTilt:            0.3,
    reliefFlatness:       0.55,
    atmosphereThickness:  0.4,
    coreRadiusRatio:      0.55,
    liquidState:         'liquid' as const,
    liquidCoverage:       0.4,
    liquidColor:         '#175da1',
  }

  const body = useBody(config, DEFAULT_TILE_SIZE)
  scene.add(body.group)

  body.interactive.activate()
  body.view.set('surface')

  setLiquid = (visible) => body.liquid.setVisible(visible)

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
      const nMap    = buildNeighborMap(sim.tiles)
      const seen    = new Set<number>()
      const queue: number[] = [centreId]
      const updates = new Map<number, number>()
      while (queue.length && updates.size < 14) {
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

  const raycaster = new THREE.Raycaster()
  const pointer   = new THREE.Vector2()
  function onClick(e: PointerEvent) {
    const r = el.getBoundingClientRect()
    pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
    pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const ref = body.interactive.queryHover(raycaster)
    if (ref?.layer === 'sol') {
      body.tiles.sol.updateTileSolHeight(new Map([[ref.tileId, 0]]))
      minedCount.value++
    }
  }
  renderer.domElement.addEventListener('click', onClick)

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
</script>

<template>
  <div class="core-demo">
    <div ref="container" class="core-canvas">
      <p class="core-hint">Cliquez une tuile pour creuser Â· {{ minedCount }} tuiles minÃ©es</p>
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
  padding: 0.7rem 0.75rem;
  background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
}
.core-toggle {
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
</style>
