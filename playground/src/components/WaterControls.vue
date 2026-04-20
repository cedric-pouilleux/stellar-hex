<script setup lang="ts">
/**
 * Live tuning panel for the hex ocean shader.
 *
 * Drives `hexGraphicsUniforms` (wave strength, wave speed, specular, depth
 * darkening, opacity, master toggle, ocean-layer visibility) through the
 * reactive mirror exposed by `oceanShaderParams`. No rebuild required —
 * every slider change is picked up by the material on the next frame.
 *
 * A small badge at the top resolves the dominant surface liquid from the
 * current `BodyConfig` so the user sees what the shader is actually rendering.
 */
import { computed } from 'vue'
import type { BodyConfig } from '@lib'
import {
  oceanShaderParams,
  OCEAN_SHADER_RANGES,
  type OceanShaderNumericKey,
} from '../lib/oceanShader'
import {
  liquidAccent,
  liquidLabel,
  resolveWaterState,
} from '../lib/waterDiagnostics'

const props = defineProps<{ config: BodyConfig }>()

const waterState = computed(() => resolveWaterState(props.config))

function setCoverage(evt: Event) {
  props.config.waterCoverage = parseFloat((evt.target as HTMLInputElement).value)
}

const numericKeys: OceanShaderNumericKey[] = [
  'waveStrength', 'waveSpeed', 'specularIntensity', 'depthDarken', 'oceanOpacity',
]

function setNum(key: OceanShaderNumericKey, evt: Event) {
  oceanShaderParams[key] = parseFloat((evt.target as HTMLInputElement).value)
}

function digits(step: number): number {
  return step >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(step)))
}
</script>

<template>
  <div class="group-body">
    <!-- ── Liquid state badge ─────────────────────────────────────── -->
    <div class="water-badge" :style="{ borderColor: liquidAccent(waterState) }">
      <div class="water-dot" :style="{ background: liquidAccent(waterState) }"></div>
      <div class="water-badge-body">
        <div class="water-badge-label">{{ liquidLabel(waterState) }}</div>
        <div class="water-badge-hint">
          <template v-if="!waterState.hasLiquid && waterState.hasSurfaceBody">
            frozen — wave animation keeps static bump
          </template>
          <template v-else-if="!waterState.hasSurfaceBody">
            no surface liquid — ocean shader inactive
          </template>
          <template v-else>live shader uniforms (no rebuild)</template>
        </div>
      </div>
    </div>

    <!-- ── Coverage ────────────────────────────────────────────────── -->
    <div class="row">
      <label>Coverage %</label>
      <input
        type="range" min="0" max="1" step="0.01"
        :value="config.waterCoverage ?? 0"
        @input="setCoverage"
      />
      <span class="val">{{ Math.round((config.waterCoverage ?? 0) * 100) }}%</span>
    </div>
    <p class="hint" style="margin:0 0 6px;">Structural — rebuilds the hex body.</p>

    <!-- ── Toggles ─────────────────────────────────────────────────── -->
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Water enabled</label>
      <span></span>
      <input
        type="checkbox"
        :checked="oceanShaderParams.enabled"
        @change="oceanShaderParams.enabled = ($event.target as HTMLInputElement).checked"
      />
    </div>
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Ocean layer</label>
      <span class="hint" style="margin:0;">off = expose sea floor</span>
      <input
        type="checkbox"
        :checked="oceanShaderParams.oceanVisible"
        @change="oceanShaderParams.oceanVisible = ($event.target as HTMLInputElement).checked"
      />
    </div>

    <!-- ── Numeric sliders ─────────────────────────────────────────── -->
    <div v-for="k in numericKeys" :key="k" class="row">
      <label>{{ OCEAN_SHADER_RANGES[k].label }}</label>
      <input
        type="range"
        :min="OCEAN_SHADER_RANGES[k].min"
        :max="OCEAN_SHADER_RANGES[k].max"
        :step="OCEAN_SHADER_RANGES[k].step"
        :value="oceanShaderParams[k]"
        @input="setNum(k, $event)"
      />
      <span class="val">{{ oceanShaderParams[k].toFixed(digits(OCEAN_SHADER_RANGES[k].step)) }}</span>
    </div>
  </div>
</template>

<style scoped>
.water-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #1d2028;
  border-radius: 3px;
  background: #0b0d12;
  margin-bottom: 6px;
}
.water-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 10px;
  box-shadow: 0 0 6px currentColor;
}
.water-badge-body   { display: flex; flex-direction: column; }
.water-badge-label  { color: #e4e6ea; font-size: 11px; font-weight: 600; }
.water-badge-hint   { color: #8a919b; font-size: 10px; }
</style>
