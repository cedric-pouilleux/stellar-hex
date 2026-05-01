<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body, BodyWarmup } from '@cedric-pouilleux/stellex-js'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellex-js/sim'
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

// Multi-body warmup: one <BodyWarmup> per body, average their ratios.
const allBodies = [star, ...planets.map(p => p.body)]
const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)
const ratios       = ref<number[]>(allBodies.map(() => 0))
const readyCount   = ref(0)

function onProgress(i: number, info: { label: string; progress: number }) {
  loadingLabel.value = info.label
  ratios.value[i]    = info.progress
  loadingRatio.value = ratios.value.reduce((s, x) => s + x, 0) / ratios.value.length
}

function onReady() {
  readyCount.value++
  if (readyCount.value === allBodies.length) loading.value = false
}
</script>

<template>
  <div class="vue-demo-wrap">
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
      <BodyWarmup
        v-for="(b, i) in allBodies"
        :key="`warmup-${i}`"
        :body="b"
        @progress="info => onProgress(i, info)"
        @ready="onReady"
      />
    </TresCanvas>
    <div v-if="loading" class="hex-loader">
      <div class="hex-loader__label">{{ loadingLabel }}</div>
      <div class="hex-loader__bar">
        <div class="hex-loader__fill" :style="{ width: (loadingRatio * 100) + '%' }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.vue-demo-wrap { position: relative; width: 100%; height: 420px; }
.vue-demo      { width: 100%; height: 100%; }

.hex-loader {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: rgba(8, 8, 15, 0.65);
  backdrop-filter: blur(2px);
  z-index: 2;
}

.hex-loader__label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.04em;
}

.hex-loader__bar {
  width: 220px;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.hex-loader__fill {
  height: 100%;
  background: linear-gradient(90deg, #4ea3ff, #a78bff);
  transition: width 120ms ease-out;
}
</style>
