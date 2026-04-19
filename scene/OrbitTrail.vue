<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { useTresContext, useLoop } from '@tresjs/core'
import type { OrbitConfig } from '../types/body.types'
import { ORBIT_TRAIL_SEGMENTS } from '../config/render'

// Le trail est ajouté directement à la scène (pas au groupe parent).
// Chaque frame, son pivot est repositionné sur la position monde du parent
// sans hériter de sa rotation — donc le tracé reste parfaitement aligné
// même quand le parent tourne sur lui-même.

const props = defineProps<{
  orbit:       OrbitConfig
  parentGroup: THREE.Group
}>()

const { scene }          = useTresContext()
const { onBeforeRender } = useLoop()

function buildGeometry(): THREE.BufferGeometry {
  const { radius: r, inclination: inc } = props.orbit
  const pts = new Float32Array((ORBIT_TRAIL_SEGMENTS + 1) * 3)
  for (let i = 0; i <= ORBIT_TRAIL_SEGMENTS; i++) {
    const a   = (i / ORBIT_TRAIL_SEGMENTS) * Math.PI * 2
    const idx = i * 3
    pts[idx]     =  Math.cos(a) * r
    pts[idx + 1] = -Math.sin(a) * Math.sin(inc) * r
    pts[idx + 2] =  Math.sin(a) * Math.cos(inc) * r
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return geo
}

const line = new THREE.Line(
  buildGeometry(),
  new THREE.LineBasicMaterial({ color: 0x00ffd5, transparent: true, opacity: 0.18, depthWrite: false }),
)
line.raycast = () => {}

// Pivot sans rotation — seule la position est mise à jour chaque frame
const pivot = new THREE.Group()
pivot.add(line)

const _wp = new THREE.Vector3()

onMounted(()       => scene.value.add(pivot))
onBeforeUnmount(() => {
  scene.value.remove(pivot)
  line.geometry.dispose()
  ;(line.material as THREE.Material).dispose()
})

onBeforeRender(() => {
  props.parentGroup.getWorldPosition(_wp)
  pivot.position.copy(_wp)
})
</script>

<template><!-- renderless --></template>
