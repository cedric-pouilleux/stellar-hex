<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS â€” body lit by two coloured lights. The planet material
 * picks them up via standard THREE shading (no custom hookup required).
 */

const config: BodyConfig = {
  type:                'rocky',
  name:                'multi-light-demo',
  radius:               1,
  rotationSpeed:        0.008,
  axialTilt:            0.3,
    reliefFlatness:       0.55,
  atmosphereThickness:  0.4,
  liquidState:         'liquid',
  liquidColor:         '#1d4d8c',
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.4]" />
    <TresAmbientLight :color="'#101018'" :intensity="0.3" />
    <TresDirectionalLight :position="[-4, 1, 4]"  :intensity="2.0" :color="'#ffaa55'" />
    <TresDirectionalLight :position="[4, 1, -2]"  :intensity="1.5" :color="'#55aaff'" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
