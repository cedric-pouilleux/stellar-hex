<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Three.js demo â€” visual BFS from a clicked tile. Each ring of neighbours
 * is painted with a colder hue. Click any tile to restart the wave.
 */

const container = ref<HTMLDivElement>()
let cleanup: (() => void) | null = null

onMounted(async () => {
  const [THREE, controls, lib] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@cedric-pouilleux/stellar-hex/core'),
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
  scene.add(body.group)

  const sim     = (body as any).sim
  const tiles   = sim.tiles as Array<{ id: number }>
  const nMap    = buildNeighborMap(tiles)

  const COLORS = ['#ff5566', '#ffaa44', '#ffe066', '#88dd88', '#5599ff', '#aa88ff']

  function paintBfs(start: number) {
    const visited  = new Map<number, number>() // id â†’ ring index
    const queue: Array<{ id: number, depth: number }> = [{ id: start, depth: 0 }]
    while (queue.length) {
      const { id, depth } = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id, depth)
      if (depth >= COLORS.length - 1) continue
      for (const nid of getNeighbors(id, nMap)) {
        if (!visited.has(nid)) queue.push({ id: nid, depth: depth + 1 })
      }
    }
    for (const [id, depth] of visited) {
      body.tiles.setBaseColor(id, new THREE.Color(COLORS[depth] ?? COLORS[COLORS.length - 1]))
    }
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
    if (ref?.layer === 'sol') {
      ;(body.tiles as { resetBaseColors?: () => void }).resetBaseColors?.()
      paintBfs(ref.tileId)
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
</style>
