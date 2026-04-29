<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS gas giant demo.
 * Latitudinal band shader and ring system (when hasRings is set) are mounted
 * automatically by <Body>.
 */

const config: BodyConfig = {
  type:           'planetary', surfaceLook: 'bands',
  name:           'gas-body-demo',
  radius:         1,
  rotationSpeed:  0.004,
  axialTilt:      0.05,
  hasRings:       true,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.5]" />
    <TresAmbientLight :intensity="0.15" />
    <TresDirectionalLight :position="[5, 2, 3]" :intensity="2" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
