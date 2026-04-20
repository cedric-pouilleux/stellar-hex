<script setup lang="ts">
/**
 * Ring tuning panel — exposes the user-editable subset of `RingVariation`
 * as overrides applied on top of the seed-generated ring. Only fields the
 * user touches are persisted; the rest tracks the body name (seed).
 */
import {
  RING_RANGES, RING_ARCHETYPES, ARCHETYPE_PROFILES,
  type RingArchetype, type Profile8,
} from '@lib'
import { ringOverrides, type RingOverrides } from '../lib/state'

type NumKey = 'innerRatio' | 'outerRatio' | 'opacity' | 'bandFreq'
            | 'bandContrast' | 'dustiness' | 'grainAmount' | 'grainFreq'
            | 'lobeStrength' | 'keplerShear'

function setNum(key: NumKey, evt: Event) {
  const v = parseFloat((evt.target as HTMLInputElement).value)
  ;(ringOverrides as any)[key] = v
}
function setColor(key: 'colorInner' | 'colorOuter', evt: Event) {
  ringOverrides[key] = (evt.target as HTMLInputElement).value
}
function reset(key: keyof RingOverrides) {
  delete (ringOverrides as any)[key]
}

// Archetype changes reset the profile override to the base archetype curve so
// the sliders below immediately mirror the new macroscopic shape. User tweaks
// on individual samples are lost — that's the expected "pick a preset" UX.
function setArchetype(evt: Event) {
  const v = (evt.target as HTMLSelectElement).value as RingArchetype
  ringOverrides.archetype = v
  ringOverrides.profile   = [...ARCHETYPE_PROFILES[v]] as unknown as Profile8
}
function resetArchetype() {
  delete (ringOverrides as any).archetype
  delete (ringOverrides as any).profile
}

/** Returns the profile currently displayed in the sliders (override or archetype default). */
function currentProfile(): Profile8 {
  if (ringOverrides.profile) return ringOverrides.profile
  const a = ringOverrides.archetype ?? 'broad'
  return ARCHETYPE_PROFILES[a]
}

function setProfileSample(i: number, evt: Event) {
  const v = parseFloat((evt.target as HTMLInputElement).value)
  const next = [...currentProfile()] as unknown as number[]
  next[i] = v
  ringOverrides.profile = next as unknown as Profile8
}

// `outerRatio` max is `innerRatio.max + wideThick.max` — the true upper bound
// a seeded ring can reach. Exposed here so the slider covers the whole range.
const OUTER_MAX = RING_RANGES.innerRatio.max + RING_RANGES.wideThick.max

function val(v: number | undefined, fallback: number, step: number): string {
  const n = v ?? fallback
  const dp = step >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(step)))
  return n.toFixed(dp)
}
</script>

