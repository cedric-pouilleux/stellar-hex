<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import BodyViewBar, { type ViewMode } from './BodyViewBar.vue'
import { setBodyCoreVisible } from './bodyCoreVisibility'

/**
 * Three.js demo — rocky planet with a 60% water ocean coverage.
 * View toggle: Shader / Sol / Atmosphère.
 *
 * Hover behaviour: the lib's `hoverCursor` config wires a unified ring +
 * emissive point light + opaque underwater column. The column shows on
 * liquid hovers only; ring + light fire on every layer.
 */

const container = ref<HTMLDivElement>()
const mode      = ref<ViewMode>('shader')
let applyMode: ((m: ViewMode) => void) | null = null
let cleanup:   (() => void) | null = null

watch(mode, m => applyMode?.(m))

onMounted(async () => {
  const [THREE, { OrbitControls }, { useBody, DEFAULT_TILE_SIZE }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@cedric-pouilleux/stellar-hex/core'),
  ])

  const el = container.value!
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(el.clientWidth, 400)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, el.clientWidth / 400, 0.1, 100)
  camera.position.set(0, 0.4, 3.5)

  scene.add(new THREE.AmbientLight(0xffffff, 0.25))
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.5)
  sun.position.set(5, 3, 4)
  scene.add(sun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.autoRotate = true
  orbit.autoRotateSpeed = 0.6
  orbit.minDistance = 1.6
  orbit.maxDistance = 8

  const body = useBody({
    type:                'planetary', surfaceLook: 'terrain',
    name:                'ocean-demo',
    radius:               1,
    rotationSpeed:        0,
    axialTilt:            0.3,
    reliefFlatness:       0.55,
    atmosphereThickness:  0.45,
    liquidState:         'liquid',
    liquidCoverage:       0.6,
    liquidColor:         '#175da1',
  }, DEFAULT_TILE_SIZE, {
    hoverCursor: {
      ring:     { color: 0xffffff },
      emissive: { color: 0xffffff, intensity: 1.5, size: 0.6 },
      column:   { color: 0xffffff },
    },
  })
  scene.add(body.group)
  setBodyCoreVisible(body, false)

  // ── Hover dispatch (lib's queryHover handles sol/liquid/atmo) ──
  const raycaster = new THREE.Raycaster()
  const pointer   = new THREE.Vector2()
  let pointerSet  = false

  const onPointerMove = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect()
    pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
    pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
    pointerSet = true
  }
  renderer.domElement.addEventListener('pointermove', onPointerMove)

  applyMode = (m) => {
    if (m === 'shader') { body.view.set('shader'); body.interactive.deactivate(); setBodyCoreVisible(body, false) }
    else {
      body.interactive.activate()
      body.view.set(m === 'atmo' ? 'atmosphere' : 'surface')
      setBodyCoreVisible(body, true)
    }
  }

  let animId: number
  let last = performance.now()
  const loop = () => {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const dt = (now - last) / 1000
    last = now
    orbit.update()
    body.tick(dt)
    if (pointerSet && mode.value !== 'shader') {
      raycaster.setFromCamera(pointer, camera)
      body.hover.setBoardTile(body.interactive.queryHover(raycaster))
    }
    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    orbit.dispose()
    body.dispose()
    renderer.dispose()
    el.removeChild(renderer.domElement)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div class="demo-wrap">
    <div ref="container" class="demo-canvas" />
    <BodyViewBar :body-type="'rocky'" v-model:mode="mode" />
  </div>
</template>

<style scoped>
.demo-wrap   { width: 100%; }
.demo-canvas { width: 100%; height: 400px; }
</style>
