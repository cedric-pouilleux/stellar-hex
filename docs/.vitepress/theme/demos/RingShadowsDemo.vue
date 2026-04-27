<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import BodyViewBar, { type ViewMode } from './BodyViewBar.vue'
import { setBodyCoreVisible } from './bodyCoreVisibility'

/**
 * Three.js demo â€” gas giant + rings, side-lit so the ring shadow falls
 * across the equator. View toggle: Shader / AtmosphÃ¨re.
 */

const container = ref<HTMLDivElement>()
const mode      = ref<ViewMode>('shader')
let applyMode: ((m: ViewMode) => void) | null = null
let cleanup:   (() => void) | null = null

watch(mode, m => applyMode?.(m))

onMounted(async () => {
  const [THREE, { OrbitControls }, lib] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('@cedric-pouilleux/stellar-hex/core'),
  ])
  const { useBody, DEFAULT_TILE_SIZE, buildBodyRings } = lib

  const el = container.value!
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(el.clientWidth, 400)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, el.clientWidth / 400, 0.1, 100)
  camera.position.set(0, 1.2, 6.5)

  scene.add(new THREE.AmbientLight(0xffffff, 0.2))
  const sun = new THREE.DirectionalLight(0xffe6cc, 2.5)
  sun.position.set(6, 0.5, 0)
  scene.add(sun)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.autoRotate = true
  orbit.autoRotateSpeed = 0.4
  orbit.target.set(0, 0, 0)
  orbit.minDistance = 3
  orbit.maxDistance = 12

  const body = useBody({
    type:           'gaseous',
    name:           'shadow-jove',
    radius:          1.4,
    rotationSpeed:   0.003,
    axialTilt:       0.18,
    hasRings:        true,
  }, DEFAULT_TILE_SIZE)
  scene.add(body.group)
  setBodyCoreVisible(body, false)

  const planetMat = (body as any).planetMaterial?.material as THREE.ShaderMaterial | undefined
  if (planetMat?.uniforms.uRingSunWorldPos) {
    planetMat.uniforms.uRingSunWorldPos.value
      .copy(sun.position).normalize().multiplyScalar(1e4)
  }

  let rings: ReturnType<typeof buildBodyRings> | null = null
  if (body.variation.rings) {
    const planetWorldPos = new THREE.Vector3()
    rings = buildBodyRings({
      radius:        body.config.radius,
      rotationSpeed: body.config.rotationSpeed,
      variation:     body.variation.rings,
      planetWorldPos,
    })
    body.group.add(rings.carrier)

    applyMode = (m) => {
      if (m === 'shader') { body.view.set('shader'); body.interactive.deactivate(); setBodyCoreVisible(body, false) }
      else {
        body.interactive.activate()
        body.view.set('atmosphere')
      setBodyCoreVisible(body, true)
      }
    }

    let animId: number
    let last = performance.now()
    const loop = () => {
      animId = requestAnimationFrame(loop)
      const now = performance.now()
      const dt  = (now - last) / 1000
      last = now
      orbit.update()
      body.tick(dt)
      body.group.getWorldPosition(planetWorldPos)
      rings!.tick(dt)
      renderer.render(scene, camera)
    }
    loop()

    cleanup = () => {
      cancelAnimationFrame(animId)
      orbit.dispose()
      body.group.remove(rings!.carrier)
      rings!.dispose()
      body.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div class="demo-wrap">
    <div ref="container" class="demo-canvas" />
    <BodyViewBar :body-type="'gaseous'" v-model:mode="mode" />
  </div>
</template>

<style scoped>
.demo-wrap   { width: 100%; }
.demo-canvas { width: 100%; height: 400px; }
</style>
