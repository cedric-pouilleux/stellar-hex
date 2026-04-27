<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS star demo.
 * <Body> mounts the animated star shader.
 * Wire god-rays via a post-processing pass child component for the full effect.
 */

const config: BodyConfig = {
  type:           'star',
  name:           'Sol',
  radius:         1,
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
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
