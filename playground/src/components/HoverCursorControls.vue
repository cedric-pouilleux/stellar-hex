<script setup lang="ts">
/**
 * Live tuning panel for the hover cursor — drives the lib's
 * `body.hover.updateCursor` through the reactive `hoverCursorParams`
 * mirror. Three primitives, each independently togglable + tintable:
 *
 *   - Ring        : flat outline at the visible top (every layer)
 *   - Floor ring  : seabed outline under liquid hovers (the sol tile
 *                   sitting under the hovered ocean hex)
 *   - Emissive    : `THREE.PointLight` at mid-prism (every layer)
 *
 * Disabling a primitive sets its config to `false` — the lib hides the
 * primitive but keeps the GPU resource around for instant re-enable.
 */
import {
  hoverCursorParams,
  HOVER_CURSOR_DEFAULTS,
  HOVER_CURSOR_RANGES,
  type RingParams,
} from '../lib/hoverCursorParams'

function setNum<T extends RingParams | typeof hoverCursorParams.emissive>(
  ref: T,
  key: keyof T,
  evt: Event,
) {
  ;(ref as any)[key] = parseFloat((evt.target as HTMLInputElement).value)
}

function resetAll() {
  Object.assign(hoverCursorParams.ring,      HOVER_CURSOR_DEFAULTS.ring)
  Object.assign(hoverCursorParams.floorRing, HOVER_CURSOR_DEFAULTS.floorRing)
  Object.assign(hoverCursorParams.emissive,  HOVER_CURSOR_DEFAULTS.emissive)
}
</script>

