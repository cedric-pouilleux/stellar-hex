<script setup lang="ts">
import { ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellar-hex/sim'
import HexRaycaster from './HexRaycaster.vue'

/**
 * Vue / TresJS hex viewer.
 * Raycasting is handled by HexRaycaster (a child component placed inside
 * TresCanvas so it can access useTresContext).
 */

const config: BodyConfig = {
  type:                'rocky',
  name:                'hex-demo',
  radius:              1,
  temperatureMin:      -20,
  temperatureMax:      35,
  liquidCoverage:      0.6,
  rotationSpeed:       0,
  axialTilt:           0,
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
    <Body
      :body="(body as unknown as RenderableBody)"
      :paused="false"
      :speed-multiplier="1"
      :interactive="true"
      :hovered-tile-id="hoveredTileId"
    />
    <HexRaycaster :body="body" @hover="hoveredTileId = $event" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
