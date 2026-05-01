<script setup lang="ts">
import { onMounted, nextTick, ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body, BodyWarmup } from '@cedric-pouilleux/stellexjs'
import { buildNeighborMap, getNeighbors } from '@cedric-pouilleux/stellexjs/sim'
import type { BodyConfig, RenderableBody } from '@cedric-pouilleux/stellexjs/sim'
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

const loading      = ref(true)
const loadingLabel = ref('Preparing shaders…')
const loadingRatio = ref(0)

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
  <div class="vue-demo-wrap">
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
.vue-demo-wrap { position: relative; width: 100%; height: 460px; }
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
