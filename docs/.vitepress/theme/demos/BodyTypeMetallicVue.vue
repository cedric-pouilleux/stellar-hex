<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import {
  useBody,
  generateBodyVariation,
  DEFAULT_TILE_SIZE,
  Body,
} from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS metallic planet demo.
 * PBR reflections come from the metallic shader; the crack network and lava
 * veins are activated by pushing non-zero intensities onto the variation.
 */

const config: BodyConfig = {
  type:           'planetary', surfaceLook: 'metallic',
  name:           'metallic-body-demo',
  radius:         1,
  rotationSpeed:  0.003,
  axialTilt:      0.15,
}

const variation = generateBodyVariation(config)
variation.crackIntensity = 0.5
variation.lavaIntensity  = 0.4

const body = useBody(config, DEFAULT_TILE_SIZE, { variation })
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
