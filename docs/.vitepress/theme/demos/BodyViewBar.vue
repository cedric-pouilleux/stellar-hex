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

interface ButtonSpec { mode: ViewMode, label: string, icon: string }

const buttons = computed<ButtonSpec[]>(() => {
  if (props.bodyType === 'star') return []
  if (props.bodyType === 'metallic') return [
    { mode: 'shader', label: 'Shader', icon: '✦' },
    { mode: 'sol',    label: 'Sol',    icon: '⬢' },
  ]
  // Rocky and gaseous both expose the three modes — `sol` reveals the
  // inner core through the playable hex shell on a gas giant, same as
  // rocky exposing its dug-out terrain.
  return [
    { mode: 'shader', label: 'Shader',     icon: '✦' },
    { mode: 'sol',    label: 'Sol',        icon: '⬢' },
    { mode: 'atmo',   label: 'Atmosphère', icon: '☁' },
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
          width: `calc(${100 / buttons.length}% - 6px)`,
          transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 6}px))`,
        }"
      />
      <button
        v-for="b in buttons"
        :key="b.mode"
        class="vbar__btn"
        :class="{ 'vbar__btn--on': mode === b.mode }"
        @click="$emit('update:mode', b.mode)"
      >
        <span class="vbar__icon">{{ b.icon }}</span>{{ b.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.vbar {
  display: flex;
  justify-content: center;
  padding: 0.7rem 0.75rem;
  background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
}
.vbar__track {
  position: relative;
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.08);
}
.vbar__pill {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s ease;
  pointer-events: none;
  z-index: 0;
}
.vbar__btn {
  position: relative;
  z-index: 1;
  font-size: 0.78rem;
  font-family: var(--vp-font-family-mono);
  padding: 0.4rem 1.1rem;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color 0.2s;
  white-space: nowrap;
}
.vbar__btn:hover { color: var(--vp-c-text-1); }
.vbar__btn--on {
  color: #fff;
  font-weight: 500;
}
.vbar__icon {
  opacity: 0.85;
  font-size: 0.95em;
}
</style>
