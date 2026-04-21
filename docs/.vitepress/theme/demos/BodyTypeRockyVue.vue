<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'

/**
 * Vue / TresJS rocky planet demo.
 * Craters, cracks and optional lava are resolved automatically from the config.
 */

const config: BodyConfig = {
  type:           'rocky',
  name:           'rocky-body-demo',
  radius:         1,
  temperatureMin: -60,
  temperatureMax: 80,
  rotationSpeed:  0.003,
  axialTilt:      0.3,
  hasCracks:      true,
  hasLava:        true,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.5]" />
    <TresAmbientLight :intensity="0.2" />
    <TresDirectionalLight :position="[5, 3, 3]" :intensity="2.5" />
    <Body :body="body" :paused="false" :speed-multiplier="1" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
