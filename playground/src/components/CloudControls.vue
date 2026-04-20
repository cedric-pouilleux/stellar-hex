<script setup lang="ts">
/**
 * Live tuning panel for the cloud shell shader.
 *
 * Drives the shared `hexGraphicsUniforms` (opacity, speed, color) directly
 * for no-rebuild tweaks. `Coverage override` patches the cloud mesh uniform
 * on the fly. The `Enabled` checkbox hides the mesh without tearing it down.
 */
import { computed } from 'vue'
import {
  cloudShaderParams,
  CLOUD_SHADER_RANGES,
  CLOUD_COVERAGE_RANGE,
  type CloudShaderNumericKey,
} from '../lib/cloudShader'
import { rebuildKey } from '../lib/state'

const numericKeys: CloudShaderNumericKey[] = ['opacity', 'speed']

function setNum(key: CloudShaderNumericKey, evt: Event) {
  cloudShaderParams[key] = parseFloat((evt.target as HTMLInputElement).value)
}

const coverageEnabled = computed({
  get: () => cloudShaderParams.coverageOverride !== null,
  set: (on: boolean) => {
    cloudShaderParams.coverageOverride = on ? 0.5 : null
    rebuildKey.value++
  },
})

function setCoverage(evt: Event) {
  cloudShaderParams.coverageOverride = parseFloat((evt.target as HTMLInputElement).value)
}

function digits(step: number): number {
  return step >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(step)))
}
</script>

<template>
  <div class="group-body">
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Enabled</label>
      <span></span>
      <input
        type="checkbox"
        :checked="cloudShaderParams.enabled"
        @change="cloudShaderParams.enabled = ($event.target as HTMLInputElement).checked"
      />
    </div>

    <div v-for="k in numericKeys" :key="k" class="row">
      <label>{{ CLOUD_SHADER_RANGES[k].label }}</label>
      <input
        type="range"
        :min="CLOUD_SHADER_RANGES[k].min"
        :max="CLOUD_SHADER_RANGES[k].max"
        :step="CLOUD_SHADER_RANGES[k].step"
        :value="cloudShaderParams[k]"
        @input="setNum(k, $event)"
      />
      <span class="val">{{ cloudShaderParams[k].toFixed(digits(CLOUD_SHADER_RANGES[k].step)) }}</span>
    </div>

    <div class="row">
      <label>Color</label>
      <input
        type="color"
        :value="cloudShaderParams.color"
        @input="cloudShaderParams.color = ($event.target as HTMLInputElement).value"
      />
      <span class="val">{{ cloudShaderParams.color }}</span>
    </div>

    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Override %</label>
      <span class="hint" style="margin:0;">off = auto from config</span>
      <input type="checkbox" :checked="coverageEnabled" @change="coverageEnabled = ($event.target as HTMLInputElement).checked" />
    </div>
    <div class="row" v-if="coverageEnabled">
      <label>Coverage %</label>
      <input
        type="range"
        :min="CLOUD_COVERAGE_RANGE.min"
        :max="CLOUD_COVERAGE_RANGE.max"
        :step="CLOUD_COVERAGE_RANGE.step"
        :value="cloudShaderParams.coverageOverride ?? 0"
        @input="setCoverage"
      />
      <span class="val">{{ Math.round((cloudShaderParams.coverageOverride ?? 0) * 100) }}%</span>
    </div>
  </div>
</template>
