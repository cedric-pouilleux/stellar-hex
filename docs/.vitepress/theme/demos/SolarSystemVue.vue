<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS — three planets orbit a central star. Orbital position is
 * caller-driven; rotation is handled by <Body>'s internal animator.
 *
 * Lighting: a single `THREE.PointLight` instance is created imperatively,
 * mounted in the template via `<primitive>` and passed to every
 * `useBody({ sunLight })`. The same instance drives both the visible
 * Three.js lighting and the body shaders' planet→sun direction — no
 * separate `Vector3` to keep in sync.
 */

const sun = new THREE.PointLight(0xfff1cc, 4.5, 0, 0)
sun.position.set(0, 0, 0)

const star = useBody({
  type: 'star', name: 'system-sun',
  radius: 1.2,
  spectralType: 'G', rotationSpeed: 0.003, axialTilt: 0,
  reliefFlatness: 0.55,
} as BodyConfig, DEFAULT_TILE_SIZE)

const planets = [
  { body: useBody({
      type: 'planetary', surfaceLook: 'terrain', name: 'rocky-1',
      radius: 0.45,
      rotationSpeed: 0.02, axialTilt: 0.4,
      reliefFlatness: 0.55,
      atmosphereThickness: 0.5, liquidState: 'liquid', liquidColor: '#1d4d8c',
    } as BodyConfig, DEFAULT_TILE_SIZE, { sunLight: sun }),
    orbitRadius: 4.5, orbitSpeed: 0.30, phase: 0 },
  { body: useBody({
      type: 'planetary', surfaceLook: 'metallic', name: 'metal-2',
      radius: 0.6,
      rotationSpeed: 0.012, axialTilt: 0.2,
      reliefFlatness: 0.55,
    } as BodyConfig, DEFAULT_TILE_SIZE, { sunLight: sun }),
    orbitRadius: 7.0, orbitSpeed: 0.18, phase: 1.5 },
  { body: useBody({
      type: 'planetary', surfaceLook: 'bands', name: 'jovian-3',
      radius: 1.0,
      rotationSpeed: 0.005, axialTilt: 0.05,
      reliefFlatness: 0.55,
    } as BodyConfig, DEFAULT_TILE_SIZE, { sunLight: sun }),
    orbitRadius: 11.0, orbitSpeed: 0.10, phase: 3.2 },
]

// Initial placement so the first frame is correct before the RAF loop kicks in.
planets.forEach(p => p.body.group.position.set(p.orbitRadius, 0, 0))

let animId: number | null = null
let elapsed = 0
let last    = performance.now()

const tick = () => {
  animId = requestAnimationFrame(tick)
  const now = performance.now()
  const dt  = (now - last) / 1000
  last = now
  elapsed += dt
  star.tick(dt)
  planets.forEach((p) => {
    const angle = p.phase + elapsed * p.orbitSpeed
    // Direct group write: needed because `body.tick` reads world position
    // to recompute the sun direction. Going through <Body>'s `pose`
    // would defer the position update to the TresJS render loop, after
    // tick has already run.
    p.body.group.position.set(
      Math.cos(angle) * p.orbitRadius,
      0,
      Math.sin(angle) * p.orbitRadius,
    )
    p.body.tick(dt)
  })
}

onMounted(() => tick())
onBeforeUnmount(() => { if (animId) cancelAnimationFrame(animId) })
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#000005'">
    <TresPerspectiveCamera :position="[0, 9, 18]" :look-at="[0, 0, 0]" />
    <primitive :object="sun" />

    <OrbitControlsBridge :auto-rotate="true" />

    <Body :body="(star as unknown as RenderableBody)" :preview-mode="true" />
    <Body
      v-for="p in planets"
      :key="p.body.config.name"
      :body="(p.body as unknown as RenderableBody)"
      :sun-light="sun"
    />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 420px; }
</style>
