<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'

/**
 * Vue / TresJS equivalent of ThreePlanetDemo.
 * <Body> automatically mounts AtmosphereShell and CloudShell based on the
 * config — no manual shell setup needed.
 */

const config: BodyConfig = {
  type:                'rocky',
  name:                'demo-earth',
  radius:              1,
  temperatureMin:      -20,
  temperatureMax:      35,
  liquidCoverage:      0.6,
  rotationSpeed:       0.004,
  axialTilt:           0.41,
  atmosphereThickness: 0.7,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.5]" />
    <TresAmbientLight :intensity="0.25" />
    <TresDirectionalLight :position="[5, 3, 3]" :intensity="2.5" />
    <Body
      :body="body"
      :paused="false"
      :speed-multiplier="1"
      :preview-mode="true" 
    />
  </TresCanvas>
</template>

<style scoped>
.vue-demo {
  width: 100%;
  height: 400px;
}
</style>
