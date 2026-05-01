<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Three.js demo — visual BFS from a clicked tile. Each ring of neighbours
 * is painted with a colder hue. Click any tile to restart the wave.
 */

const container = ref<HTMLDivElement>()

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

let cleanup: (() => void) | null = null

onMounted(async () => {
  const [THREE, controls, lib] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@cedric-pouilleux/stellexjs/core'),
  ])
  const { OrbitControls } = controls
  const { useBody, DEFAULT_TILE_SIZE, buildNeighborMap, getNeighbors } = lib

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

  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const sun = new THREE.DirectionalLight(0xffffff, 2.0)
  sun.position.set(5, 3, 4)
  scene.add(sun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true

  const config = {
    type:                'planetary', surfaceLook: 'terrain' as const,
    name:                'bfs-demo',
    radius:               1,
    rotationSpeed:        0,
    axialTilt:            0,
    reliefFlatness:       0.55,
    atmosphereThickness:  0.4,
  }

  const body = useBody(config, DEFAULT_TILE_SIZE)
  body.interactive.activate()
  body.view.set('surface')
  scene.add(body.group)

  const sim   = body.sim
  const tiles = sim.tiles
  const nMap  = buildNeighborMap(tiles)

  const COLORS = ['#ff5566', '#ffaa44', '#ffe066', '#88dd88', '#5599ff', '#aa88ff']

  // Cache the palette baseline per tile so a fresh BFS click starts from
  // the original look — `applyOverlay` only writes the tiles passed in,
  // so re-applying the baseline restores tiles that fell out of the new
  // wave radius.
  const baselineColors = new Map<number, { r: number; g: number; b: number }>()
  for (const tile of tiles) {
    const v = body.tiles.sol.tileBaseVisual(tile.id)
    if (v) baselineColors.set(tile.id, { r: v.r, g: v.g, b: v.b })
  }

  function paintBfs(start: number) {
    const visited = new Map<number, number>() // id → ring index
    const queue:  Array<{ id: number, depth: number }> = [{ id: start, depth: 0 }]
    while (queue.length) {
      const { id, depth } = queue.shift()!
      if (visited.has(id)) continue
      visited.set(id, depth)
      if (depth >= COLORS.length - 1) continue
      for (const nid of getNeighbors(id, nMap)) {
        if (!visited.has(nid)) queue.push({ id: nid, depth: depth + 1 })
      }
    }

    // Restart from the palette baseline so previously-painted rings
    // outside the new wave fade back to terrain colour.
    body.tiles.sol.applyOverlay(baselineColors)

    const overlay = new Map<number, { r: number; g: number; b: number }>()
    const tmp     = new THREE.Color()
    for (const [id, depth] of visited) {
      tmp.set(COLORS[depth] ?? COLORS[COLORS.length - 1])
      overlay.set(id, { r: tmp.r, g: tmp.g, b: tmp.b })
    }
    body.tiles.sol.applyOverlay(overlay)
  }

  paintBfs(0)

  const raycaster = new THREE.Raycaster()
  const pointer   = new THREE.Vector2()
  function onClick(e: PointerEvent) {
    const r = el.getBoundingClientRect()
    pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
    pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const ref = body.interactive.queryHover(raycaster)
    if (ref?.layer === 'sol') paintBfs(ref.tileId)
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
    body.tick(dt)
    orbit.update()
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
  <div ref="container" class="three-demo">
    <div v-if="loading" class="hex-loader">
      <div class="hex-loader__label">{{ loadingLabel }}</div>
      <div class="hex-loader__bar">
        <div class="hex-loader__fill" :style="{ width: (loadingRatio * 100) + '%' }" />
      </div>
    </div>
    <p class="hint">Cliquez une tuile pour relancer le BFS</p>
  </div>
</template>

<style scoped>
.three-demo {
  position: relative;
  width: 100%;
  height: 400px;
}
.hint {
  position: absolute;
  top: 0.75rem;
  left: 1rem;
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: rgba(255,255,255,0.55);
  pointer-events: none;
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
