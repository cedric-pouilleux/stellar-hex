<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS gas giant demo.
 * <Body> mounts <BodyRings> automatically when body.variation.rings is set.
 */

const config: BodyConfig = {
  type:           'gaseous',
  name:           'Jovian',
  radius:         2,
  rotationSpeed:  0.003,
  axialTilt:      0.05,
  hasRings:       true,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 1.8, 7]" :look-at="[0, 0, 0]" />
    <TresAmbientLight :intensity="0.3" />
    <TresDirectionalLight :position="[5, 3, 3]" :intensity="2" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
