<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS atmosphere demo.
 * Increasing `atmosphereThickness` thickens the procedural shell,
 * dampens crater/crack relief and softens hex transitions.
 */

const config: BodyConfig = {
  type:                'planetary', surfaceLook: 'terrain',
  name:                'atmo-demo',
  radius:               1,
  rotationSpeed:        0.005,
  axialTilt:            0.2,
    reliefFlatness:       0.55,
  atmosphereThickness:  0.6,
  liquidState:         'liquid',
  liquidColor:         '#1d4d8c',
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.6]" />
    <TresAmbientLight :intensity="0.25" />
    <TresDirectionalLight :position="[5, 3, 4]" :intensity="2.4" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
