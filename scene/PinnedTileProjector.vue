<script setup lang="ts">
import * as THREE from 'three'
import { useLoop, useTresContext } from '@tresjs/core'
import { pinLocalPos, pinParentGroup } from '../core/hoverState'

const emit = defineEmits<{
  /**
   * Emitted each frame with the screen-space position (CSS px) of the tile
   * currently pinned by the popover, or null when no pin / behind camera.
   */
  'update-position': [pos: { x: number; y: number } | null]
}>()

const { camera, renderer } = useTresContext()
const { onBeforeRender }   = useLoop()

const _world = new THREE.Vector3()
const _ndc   = new THREE.Vector3()

/**
 * Projects the pinned tile center from local → world → screen px every frame,
 * so the popover and selection marker stay anchored to the hex under planet
 * rotation, independently of cursor hover.
 */
onBeforeRender(() => {
  const cam = camera.activeCamera.value
  const lp  = pinLocalPos.value
  const pg  = pinParentGroup.value

  if (!cam || !lp || !pg) {
    emit('update-position', null)
    return
  }

  _world.copy(lp).applyMatrix4(pg.matrixWorld)
  _ndc.copy(_world).project(cam)

  if (_ndc.z > 1) {
    emit('update-position', null)
    return
  }

  const canvas = renderer.instance.domElement
  emit('update-position', {
    x: (_ndc.x + 1) / 2 * canvas.clientWidth,
    y: (-_ndc.y + 1) / 2 * canvas.clientHeight,
  })
})
</script>

<template><!-- renderless --></template>
