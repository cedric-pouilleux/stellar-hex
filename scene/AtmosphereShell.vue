<script setup lang="ts">
/**
 * TresJS wrapper around `buildAtmosphereShell` — owns Vue lifecycle and the
 * per-frame `onBeforeRender` hook; all Three.js work lives in the pure builder.
 */
import { onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { useLoop } from '@tresjs/core'
import { hexGraphicsUniforms } from '../render/hexGraphicsUniforms'
import { buildAtmosphereShell } from '../render/buildAtmosphereShell'

const props = defineProps<{
  group:     THREE.Group
  radius:    number
  color:     string
  intensity: number
  power:     number
  /** false for stars — self-lit, no Rayleigh, full glow all around */
  litBySun?: boolean
}>()

const _planetWP = new THREE.Vector3()

const { mesh, tick, dispose } = buildAtmosphereShell({
  radius:             props.radius,
  color:              props.color,
  intensity:          props.intensity,
  power:              props.power,
  litBySun:           props.litBySun,
  atmoOpacityUniform: hexGraphicsUniforms.uAtmoOpacity,
  getPlanetWorldPos:  () => props.group.getWorldPosition(_planetWP),
})

const { onBeforeRender } = useLoop()
const { off: stopLoop }  = onBeforeRender(({ delta }) => tick(delta))

onMounted(() => props.group.add(mesh))
onBeforeUnmount(() => {
  stopLoop()
  props.group.remove(mesh)
  dispose()
})
</script>

<template><!-- renderless --></template>
