<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS â€” three planets orbit a central star. Orbital position is
 * caller-driven; rotation is handled by <Body>'s internal animator.
 */

const star = useBody({
  type: 'star', name: 'system-sun',
  radius: 1.2, 
  spectralType: 'G', rotationSpeed: 0.003, axialTilt: 0,
    reliefFlatness:       0.55,
} as BodyConfig, DEFAULT_TILE_SIZE)

const planets = [
  { body: useBody({
      type: 'rocky', name: 'rocky-1',
      radius: 0.45, 
      rotationSpeed: 0.02, axialTilt: 0.4,
    reliefFlatness:       0.55,
      atmosphereThickness: 0.5, liquidState: 'liquid', liquidColor: '#1d4d8c',
    } as BodyConfig, DEFAULT_TILE_SIZE),
    orbitRadius: 4.5, orbitSpeed: 0.30, phase: 0 },
  { body: useBody({
      type: 'metallic', name: 'metal-2',
      radius: 0.6, 
      rotationSpeed: 0.012, axialTilt: 0.2,
    reliefFlatness:       0.55,
    } as BodyConfig, DEFAULT_TILE_SIZE),
    orbitRadius: 7.0, orbitSpeed: 0.18, phase: 1.5 },
  { body: useBody({
      type: 'gaseous', name: 'jovian-3',
      radius: 1.0, 
      rotationSpeed: 0.005, axialTilt: 0.05,
    reliefFlatness:       0.55,
    } as BodyConfig, DEFAULT_TILE_SIZE),
    orbitRadius: 11.0, orbitSpeed: 0.10, phase: 3.2 },
]

const poses = ref(planets.map(p => ({
  quaternion: new THREE.Quaternion(),
  position:   new THREE.Vector3(p.orbitRadius, 0, 0),
})))

let animId: number | null = null
let elapsed = 0
let last    = performance.now()

const tick = () => {
  animId = requestAnimationFrame(tick)
  const now = performance.now()
  const dt  = (now - last) / 1000
  last = now
  elapsed += dt
  planets.forEach((p, i) => {
    const angle = p.phase + elapsed * p.orbitSpeed
    poses.value[i].position.set(
      Math.cos(angle) * p.orbitRadius,
      0,
      Math.sin(angle) * p.orbitRadius,
    )
  })
}

onMounted(() => tick())
onBeforeUnmount(() => { if (animId) cancelAnimationFrame(animId) })
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#000005'">
    <TresPerspectiveCamera :position="[0, 9, 18]" :look-at="[0, 0, 0]" />
    <TresAmbientLight :color="'#222233'" :intensity="0.4" />
    <TresPointLight :position="[0, 0, 0]" :intensity="4.5" :color="'#fff1cc'" />

    <OrbitControlsBridge :auto-rotate="true" />

    <Body :body="(star as unknown as RenderableBody)" :preview-mode="true" />
    <Body
      v-for="(p, i) in planets"
      :key="p.body.config.name"
      :body="(p.body as unknown as RenderableBody)"
      :pose="poses[i]"
    />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 420px; }
</style>