<template>
  <div class="group-body">
    <div class="row">
      <label>Archetype</label>
      <select
        :value="ringOverrides.archetype ?? ''"
        @change="setArchetype"
        @dblclick="resetArchetype"
      >
        <option value="" disabled>— seed —</option>
        <option v-for="a in RING_ARCHETYPES" :key="a" :value="a">{{ a }}</option>
      </select>
      <span></span>
    </div>

    <details class="group" style="margin:4px 0;">
      <summary>Profile (8 radial samples)</summary>
      <div class="group-body">
        <div v-for="(v, i) in currentProfile()" :key="i" class="row">
          <label>t = {{ (i / 7).toFixed(2) }}</label>
          <input
            type="range"
            min="0" max="1" step="0.01"
            :value="v"
            @input="setProfileSample(i, $event)"
            @dblclick="reset('profile')"
          />
          <span class="val">{{ v.toFixed(2) }}</span>
        </div>
        <p class="hint" style="margin:6px 0 0;">
          Double-click any sample to release the whole profile back to the archetype curve.
        </p>
      </div>
    </details>

    <div class="row">
      <label>Inner ratio</label>
      <input
        type="range"
        :min="RING_RANGES.innerRatio.min" :max="RING_RANGES.innerRatio.max" step="0.01"
        :value="ringOverrides.innerRatio ?? RING_RANGES.innerRatio.min"
        @input="setNum('innerRatio', $event)"
        @dblclick="reset('innerRatio')"
      />
      <span class="val">{{ val(ringOverrides.innerRatio, RING_RANGES.innerRatio.min, 0.01) }}</span>
    </div>
    <div class="row">
      <label>Outer ratio</label>
      <input
        type="range"
        :min="RING_RANGES.innerRatio.min + 0.05" :max="OUTER_MAX" step="0.01"
        :value="ringOverrides.outerRatio ?? (RING_RANGES.innerRatio.min + 0.5)"
        @input="setNum('outerRatio', $event)"
        @dblclick="reset('outerRatio')"
      />
      <span class="val">{{ val(ringOverrides.outerRatio, RING_RANGES.innerRatio.min + 0.5, 0.01) }}</span>
    </div>

    <div class="row">
      <label>Color inner</label>
      <input
        type="color"
        :value="ringOverrides.colorInner ?? '#b89878'"
        @input="setColor('colorInner', $event)"
      />
      <span></span>
    </div>
    <div class="row">
      <label>Color outer</label>
      <input
        type="color"
        :value="ringOverrides.colorOuter ?? '#e8d8b8'"
        @input="setColor('colorOuter', $event)"
      />
      <span></span>
    </div>

    <div class="row">
      <label>Opacity</label>
      <input
        type="range"
        :min="RING_RANGES.opacity.min" :max="RING_RANGES.opacity.max" step="0.01"
        :value="ringOverrides.opacity ?? RING_RANGES.opacity.max"
        @input="setNum('opacity', $event)"
        @dblclick="reset('opacity')"
      />
      <span class="val">{{ val(ringOverrides.opacity, RING_RANGES.opacity.max, 0.01) }}</span>
    </div>
    <div class="row">
      <label>Band freq</label>
      <input
        type="range"
        :min="RING_RANGES.bandFreq.min" :max="RING_RANGES.bandFreq.max" step="1"
        :value="ringOverrides.bandFreq ?? RING_RANGES.bandFreq.min"
        @input="setNum('bandFreq', $event)"
        @dblclick="reset('bandFreq')"
      />
      <span class="val">{{ val(ringOverrides.bandFreq, RING_RANGES.bandFreq.min, 1) }}</span>
    </div>
    <div class="row">
      <label>Band contrast</label>
      <input
        type="range"
        :min="RING_RANGES.bandContrast.min" :max="RING_RANGES.bandContrast.max" step="0.01"
        :value="ringOverrides.bandContrast ?? RING_RANGES.bandContrast.min"
        @input="setNum('bandContrast', $event)"
        @dblclick="reset('bandContrast')"
      />
      <span class="val">{{ val(ringOverrides.bandContrast, RING_RANGES.bandContrast.min, 0.01) }}</span>
    </div>
    <div class="row">
      <label>Dustiness</label>
      <input
        type="range"
        :min="RING_RANGES.dustiness.min" :max="RING_RANGES.dustiness.max" step="0.01"
        :value="ringOverrides.dustiness ?? RING_RANGES.dustiness.min"
        @input="setNum('dustiness', $event)"
        @dblclick="reset('dustiness')"
      />
      <span class="val">{{ val(ringOverrides.dustiness, RING_RANGES.dustiness.min, 0.01) }}</span>
    </div>
    <div class="row">
      <label>Grain amount</label>
      <input
        type="range"
        :min="RING_RANGES.grainAmount.min" :max="RING_RANGES.grainAmount.max" step="0.01"
        :value="ringOverrides.grainAmount ?? RING_RANGES.grainAmount.min"
        @input="setNum('grainAmount', $event)"
        @dblclick="reset('grainAmount')"
      />
      <span class="val">{{ val(ringOverrides.grainAmount, RING_RANGES.grainAmount.min, 0.01) }}</span>
    </div>
    <div class="row">
      <label>Grain freq</label>
      <input
        type="range"
        :min="RING_RANGES.grainFreq.min" :max="RING_RANGES.grainFreq.max" step="1"
        :value="ringOverrides.grainFreq ?? RING_RANGES.grainFreq.min"
        @input="setNum('grainFreq', $event)"
        @dblclick="reset('grainFreq')"
      />
      <span class="val">{{ val(ringOverrides.grainFreq, RING_RANGES.grainFreq.min, 1) }}</span>
    </div>
    <div class="row">
      <label>Lobe strength</label>
      <input
        type="range"
        :min="RING_RANGES.lobeStrength.min" :max="RING_RANGES.lobeStrength.max" step="0.01"
        :value="ringOverrides.lobeStrength ?? RING_RANGES.lobeStrength.min"
        @input="setNum('lobeStrength', $event)"
        @dblclick="reset('lobeStrength')"
      />
      <span class="val">{{ val(ringOverrides.lobeStrength, RING_RANGES.lobeStrength.min, 0.01) }}</span>
    </div>
    <div class="row">
      <label>Kepler shear</label>
      <input
        type="range"
        :min="RING_RANGES.keplerShear.min" :max="RING_RANGES.keplerShear.max" step="0.01"
        :value="ringOverrides.keplerShear ?? RING_RANGES.keplerShear.min"
        @input="setNum('keplerShear', $event)"
        @dblclick="reset('keplerShear')"
      />
      <span class="val">{{ val(ringOverrides.keplerShear, RING_RANGES.keplerShear.min, 0.01) }}</span>
    </div>
    <p class="hint" style="margin:2px 0 0;">
      Kepler shear: 0 = rigid block, 1 = outer bands drift visibly slower than inner (Saturn-like shear spiral).
    </p>

    <p class="hint" style="margin:6px 0 0;">
      Double-click a slider to release it back to the seed value.
    </p>
  </div>
</template>
