<script setup lang="ts">
import * as THREE from 'three'
import { TresCanvas, useTresContext } from '@tresjs/core'
import { onMounted } from 'vue'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import { buildNeighborMap, getNeighbors } from '@cedric-pouilleux/stellar-hex/sim'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS â€” paints the BFS neighbourhood from a fixed start tile.
 * Same API as the Three.js demo, expressed declaratively.
 */

const config: BodyConfig = {
  type:                'rocky',
  name:                'bfs-demo',
  radius:               1,
  rotationSpeed:        0,
  axialTilt:            0,
    reliefFlatness:       0.55,
  atmosphereThickness:  0.4,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
const COLORS = ['#ff5566', '#ffaa44', '#ffe066', '#88dd88', '#5599ff', '#aa88ff']

onMounted(() => {
  body.interactive.activate()
  const sim   = (body as any).sim
  const nMap  = buildNeighborMap(sim.tiles)
  const queue: Array<{ id: number, depth: number }> = [{ id: 0, depth: 0 }]
  const seen  = new Set<number>()
  while (queue.length) {
    const { id, depth } = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    body.tiles.setBaseColor(id, new THREE.Color(COLORS[depth] ?? COLORS[COLORS.length - 1]))
    if (depth >= COLORS.length - 1) continue
    for (const nid of getNeighbors(id, nMap)) {
      if (!seen.has(nid)) queue.push({ id: nid, depth: depth + 1 })
    }
  }
})
</script>

<template>
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
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
