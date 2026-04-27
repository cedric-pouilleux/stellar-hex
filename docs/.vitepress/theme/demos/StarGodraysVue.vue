<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS â€” bare star (no post-process). For the full god-ray pipeline,
 * mount an EffectComposer outside TresJS or use a pass plug-in like
 * @tresjs/cientos's <Postpro>.
 */

const config: BodyConfig = {
  type:           'star',
  name:           'godray-sun',
  radius:          1,
  spectralType:   'G',
  rotationSpeed:   0.001,
  axialTilt:       0,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#000005'">
    <TresPerspectiveCamera :position="[0, 0, 5]" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
