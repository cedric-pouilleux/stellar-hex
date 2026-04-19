<script setup lang="ts">
/**
 * TresJS wrapper around `buildBodyEffectLayer`. The Three.js mesh + mode
 * selection + shaders all live in the pure builder; this component owns Vue
 * lifecycle, the per-frame `onBeforeRender` driver and TresJS's camera context.
 */
import { onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { useLoop, useTresContext } from '@tresjs/core'
import { buildBodyEffectLayer } from '../render/buildBodyEffectLayer'
import type { BodyConfig } from '../types/body.types'

const props = defineProps<{
  group:   THREE.Group
  config:  BodyConfig
  /** World-space position of the primary light source.
   *  Defaults to origin (HexasphereScene: star at [0,0,0]).
   *  Override in preview contexts where the planet is at the origin. */
  sunPos?: THREE.Vector3
}>()

const { camera } = useTresContext()
const _cameraWP  = new THREE.Vector3()

const layer = buildBodyEffectLayer({
  config:           props.config,
  sunPos:           props.sunPos,
  getCameraWorldPos: () => {
    const cam = camera.activeCamera.value
    if (cam) _cameraWP.setFromMatrixPosition(cam.matrixWorld)
    return _cameraWP
  },
})

const { onBeforeRender } = useLoop()
const { off: stopLoop }  = onBeforeRender(({ delta }) => layer.tick(delta))

onMounted(() => props.group.add(layer.mesh))
onBeforeUnmount(() => {
  stopLoop()
  props.group.remove(layer.mesh)
  layer.dispose()
})

defineExpose({
  mode:      layer.mode,
  uWarmth:   layer.uWarmth,
  uTempNorm: layer.uTempNorm,
  uWaterCov: layer.uWaterCov,
})
</script>

<template><!-- renderless --></template>
