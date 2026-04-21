<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'

/**
 * Vue / TresJS gas giant demo.
 * Latitudinal band shader and ring system (when hasRings is set) are mounted
 * automatically by <Body>.
 */

const config: BodyConfig = {
  type:           'gaseous',
  name:           'gas-body-demo',
  radius:         1,
  temperatureMin: 90,
  temperatureMax: 130,
  rotationSpeed:  0.004,
  axialTilt:      0.05,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.5]" />
    <TresAmbientLight :intensity="0.15" />
    <TresDirectionalLight :position="[5, 2, 3]" :intensity="2" />
    <Body :body="body" :paused="false" :speed-multiplier="1" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
