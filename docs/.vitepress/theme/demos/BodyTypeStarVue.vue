<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'

/**
 * Vue / TresJS star demo.
 * Convective granulation and corona glow are driven by the spectral type.
 * Wire a post-processing pass for god-rays (see the star-godrays example).
 */

const config: BodyConfig = {
  type:           'star',
  name:           'star-body-demo',
  radius:         1,
  temperatureMin: 5000,
  temperatureMax: 5778,
  spectralType:   'G',
  rotationSpeed:  0.002,
  axialTilt:      0,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#000005'">
    <TresPerspectiveCamera :position="[0, 0, 4]" />
    <TresAmbientLight :intensity="0.05" />
    <Body :body="body" :paused="false" :speed-multiplier="1" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
