<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Three.js demo — G-class star (Sun-like). Temperature drives the
 * blackbody colour; granulation, corona and pulsation come for free.
 * Drag to rotate, scroll to zoom.
 */

const container = ref<HTMLDivElement>()
let cleanup: (() => void) | null = null

onMounted(async () => {
  const [THREE, { OrbitControls }, { useBody, DEFAULT_TILE_SIZE }] = await Promise.all([
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
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
  camera.position.set(0, 0, 4)

  scene.add(new THREE.AmbientLight(0xffffff, 0.05))

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.autoRotate = true
  orbit.autoRotateSpeed = 0.4
  orbit.minDistance = 2
  orbit.maxDistance = 10

  const body = useBody({
    type:           'star',
    name:           'star-body-demo',
    radius:          1,
    spectralType:   'G',
    rotationSpeed:   0,
    axialTilt:       0,
  }, DEFAULT_TILE_SIZE)
  scene.add(body.group)

  let animId: number
  let last = performance.now()

  const loop = () => {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const dt  = (now - last) / 1000
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
  <div ref="container" class="three-demo" />
</template>

<style scoped>
.three-demo { width: 100%; height: 400px; }
</style>
