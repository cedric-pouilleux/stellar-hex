<script setup lang="ts">
import { useData } from 'vitepress'
import { useImplMode } from '../composables/useImplMode'

/**
 * Global implementation switcher — injected into the aside-top layout slot.
 * Only visible on /examples/ pages. Persists the user's choice across all
 * DemoBlock instances via useImplMode (localStorage-backed).
 */

const { page } = useData()
const { mode, setMode } = useImplMode()

const isExamplesPage = () => page.value.relativePath.startsWith('examples/')
</script>

<template>
  <div v-if="isExamplesPage()" class="impl-switcher">
    <span class="impl-switcher__label">Implementation</span>
    <div class="impl-switcher__buttons">
      <button
        class="impl-switcher__btn"
        :class="{ 'impl-switcher__btn--active': mode === 'three' }"
        @click="setMode('three')"
      >
        Three.js
      </button>
      <button
        class="impl-switcher__btn"
        :class="{ 'impl-switcher__btn--active': mode === 'vue' }"
        @click="setMode('vue')"
      >
        Vue
      </button>
    </div>
  </div>
</template>

<style scoped>
.impl-switcher {
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--vp-c-divider);
}

.impl-switcher__label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.5rem;
}

.impl-switcher__buttons {
  display: flex;
  gap: 4px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 3px;
}

.impl-switcher__btn {
  flex: 1;
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  font-family: var(--vp-font-family-mono);
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--vp-c-text-2);
  transition: color 0.15s, background 0.15s;
}

.impl-switcher__btn:hover {
  color: var(--vp-c-text-1);
}

.impl-switcher__btn--active {
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
</style>
