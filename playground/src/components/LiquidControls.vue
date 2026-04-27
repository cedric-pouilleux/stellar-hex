<script setup lang="ts">
/**
 * Live tuning panel for the hex liquid-shell shader.
 *
 * Drives `hexGraphicsUniforms` (wave geometry, specular, fresnel, foam,
 * roughness, opacity, master toggle, liquid-shell visibility) through the
 * reactive mirror exposed by `liquidShaderParams`. No rebuild required —
 * every slider change is picked up by the material on the next frame.
 *
 * Liquid `state` (liquid / frozen / none) stays caller-driven via radio
 * buttons because forcing a state is the only way to test, e.g., a frozen
 * surface on a hot planet — the chemistry-driven auto-derive in `state.ts`
 * picks the natural one but doesn't unlock that scenario. Substance is
 * dropped: the colour picker covers any visual override the user needs.
 */
import { computed } from 'vue'
import type { BodyConfig } from '@lib'
import {
  liquidShaderParams,
  LIQUID_SHADER_RANGES,
  LIQUID_SHADER_DEFAULTS,
  type LiquidShaderNumericKey,
} from '../lib/liquidShader'
import {
  SURFACE_LIQUID_COLORS,
  FROZEN_LIQUID_COLOR,
  DRY_SEA_COLOR,
} from '../lib/liquidCatalog'
import { playgroundLibMeta } from '../lib/state'
import { seaLevelFraction, SEA_LEVEL_DEFAULT } from '../lib/seaLevel'

const props = defineProps<{ config: BodyConfig }>()

const liquidStates: Array<'liquid' | 'frozen' | 'none'> = ['liquid', 'frozen', 'none']

function toHexString(value: number | string | undefined): string {
  if (typeof value === 'string') return value.startsWith('#') ? value : `#${value}`
  if (typeof value === 'number') return `#${value.toString(16).padStart(6, '0')}`
  return ''
}

const currentColor = computed(() => {
  const override = toHexString(props.config.liquidColor as number | string | undefined)
  if (override) return override
  if (props.config.liquidState === 'frozen') return FROZEN_LIQUID_COLOR
  const t = playgroundLibMeta.liquidType
  if (t && SURFACE_LIQUID_COLORS[t]) return SURFACE_LIQUID_COLORS[t]
  return DRY_SEA_COLOR
})

function setState(value: 'liquid' | 'frozen' | 'none') {
  props.config.liquidState = value
}

function setColor(evt: Event) {
  const v = (evt.target as HTMLInputElement).value
  props.config.liquidColor = v
}

function resetColor() {
  // Undefined lets the state watcher re-resolve from the catalogue.
  props.config.liquidColor = undefined
}

/**
 * Two slider blocks: wave geometry first (most visible impact), then
 * lighting / surface response. Foam threshold + colour come last because
 * they only matter when the user is actively chasing a stylised look.
 */
const waveKeys: LiquidShaderNumericKey[] = ['waveStrength', 'waveSpeed', 'waveScale']
const lightKeys: LiquidShaderNumericKey[] = [
  'specularIntensity', 'specularSharpness', 'fresnelPower',
  'liquidRoughness', 'depthDarken', 'liquidOpacity',
]

function setNum(key: LiquidShaderNumericKey, evt: Event) {
  liquidShaderParams[key] = parseFloat((evt.target as HTMLInputElement).value)
}

function setFoamColor(evt: Event) {
  liquidShaderParams.foamColor = (evt.target as HTMLInputElement).value
}

function digits(step: number): number {
  return step >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(step)))
}
</script>

