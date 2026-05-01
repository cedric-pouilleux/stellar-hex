<script setup lang="ts">
import * as THREE from 'three'
import { TresCanvas } from '@tresjs/core'
import { onMounted, ref } from 'vue'
import { useBody, DEFAULT_TILE_SIZE, Body, BodyWarmup } from '@cedric-pouilleux/stellexjs'
import { buildNeighborMap, getNeighbors } from '@cedric-pouilleux/stellexjs/sim'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellexjs/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS — paints the BFS neighbourhood from a fixed start tile.
 * Same API as the Three.js demo, expressed declaratively.
 */

const config: BodyConfig = {
  type:                'planetary', surfaceLook: 'terrain',
  name:                'bfs-demo',
  radius:               1,
  rotationSpeed:        0,
  axialTilt:            0,
  reliefFlatness:       0.55,
  atmosphereThickness:  0.4,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
const COLORS = ['#ff5566', '#ffaa44', '#ffe066', '#88dd88', '#5599ff', '#aa88ff']

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

onMounted(() => {
  body.interactive.activate()
  if (body.kind !== 'planet') return
  const sim   = body.sim
  const nMap  = buildNeighborMap(sim.tiles)
  const queue: Array<{ id: number, depth: number }> = [{ id: 0, depth: 0 }]
  const seen  = new Set<number>()
  const overlay = new Map<number, { r: number; g: number; b: number }>()
  const tmp     = new THREE.Color()
  while (queue.length) {
    const { id, depth } = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    tmp.set(COLORS[depth] ?? COLORS[COLORS.length - 1])
    overlay.set(id, { r: tmp.r, g: tmp.g, b: tmp.b })
    if (depth >= COLORS.length - 1) continue
    for (const nid of getNeighbors(id, nMap)) {
      if (!seen.has(nid)) queue.push({ id: nid, depth: depth + 1 })
    }
  }
  body.tiles.sol.applyOverlay(overlay)
})
</script>

<template>
  <div class="vue-demo-wrap">
    <TresCanvas class="vue-demo" :clear-color="'#08080f'">
      <TresPerspectiveCamera :position="[0, 0, 4]" />
      <TresAmbientLight :intensity="0.5" />
      <TresDirectionalLight :position="[5, 3, 4]" :intensity="2.0" />
      <OrbitControlsBridge :auto-rotate="true" />
      <Body
        :body="(body as unknown as RenderableBody)"
        :interactive="true"
        :preview-mode="true"
      />
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
