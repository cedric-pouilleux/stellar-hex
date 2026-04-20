<script setup lang="ts">
/**
 * Live tuning panel for the atmosphere shell shader.
 *
 * `Opacity` rides the shared `uAtmoOpacity` uniform (no rebuild). Intensity,
 * power and color are patched into the atmosphere mesh on the fly via
 * `BodyShellsHandle.setAtmosphereParams`, which the pane watchers call when
 * the reactive state changes. Each override field has a null-gated toggle —
 * disabling it restores the lib-derived value from `auraParamsFor`.
 */
import { computed } from 'vue'
import {
  atmosphereShaderParams,
  ATMOSPHERE_SHADER_RANGES,
  ATMOSPHERE_INTENSITY_RANGE,
  ATMOSPHERE_POWER_RANGE,
  type AtmosphereShaderNumericKey,
} from '../lib/atmosphereShader'

const numericKeys: AtmosphereShaderNumericKey[] = ['opacity']

function setNum(key: AtmosphereShaderNumericKey, evt: Event) {
  atmosphereShaderParams[key] = parseFloat((evt.target as HTMLInputElement).value)
}

const intensityEnabled = computed({
  get: () => atmosphereShaderParams.intensityOverride !== null,
  set: (on: boolean) => { atmosphereShaderParams.intensityOverride = on ? 1.0 : null },
})
const powerEnabled = computed({
  get: () => atmosphereShaderParams.powerOverride !== null,
  set: (on: boolean) => { atmosphereShaderParams.powerOverride = on ? 2.5 : null },
})
const colorEnabled = computed({
  get: () => atmosphereShaderParams.colorOverride !== null,
  set: (on: boolean) => { atmosphereShaderParams.colorOverride = on ? '#8ecaff' : null },
})

function setIntensity(evt: Event) {
  atmosphereShaderParams.intensityOverride = parseFloat((evt.target as HTMLInputElement).value)
}
function setPower(evt: Event) {
  atmosphereShaderParams.powerOverride = parseFloat((evt.target as HTMLInputElement).value)
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
        :checked="atmosphereShaderParams.enabled"
        @change="atmosphereShaderParams.enabled = ($event.target as HTMLInputElement).checked"
      />
    </div>

    <div v-for="k in numericKeys" :key="k" class="row">
      <label>{{ ATMOSPHERE_SHADER_RANGES[k].label }}</label>
      <input
        type="range"
        :min="ATMOSPHERE_SHADER_RANGES[k].min"
        :max="ATMOSPHERE_SHADER_RANGES[k].max"
        :step="ATMOSPHERE_SHADER_RANGES[k].step"
        :value="atmosphereShaderParams[k]"
        @input="setNum(k, $event)"
      />
      <span class="val">{{ atmosphereShaderParams[k].toFixed(digits(ATMOSPHERE_SHADER_RANGES[k].step)) }}</span>
    </div>

    <!-- Intensity override -->
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Intensity ovr.</label>
      <span class="hint" style="margin:0;">off = auto from config</span>
      <input type="checkbox" :checked="intensityEnabled" @change="intensityEnabled = ($event.target as HTMLInputElement).checked" />
    </div>
    <div class="row" v-if="intensityEnabled">
      <label>Intensity</label>
      <input
        type="range"
        :min="ATMOSPHERE_INTENSITY_RANGE.min"
        :max="ATMOSPHERE_INTENSITY_RANGE.max"
        :step="ATMOSPHERE_INTENSITY_RANGE.step"
        :value="atmosphereShaderParams.intensityOverride ?? 0"
        @input="setIntensity"
      />
      <span class="val">{{ (atmosphereShaderParams.intensityOverride ?? 0).toFixed(2) }}</span>
    </div>

    <!-- Power override -->
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Power ovr.</label>
      <span class="hint" style="margin:0;">fresnel sharpness</span>
      <input type="checkbox" :checked="powerEnabled" @change="powerEnabled = ($event.target as HTMLInputElement).checked" />
    </div>
    <div class="row" v-if="powerEnabled">
      <label>Power</label>
      <input
        type="range"
        :min="ATMOSPHERE_POWER_RANGE.min"
        :max="ATMOSPHERE_POWER_RANGE.max"
        :step="ATMOSPHERE_POWER_RANGE.step"
        :value="atmosphereShaderParams.powerOverride ?? 0"
        @input="setPower"
      />
      <span class="val">{{ (atmosphereShaderParams.powerOverride ?? 0).toFixed(2) }}</span>
    </div>

    <!-- Color override -->
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Color ovr.</label>
      <span class="hint" style="margin:0;">off = auto from config</span>
      <input type="checkbox" :checked="colorEnabled" @change="colorEnabled = ($event.target as HTMLInputElement).checked" />
    </div>
    <div class="row" v-if="colorEnabled">
      <label>Color</label>
      <input
        type="color"
        :value="atmosphereShaderParams.colorOverride ?? '#8ecaff'"
        @input="atmosphereShaderParams.colorOverride = ($event.target as HTMLInputElement).value"
      />
      <span class="val">{{ atmosphereShaderParams.colorOverride }}</span>
    </div>
  </div>
</template>
