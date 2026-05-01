<script setup lang="ts">
import { ref, watch } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body, BodyWarmup } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'
import BodyViewBar, { type ViewMode } from './BodyViewBar.vue'

/**
 * Vue / TresJS — playable mode showcase. `interactive` is reactive on
 * <Body>; the view mode is pushed via `body.view.set` from a watcher.
 */

const config: BodyConfig = {
  type:                'planetary', surfaceLook: 'terrain',
  name:                'playable-demo',
  radius:               1,
  rotationSpeed:        0,
  axialTilt:            0.41,
    reliefFlatness:       0.55,
  atmosphereThickness:  0.6,
  liquidState:         'liquid',
  liquidCoverage:       0.55,
  liquidColor:         '#175da1',
}

const body = useBody(config, DEFAULT_TILE_SIZE)
const mode = ref<ViewMode>('shader')

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

watch(mode, m => {
  body.view.set(m === 'atmo' ? 'atmosphere' : 'surface')
})
</script>

<template>
  <div class="play-demo">
    <div class="play-canvas-wrap">
      <TresCanvas class="play-canvas" :clear-color="'#08080f'">
        <TresPerspectiveCamera :position="[0, 0.4, 3.6]" :look-at="[0, 0, 0]" />
        <TresAmbientLight :intensity="0.25" />
        <TresDirectionalLight :position="[5, 3, 4]" :intensity="2.5" :color="'#fff1dd'" />
        <OrbitControlsBridge :auto-rotate="true" />
        <Body
          :body="(body as unknown as RenderableBody)"
          :interactive="mode !== 'shader'"
          :preview-mode="true"
          :cloud-coverage="0.5"
        />
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

    <BodyViewBar :body-type="'rocky'" v-model:mode="mode" />
  </div>
</template>

<style scoped>
.play-demo { width: 100%; }
.play-canvas-wrap { position: relative; width: 100%; height: 460px; }
.play-canvas { width: 100%; height: 100%; }

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
