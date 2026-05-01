<script setup lang="ts">
import { computed } from 'vue'

/**
 * Reusable view-mode toggle for body demos — segmented control style.
 *
 *   - 'shader' = smooth procedural sphere (default).
 *   - 'sol'    = interactive hex mesh, surface view (relief visible).
 *   - 'atmo'   = interactive hex mesh, atmosphere view (sol hidden, smooth fallback shown).
 *
 * Per body type:
 *   - rocky    → 3 modes (shader, sol, atmo)
 *   - metallic → 2 modes (shader, sol)  — no atmosphere shell to expose
 *   - gaseous  → 3 modes (shader, sol, atmo) — sol exposes the inner
 *                core for excavation visualisation
 *   - star     → no bar
 *
 * Emits `update:mode` with the new value.
 */

export type ViewMode = 'shader' | 'sol' | 'atmo'

const props = defineProps<{
  bodyType: 'rocky' | 'metallic' | 'gaseous' | 'star'
  mode:     ViewMode
}>()
defineEmits<{ (e: 'update:mode', m: ViewMode): void }>()

type IconKey = 'shader' | 'sol' | 'atmo'
interface ButtonSpec { mode: ViewMode, label: string, icon: IconKey }

const buttons = computed<ButtonSpec[]>(() => {
  if (props.bodyType === 'star') return []
  if (props.bodyType === 'metallic') return [
    { mode: 'shader', label: 'Shader', icon: 'shader' },
    { mode: 'sol',    label: 'Sol',    icon: 'sol' },
  ]
  // Rocky and gaseous both expose the three modes — `sol` reveals the
  // inner core through the playable hex shell on a gas giant, same as
  // rocky exposing its dug-out terrain.
  return [
    { mode: 'shader', label: 'Shader',     icon: 'shader' },
    { mode: 'sol',    label: 'Sol',        icon: 'sol' },
    { mode: 'atmo',   label: 'Atmosphère', icon: 'atmo' },
  ]
})

const activeIndex = computed(() =>
  Math.max(0, buttons.value.findIndex(b => b.mode === props.mode)),
)
</script>

<template>
  <div v-if="buttons.length" class="vbar">
    <div class="vbar__track">
      <div
        class="vbar__pill"
        :style="{
          width: `${100 / buttons.length}%`,
          transform: `translateX(${activeIndex * 100}%)`,
        }"
      />
      <button
        v-for="b in buttons"
        :key="b.mode"
        class="vbar__btn"
        :class="{ 'vbar__btn--on': mode === b.mode }"
        @click="$emit('update:mode', b.mode)"
      >
        <svg
          class="vbar__icon"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path
            v-if="b.icon === 'shader'"
            d="M8 1.2 L9.4 6.6 L14.8 8 L9.4 9.4 L8 14.8 L6.6 9.4 L1.2 8 L6.6 6.6 Z"
            fill="currentColor"
          />
          <polygon
            v-else-if="b.icon === 'sol'"
            points="8,1.5 13.6,4.75 13.6,11.25 8,14.5 2.4,11.25 2.4,4.75"
            fill="currentColor"
          />
          <path
            v-else
            d="M4 12.5c-1.66 0-3-1.34-3-3 0-1.46 1.04-2.68 2.42-2.95C3.94 4.81 5.85 3.5 8 3.5c2.49 0 4.5 1.79 4.5 4 0 .04 0 .08-.01.12 1.43.16 2.51 1.39 2.51 2.88 0 1.66-1.34 3-3 3H4z"
            fill="currentColor"
          />
        </svg>{{ b.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.vbar {
  display: flex;
  width: 100%;
  background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
}
.vbar__track {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
}
.vbar__pill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: #1a1a1f;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s ease;
  pointer-events: none;
  z-index: 0;
}
.vbar__btn {
  position: relative;
  z-index: 1;
  flex: 1;
  font-size: 0.72rem;
  font-family: var(--vp-font-family-mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.35rem 0.5rem;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: color 0.2s;
  white-space: nowrap;
}
.vbar__btn:hover { color: var(--vp-c-text-1); }
.vbar__btn--on,
.vbar__btn--on:hover {
  color: #fff;
  font-weight: 500;
}
.vbar__icon {
  width: 0.95em;
  height: 0.95em;
  opacity: 0.85;
  flex-shrink: 0;
}
</style>
