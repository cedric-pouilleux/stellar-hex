<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as THREE from 'three'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body, BodyWarmup } from '@cedric-pouilleux/stellar-hex'
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

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

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
  <div class="vue-demo-wrap">
    <TresCanvas class="vue-demo" :clear-color="'#08080f'">
      <TresPerspectiveCamera :position="[0, 1.2, 6.5]" :look-at="[0, 0, 0]" />
      <TresAmbientLight :intensity="0.2" />
      <TresDirectionalLight :position="[6, 0.5, 0]" :intensity="2.5" :color="'#ffe6cc'" />
      <OrbitControlsBridge :auto-rotate="true" />
      <Body :body="body" :preview-mode="true" />
      <BodyWarmup
        :body="body"
        @progress="info => { loadingLabel = info.label; loadingRatio = info.progress }"
        @ready="loading = false"
      />
    </TresCanvas>
    <div v-if="loading" class="hex-loader">
      <div class="hex-loader__label">{{ loadingLabel }}</div>
      <div class="hex-loader__bar">
        <div class="hex-loader__fill" :style="{ width: (loadingRatio * 100) + '%' }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.vue-demo-wrap { position: relative; width: 100%; height: 400px; }
.vue-demo      { width: 100%; height: 100%; }

.hex-loader {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: rgba(8, 8, 15, 0.65);
  backdrop-filter: blur(2px);
  z-index: 2;
}

.hex-loader__label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.04em;
}

.hex-loader__bar {
  width: 220px;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.hex-loader__fill {
  height: 100%;
  background: linear-gradient(90deg, #4ea3ff, #a78bff);
  transition: width 120ms ease-out;
}
</style>
