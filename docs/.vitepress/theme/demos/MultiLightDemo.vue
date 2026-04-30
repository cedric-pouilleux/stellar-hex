<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import BodyViewBar, { type ViewMode } from './BodyViewBar.vue'
import { setBodyCoreVisible } from './bodyCoreVisibility'

/**
 * Three.js demo â€” two coloured directional lights illuminate a rocky body.
 * View toggle: Shader / Sol / AtmosphÃ¨re.
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
  camera.position.set(0, 0.4, 3.4)

  const warmSun = new THREE.DirectionalLight(0xffaa55, 2.0)
  warmSun.position.set(-4, 1, 4)
  scene.add(warmSun)
  const coolSun = new THREE.DirectionalLight(0x55aaff, 1.5)
  coolSun.position.set(4, 1, -2)
  scene.add(coolSun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.autoRotate = true
  orbit.autoRotateSpeed = 0.6
  orbit.minDistance = 1.6
  orbit.maxDistance = 8

  const body = useBody({
    type:                'planetary', surfaceLook: 'terrain',
    name:                'multi-light-demo',
    radius:               1,
    rotationSpeed:        0,
    axialTilt:            0.3,
    reliefFlatness:       0.55,
    atmosphereThickness:  0.4,
    liquidState:         'liquid',
    liquidColor:         '#1d4d8c',
  }, DEFAULT_TILE_SIZE, { sunLight: warmSun })
  scene.add(body.group)
  setBodyCoreVisible(body, false)

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
    renderer.render(scene, camera)
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
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
