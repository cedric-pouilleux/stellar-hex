<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS equivalent of ThreePlanetDemo. The body's atmosphere renders
 * as a band of the layered hex mesh (no separate shell).
 */

const config: BodyConfig = {
  type:                'planetary', surfaceLook: 'terrain',
  name:                'demo-earth',
  radius:              1,
  liquidState:         'liquid',
  rotationSpeed:       0.004,
  axialTilt:           0.41,
    reliefFlatness:       0.55,
  atmosphereThickness: 0.7,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.5]" />
    <TresAmbientLight :intensity="0.25" />
    <TresDirectionalLight :position="[5, 3, 3]" :intensity="2.5" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body
      :body="body"
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
