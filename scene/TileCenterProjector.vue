<script setup lang="ts">
import * as THREE from 'three'
import { useLoop, useTresContext } from '@tresjs/core'
import type { HoverChannel } from '../render/state/hoverState'

const props = defineProps<{
  /**
   * Per-body hover channel produced by `useBody` (`body.hoverChannel`).
   * The projector reads `hoverLocalPos` / `hoverParentGroup` on each frame.
   * Each `<TileCenterProjector>` instance must be bound to a single body.
   */
  channel: HoverChannel
}>()

const emit = defineEmits<{
  /**
   * Emitted each frame with the screen-space position (CSS px) of the
   * hovered tile center, or null when nothing is hovered / behind camera.
   */
  'update-position': [pos: { x: number; y: number } | null]
}>()

const { camera, renderer } = useTresContext()
const { onBeforeRender }   = useLoop()

const _world = new THREE.Vector3()
const _ndc   = new THREE.Vector3()

/**
 * Projects the hovered tile center from local space → world space → screen px.
 * Runs every frame so the tooltip anchor tracks planet rotation smoothly.
 */
onBeforeRender(() => {
  const cam = camera.activeCamera.value
  const lp  = props.channel.hoverLocalPos.value
  const pg  = props.channel.hoverParentGroup.value

  if (!cam || !lp || !pg) {
    emit('update-position', null)
    return
  }

  // Local → world
  _world.copy(lp).applyMatrix4(pg.matrixWorld)

  // World → NDC
  _ndc.copy(_world).project(cam)

  // Behind camera guard
  if (_ndc.z > 1) {
    emit('update-position', null)
    return
  }

  const canvas = renderer.instance.domElement
  const w      = canvas.clientWidth
  const h      = canvas.clientHeight

  // NDC → CSS pixels (Y flipped)
  emit('update-position', {
    x: (_ndc.x + 1) / 2 * w,
    y: (-_ndc.y + 1) / 2 * h,
  })
})
</script>

<template><!-- renderless --></template>
