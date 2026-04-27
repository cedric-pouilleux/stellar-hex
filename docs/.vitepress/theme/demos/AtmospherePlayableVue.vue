<script setup lang="ts">
import { onMounted } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS — playable atmosphere band.
 *
 * <Body> is mounted with `interactive: true`; the view is switched to
 * 'atmosphere' on mount so the demo opens directly on the atmo band.
 * For raycasting / paint, see the Three.js tab — the same setup needs a
 * helper component running inside <TresCanvas> (see HexRaycaster).
 */

const config: BodyConfig = {
  type:                'rocky',
  name:                'atmo-playable',
  radius:               1,
  rotationSpeed:        0,
  axialTilt:            0.3,
  reliefFlatness:       0.55,
  atmosphereThickness:  0.7,
  liquidState:         'liquid',
  liquidColor:         '#175da1',
}

const body = useBody(config, DEFAULT_TILE_SIZE)

onMounted(() => {
  body.interactive.activate()
  body.view.set('atmosphere')
})
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0.4, 3.5]" :look-at="[0, 0, 0]" />
    <TresAmbientLight :intensity="0.35" />
    <TresDirectionalLight :position="[5, 3, 4]" :intensity="2.0" :color="'#fff1dd'" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body
      :body="(body as unknown as RenderableBody)"
      :interactive="true"
      :preview-mode="true"
    />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 460px; }
</style>
