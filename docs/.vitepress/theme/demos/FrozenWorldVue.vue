<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS frozen-world demo.
 */

const config: BodyConfig = {
  type:                'rocky',
  name:                'frozen-demo',
  radius:               1,
  rotationSpeed:        0.006,
  axialTilt:            0.4,
    reliefFlatness:       0.55,
  atmosphereThickness:  0.3,
  liquidState:         'frozen',
  liquidColor:         '#a8c8e0',
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.5]" />
    <TresAmbientLight :color="'#b0c4de'" :intensity="0.4" />
    <TresDirectionalLight :position="[5, 3, 4]" :intensity="2.0" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body
      :body="body"
      :preview-mode="true"
    />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
