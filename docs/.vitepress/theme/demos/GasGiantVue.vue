<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'

/**
 * Vue / TresJS gas giant demo.
 * <Body> mounts <BodyRings> automatically when body.variation.rings is set.
 */

const config: BodyConfig = {
  type:           'gaseous',
  name:           'Jovian',
  radius:         2,
  temperatureMin: 90,
  temperatureMax: 130,
  rotationSpeed:  0.003,
  axialTilt:      0.05,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 2, 8]" />
    <TresAmbientLight :intensity="0.3" />
    <TresDirectionalLight :position="[5, 3, 3]" :intensity="2" />
    <Body :body="body" :paused="false" :speed-multiplier="1" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
