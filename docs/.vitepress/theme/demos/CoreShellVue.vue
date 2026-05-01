<script setup lang="ts">
import { onMounted, nextTick } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import { buildNeighborMap, getNeighbors } from '@cedric-pouilleux/stellar-hex/sim'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS — Earth-like planet with a pre-excavated tile cluster
 * exposing the molten core. The core mesh (sphere of fire shader +
 * point light) becomes visible wherever a sol tile has been mined down
 * to band 0.
 */

const config: BodyConfig = {
  type:                'planetary', surfaceLook: 'terrain',
  name:                'core-demo',
  radius:               1,
  rotationSpeed:        0,
  axialTilt:            0.3,
    reliefFlatness:       0.55,
  atmosphereThickness:  0.4,
  coreRadiusRatio:      0.55,
  liquidState:         'liquid',
  liquidCoverage:       0.4,
  liquidColor:         '#175da1',
}

const body = useBody(config, DEFAULT_TILE_SIZE)

onMounted(async () => {
  body.interactive.activate()
  body.view.set('surface')

  // Wait two ticks: <Body> needs to mount the group, and the interactive
  // mesh needs its first attribute upload before we mutate sol heights.
  await nextTick()
  await nextTick()

  try {
    const sim    = body.sim
    const seaLvl = sim.seaLevelElevation

    let centreId: number | null = null
    for (const [id, state] of sim.tileStates) {
      if (state.elevation > seaLvl) { centreId = id; break }
    }
    if (centreId == null) return

    const nMap    = buildNeighborMap(sim.tiles)
    const seen    = new Set<number>()
    const queue: number[] = [centreId]
    const updates = new Map<number, number>()
    while (queue.length && updates.size < 14) {
      const cur = queue.shift()!
      if (seen.has(cur)) continue
      seen.add(cur)
      const s = sim.tileStates.get(cur)
      if (s && s.elevation > seaLvl) {
        updates.set(cur, 0)
        for (const n of getNeighbors(cur, nMap)) queue.push(n)
      }
    }
    if (updates.size > 0) body.tiles.sol.updateTileSolHeight(updates)
  } catch (err) {
    console.warn('[CoreShellVue] pre-excavation skipped:', err)
  }
})
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0.4, 3.0]" :look-at="[0, 0, 0]" />
    <TresAmbientLight :intensity="0.4" />
    <TresDirectionalLight :position="[5, 3, 4]" :intensity="1.8" :color="'#fff1dd'" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body
      :body="(body as unknown as RenderableBody)"
      :interactive="true"
      :preview-mode="true"
    />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 460px; }
</style>
