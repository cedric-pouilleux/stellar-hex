<script setup lang="ts">
/**
 * Per-resource controls — every entry of the unified resource catalogue
 * (sol + atmo) gets a toggle, a colour picker, a pattern dropdown and a
 * distribution-weight slider. The panel mutates {@link resourceUIState}
 * directly; the reactive bridge in `state.ts` re-registers paint visuals on
 * every edit and `App.vue` bumps `rebuildKey` on any change so both panes
 * refresh.
 *
 * Live total amounts on the active body are surfaced from
 * {@link totalResources} — recomputed by each render pane on rebuild.
 */
import { computed } from 'vue'
import {
  DEMO_RESOURCES,
  resourceLayer,
  type ResourceLayer,
  type ResourceSpec,
} from '../lib/resourceDemo'
import { resourceUIState, totalResources } from '../lib/state'
import {
  GAS_PATTERN_KINDS,
  GAS_PATTERN_LABEL,
  type GasPatternKind,
} from '../lib/gasPatterns'
import { hexFromInt, intFromHex } from '../lib/colorHex'

interface Section {
  layer: ResourceLayer
  title: string
  empty: string
  specs: ResourceSpec[]
}

/** Two collapsible sections — Surface (sol) first, Atmosphère (atmo) second. */
const sections = computed<Section[]>(() => [
  {
    layer: 'sol',
    title: 'Surface',
    empty: 'No surface resources in the catalogue.',
    specs: DEMO_RESOURCES.filter(r => resourceLayer(r.phase) === 'sol'),
  },
  {
    layer: 'atmo',
    title: 'Atmosphère',
    empty: 'No atmospheric resources in the catalogue.',
    specs: DEMO_RESOURCES.filter(r => resourceLayer(r.phase) === 'atmo'),
  },
])

function onColorInput(id: string, evt: Event) {
  resourceUIState[id].color = intFromHex((evt.target as HTMLInputElement).value)
}

function onPatternInput(id: string, evt: Event) {
  resourceUIState[id].patternKind = (evt.target as HTMLSelectElement).value as GasPatternKind
}

function onToggleInput(id: string, evt: Event) {
  resourceUIState[id].enabled = (evt.target as HTMLInputElement).checked
}

function onWeightInput(id: string, evt: Event) {
  resourceUIState[id].weight = parseFloat((evt.target as HTMLInputElement).value)
}

function onReset(spec: ResourceSpec) {
  const ui = resourceUIState[spec.id]
  ui.enabled     = true
  ui.color       = spec.color
  ui.patternKind = spec.pattern.kind
  ui.weight      = 1
}

/** Per-resource live total — falls back to 0 when no tile carries the id. */
function totalFor(id: string): number {
  return totalResources.value.get(id) ?? 0
}

/** Cumulative grand total across every catalogued resource. */
const grandTotal = computed(() => {
  let s = 0
  for (const r of DEMO_RESOURCES) s += totalFor(r.id)
  return s
})

/** Per-section subtotal, surfaced under each section title. */
function sectionTotal(specs: ResourceSpec[]): number {
  let s = 0
  for (const r of specs) s += totalFor(r.id)
  return s
}

function fmt(n: number): string {
  if (n === 0) return '0'
  if (n >= 1000) return n.toFixed(0)
  if (n >= 100)  return n.toFixed(1)
  return n.toFixed(2)
}
</script>

<template>
  <div class="res-grand-total">
    <span class="k">Total planète</span>
    <span class="v">{{ fmt(grandTotal) }}</span>
  </div>

  <details v-for="section in sections" :key="section.layer" class="group" open>
    <summary>
      <span>{{ section.title }}</span>
      <span class="res-section-total">{{ fmt(sectionTotal(section.specs)) }}</span>
    </summary>
    <div class="group-body">
      <p v-if="section.specs.length === 0" class="hint">{{ section.empty }}</p>
      <div v-for="spec in section.specs" :key="spec.id" class="res-row">
        <div class="res-row-header">
          <input
            type="checkbox"
            :checked="resourceUIState[spec.id].enabled"
            @change="onToggleInput(spec.id, $event)"
          />
          <label>{{ spec.label }}</label>
          <span class="res-total" :title="`Total on planet: ${totalFor(spec.id)}`">{{ fmt(totalFor(spec.id)) }}</span>
          <button type="button" class="pill" @click="onReset(spec)">Reset</button>
        </div>
        <div class="res-row-controls">
          <input
            type="color"
            :value="hexFromInt(resourceUIState[spec.id].color)"
            :disabled="!resourceUIState[spec.id].enabled"
            @input="onColorInput(spec.id, $event)"
          />
          <select
            :value="resourceUIState[spec.id].patternKind"
            :disabled="!resourceUIState[spec.id].enabled"
            @change="onPatternInput(spec.id, $event)"
          >
            <option v-for="k in GAS_PATTERN_KINDS" :key="k" :value="k">{{ GAS_PATTERN_LABEL[k] }}</option>
          </select>
        </div>
        <div class="res-row-weight">
          <label>Distribution</label>
          <input
            type="range" min="0" max="1" step="0.01"
            :value="resourceUIState[spec.id].weight"
            :disabled="!resourceUIState[spec.id].enabled"
            @input="onWeightInput(spec.id, $event)"
          />
          <span class="val">{{ Math.round(resourceUIState[spec.id].weight * 100) }}%</span>
        </div>
      </div>
    </div>
  </details>
</template>

<style scoped>
.res-grand-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  margin: 0 0 8px;
  border: 1px solid #1d2028;
  border-radius: 4px;
  background: #10141c;
  font-size: 11px;
}
.res-grand-total .k {
  color: #8a919b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  font-size: 10px;
}
.res-grand-total .v {
  color: #e4e6ea;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.group > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.res-section-total {
  color: #8a919b;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  margin-right: 4px;
}

.res-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
  border-bottom: 1px solid #1a1c22;
}
.res-row:last-child {
  border-bottom: none;
}
.res-row-header {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.res-row-header label {
  color: #e4e6ea;
  font-weight: 500;
}
.res-row-header .res-total {
  color: #8a919b;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  min-width: 32px;
}
.res-row-header .pill {
  border: 0;
  cursor: pointer;
  font-size: 10px;
  background: #1a1c22;
  color: #8a919b;
  padding: 2px 6px;
  border-radius: 2px;
}
.res-row-header .pill:hover {
  background: #242830;
  color: #c0c6d0;
}
.res-row-controls {
  display: grid;
  grid-template-columns: 40px 1fr;
  align-items: center;
  gap: 8px;
}
.res-row-controls input[type=color] {
  width: 100%;
  height: 22px;
  padding: 0;
  border: 1px solid #2a2e36;
  background: transparent;
  cursor: pointer;
}
.res-row-controls input[type=color]:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.res-row-controls select {
  font-size: 11px;
}
.res-row-weight {
  display: grid;
  grid-template-columns: 70px 1fr 36px;
  align-items: center;
  gap: 6px;
  font-size: 10px;
}
.res-row-weight label { color: #8a919b; }
.res-row-weight input[type=range] {
  width: 100%;
  accent-color: #4d7dd4;
}
.res-row-weight input[type=range]:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.res-row-weight .val {
  text-align: right;
  color: #c9cdd4;
  font-variant-numeric: tabular-nums;
}
</style>
