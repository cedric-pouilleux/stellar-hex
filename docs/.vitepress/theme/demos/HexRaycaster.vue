<script setup lang="ts">
import { useRenderLoop, useTresContext } from '@tresjs/core'
import * as THREE from 'three'

/**
 * Inner component — must live inside <TresCanvas> to access useTresContext.
 * Drives body.queryHover / setHover each frame and emits the hovered tile id.
 */

const props = defineProps<{ body: any }>()
const emit  = defineEmits<{ hover: [id: number | null] }>()

const { camera, renderer } = useTresContext()

const raycaster = new THREE.Raycaster()
const pointer   = new THREE.Vector2()
let   lastId: number | null = null

renderer.value?.domElement.addEventListener('pointermove', (e: PointerEvent) => {
  const r = renderer.value!.domElement.getBoundingClientRect()
  pointer.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
  pointer.y = -((e.clientY - r.top)  / r.height) * 2 + 1
})

const { onBeforeRender } = useRenderLoop()
onBeforeRender(() => {
  if (!camera.value) return
  raycaster.setFromCamera(pointer, camera.value as THREE.Camera)
  const id = props.body.queryHover?.(raycaster) ?? null
  if (id !== lastId) { lastId = id; emit('hover', id) }
})
</script>

<template><slot /></template>
