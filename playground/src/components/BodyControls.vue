<script setup lang="ts">
import { computed } from 'vue'
import type { BodyConfig, SpectralType } from '@lib'
import { tileSize } from '../lib/state'
import RingControls from './RingControls.vue'
import TemperatureControls from './TemperatureControls.vue'
import LiquidControls from './LiquidControls.vue'

const props = defineProps<{ config: BodyConfig }>()

/** Whether a field is meaningful for the current body type. */
const isRocky   = computed(() => props.config.type === 'rocky')
const isGaseous = computed(() => props.config.type === 'gaseous')
const isStar    = computed(() => props.config.type === 'star')
const needsTemp = computed(() => props.config.type !== 'star')

const spectralTypes: SpectralType[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M']

function set<K extends keyof BodyConfig>(key: K, value: BodyConfig[K]) {
  ;(props.config as any)[key] = value
}

function setNum(key: keyof BodyConfig, evt: Event) {
  set(key as any, parseFloat((evt.target as HTMLInputElement).value) as any)
}
function setInt(key: keyof BodyConfig, evt: Event) {
  set(key as any, parseInt((evt.target as HTMLInputElement).value) as any)
}
</script>

<template>
  <details class="group" open>
    <summary>Identity</summary>
    <div class="group-body">
      <div class="row" style="grid-template-columns: 110px 1fr;">
        <label>Name (seed)</label>
        <input type="text" :value="config.name" @change="set('name', ($event.target as HTMLInputElement).value)" />
      </div>
      <p class="hint">The name is the deterministic seed driving noise, variation and resource distribution.</p>
    </div>
  </details>

  <details class="group" open>
    <summary>Geometry</summary>
    <div class="group-body">
      <div class="row">
        <label>Radius</label>
        <input type="range" min="0.5" max="8" step="0.1" :value="config.radius" @input="setNum('radius', $event)" />
        <span class="val">{{ config.radius.toFixed(1) }}</span>
      </div>
      <div class="row">
        <label>Tile size</label>
        <input type="range" min="0.05" max="0.5" step="0.01" :value="tileSize" @input="tileSize = parseFloat(($event.target as HTMLInputElement).value)" />
        <span class="val">{{ tileSize.toFixed(2) }}</span>
      </div>
      <div class="row" v-if="config.type === 'metallic'">
        <label>Terrain levels</label>
        <input type="range" min="4" max="40" step="1" :value="config.terrainLevelCount ?? 20" @input="setInt('terrainLevelCount', $event)" />
        <span class="val">{{ config.terrainLevelCount ?? 20 }}</span>
      </div>
      <div class="row">
        <label>Axial tilt</label>
        <input type="range" min="0" max="1.57" step="0.01" :value="config.axialTilt" @input="setNum('axialTilt', $event)" />
        <span class="val">{{ config.axialTilt.toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Rotation speed</label>
        <input type="range" min="0" max="0.2" step="0.001" :value="config.rotationSpeed" @input="setNum('rotationSpeed', $event)" />
        <span class="val">{{ config.rotationSpeed.toFixed(3) }}</span>
      </div>
    </div>
  </details>

  <details class="group" v-if="needsTemp" open>
    <summary>Climate</summary>
    <div class="group-body">
      <div class="row" style="grid-template-columns: 110px 1fr;">
        <label>Temperature</label>
        <TemperatureControls :config="config" />
      </div>
      <div class="row">
        <label>Mass (M⊕)</label>
        <input type="range" min="0.01" max="50" step="0.01" :value="config.mass ?? 1" @input="setNum('mass', $event)" />
        <span class="val">{{ (config.mass ?? 1).toFixed(2) }}</span>
      </div>
    </div>
  </details>

  <details class="group" v-if="isRocky" open>
    <summary>Liquid / Ocean</summary>
    <LiquidControls :config="config" />
  </details>

  <details class="group" v-if="isStar" open>
    <summary>Spectral</summary>
    <div class="group-body">
      <div class="row">
        <label>Spectral type</label>
        <select :value="config.spectralType ?? 'G'" @change="set('spectralType', ($event.target as HTMLSelectElement).value as SpectralType)">
          <option v-for="s in spectralTypes" :key="s" :value="s">{{ s }}</option>
        </select>
        <span></span>
      </div>
    </div>
  </details>

  <details class="group" v-if="isGaseous" open>
    <summary>Gas composition</summary>
    <div class="group-body">
      <template v-for="k in ['H2He','CH4','NH3','H2O','sulfur'] as const" :key="k">
        <div class="row">
          <label>{{ k }}</label>
          <input
            type="range" min="0" max="1" step="0.01"
            :value="config.gasComposition?.[k] ?? 0"
            @input="(e) => {
              const v = parseFloat(((e.target as HTMLInputElement).value))
              config.gasComposition = { ...(config.gasComposition ?? { H2He:0, CH4:0, NH3:0, H2O:0, sulfur:0 }), [k]: v }
            }"
          />
          <span class="val">{{ (config.gasComposition?.[k] ?? 0).toFixed(2) }}</span>
        </div>
      </template>
      <div class="row">
        <label>Core ratio</label>
        <input type="range" min="0.1" max="0.9" step="0.01" :value="config.coreRadiusRatio ?? 0.55" @input="setNum('coreRadiusRatio', $event)" />
        <span class="val">{{ (config.coreRadiusRatio ?? 0.55).toFixed(2) }}</span>
      </div>
    </div>
  </details>

  <details class="group" open>
    <summary>Variation</summary>
    <div class="group-body">
      <div class="row">
        <label>Resource density</label>
        <input type="range" min="0" max="2" step="0.05" :value="config.resourceDensity ?? 1" @input="setNum('resourceDensity', $event)" />
        <span class="val">{{ (config.resourceDensity ?? 1).toFixed(2) }}</span>
      </div>
    </div>
  </details>

  <details class="group" open>
    <summary>Rings</summary>
    <div class="group-body">
      <div class="row" style="grid-template-columns: 110px 1fr auto;">
        <label>Enabled</label>
        <span></span>
        <input type="checkbox" :checked="config.hasRings ?? false" @change="set('hasRings', ($event.target as HTMLInputElement).checked)" />
      </div>
    </div>
    <RingControls v-if="config.hasRings" />
  </details>
</template>
