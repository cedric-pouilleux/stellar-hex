<script setup lang="ts">
/**
 * Double-range temperature slider with a cold-to-hot gradient track.
 * Mutates the bound `temperatureMin` / `temperatureMax` fields on `config`
 * through the shared range helpers so the gap between handles is preserved.
 */
import { computed } from 'vue'
import type { PlaygroundBodyConfig } from '../lib/state'
import {
  commitMin,
  commitMax,
  temperatureGradientCss,
  toRatio,
} from '../lib/temperatureRange'

interface Props {
  config: PlaygroundBodyConfig
  /** Absolute lower bound for the slider domain (°C). */
  absoluteMin?: number
  /** Absolute upper bound for the slider domain (°C). */
  absoluteMax?: number
  /** Minimum gap between min and max handles (°C). */
  minGap?: number
}
const props = withDefaults(defineProps<Props>(), {
  absoluteMin: -273,
  absoluteMax: 500,
  minGap:      1,
})

const bounds = computed(() => ({
  absoluteMin: props.absoluteMin,
  absoluteMax: props.absoluteMax,
  minGap:      props.minGap,
}))

const minPct = computed(() => toRatio(props.config.temperatureMin, props.absoluteMin, props.absoluteMax) * 100)
const maxPct = computed(() => toRatio(props.config.temperatureMax, props.absoluteMin, props.absoluteMax) * 100)

const trackBackground = temperatureGradientCss()

function onMinInput(evt: Event) {
  const v = parseFloat((evt.target as HTMLInputElement).value)
  const next = commitMin(v, {
    min: props.config.temperatureMin,
    max: props.config.temperatureMax,
  }, bounds.value)
  props.config.temperatureMin = next.min
  props.config.temperatureMax = next.max
}

function onMaxInput(evt: Event) {
  const v = parseFloat((evt.target as HTMLInputElement).value)
  const next = commitMax(v, {
    min: props.config.temperatureMin,
    max: props.config.temperatureMax,
  }, bounds.value)
  props.config.temperatureMin = next.min
  props.config.temperatureMax = next.max
}
</script>

<template>
  <div class="temp-ctrl">
    <div class="temp-readout">
      <span class="temp-val cold">{{ config.temperatureMin }}°C</span>
      <span class="temp-sep">→</span>
      <span class="temp-val hot">{{ config.temperatureMax }}°C</span>
    </div>

    <div class="temp-slider">
      <div class="temp-track" :style="{ background: trackBackground }"></div>
      <div
        class="temp-selected"
        :style="{ left: minPct + '%', width: (maxPct - minPct) + '%' }"
      ></div>

      <input
        type="range"
        class="temp-thumb temp-thumb-min"
        :min="absoluteMin" :max="absoluteMax" step="1"
        :value="config.temperatureMin"
        @input="onMinInput"
        aria-label="Temperature min"
      />
      <input
        type="range"
        class="temp-thumb temp-thumb-max"
        :min="absoluteMin" :max="absoluteMax" step="1"
        :value="config.temperatureMax"
        @input="onMaxInput"
        aria-label="Temperature max"
      />
    </div>

    <div class="temp-scale">
      <span>{{ absoluteMin }}°C</span>
      <span>{{ absoluteMax }}°C</span>
    </div>
  </div>
</template>

<style scoped>
.temp-ctrl {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 2px 2px;
}

.temp-readout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.temp-val       { color: #c9cdd4; }
.temp-val.cold  { color: #6dc1e0; }
.temp-val.hot   { color: #e08c4a; }
.temp-sep       { color: #5a6370; }

.temp-slider {
  position: relative;
  height: 28px;
}

.temp-track {
  position: absolute;
  inset: 0;
  height: 28px;
  border-radius: 3px;
  border: 1px solid #1d2028;
}

.temp-selected {
  position: absolute;
  top: 0;
  height: 28px;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22) inset;
  pointer-events: none;
}

/* Both thumbs share the same track-space; tracks are made invisible so only
   the thumbs are interactive, stacked so the min handle stays reachable when
   both sit near the same position. */
.temp-thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  pointer-events: none;
  margin: 0;
}
.temp-thumb-min { z-index: 2; }
.temp-thumb-max { z-index: 3; }

.temp-thumb::-webkit-slider-runnable-track,
.temp-thumb::-moz-range-track {
  background: transparent;
  border: none;
  height: 28px;
}

.temp-thumb::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  pointer-events: auto;
  width: 8px;
  height: 32px;
  border-radius: 2px;
  background: #e4e6ea;
  border: 1px solid #0b0d12;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  cursor: ew-resize;
  margin-top: -2px;
}
.temp-thumb::-moz-range-thumb {
  pointer-events: auto;
  width: 8px;
  height: 32px;
  border-radius: 2px;
  background: #e4e6ea;
  border: 1px solid #0b0d12;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  cursor: ew-resize;
}

.temp-thumb:focus-visible::-webkit-slider-thumb { border-color: #4d7dd4; }
.temp-thumb:focus-visible::-moz-range-thumb     { border-color: #4d7dd4; }

.temp-scale {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #5a6370;
  font-variant-numeric: tabular-nums;
}
</style>
