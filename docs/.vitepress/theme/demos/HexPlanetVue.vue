<script setup lang="ts">
import { ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellar-hex/sim'
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
</script>

<template>
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
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
