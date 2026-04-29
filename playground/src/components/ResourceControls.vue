<script setup lang="ts">
/**
 * Per-resource controls — every entry of the unified resource catalogue
 * (sol + atmo) gets a toggle, a colour picker, a pattern dropdown and a
 * distribution-weight slider, all packed on a single row.
 *
 * Custom resources can be appended on the fly (one form per section). They
 * land in `customResources` (state.ts) and show up below the catalogue.
 *
 * Live total amounts on the active body are surfaced from
 * {@link totalResources} — recomputed by each render pane on rebuild.
 */
import { computed, reactive } from 'vue'
import {
  type ResourceLayer,
  type ResourceSpec,
} from '../lib/resourceDemo'
import {
  resourceUIState,
  totalResources,
  customResources,
  allResources,
  addCustomResource,
  removeCustomResource,
} from '../lib/state'
import {
  GAS_PATTERN_KINDS,
  GAS_PATTERN_SHORT_LABEL,
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

const sections = computed<Section[]>(() => {
  const all = allResources()
  return [
    {
      layer: 'sol',
      title:  'Surface',
      empty:  'No surface resources in the catalogue.',
      specs:  all.filter(r => r.phase !== 'gas'),
    },
    {
      layer: 'atmo',
      title:  'Atmosphère',
      empty:  'No atmospheric resources in the catalogue.',
      specs:  all.filter(r => r.phase === 'gas'),
    },
  ]
})

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

/** Per-resource live total — falls back to 0 when no tile carries the id. */
function totalFor(id: string): number {
  return totalResources.value.get(id) ?? 0
}

/** Cumulative grand total across every catalogued + custom resource. */
const grandTotal = computed(() => {
  let s = 0
  for (const r of allResources()) s += totalFor(r.id)
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

/** True if `id` was added at runtime (vs. shipped catalogue). Drives the trash button. */
function isCustom(id: string): boolean {
  return customResources.value.some(r => r.id === id)
}

// ── Add-resource form (one per section) ─────────────────────────
interface AddForm {
  open:        boolean
  label:       string
  color:       string         // `#rrggbb`
  patternKind: GasPatternKind
}
const addForms = reactive<Record<ResourceLayer, AddForm>>({
  sol:  { open: false, label: '', color: '#888888', patternKind: 'cluster' },
  atmo: { open: false, label: '', color: '#88aaff', patternKind: 'scatter' },
})

function toggleForm(layer: ResourceLayer) {
  addForms[layer].open = !addForms[layer].open
}

function submitAdd(layer: ResourceLayer) {
  const form = addForms[layer]
  const label = form.label.trim()
  if (label.length === 0) return
  addCustomResource({
    layer,
    label,
    color:       intFromHex(form.color),
    patternKind: form.patternKind,
  })
  form.open  = false
  form.label = ''
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

      <div
        v-for="spec in section.specs"
        :key="spec.id"
        class="res-row"
        :title="spec.label"
      >
        <input
          type="checkbox"
          :checked="resourceUIState[spec.id].enabled"
          @change="onToggleInput(spec.id, $event)"
        />
        <input
          type="color"
          :value="hexFromInt(resourceUIState[spec.id].color)"
          :disabled="!resourceUIState[spec.id].enabled"
          @input="onColorInput(spec.id, $event)"
        />
        <span class="res-label">{{ spec.label }}</span>
        <select
          class="res-pattern"
          :value="resourceUIState[spec.id].patternKind"
          :disabled="!resourceUIState[spec.id].enabled"
          @change="onPatternInput(spec.id, $event)"
        >
          <option v-for="k in GAS_PATTERN_KINDS" :key="k" :value="k" :title="GAS_PATTERN_LABEL[k]">
            {{ GAS_PATTERN_SHORT_LABEL[k] }}
          </option>
        </select>
        <input
          class="res-weight"
          type="range" min="0" max="1" step="0.01"
          :value="resourceUIState[spec.id].weight"
          :disabled="!resourceUIState[spec.id].enabled"
          @input="onWeightInput(spec.id, $event)"
        />
        <span class="res-total" :title="`Total on planet: ${totalFor(spec.id)}`">{{ fmt(totalFor(spec.id)) }}</span>
        <button
          v-if="isCustom(spec.id)"
          class="res-remove"
          type="button"
          title="Supprimer cette ressource"
          @click="removeCustomResource(spec.id)"
        >×</button>
      </div>

      <div class="add-area">
        <button v-if="!addForms[section.layer].open" type="button" class="add-btn" @click="toggleForm(section.layer)">
          + Ajouter une ressource
        </button>
        <form v-else class="add-form" @submit.prevent="submitAdd(section.layer)">
          <div class="add-row">
            <input
              v-model="addForms[section.layer].label"
              class="add-label"
              type="text"
              placeholder="Nom"
              autofocus
            />
            <input
              v-model="addForms[section.layer].color"
              class="add-color"
              type="color"
            />
            <select v-model="addForms[section.layer].patternKind" class="add-pattern">
              <option v-for="k in GAS_PATTERN_KINDS" :key="k" :value="k">{{ GAS_PATTERN_LABEL[k] }}</option>
            </select>
          </div>
          <div class="add-actions">
            <button type="button" class="btn-ghost" @click="toggleForm(section.layer)">Annuler</button>
            <button type="submit" class="btn-primary" :disabled="addForms[section.layer].label.trim().length === 0">Ajouter</button>
          </div>
        </form>
      </div>
    </div>
  </details>
</template>

<style scoped>
.res-grand-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0 10px;
  margin: 0 0 4px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
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

/* Single-row layout: toggle | color | label | pattern | weight | total | (×) */
.res-row {
  display: grid;
  grid-template-columns: 14px 22px 1fr 70px 56px 30px;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid #1a1c22;
  font-size: 11px;
}
.res-row:last-of-type { border-bottom: none; }

/* Custom rows get an extra trailing trash column. */
.res-row:has(.res-remove) {
  grid-template-columns: 14px 22px 1fr 70px 56px 30px 16px;
}

.res-row input[type=checkbox] { margin: 0; }

.res-row input[type=color] {
  width: 100%;
  height: 18px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
}
.res-row input[type=color]:disabled { cursor: not-allowed; opacity: 0.45; }

.res-label {
  color: #e4e6ea;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.res-pattern {
  appearance: none;
  -webkit-appearance: none;
  height: 22px;
  width: 100%;
  padding: 0 18px 0 6px;
  font-size: 10px;
  font-weight: 500;
  color: #e4e6ea;
  background-color: rgba(255, 255, 255, 0.04);
  background-image:
    linear-gradient(45deg, transparent 50%, #8a919b 50%),
    linear-gradient(135deg, #8a919b 50%, transparent 50%);
  background-position:
    calc(100% - 9px) 50%,
    calc(100% - 6px) 50%;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 3px;
  cursor: pointer;
}
.res-pattern:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.22);
  background-color: rgba(255, 255, 255, 0.06);
}
.res-pattern:disabled { cursor: not-allowed; opacity: 0.45; }
.res-pattern option { background: #14161b; color: #e4e6ea; }

.res-weight {
  width: 100%;
  accent-color: #9aa3b0;
}
.res-weight:disabled { opacity: 0.4; cursor: not-allowed; }

.res-total {
  color: #8a919b;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.res-remove {
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #6a7280;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  border-radius: 3px;
}
.res-remove:hover {
  background: rgba(255, 80, 80, 0.18);
  color: #ff8a8a;
}

/* ── Add-resource form ─────────────────────────────────── */
.add-area { padding-top: 8px; }
.add-btn {
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  color: #8a919b;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  transition: border-color 0.12s, color 0.12s;
}
.add-btn:hover {
  border-color: rgba(255, 255, 255, 0.30);
  color: #e4e6ea;
}
.add-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.02);
}
.add-row {
  display: grid;
  grid-template-columns: 1fr 26px 90px;
  gap: 6px;
  align-items: center;
}
.add-label {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: #e4e6ea;
  padding: 3px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.add-color {
  width: 100%;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
}
.add-pattern {
  appearance: none;
  -webkit-appearance: none;
  height: 22px;
  padding: 0 18px 0 6px;
  font-size: 10px;
  color: #e4e6ea;
  background-color: rgba(255, 255, 255, 0.04);
  background-image:
    linear-gradient(45deg, transparent 50%, #8a919b 50%),
    linear-gradient(135deg, #8a919b 50%, transparent 50%);
  background-position:
    calc(100% - 9px) 50%,
    calc(100% - 6px) 50%;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 3px;
  cursor: pointer;
}
.add-pattern option { background: #14161b; color: #e4e6ea; }

.add-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.btn-ghost,
.btn-primary {
  padding: 4px 10px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: transparent;
  color: #b0b6c0;
}
.btn-ghost:hover { color: #e4e6ea; border-color: rgba(255, 255, 255, 0.22); }
.btn-primary {
  background: rgba(255, 255, 255, 0.10);
  color: #e4e6ea;
}
.btn-primary:hover:not(:disabled) { background: rgba(255, 255, 255, 0.18); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