<template>
  <div class="group-body">
    <!-- ── Cap ring (waterline / sol cap / atmo cap) ───────── -->
    <h4 class="sub-h">Ring (cap)</h4>
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Enabled</label>
      <span></span>
      <input
        type="checkbox"
        :checked="hoverCursorParams.ring.enabled"
        @change="hoverCursorParams.ring.enabled = ($event.target as HTMLInputElement).checked"
      />
    </div>
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Color</label>
      <input
        type="color"
        :value="hoverCursorParams.ring.color"
        :disabled="!hoverCursorParams.ring.enabled"
        @input="hoverCursorParams.ring.color = ($event.target as HTMLInputElement).value"
      />
      <span class="val" style="font-family: monospace;">{{ hoverCursorParams.ring.color }}</span>
    </div>
    <div class="row">
      <label>Size</label>
      <input
        type="range"
        :min="HOVER_CURSOR_RANGES.ringSize.min"
        :max="HOVER_CURSOR_RANGES.ringSize.max"
        :step="HOVER_CURSOR_RANGES.ringSize.step"
        :value="hoverCursorParams.ring.size"
        :disabled="!hoverCursorParams.ring.enabled"
        @input="setNum(hoverCursorParams.ring, 'size', $event)"
      />
      <span class="val">{{ hoverCursorParams.ring.size.toFixed(1) }}</span>
    </div>
    <div class="row">
      <label>Opacity</label>
      <input
        type="range"
        :min="HOVER_CURSOR_RANGES.ringOpacity.min"
        :max="HOVER_CURSOR_RANGES.ringOpacity.max"
        :step="HOVER_CURSOR_RANGES.ringOpacity.step"
        :value="hoverCursorParams.ring.opacity"
        :disabled="!hoverCursorParams.ring.enabled"
        @input="setNum(hoverCursorParams.ring, 'opacity', $event)"
      />
      <span class="val">{{ hoverCursorParams.ring.opacity.toFixed(2) }}</span>
    </div>

    <!-- ── Floor ring (seabed twin, liquid only) ───────────── -->
    <h4 class="sub-h">Ring (seabed) — liquid only</h4>
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Enabled</label>
      <span></span>
      <input
        type="checkbox"
        :checked="hoverCursorParams.floorRing.enabled"
        @change="hoverCursorParams.floorRing.enabled = ($event.target as HTMLInputElement).checked"
      />
    </div>
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Color</label>
      <input
        type="color"
        :value="hoverCursorParams.floorRing.color"
        :disabled="!hoverCursorParams.floorRing.enabled"
        @input="hoverCursorParams.floorRing.color = ($event.target as HTMLInputElement).value"
      />
      <span class="val" style="font-family: monospace;">{{ hoverCursorParams.floorRing.color }}</span>
    </div>
    <div class="row">
      <label>Size</label>
      <input
        type="range"
        :min="HOVER_CURSOR_RANGES.ringSize.min"
        :max="HOVER_CURSOR_RANGES.ringSize.max"
        :step="HOVER_CURSOR_RANGES.ringSize.step"
        :value="hoverCursorParams.floorRing.size"
        :disabled="!hoverCursorParams.floorRing.enabled"
        @input="setNum(hoverCursorParams.floorRing, 'size', $event)"
      />
      <span class="val">{{ hoverCursorParams.floorRing.size.toFixed(1) }}</span>
    </div>
    <div class="row">
      <label>Opacity</label>
      <input
        type="range"
        :min="HOVER_CURSOR_RANGES.ringOpacity.min"
        :max="HOVER_CURSOR_RANGES.ringOpacity.max"
        :step="HOVER_CURSOR_RANGES.ringOpacity.step"
        :value="hoverCursorParams.floorRing.opacity"
        :disabled="!hoverCursorParams.floorRing.enabled"
        @input="setNum(hoverCursorParams.floorRing, 'opacity', $event)"
      />
      <span class="val">{{ hoverCursorParams.floorRing.opacity.toFixed(2) }}</span>
    </div>

    <!-- ── Emissive light ───────────────────────────────────── -->
    <h4 class="sub-h">Emissive light</h4>
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Enabled</label>
      <span></span>
      <input
        type="checkbox"
        :checked="hoverCursorParams.emissive.enabled"
        @change="hoverCursorParams.emissive.enabled = ($event.target as HTMLInputElement).checked"
      />
    </div>
    <div class="row" style="grid-template-columns: 110px 1fr auto;">
      <label>Color</label>
      <input
        type="color"
        :value="hoverCursorParams.emissive.color"
        :disabled="!hoverCursorParams.emissive.enabled"
        @input="hoverCursorParams.emissive.color = ($event.target as HTMLInputElement).value"
      />
      <span class="val" style="font-family: monospace;">{{ hoverCursorParams.emissive.color }}</span>
    </div>
    <div class="row">
      <label>Intensity</label>
      <input
        type="range"
        :min="HOVER_CURSOR_RANGES.emissiveIntensity.min"
        :max="HOVER_CURSOR_RANGES.emissiveIntensity.max"
        :step="HOVER_CURSOR_RANGES.emissiveIntensity.step"
        :value="hoverCursorParams.emissive.intensity"
        :disabled="!hoverCursorParams.emissive.enabled"
        @input="setNum(hoverCursorParams.emissive, 'intensity', $event)"
      />
      <span class="val">{{ hoverCursorParams.emissive.intensity.toFixed(1) }}</span>
    </div>
    <div class="row">
      <label>Size</label>
      <input
        type="range"
        :min="HOVER_CURSOR_RANGES.emissiveSize.min"
        :max="HOVER_CURSOR_RANGES.emissiveSize.max"
        :step="HOVER_CURSOR_RANGES.emissiveSize.step"
        :value="hoverCursorParams.emissive.size"
        :disabled="!hoverCursorParams.emissive.enabled"
        @input="setNum(hoverCursorParams.emissive, 'size', $event)"
      />
      <span class="val">{{ hoverCursorParams.emissive.size.toFixed(2) }}</span>
    </div>

    <!-- ── Reset ────────────────────────────────────────────── -->
    <div class="row" style="grid-template-columns: 1fr auto; margin-top:6px;">
      <span class="hint" style="margin:0;">Restore defaults for every primitive.</span>
      <button type="button" class="pill" style="border:0; cursor:pointer; font-size:10px;" @click="resetAll">Reset</button>
    </div>
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
</style>
