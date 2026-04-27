<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Three.js demo — star with screen-space god rays via EffectComposer.
 * Drag to rotate, scroll to zoom. Ray params come from `godRaysFromStar`.
 *
 * The shader needs an isolated render of the star (`tMask`); we keep a
 * dedicated WebGLRenderTarget outside the composer so the GodRays pass
 * never reads a target it is also writing to.
 */

const container = ref<HTMLDivElement>()
let cleanup: (() => void) | null = null

onMounted(async () => {
  const [
    THREE,
    { OrbitControls },
    { EffectComposer },
    { RenderPass },
    { ShaderPass },
    { CopyShader },
    lib,
  ] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('three/examples/jsm/postprocessing/EffectComposer.js'),
    import('three/examples/jsm/postprocessing/RenderPass.js'),
    import('three/examples/jsm/postprocessing/ShaderPass.js'),
    import('three/examples/jsm/shaders/CopyShader.js'),
    import('@cedric-pouilleux/stellar-hex/core'),
  ])
  const { useBody, DEFAULT_TILE_SIZE, GodRaysShader, godRaysFromStar } = lib

  const el     = container.value!
  const width  = el.clientWidth
  const height = 400
  const dpr    = Math.min(window.devicePixelRatio, 2)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(dpr)
  el.appendChild(renderer.domElement)

  const scene  = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
  camera.position.set(0, 0, 5)

  const star = useBody({
    type:           'star',
    name:           'godray-sun',
    radius:          1,
    spectralType:   'G',
    rotationSpeed:   0.001,
    axialTilt:       0,
  }, DEFAULT_TILE_SIZE)
  star.group.position.set(-1.2, 0.4, 0)
  scene.add(star.group)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping   = true
  orbit.target.copy(star.group.position)
  orbit.autoRotate      = true
  orbit.autoRotateSpeed = 0.3
  orbit.minDistance     = 2.5
  orbit.maxDistance     = 12

  const maskTarget = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
    depthBuffer: false,
    stencilBuffer: false,
  })

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  const params  = godRaysFromStar({ spectralType: 'G' })
  const godRays = new ShaderPass(GodRaysShader)
  godRays.uniforms.uExposure.value = params.exposure
  godRays.uniforms.uDecay.value    = params.decay
  godRays.uniforms.uDensity.value  = params.density
  godRays.uniforms.uWeight.value   = params.weight
  godRays.uniforms.uEnabled.value  = 1.0
  godRays.uniforms.tMask.value     = maskTarget.texture
  composer.addPass(godRays)
  composer.addPass(new ShaderPass(CopyShader))

  let animId: number
  let last = performance.now()
  const screenPos = new THREE.Vector3()

  const loop = () => {
    animId = requestAnimationFrame(loop)
    const now = performance.now()
    const dt  = (now - last) / 1000
    last = now
    star.tick(dt)
    orbit.update()

    screenPos.copy(star.group.position).project(camera)
    godRays.uniforms.uSunUV.value.set(
      (screenPos.x + 1) / 2,
      (screenPos.y + 1) / 2,
    )
    godRays.uniforms.uEnabled.value = screenPos.z < 1 ? 1 : 0

    renderer.setRenderTarget(maskTarget)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)

    composer.render()
  }
  loop()

  cleanup = () => {
    cancelAnimationFrame(animId)
    orbit.dispose()
    star.dispose()
    maskTarget.dispose()
    composer.dispose()
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
