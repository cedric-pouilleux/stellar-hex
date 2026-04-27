<script setup lang="ts">
import { ref, watch } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'
import BodyViewBar, { type ViewMode } from './BodyViewBar.vue'

/**
 * Vue / TresJS â€” playable mode showcase. `interactive` is reactive on
 * <Body>; the view mode is pushed via `body.view.set` from a watcher.
 */

const config: BodyConfig = {
  type:                'rocky',
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

watch(mode, m => {
  body.view.set(m === 'atmo' ? 'atmosphere' : 'surface')
})
</script>

<template>
  <div class="play-demo">
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
    </TresCanvas>

    <BodyViewBar :body-type="'rocky'" v-model:mode="mode" />
  </div>
</template>

<style scoped>
.play-demo { width: 100%; }
.play-canvas { width: 100%; height: 460px; }
</style>
