<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useTresContext } from '@tresjs/core'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Vanilla OrbitControls bridge for TresJS — runs inside <TresCanvas>.
 *
 * Pulls the camera + renderer out of the TresJS context (which fills
 * asynchronously after canvas mount) and instantiates a Three.js
 * OrbitControls. We watch the refs rather than read them in onMounted
 * because TresJS may need an extra tick to populate them.
 *
 * Replace by `<OrbitControls />` from `@tresjs/cientos` if that package
 * is available in your project — same intent, less boilerplate.
 */

const props = withDefaults(defineProps<{
  autoRotate?:      boolean
  autoRotateSpeed?: number
  minDistance?:     number
  maxDistance?:     number
  enableDamping?:   boolean
}>(), {
  autoRotate:      false,
  autoRotateSpeed: 0.6,
  minDistance:     1.6,
  maxDistance:     8,
  enableDamping:   true,
})

const ctx = useTresContext()
let controls: OrbitControls | null = null
let raf = 0

const stopWatch = watch(
  [() => ctx.camera.value, () => ctx.renderer.value],
  ([camera, renderer]) => {
    if (!camera || !renderer || controls) return
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping   = props.enableDamping
    controls.autoRotate      = props.autoRotate
    controls.autoRotateSpeed = props.autoRotateSpeed
    controls.minDistance     = props.minDistance
    controls.maxDistance     = props.maxDistance
    const tick = () => {
      controls?.update()
      raf = requestAnimationFrame(tick)
    }
    tick()
    stopWatch()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  controls?.dispose()
  stopWatch()
})
</script>

<template><!-- renderless --></template>