<template>
  <div class="group-body">
    <!-- ── State (caller-forced override on top of the chemistry watcher) ── -->
    <div class="row" style="grid-template-columns: 110px 1fr;">
      <label>State</label>
      <div class="state-radio">
        <label v-for="s in liquidStates" :key="s" :class="{ 'is-active': (config.liquidState ?? 'none') === s }">
          <input
            type="radio"
            name="liquid-state"
            :value="s"
            :checked="(config.liquidState ?? 'none') === s"
            @change="setState(s)"
          />
          <span>{{ s }}</span>
        </label>
      </div>
    </div>

    <!-- ── Color (manual override on top of the chemistry-derived tint) ── -->
    <div class="row" style="grid-template-columns: 110px 1fr auto auto;">
      <label>Color</label>
      <input
        type="color"
        :value="currentColor"
        :disabled="config.liquidState === 'none'"
        @input="setColor"
      />
      <span class="val" style="font-family: monospace;">{{ currentColor }}</span>
      <button
        type="button"
        class="pill"
        style="border:0; cursor:pointer; font-size:10px;"
        :disabled="config.liquidColor === undefined"
        @click="resetColor"
      >Reset</button>
    </div>
    <p class="hint" style="margin:0 0 6px;">
      Reset clears the manual override — colour falls back to the chemistry-derived tint.
    </p>

    <!-- ── Sea level ───────────────────────────────────────────────── -->
    <div class="row" style="grid-template-columns: 110px 1fr auto auto;">
      <label>Sea level</label>
      <input
        type="range" min="0" max="1" step="0.01"
        :value="seaLevelFraction"
        :disabled="config.liquidState !== 'liquid'"
        @input="seaLevelFraction = parseFloat(($event.target as HTMLInputElement).value)"
      />
      <span class="val">{{ Math.round(seaLevelFraction * 100) }}%</span>
      <button
        type="button"
        class="pill"
        style="border:0; cursor:pointer; font-size:10px;"
        :disabled="seaLevelFraction === SEA_LEVEL_DEFAULT"
        @click="seaLevelFraction = SEA_LEVEL_DEFAULT"
      >Reset</button>
    </div>
    <p class="hint" style="margin:0 0 6px;">
      Live — lifts the translucent liquid shell between core (0%) and nominal surface (100%). Tile classification is unchanged.
    </p>

    <!-- ── Toggles ─────────────────────────────────────────────────── -->
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Liquid enabled</label>
      <span></span>
      <input
        type="checkbox"
        :checked="liquidShaderParams.enabled"
        @change="liquidShaderParams.enabled = ($event.target as HTMLInputElement).checked"
      />
    </div>
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Liquid shell</label>
      <span class="hint" style="margin:0;">off = expose sea floor</span>
      <input
        type="checkbox"
        :checked="liquidShaderParams.liquidVisible"
        @change="liquidShaderParams.liquidVisible = ($event.target as HTMLInputElement).checked"
      />
    </div>

    <!-- ── Wave geometry ───────────────────────────────────────────── -->
    <h4 class="sub-h">Waves</h4>
    <div v-for="k in waveKeys" :key="k" class="row">
      <label>{{ LIQUID_SHADER_RANGES[k].label }}</label>
      <input
        type="range"
        :min="LIQUID_SHADER_RANGES[k].min"
        :max="LIQUID_SHADER_RANGES[k].max"
        :step="LIQUID_SHADER_RANGES[k].step"
        :value="liquidShaderParams[k]"
        @input="setNum(k, $event)"
      />
      <span class="val">{{ liquidShaderParams[k].toFixed(digits(LIQUID_SHADER_RANGES[k].step)) }}</span>
    </div>

    <!-- ── Lighting / surface response ─────────────────────────────── -->
    <h4 class="sub-h">Lighting &amp; surface</h4>
    <div v-for="k in lightKeys" :key="k" class="row">
      <label>{{ LIQUID_SHADER_RANGES[k].label }}</label>
      <input
        type="range"
        :min="LIQUID_SHADER_RANGES[k].min"
        :max="LIQUID_SHADER_RANGES[k].max"
        :step="LIQUID_SHADER_RANGES[k].step"
        :value="liquidShaderParams[k]"
        @input="setNum(k, $event)"
      />
      <span class="val">{{ liquidShaderParams[k].toFixed(digits(LIQUID_SHADER_RANGES[k].step)) }}</span>
    </div>

    <!-- ── Foam (whitecaps on wave crests) ─────────────────────────── -->
    <h4 class="sub-h">Foam</h4>
    <div class="row">
      <label>{{ LIQUID_SHADER_RANGES.foamThreshold.label }}</label>
      <input
        type="range"
        :min="LIQUID_SHADER_RANGES.foamThreshold.min"
        :max="LIQUID_SHADER_RANGES.foamThreshold.max"
        :step="LIQUID_SHADER_RANGES.foamThreshold.step"
        :value="liquidShaderParams.foamThreshold"
        @input="setNum('foamThreshold', $event)"
      />
      <span class="val">{{ liquidShaderParams.foamThreshold.toFixed(2) }}</span>
    </div>
    <div class="row" style="grid-template-columns: 110px 1fr auto auto;">
      <label>Foam color</label>
      <input
        type="color"
        :value="liquidShaderParams.foamColor"
        @input="setFoamColor"
      />
      <span class="val" style="font-family: monospace;">{{ liquidShaderParams.foamColor }}</span>
      <button
        type="button"
        class="pill"
        style="border:0; cursor:pointer; font-size:10px;"
        :disabled="liquidShaderParams.foamColor === LIQUID_SHADER_DEFAULTS.foamColor"
        @click="liquidShaderParams.foamColor = LIQUID_SHADER_DEFAULTS.foamColor"
      >Reset</button>
    </div>
    <p class="hint" style="margin:0;">
      Threshold = 1 disables foam (no wave crest reaches a normalised height of 1). Lower it toward 0.5 to see whitecaps appear.
    </p>
  </div>
</template>

<style scoped>
.sub-h {
  margin: 8px 0 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: #6a7280;
  letter-spacing: 0.08em;
}
.state-radio {
  display: inline-flex;
  border: 1px solid #1d2028;
  border-radius: 3px;
  overflow: hidden;
}
.state-radio label {
  padding: 3px 10px;
  cursor: pointer;
  font-size: 11px;
  color: #8a919b;
  background: #0a0c11;
  border-left: 1px solid #1d2028;
}
.state-radio label:first-child { border-left: 0; }
.state-radio label.is-active   { background: #1c2536; color: #e4e6ea; }
.state-radio input             { display: none; }
</style>
