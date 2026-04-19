<script setup lang="ts">
/**
 * TresJS wrapper around `buildCloudShell` — the Three.js mesh + shaders live
 * in the pure builder; this component only owns Vue lifecycle and the loop
 * binding, plus the reactive `hexGraphicsUniforms` forwarding.
 *
 * The shell auto-discovers the scene's dominant light source (brightest
 * PointLight / DirectionalLight) for its terminator shading — no sun prop.
 */
import { onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { hexGraphicsUniforms } from '../render/hexGraphicsUniforms'
import { buildCloudShell } from '../render/buildCloudShell'

const props = defineProps<{
  group:             THREE.Group
  radius:            number
  coverage:          number
  frozen:            boolean
  occluderUniforms?: { pos: { value: THREE.Vector3 }, radius: { value: number } }
}>()

const { mesh, tick, dispose } = buildCloudShell({
  radius:              props.radius,
  coverage:            props.coverage,
  frozen:              props.frozen,
  occluderUniforms:    props.occluderUniforms,
  cloudOpacityUniform: hexGraphicsUniforms.uCloudOpacity,
  cloudSpeedUniform:   hexGraphicsUniforms.uCloudSpeed,
})

const { onBeforeRender } = useLoop()
const { off: stopLoop } = onBeforeRender(({ delta }) => tick(delta))

onMounted(() => props.group.add(mesh))
onBeforeUnmount(() => {
  stopLoop()
  props.group.remove(mesh)
  dispose()
})
</script>

<template><!-- renderless --></template>
