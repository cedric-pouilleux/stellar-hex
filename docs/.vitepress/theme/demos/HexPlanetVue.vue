<script setup lang="ts">
import { ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body, BodyWarmup } from '@cedric-pouilleux/stellex-js'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellex-js/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'
import HexRaycaster from './HexRaycaster.vue'

/**
 * Vue / TresJS hex viewer.
 * Raycasting is handled by HexRaycaster (a child component placed inside
 * TresCanvas so it can access useTresContext).
 */

const config: BodyConfig = {
  type:                'planetary', surfaceLook: 'terrain',
  name:                'hex-demo',
  radius:              1,
  liquidState:         'liquid',
  rotationSpeed:       0,
  axialTilt:           0,
    reliefFlatness:       0.55,
  atmosphereThickness: 0.7,
}

const body          = useBody(config, DEFAULT_TILE_SIZE)
const hoveredTileId = ref<number | null>(null)

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)
</script>

<template>
  <div class="vue-demo-wrap">
    <TresCanvas class="vue-demo" :clear-color="'#08080f'">
      <TresPerspectiveCamera :position="[0, 0, 3.5]" />
      <TresAmbientLight :intensity="0.6" />
      <TresDirectionalLight :position="[6, 4, 5]" :intensity="2.5" />
      <OrbitControlsBridge :auto-rotate="true" />
      <Body
        :body="(body as unknown as RenderableBody)"
        :interactive="true"
        :hovered-tile-id="hoveredTileId"
      />
      <HexRaycaster :body="body" @hover="hoveredTileId = $event" />
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
