<script setup lang="ts">
import { computed } from 'vue'
import { digOptions } from '../lib/state'
import {
  DIG_IMPACT_PRESETS,
  applyDigPreset,
  findMatchingDigPreset,
  getDigPreset,
  type DigImpactPresetId,
} from '../lib/digPresets'

/**
 * Dig-impact preset currently matching the two tracked knobs on `digOptions`,
 * or `null` when the user has tweaked a slider manually. Drives the
 * "Personnalisé" option in the picker and the hint line below it.
 */
const activePresetId = computed<DigImpactPresetId | null>(() => findMatchingDigPreset(digOptions))

/** One-line pitch for the active preset, if any. */
const activePresetHint = computed(() => {
  const id = activePresetId.value
  return id ? getDigPreset(id)?.hint ?? null : null
})

function onPresetChange(evt: Event) {
  const id = (evt.target as HTMLSelectElement).value as DigImpactPresetId | ''
  if (!id) return   // "Personnalisé" is a no-op — keep the current tweak.
  const preset = getDigPreset(id)
  if (preset) applyDigPreset(digOptions, preset)
}

function setInt<K extends 'centerDrop' | 'radius'>(key: K, evt: Event) {
  digOptions[key] = parseInt((evt.target as HTMLInputElement).value)
}
</script>

<template>
  <details class="group" open>
    <summary>Creusage / Impact</summary>
    <div class="group-body">
      <div class="row">
        <label>Impact</label>
        <select :value="activePresetId ?? ''" @change="onPresetChange">
          <option value="">Personnalisé</option>
          <option v-for="p in DIG_IMPACT_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
        <span></span>
      </div>
      <p v-if="activePresetHint" class="hint">{{ activePresetHint }}</p>
      <div class="row">
        <label>Profondeur</label>
        <input
          type="range" min="1" max="12" step="1"
          :value="digOptions.centerDrop"
          @input="setInt('centerDrop', $event)"
        />
        <span class="val">{{ digOptions.centerDrop }}</span>
      </div>
      <div class="row">
        <label>Rayon</label>
        <input
          type="range" min="0" max="6" step="1"
          :value="digOptions.radius"
          @input="setInt('radius', $event)"
        />
        <span class="val">{{ digOptions.radius }}</span>
      </div>
      <p class="hint">
        Profondeur = bandes retirées au centre. Rayon = anneaux de voisins touchés (chute décroissante).
      </p>
    </div>
  </details>
</template>
