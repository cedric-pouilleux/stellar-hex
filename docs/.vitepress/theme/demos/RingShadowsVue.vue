<script setup lang="ts">
import { onMounted } from 'vue'
import * as THREE from 'three'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS — gas giant + rings, side-lit so the ring shadow falls
 * across the equator. <Body> mounts <BodyRings> automatically. The
 * ring-on-planet shadow needs the sun position pushed into the
 * `uRingSunWorldPos` uniform — done once at mount since the light is
 * static here.
 */

const config: BodyConfig = {
  type:           'planetary', surfaceLook: 'bands',
  name:           'shadow-jove',
  radius:          1.4,
  rotationSpeed:   0.003,
  axialTilt:       0.18,
  hasRings:        true,
}

const body = useBody(config, DEFAULT_TILE_SIZE)

// Sun position matching the <TresDirectionalLight> in the template.
const SUN_DIR = new THREE.Vector3(6, 0.5, 0).normalize().multiplyScalar(1e4)

onMounted(() => {
  const planetMat = (body as any).planetMaterial?.material as THREE.ShaderMaterial | undefined
  if (planetMat?.uniforms.uRingSunWorldPos) {
    planetMat.uniforms.uRingSunWorldPos.value.copy(SUN_DIR)
  }
})
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 1.2, 6.5]" :look-at="[0, 0, 0]" />
    <TresAmbientLight :intensity="0.2" />
    <TresDirectionalLight :position="[6, 0.5, 0]" :intensity="2.5" :color="'#ffe6cc'" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
