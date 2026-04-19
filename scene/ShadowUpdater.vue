<script setup lang="ts">
// ShadowUpdater — updates uShadowPos uniform each frame with the shadow
// caster's world-space position, so the planet shader can compute the shadow.

import * as THREE from 'three'
import { useLoop } from '@tresjs/core'

const props = defineProps<{
  casterGroup: THREE.Group
  posUniform:  { value: THREE.Vector3 }
}>()

const tmp = new THREE.Vector3()
const { onBeforeRender } = useLoop()
onBeforeRender(() => {
  props.casterGroup.getWorldPosition(tmp)
  props.posUniform.value.copy(tmp)
})
</script>

<template><!-- renderless --></template>
