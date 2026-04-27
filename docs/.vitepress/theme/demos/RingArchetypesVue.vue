<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body, ARCHETYPE_PROFILES } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS â€” single gas giant whose ring archetype is overridden
 * before mounting the body. Swap `archetype` to switch the look.
 */

const config: BodyConfig = {
  type:           'gaseous',
  name:           'archetype-demo',
  radius:          1.2,
  rotationSpeed:   0.002,
  axialTilt:       0.15,
  hasRings:        true,
}

const body = useBody(config, DEFAULT_TILE_SIZE)

if (body.variation.rings) {
  body.variation.rings = {
    ...body.variation.rings,
    archetype: 'shepherd',
    profile:   ARCHETYPE_PROFILES.shepherd,
  }
}
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 1.2, 6]" :look-at="[0, 0, 0]" />
    <TresAmbientLight :intensity="0.3" />
    <TresDirectionalLight :position="[4, 3, 4]" :intensity="2.0" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
