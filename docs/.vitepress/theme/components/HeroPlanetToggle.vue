<script setup lang="ts">
import {
  heroBaseMode,
  heroLoading,
  heroLoadingLabel,
  heroLoadingRatio,
  heroViewOptions,
} from '../composables/heroPlanetState'

/**
 * Compact controls strip rendered just above the home features grid
 * via VitePress' `home-features-before` slot.
 *
 *   - while the planet is warming up, shows a small progress bar with
 *     the current label streamed by `body.warmup`,
 *   - once ready, swaps to a 3-button toggle (shader / surface /
 *     atmosphere) wired to the shared `heroBaseMode` ref. The canvas
 *     watches that ref to switch its view.
 *
 * Layout: right-aligned, small, square-ish corners — meant to read as
 * a discreet utility row, not a hero CTA.
 */
</script>

<template>
  <div class="hero-toggle-row">
    <Transition name="hero-toggle-fade" mode="out-in">
      <div
        v-if="heroLoading"
        key="loader"
        class="hero-toggle__loader"
      >
        <span class="hero-toggle__label">{{ heroLoadingLabel }}</span>
        <div class="hero-toggle__bar">
          <div
            class="hero-toggle__fill"
            :style="{ width: (heroLoadingRatio * 100) + '%' }"
          />
        </div>
      </div>

      <div
        v-else
        key="toggle"
        class="hero-toggle__group"
        role="group"
        aria-label="Vue de la planète"
      >
        <button
          v-for="opt in heroViewOptions"
          :key="opt.value"
          type="button"
          :class="{ 'is-active': heroBaseMode === opt.value }"
          @click="heroBaseMode = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/*
 * Stay in the central content flow — same max-width / horizontal
 * padding as VitePress' `.container` so the row is aligned with the
 * features grid below. Centered horizontally, just above the cards.
 */
.hero-toggle-row {
  max-width: 1152px;
  margin: 0 auto 20px auto;
  display: flex;
  justify-content: flex-start;
  pointer-events: none;
}

@media (max-width: 960px) {
  .hero-toggle-row { padding: 0 48px 16px 48px; }
}
@media (max-width: 768px) {
  .hero-toggle-row { padding: 0 24px 12px 24px; }
}

.hero-toggle__group,
.hero-toggle__loader {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.hero-toggle__group { gap: 1rem; }

.hero-toggle__group button {
  font-family: var(--vp-font-family-mono);
  font-size: 0.9rem;
  letter-spacing: 0.04em;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  text-decoration: none;
  text-underline-offset: 4px;
  transition: color 140ms ease, text-decoration-color 140ms ease;
}
.hero-toggle__group button:hover {
  text-decoration: underline;
  text-decoration-color: rgba(255, 255, 255, 0.6);
}
.hero-toggle__group button.is-active {
  color: #fff;
}

.hero-toggle__label {
  font-family: var(--vp-font-family-mono);
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-2);
}

.hero-toggle__bar {
  width: 120px;
  height: 3px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.hero-toggle__fill {
  height: 100%;
  background: linear-gradient(90deg, #4ea3ff, #a78bff);
  transition: width 120ms ease-out;
}

.hero-toggle-fade-enter-active,
.hero-toggle-fade-leave-active { transition: opacity 200ms ease; }
.hero-toggle-fade-enter-from,
.hero-toggle-fade-leave-to     { opacity: 0; }
</style>
