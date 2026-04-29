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
 * Vue / TresJS lava-world demo.
 * Cracks + lava are pure visual effects: the caller activates them by
 * pushing non-zero intensities + the desired colour onto the body's
 * `BodyVariation` and feeding it to `useBody({ variation })`.
 */

const config: BodyConfig = {
  type:                'planetary', surfaceLook: 'terrain',
  name:                'lava-demo',
  radius:               1,
  rotationSpeed:        0.002,
  axialTilt:            0.1,
  reliefFlatness:       0.55,
  atmosphereThickness:  0.05,
}

const variation = generateBodyVariation(config)
variation.crackIntensity = 0.6
variation.lavaIntensity  = 0.5
variation.lavaColor      = '#ff5520'

const body = useBody(config, DEFAULT_TILE_SIZE, { variation })
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.4]" />
    <TresAmbientLight :intensity="0.15" />
    <TresDirectionalLight :position="[4, 3, 5]" :intensity="1.5" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
