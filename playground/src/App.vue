<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import ShaderPane      from './panes/ShaderPane.vue'
import HexaPane        from './panes/HexaPane.vue'
import ShaderControls  from './components/ShaderControls.vue'
import BodyControls    from './components/BodyControls.vue'
import { BODY_TYPES, generateBodyVariation, type LibBodyType } from '@lib'
import { configToLibParams } from '@render/configToLibParams'
import {
  bodyType, bodyConfig, shaderParams, tileSize,
  rebuildKey, toBodyType,
} from './lib/state'

// ── Config → shader param derivation ──────────────────────────
// `useBody` runs every BodyConfig through `configToLibParams(config, variation)`
// before feeding the planet material. The shader preview (left pane) must use
// the same derivation to stay visually in sync with the hex view; otherwise it
// would just render the raw shader defaults.
function deriveShaderParams() {
  const variation = generateBodyVariation(bodyConfig)
  return configToLibParams(bodyConfig, variation) as Record<string, number | string | number[] | boolean>
}

// Reactive churn control: `shaderParams` feeds both `ShaderControls` and a
// deep watcher in `ShaderPane` that pushes uniforms to the material. A naive
// delete-then-reassign on every slider tick fires O(N) reactive updates per
// mousemove, which dominates the drag-time cost. We instead mutate only keys
// whose value actually changed and drop stale ones.
function resyncShaderParams() {
  const fresh  = deriveShaderParams()
  const target = shaderParams as Record<string, unknown>

  for (const k of Object.keys(target)) {
    if (!(k in fresh)) delete target[k]
  }
  for (const k of Object.keys(fresh)) {
    const nv = fresh[k]
    const cv = target[k]
    if (Array.isArray(nv) && Array.isArray(cv) && nv.length === cv.length &&
        nv.every((v, i) => v === cv[i])) continue
    if (nv !== cv) target[k] = nv
  }
}

// Coalesce rapid slider drags into one re-derivation per animation frame.
// `generateBodyVariation` + `configToLibParams` are pure CPU work that does
// not need to run at mousemove frequency.
let resyncHandle: number | null = null
function scheduleResync() {
  if (resyncHandle != null) return
  resyncHandle = requestAnimationFrame(() => {
    resyncHandle = null
    if (autoSync.value) resyncShaderParams()
  })
}

/**
 * When on (default), every BodyConfig tweak rewrites the shader params from
 * the physics pipeline. Toggle off to freeze the shader params and tweak them
 * independently of the physical config.
 */
const autoSync = ref(true)

// Initial sync on mount.
resyncShaderParams()

// ── Type switch ───────────────────────────────────────────────
// Also triggers a physics→shader resync so the left pane picks the correct
// param schema (shader keys differ per type) already populated with derived
// values instead of raw defaults.
function setType(t: LibBodyType) {
  if (bodyType.value === t) return
  bodyType.value  = t
  bodyConfig.type = toBodyType(t)
  resyncShaderParams()
  rebuildKey.value++
}

// Re-derive on every BodyConfig mutation so the shader preview tracks the
// physical config when auto-sync is enabled. Manual slider tweaks survive
// until the next config change. Coalesced via rAF so rapid drags do not
// re-run the full derivation at mousemove frequency.
watch(bodyConfig, scheduleResync, { deep: true })

// Rebuild the hex body when a structural field changes (not just uniforms).
// Radius/terrainLevelCount/name drive geometry + seed — they can't be
// live-patched through `setParams`, so we bump rebuildKey to force both panes
// to recreate their `useBody` instance.
watch(() => bodyConfig.type,                 () => rebuildKey.value++)
watch(() => bodyConfig.hasRings,             () => rebuildKey.value++)
watch(() => bodyConfig.hasCracks,            () => rebuildKey.value++)
watch(() => bodyConfig.hasLava,              () => rebuildKey.value++)
watch(() => bodyConfig.radius,               () => rebuildKey.value++)
watch(() => bodyConfig.terrainLevelCount,    () => rebuildKey.value++)
watch(() => bodyConfig.name,                 () => rebuildKey.value++)
// Atmosphere / cloud shells depend on these fields at attach time — the shells
// are built from scratch on rebuild, so changes must bump rebuildKey to flow.
watch(() => bodyConfig.atmosphereThickness,  () => rebuildKey.value++)
watch(() => bodyConfig.waterCoverage,        () => rebuildKey.value++)
watch(() => bodyConfig.spectralType,         () => rebuildKey.value++)
watch(() => bodyConfig.temperatureMin,       () => rebuildKey.value++)
watch(() => bodyConfig.temperatureMax,       () => rebuildKey.value++)

function onShaderUpdate(key: string, value: number | string | number[] | boolean) {
  ;(shaderParams as any)[key] = value
}

const warning = computed(() => {
  if (bodyConfig.type === 'gaseous' && !bodyConfig.gasComposition) {
    return 'Set a gas composition below to unlock the real gas giant palette.'
  }
  return null
})

/**
 * Shader groups gated by a Body checkbox. Kept in sync with the group
 * labels declared in `BODY_GROUPS` (shaders/params.ts).
 */
const hiddenShaderGroups = computed(() => {
  const hidden: string[] = []
  if (!bodyConfig.hasCracks) hidden.push('Fissures')
  if (!bodyConfig.hasLava)   hidden.push('Lave')
  return hidden
})
</script>

<template>
  <div class="layout">
    <div class="topbar">
      <strong>stellar-hex</strong>
      <span>playground</span>
      <div class="type-switch" style="margin:0; flex: 0 0 auto;">
        <button
          v-for="t in BODY_TYPES" :key="t.id"
          :class="{ active: bodyType === t.id }"
          @click="setType(t.id)"
        >{{ t.icon }} {{ t.label }}</button>
      </div>
      <div class="spacer"></div>
      <label class="pill" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" v-model="autoSync" />
        Auto-sync shader ← config
      </label>
      <button class="pill" style="border:0; cursor:pointer;" @click="resyncShaderParams">Resync now</button>
      <span class="pill">Drag: orbit · Scroll: zoom · Hover a tile for details</span>
    </div>

    <!-- LEFT sidebar: shader params -->
    <aside class="panel">
      <h2>Shader parameters</h2>
      <p v-if="autoSync" class="hint" style="margin:0 0 6px;">
        Derived from the body config. Tweaks persist until the next config change.
      </p>
      <ShaderControls :type="bodyType" :values="shaderParams" :hidden-groups="hiddenShaderGroups" @update="onShaderUpdate" />
    </aside>

    <!-- LEFT view: continuous shader preview -->
    <div class="view-wrap" style="display:contents;">
      <ShaderPane
        :type="bodyType"
        :params="shaderParams"
        :config="bodyConfig"
        :tile-size="tileSize"
        :rebuild-key="rebuildKey"
      />
    </div>

    <!-- RIGHT view: hexa body (interactive) -->
    <HexaPane :config="bodyConfig" :tile-size="tileSize" :rebuild-key="rebuildKey" />

    <!-- RIGHT sidebar: body params -->
    <aside class="panel">
      <div v-if="warning" class="warn">{{ warning }}</div>
      <h2>Body parameters</h2>
      <BodyControls :config="bodyConfig" />
    </aside>
  </div>
</template>
