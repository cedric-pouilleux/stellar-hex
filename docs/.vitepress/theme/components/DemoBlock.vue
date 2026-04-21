<script setup lang="ts">
import { computed, ref } from 'vue'
import { useImplMode } from '../composables/useImplMode'

/**
 * Wrapper component for live demos in the docs.
 *
 * - Default slot: the live preview (always the Three.js implementation).
 * - `tabs` array: one entry per code variant. Labels must contain "three" or
 *   "vue" (case-insensitive) so the global ImplSwitcher can auto-select the
 *   matching tab when the user changes the global implementation mode.
 */

export interface DemoTab {
  /** Label shown in the tab bar — should contain "Three.js" or "Vue". */
  label: string
  /** Raw source code (import with `?raw`). */
  code: string
  /** Language hint shown in the code header. Defaults to "vue". */
  lang?: string
}

const props = defineProps<{
  tabs: DemoTab[]
}>()

const { mode, setMode } = useImplMode()
const showCode = ref(false)

/** Resolve the active tab index from the global impl mode. */
const activeCode = computed({
  get(): number {
    const idx = props.tabs.findIndex(t =>
      mode.value === 'vue'
        ? t.label.toLowerCase().includes('vue')
        : t.label.toLowerCase().includes('three'),
    )
    return idx >= 0 ? idx : 0
  },
  /** When the user clicks a tab manually, update the global mode too. */
  set(i: number) {
    const label = props.tabs[i]?.label.toLowerCase() ?? ''
    setMode(label.includes('vue') ? 'vue' : 'three')
  },
})

const current = () => props.tabs[activeCode.value]
</script>

<template>
  <div class="demo-block">

    <!-- Live preview -->
    <div class="demo-block__preview">
      <slot />
    </div>

    <!-- Actions bar -->
    <div class="demo-block__actions">
      <button class="demo-block__toggle" @click="showCode = !showCode">
        {{ showCode ? '↑ Hide code' : '↓ Show code' }}
      </button>
    </div>

    <template v-if="showCode">
      <!-- Tab bar — only rendered when there are multiple code variants -->
      <div v-if="tabs.length > 1" class="demo-block__tabs">
        <button
          v-for="(tab, i) in tabs"
          :key="tab.label"
          class="demo-block__tab"
          :class="{ 'demo-block__tab--active': activeCode === i }"
          @click="activeCode = i"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="demo-block__code">
        <div class="demo-block__code-lang">{{ current().lang ?? 'vue' }}</div>
        <pre class="demo-block__pre"><code>{{ current().code }}</code></pre>
      </div>
    </template>

  </div>
</template>

<style scoped>
.demo-block {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  margin: 1.5rem 0;
}

.demo-block__preview {
  background: #08080f;
  min-height: 400px;
}

.demo-block__actions {
  display: flex;
  justify-content: flex-end;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.demo-block__toggle {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: color 0.2s, background 0.2s;
}

.demo-block__toggle:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-alt);
}

.demo-block__tabs {
  display: flex;
  gap: 2px;
  padding: 0.5rem 0.75rem 0;
  background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
}

.demo-block__tab {
  padding: 0.35rem 0.9rem;
  font-size: 0.8rem;
  font-family: var(--vp-font-family-mono);
  background: none;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  color: var(--vp-c-text-2);
  transition: color 0.15s, background 0.15s, border-color 0.15s;
  position: relative;
  bottom: -1px;
}

.demo-block__tab:hover { color: var(--vp-c-brand-1); }

.demo-block__tab--active {
  color: var(--vp-c-text-1);
  background: var(--vp-code-block-bg);
  border-color: var(--vp-c-divider);
  border-bottom-color: var(--vp-code-block-bg);
}

.demo-block__code {
  position: relative;
  border-top: 1px solid var(--vp-c-divider);
}

.demo-block__code-lang {
  position: absolute;
  top: 0.75rem;
  right: 1rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.demo-block__pre {
  margin: 0;
  padding: 1.5rem 1.25rem;
  background: var(--vp-code-block-bg);
  overflow-x: auto;
  font-size: 0.85rem;
  line-height: 1.6;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
  white-space: pre;
}
</style>
