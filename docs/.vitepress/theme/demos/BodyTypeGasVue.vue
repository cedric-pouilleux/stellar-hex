<script setup lang="ts">
import { ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body, BodyWarmup } from '@cedric-pouilleux/stellex-js'
import type { BodyConfig } from '@cedric-pouilleux/stellex-js/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS gas giant demo.
 * Latitudinal band shader and ring system (when hasRings is set) are mounted
 * automatically by <Body>.
 */

const config: BodyConfig = {
  type:           'planetary', surfaceLook: 'bands',
  name:           'gas-body-demo',
  radius:         1,
  rotationSpeed:  0.004,
  axialTilt:      0.05,
  hasRings:       true,
}

const body = useBody(config, DEFAULT_TILE_SIZE)

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)
</script>

<template>
  <div class="vue-demo-wrap">
    <TresCanvas class="vue-demo" :clear-color="'#08080f'">
      <TresPerspectiveCamera :position="[0, 0, 3.5]" />
      <TresAmbientLight :intensity="0.15" />
      <TresDirectionalLight :position="[5, 2, 3]" :intensity="2" />
      <OrbitControlsBridge :auto-rotate="true" />
      <Body :body="body" :preview-mode="true" />
      <BodyWarmup
        :body="body"
        @progress="info => { loadingLabel = info.label; loadingRatio = info.progress }"
        @ready="loading = false"
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
.vue-demo-wrap { position: relative; width: 100%; height: 400px; }
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
