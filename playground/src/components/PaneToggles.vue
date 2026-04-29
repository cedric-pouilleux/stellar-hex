<script setup lang="ts">
/**
 * Floating overlay toggles — sits at the top of the viewport, above the
 * spinning body. Groups the two pane-level view switches:
 *
 *  1. Shader / Hexa — which render pane is active (topbar-level previously).
 *  2. Sol / Atmosphère — layered mesh view (only meaningful in Hexa pane).
 *
 * The atmosphere toggle auto-hides on stars and on bodies configured
 * without an atmosphere — same contract as `hasAtmosphere(config)` on
 * the lib side, so the UI switch and the lib-side render decisions
 * stay in lockstep.
 */
import { computed } from 'vue'
import { hasAtmosphere } from '@lib'
import { bodyConfig, activePane } from '../lib/state'
import { viewMode } from '../lib/viewMode'

const canHaveAtmosphere = computed(() => hasAtmosphere(bodyConfig))
const showAtmoToggle    = computed(() =>
  activePane.value === 'hexa' && canHaveAtmosphere.value,
)
</script>

<template>
  <div class="pane-toggles">
    <div class="view-toggle pane-toggles__group">
      <button
        type="button"
        class="view-toggle__btn"
        :class="{ 'is-active': activePane === 'shader' }"
        @click="activePane = 'shader'"
      >Shader</button>
      <button
        type="button"
        class="view-toggle__btn"
        :class="{ 'is-active': activePane === 'hexa' }"
        @click="activePane = 'hexa'"
      >Hexa</button>
    </div>

    <div v-if="showAtmoToggle" class="view-toggle pane-toggles__group">
      <button
        type="button"
        class="view-toggle__btn"
        :class="{ 'is-active': viewMode === 'surface' }"
        @click="viewMode = 'surface'"
      >Sol</button>
      <button
        type="button"
        class="view-toggle__btn"
        :class="{ 'is-active': viewMode === 'atmosphere' }"
        @click="viewMode = 'atmosphere'"
      >Atmosphère</button>
    </div>
  </div>
</template>

<style scoped>
.pane-toggles {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 10;
  pointer-events: none;
}
.pane-toggles__group {
  pointer-events: auto;
  background: rgba(15, 18, 24, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-color: rgba(255, 255, 255, 0.08);
}
</style>
