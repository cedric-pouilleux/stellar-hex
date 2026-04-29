<script setup lang="ts">
import { computed } from 'vue'
import { BODY_PARAMS, type LibBodyType, type ParamDef } from '@lib'
import { BODY_GROUP_LABELS, paramLabel, selectOptionLabels } from '../lib/paramLabels'

type ParamValue = number | string | number[] | boolean

const props = defineProps<{
  type:   LibBodyType
  values: Record<string, ParamValue>
  /**
   * Group labels to hide from the shader panel. Used to gate optional
   * feature groups (cracks, lava) behind their Body checkbox so the UI
   * only exposes what the current config actually uses.
   */
  hiddenGroups?: readonly string[]
}>()

defineEmits<{ (e: 'update', key: string, value: ParamValue): void }>()

const defs    = computed(() => BODY_PARAMS[props.type])
const groups  = computed(() => {
  const hidden = new Set(props.hiddenGroups ?? [])
  return BODY_GROUP_LABELS[props.type].filter(g => !hidden.has(g.label))
})

// Uniforms derived purely from `config.name` (via `configToLibParams` +
// `generateBodyVariation`) — exposing them as editable sliders would
// break the "one seed per body" contract, so they stay hidden from the UI.
const DERIVED_FROM_NAME = new Set<string>(['seed', 'noiseSeed'])
function visibleKeys(keys: readonly string[]) {
  return keys.filter(k => !DERIVED_FROM_NAME.has(k))
}

function isColor(def: ParamDef)  { return def.type === 'color' }
function isSelect(def: ParamDef) { return def.type === 'select' }
function isSlider(def: ParamDef) { return !def.type && typeof def.default === 'number' }
function isVec3(def: ParamDef)   { return !def.type && Array.isArray(def.default) }

function selectOptions(key: string, def: ParamDef): readonly string[] {
  return selectOptionLabels(key, def.optionCount ?? 0)
}

function fmt(v: number | undefined, step?: number) {
  // Defensive against transient undefined during type switches — the watcher
  // pipeline backfills missing keys, but a render can still pick a stale
  // `values` snapshot before the resync lands. Render a placeholder rather
  // than crashing the panel.
  if (v === undefined || Number.isNaN(v)) return '—'
  if (step === undefined || step >= 1) return String(Math.round(v))
  const dp = Math.max(0, -Math.floor(Math.log10(step)))
  return v.toFixed(dp)
}
</script>

<template>
  <details v-for="group in groups" :key="group.label" class="group">
    <summary>{{ group.label }}</summary>
    <div class="group-body">
      <template v-for="key in visibleKeys(group.keys)" :key="key">
        <template v-if="defs[key]">
          <!-- slider -->
          <div v-if="isSlider(defs[key])" class="row">
            <label :title="key">{{ paramLabel(key) }}</label>
            <input
              type="range"
              :min="defs[key].min"
              :max="defs[key].max"
              :step="defs[key].step"
              :value="values[key] as number"
              @input="$emit('update', key, parseFloat(($event.target as HTMLInputElement).value))"
            />
            <span class="val">{{ fmt(values[key] as number, defs[key].step) }}</span>
          </div>
          <!-- color -->
          <div v-else-if="isColor(defs[key])" class="row">
            <label :title="key">{{ paramLabel(key) }}</label>
            <input
              type="color"
              :value="values[key] as string"
              @input="$emit('update', key, ($event.target as HTMLInputElement).value)"
            />
            <span></span>
          </div>
          <!-- select -->
          <div v-else-if="isSelect(defs[key])" class="row">
            <label :title="key">{{ paramLabel(key) }}</label>
            <select
              :value="values[key] as number"
              @change="$emit('update', key, parseInt(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="(opt, i) in selectOptions(key, defs[key])" :key="i" :value="i">{{ opt }}</option>
            </select>
            <span></span>
          </div>
          <!-- vec3 (noise seed) -->
          <div v-else-if="isVec3(defs[key])" class="row" style="grid-template-columns: 110px 1fr 1fr 1fr;">
            <label :title="key">{{ paramLabel(key) }}</label>
            <input
              v-for="(n, i) in (values[key] as number[])"
              :key="i"
              type="number"
              step="0.1"
              :value="n"
              @change="(evt) => {
                const arr = [...(values[key] as number[])]
                arr[i] = parseFloat(((evt.target as HTMLInputElement).value))
                $emit('update', key, arr)
              }"
            />
          </div>
        </template>
      </template>
    </div>
  </details>
</template>
