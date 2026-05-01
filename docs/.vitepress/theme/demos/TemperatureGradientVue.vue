<script setup lang="ts">
import { ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body, BodyWarmup } from '@cedric-pouilleux/stellex-js'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellex-js/sim'

/**
 * Vue / TresJS — four bodies along a temperature axis. Each cell pre-resolves
 * its palette anchors from its thermal class and pushes them into the lib —
 * the lib itself stays climate-agnostic.
 */

interface TempSpec {
  name:        string
  label:       string
  colorLow:    string
  colorHigh:   string
  liquidState: 'liquid' | 'frozen'
}

// Caller-side temperature → palette mapping. Mirrors the Three.js demo so
// both tabs illustrate the same caller-driven pattern.
const specs: TempSpec[] = [
  { name: 't-glacial', label: '−110 °C glaciaire', colorLow: '#404a58', colorHigh: '#d8e4f0', liquidState: 'frozen' },
  { name: 't-cold',    label: '−20 °C froid',      colorLow: '#3a3a40', colorHigh: '#aab0bc', liquidState: 'liquid' },
  { name: 't-temp',    label: '+25 °C tempéré',    colorLow: '#2c2820', colorHigh: '#8a8270', liquidState: 'liquid' },
  { name: 't-hot',     label: '+200 °C torride',   colorLow: '#3a1808', colorHigh: '#c08040', liquidState: 'liquid' },
]

const cells = specs.map(spec => ({
  spec,
  body: useBody({
    type:                'planetary', surfaceLook: 'terrain',
    name:                spec.name,
    radius:               1.4,
    rotationSpeed:        0.005,
    axialTilt:            0.3,
    reliefFlatness:       0.55,
    // Sol band ~80 % of the silhouette, atmosphere ~20 %.
    atmosphereThickness:  0.2,
    liquidState:          spec.liquidState,
    liquidColor:         '#1d4d8c',
    terrainColorLow:     spec.colorLow,
    terrainColorHigh:    spec.colorHigh,
  } as BodyConfig, DEFAULT_TILE_SIZE),
}))

// Multi-body warmup: each cell has its own canvas, each contributes a slice
// of the average progress. A single overlay covers the whole grid.
const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)
const ratios       = ref<number[]>(cells.map(() => 0))
const readyCount   = ref(0)

function onProgress(i: number, info: { label: string; progress: number }) {
  loadingLabel.value = info.label
  ratios.value[i]    = info.progress
  loadingRatio.value = ratios.value.reduce((s, x) => s + x, 0) / ratios.value.length
}

function onReady() {
  readyCount.value++
  if (readyCount.value === cells.length) loading.value = false
}
</script>

<template>
  <div class="temp-grid-wrap">
    <div class="temp-grid">
      <div v-for="(cell, i) in cells" :key="cell.spec.name" class="temp-cell">
        <TresCanvas class="temp-canvas" :clear-color="'#08080f'">
          <TresPerspectiveCamera :position="[0, 0, 4.4]" />
          <TresAmbientLight :intensity="0.3" />
          <TresDirectionalLight :position="[4, 3, 5]" :intensity="2.2" />
          <Body :body="(cell.body as unknown as RenderableBody)" :preview-mode="true" />
          <BodyWarmup
            :body="cell.body"
            @progress="info => onProgress(i, info)"
            @ready="onReady"
          />
        </TresCanvas>
        <p class="temp-label">{{ cell.spec.label }}</p>
      </div>
    </div>
    <div v-if="loading" class="hex-loader">
      <div class="hex-loader__label">{{ loadingLabel }}</div>
      <div class="hex-loader__bar">
        <div class="hex-loader__fill" :style="{ width: (loadingRatio * 100) + '%' }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.temp-grid-wrap { position: relative; width: 100%; height: 400px; }
.temp-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 1px;
  background: var(--vp-c-divider);
  height: 100%;
}
.temp-cell {
  position: relative;
  background: #08080f;
}
.temp-canvas { width: 100%; height: 100%; }
.temp-label {
  position: absolute;
  bottom: 0.5rem;
  left: 0.75rem;
  font-family: var(--vp-font-family-mono);
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.65);
  margin: 0;
  pointer-events: none;
}

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
