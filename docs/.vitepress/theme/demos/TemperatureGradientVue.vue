<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS — temperate body. To switch to a frozen variant, swap
 * `liquidState` to `'frozen'` and shift the temperature window below 0 °C.
 */

const config: BodyConfig = {
  type:                'planetary', surfaceLook: 'terrain',
  name:                'temp-demo',
  radius:               1,
  rotationSpeed:        0.005,
  axialTilt:            0.3,
    reliefFlatness:       0.55,
  atmosphereThickness:  0.5,
  liquidState:         'liquid',
  liquidColor:         '#1d4d8c',
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.4]" />
    <TresAmbientLight :intensity="0.3" />
    <TresDirectionalLight :position="[5, 3, 4]" :intensity="2.2" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
