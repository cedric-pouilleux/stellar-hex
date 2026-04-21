<script setup lang="ts">
/**
 * Live tuning panel for the hex ocean shader.
 *
 * Drives `hexGraphicsUniforms` (wave strength, wave speed, specular, depth
 * darkening, opacity, master toggle, ocean-layer visibility) through the
 * reactive mirror exposed by `oceanShaderParams`. No rebuild required —
 * every slider change is picked up by the material on the next frame.
 *
 * The liquid identity (`liquidType`, `liquidState`, `liquidColor`) is now
 * fully caller-owned: the user picks substance, state, and colour manually
 * via this panel. No temperature derivation happens here or in the lib.
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
  resolveLiquidState,
  type SurfaceLiquidType,
} from '../lib/liquidDiagnostics'

const props = defineProps<{ config: BodyConfig }>()

const liquidState = computed(() => resolveLiquidState(props.config))

/** Canonical sea-colour defaults mirrored from the lib so the colour swatch
 *  shows something meaningful even when `liquidColor` is left undefined. */
const CANONICAL_SEA_COLORS: Record<SurfaceLiquidType, string> = {
  water:    '#2878d0',
  ammonia:  '#7a9840',
  methane:  '#7a5828',
  nitrogen: '#c8b0b8',
}
const FROZEN_SEA_COLOR = '#90b0c0'
const DRY_SEA_COLOR    = '#686058'

const liquidTypes: SurfaceLiquidType[] = ['water', 'ammonia', 'methane', 'nitrogen']
const liquidStates: Array<'liquid' | 'frozen' | 'none'> = ['liquid', 'frozen', 'none']

function toHexString(value: number | string | undefined): string {
  if (typeof value === 'string') return value.startsWith('#') ? value : `#${value}`
  if (typeof value === 'number') return `#${value.toString(16).padStart(6, '0')}`
  return ''
}

const currentColor = computed(() => {
  const override = toHexString(props.config.liquidColor as number | string | undefined)
  if (override) return override
  if (props.config.liquidState === 'frozen') return FROZEN_SEA_COLOR
  const t = props.config.liquidType as SurfaceLiquidType | undefined
  if (t && CANONICAL_SEA_COLORS[t]) return CANONICAL_SEA_COLORS[t]
  return DRY_SEA_COLOR
})

function setType(evt: Event) {
  const raw = (evt.target as HTMLSelectElement).value
  props.config.liquidType = raw === '' ? undefined : raw
}

function setState(evt: Event) {
  const raw = (evt.target as HTMLSelectElement).value as 'liquid' | 'frozen' | 'none'
  props.config.liquidState = raw
}

function setColor(evt: Event) {
  const v = (evt.target as HTMLInputElement).value
  props.config.liquidColor = v
}

function resetColor() {
  props.config.liquidColor = undefined
}

function setCoverage(evt: Event) {
  props.config.liquidCoverage = parseFloat((evt.target as HTMLInputElement).value)
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
    <!-- ── Liquid identity badge ───────────────────────────────────── -->
    <div class="liquid-badge" :style="{ borderColor: liquidAccent(liquidState) }">
      <div class="liquid-dot" :style="{ background: liquidAccent(liquidState) }"></div>
      <div class="liquid-badge-body">
        <div class="liquid-badge-label">{{ liquidLabel(liquidState) }}</div>
        <div class="liquid-badge-hint">
          <template v-if="!liquidState.hasLiquid && liquidState.hasSurfaceBody">
            frozen — wave animation keeps static bump
          </template>
          <template v-else-if="!liquidState.hasSurfaceBody">
            no surface liquid — ocean shader inactive
          </template>
          <template v-else>caller-owned palette, live shader uniforms</template>
        </div>
      </div>
    </div>

    <!-- ── Manual identity (no temperature coupling) ───────────────── -->
    <div class="row">
      <label>Substance</label>
      <select :value="config.liquidType ?? ''" @change="setType">
        <option value="">(none)</option>
        <option v-for="t in liquidTypes" :key="t" :value="t">{{ t }}</option>
      </select>
      <span></span>
    </div>
    <div class="row">
      <label>State</label>
      <select :value="config.liquidState ?? 'none'" @change="setState">
        <option v-for="s in liquidStates" :key="s" :value="s">{{ s }}</option>
      </select>
      <span></span>
    </div>
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
      Substance, state and colour are caller-driven. Reset clears the manual override.
    </p>

    <!-- ── Coverage ────────────────────────────────────────────────── -->
    <div class="row">
      <label>Coverage %</label>
      <input
        type="range" min="0" max="1" step="0.01"
        :value="config.liquidCoverage ?? 0"
        @input="setCoverage"
      />
      <span class="val">{{ Math.round((config.liquidCoverage ?? 0) * 100) }}%</span>
    </div>
    <p class="hint" style="margin:0 0 6px;">Structural — rebuilds the hex body.</p>

    <!-- ── Toggles ─────────────────────────────────────────────────── -->
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Liquid enabled</label>
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
.liquid-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #1d2028;
  border-radius: 3px;
  background: #0b0d12;
  margin-bottom: 6px;
}
.liquid-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 10px;
  box-shadow: 0 0 6px currentColor;
}
.liquid-badge-body   { display: flex; flex-direction: column; }
.liquid-badge-label  { color: #e4e6ea; font-size: 11px; font-weight: 600; }
.liquid-badge-hint   { color: #8a919b; font-size: 10px; }
</style>
