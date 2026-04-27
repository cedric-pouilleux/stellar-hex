<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS metallic planet demo.
 * PBR reflections, crack network and lava veins are resolved automatically
 * from the config temperature range and hasCracks / hasLava flags.
 */

const config: BodyConfig = {
  type:           'metallic',
  name:           'metallic-body-demo',
  radius:         1,
  rotationSpeed:  0.003,
  axialTilt:      0.15,
  hasCracks:      true,
  hasLava:        true,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.5]" />
    <TresAmbientLight :intensity="0.1" />
    <TresDirectionalLight :position="[5, 3, 3]" :intensity="3" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
