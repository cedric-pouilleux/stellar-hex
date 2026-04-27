<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import ShaderPane         from './panes/ShaderPane.vue'
import HexaPane           from './panes/HexaPane.vue'
import ShaderControls     from './components/ShaderControls.vue'
import BodyControls       from './components/BodyControls.vue'
import ResourceControls   from './components/ResourceControls.vue'
import PaneToggles        from './components/PaneToggles.vue'
import DigControls        from './components/DigControls.vue'
import { BODY_TYPES, generateBodyVariation, configToLibParams, type LibBodyType } from '@lib'
import {
  bodyType, bodyConfig, shaderParams, tileSize,
  rebuildKey, activePane, resourceUIState, coronaHeadroom,
  sphereDetail, shaderQuality,
} from './lib/state'
import { deriveTemperatureAnchors, deriveLavaColor } from './lib/temperaturePalette'
import { deriveMetallicBands } from './lib/metallicCatalog'

// ── Config → shader param derivation ──────────────────────────
// `useBody` runs every BodyConfig through `configToLibParams(config, variation)`
// before feeding the planet material. The shader preview (left pane) must use
// the same derivation to stay visually in sync with the hex view; otherwise it
// would just render the raw shader defaults.
//
// Default tile palette is temperature-driven: every body gets a `(colorLow,
// colorHigh)` pair derived from its mean equilibrium temperature, so the
// hex sphere reads as the right archetype (volcanic / arid / temperate /
// glacial) before any resource pattern paints over it. Resource overlay is
// applied later by the paint pipeline.
function applyTemperatureAnchors() {
  if (bodyConfig.type !== 'rocky') return
  const { colorLow, colorHigh } = deriveTemperatureAnchors(bodyConfig)
  bodyConfig.terrainColorLow  = colorLow
  bodyConfig.terrainColorHigh = colorHigh
  // Lava colour is also temperature-driven — kept caller-owned so the lib
  // ships no chemistry. Only matters when `hasLava` is on, but the cost
  // of always assigning is negligible.
  bodyConfig.lavaColor = deriveLavaColor(bodyConfig)
}

// Metallic bands cache — `deriveMetallicBands` rebuilds a fresh array of
// fresh band objects on every call, so naively re-assigning `metallicBands`
// inside `deriveShaderParams` (called on every resync) would feed the deep
// `bodyConfig` watcher a different reference every frame and re-arm the
// rebuild debounce in HexaPane indefinitely — the planet view would never
// rebuild on metallic switch. We cache by `(tempMin, tempMax)` so the
// derivation only re-fires when the input climate actually moved.
let lastMetallicSig: string | null = null

// Metallic bodies get their 4-band palette (deep/plain/high/peak) derived
// from the temperature-keyed composition catalogue — same contract as the
// rocky anchors above, but 4 stops + material ladder + volcanic emissive.
function applyMetallicBands() {
  if (bodyConfig.type !== 'metallic') return
  const sig = `${bodyConfig.temperatureMin}|${bodyConfig.temperatureMax}`
  if (sig === lastMetallicSig && bodyConfig.metallicBands) return
  lastMetallicSig = sig
  bodyConfig.metallicBands = deriveMetallicBands({
    min: bodyConfig.temperatureMin,
    max: bodyConfig.temperatureMax,
  })
}

function deriveShaderParams() {
  applyTemperatureAnchors()
  applyMetallicBands()
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
  bodyConfig.type = t
  resyncShaderParams()
  rebuildKey.value++
}

// Re-derive on every BodyConfig mutation so the shader preview tracks the
// physical config when auto-sync is enabled. Manual slider tweaks survive
// until the next config change. Coalesced via rAF so rapid drags do not
// re-run the full derivation at mousemove frequency.
watch(bodyConfig, scheduleResync, { deep: true })

// Liquid fields (`liquidState`, `liquidColor`) are user-driven through
// `LiquidControls`. Substance identity lives in `playgroundLibMeta`. Non-rocky
// bodies drop any stale liquid values so the lib skips the ocean palette branch.
watch(() => bodyConfig.type, (t) => {
  if (t !== 'rocky') {
    bodyConfig.liquidState = 'none'
    bodyConfig.liquidColor = undefined
  }
})

// Rebuild the hex body when a structural field changes (not just uniforms).
// Radius/name drive geometry + seed — they can't be live-patched through
// `setParams`, so we bump rebuildKey to force both panes to recreate their
// `useBody` instance.
watch(() => bodyConfig.type,                 () => rebuildKey.value++)
watch(() => bodyConfig.hasRings,             () => rebuildKey.value++)
watch(() => bodyConfig.hasCracks,            () => rebuildKey.value++)
watch(() => bodyConfig.hasLava,              () => rebuildKey.value++)
watch(() => bodyConfig.radius,               () => rebuildKey.value++)
watch(() => bodyConfig.name,                 () => rebuildKey.value++)
// Atmosphere / cloud shells depend on these fields at attach time — the shells
// are built from scratch on rebuild, so changes must bump rebuildKey to flow.
watch(() => bodyConfig.atmosphereThickness,  () => rebuildKey.value++)
watch(() => bodyConfig.liquidState,          () => rebuildKey.value++)
watch(() => bodyConfig.liquidColor,          () => rebuildKey.value++)
watch(() => bodyConfig.liquidCoverage,       () => rebuildKey.value++)
watch(() => bodyConfig.bandColors,           () => rebuildKey.value++)
watch(() => bodyConfig.spectralType,         () => rebuildKey.value++)
watch(() => bodyConfig.temperatureMin,       () => rebuildKey.value++)
watch(() => bodyConfig.temperatureMax,       () => rebuildKey.value++)
// fBm noise knobs feed the palette + simulation at build time (not
// patchable via setParams), so every edit needs a rebuild.
watch(() => bodyConfig.noiseScale,           () => rebuildKey.value++)
watch(() => bodyConfig.noiseOctaves,         () => rebuildKey.value++)
watch(() => bodyConfig.noisePersistence,     () => rebuildKey.value++)
watch(() => bodyConfig.noiseLacunarity,      () => rebuildKey.value++)
watch(() => bodyConfig.noisePower,           () => rebuildKey.value++)
watch(() => bodyConfig.noiseRidge,           () => rebuildKey.value++)
watch(() => bodyConfig.reliefFlatness,       () => rebuildKey.value++)
// Terrain colour overrides feed the palette at build time — changing them
// must rebuild so the gray ramp is regenerated with the new anchors.
watch(() => bodyConfig.terrainColorLow,      () => rebuildKey.value++)
watch(() => bodyConfig.terrainColorHigh,     () => rebuildKey.value++)
watch(() => bodyConfig.metallicBands,        () => rebuildKey.value++)
// Per-resource UI state — toggling enabled, swapping pattern kind, or picking
// a new colour all affect the tile distribution / paint, so every mutation
// triggers a full rebuild to flush the new state through both panes.
watch(resourceUIState,                       () => rebuildKey.value++, { deep: true })

// `coronaHeadroom` feeds `buildAtmoShell` at construction time, so
// adjusting it requires a full rebuild.
watch(coronaHeadroom,                        () => rebuildKey.value++)

// `sphereDetail` feeds every spherical mesh at construction time
// (icosphere `detail` is baked into the BufferGeometry), so flipping the
// preset requires a full rebuild.
watch(sphereDetail,                          () => rebuildKey.value++)

function onShaderUpdate(key: string, value: number | string | number[] | boolean) {
  ;(shaderParams as any)[key] = value
}

const warning = computed(() => {
  if (bodyConfig.type === 'gaseous' && !bodyConfig.bandColors) {
    return 'Set a gas composition below to unlock the real gas giant palette.'
  }
  return null
})

// ── Feature applicability (per body type) ────────────────────────
// Whether each optional feature makes sense for the current body type.
// The lib no longer enforces these rules — the playground decides which
// feature toggles to expose so the UI only shows what the caller can apply.
const canHaveCracks     = computed(() => bodyConfig.type === 'rocky' || bodyConfig.type === 'metallic')
const canHaveLava       = computed(() => bodyConfig.type === 'rocky' || bodyConfig.type === 'metallic')

function setBody<K extends keyof typeof bodyConfig>(key: K, value: (typeof bodyConfig)[K]) {
  ;(bodyConfig as any)[key] = value
}

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
  <div class="layout" :class="{ 'has-shader-pane': activePane === 'shader' }">
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
      <div class="pill" style="display:flex; align-items:center; gap:4px; padding:2px 6px;" title="Détail des sphères (smooth sphere, océan, halos, cœur, effets). HD = +1 subdivision (≈ 4× tris), Ultra = +2 (≈ 16× tris).">
        <span style="opacity:0.7; margin-right:2px;">Sphères</span>
        <button
          v-for="q in (['standard','high','ultra'] as const)"
          :key="q"
          type="button"
          :class="{ active: sphereDetail === q }"
          style="border:0; padding:2px 8px; cursor:pointer; background:transparent; color:inherit; border-radius:6px;"
          :style="sphereDetail === q ? 'background: rgba(255,255,255,0.18);' : ''"
          @click="sphereDetail = q"
        >{{ q === 'standard' ? 'Std' : q === 'high' ? 'HD' : 'Ultra' }}</button>
      </div>
      <div class="pill" style="display:flex; align-items:center; gap:4px; padding:2px 6px;" title="Qualité shader — pilote le pixel ratio du renderer. HD = ×1.5, Ultra = ×2 (clamp à devicePixelRatio).">
        <span style="opacity:0.7; margin-right:2px;">Shader</span>
        <button
          v-for="q in (['standard','high','ultra'] as const)"
          :key="q"
          type="button"
          :class="{ active: shaderQuality === q }"
          style="border:0; padding:2px 8px; cursor:pointer; background:transparent; color:inherit; border-radius:6px;"
          :style="shaderQuality === q ? 'background: rgba(255,255,255,0.18);' : ''"
          @click="shaderQuality = q"
        >{{ q === 'standard' ? 'Std' : q === 'high' ? 'HD' : 'Ultra' }}</button>
      </div>
      <label v-if="activePane === 'shader'" class="pill" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" v-model="autoSync" />
        Auto-sync shader ← config
      </label>
      <button v-if="activePane === 'shader'" class="pill" style="border:0; cursor:pointer;" @click="resyncShaderParams">Resync now</button>
      <span class="pill">Drag: orbit · Scroll: zoom · Hover a tile for details</span>
    </div>

    <!-- LEFT sidebar: resources catalogue (always visible, left-most). -->
    <aside class="panel panel-resources">
      <h2>Resources</h2>
      <ResourceControls />
    </aside>

    <!-- SHADER sidebar: shader params + feature toggles. Hidden in Hexa
         mode so the planet recentres and the user gets more viewport room. -->
    <aside class="panel panel-shader" v-if="activePane === 'shader'">
      <h2>Shader parameters</h2>
      <p v-if="autoSync" class="hint" style="margin:0 0 6px;">
        Derived from the body config. Tweaks persist until the next config change.
      </p>

      <!-- Feature toggles — caller-side rendering decisions (no longer in lib). -->
      <details class="group" v-if="canHaveCracks || canHaveLava" open>
        <summary>Features</summary>
        <div class="group-body">
          <div v-if="canHaveCracks" class="row" style="grid-template-columns: 110px 1fr auto;">
            <label>Cracks</label>
            <span></span>
            <input
              type="checkbox"
              :checked="bodyConfig.hasCracks ?? false"
              @change="setBody('hasCracks', ($event.target as HTMLInputElement).checked)"
            />
          </div>
          <div v-if="canHaveLava" class="row" style="grid-template-columns: 110px 1fr auto;">
            <label>Lava</label>
            <span></span>
            <input
              type="checkbox"
              :checked="bodyConfig.hasLava ?? false"
              @change="setBody('hasLava', ($event.target as HTMLInputElement).checked)"
            />
          </div>
        </div>
      </details>

      <ShaderControls :type="bodyType" :values="shaderParams" :hidden-groups="hiddenShaderGroups" @update="onShaderUpdate" />
    </aside>

    <!-- Centre viewport: one pane at a time, swapped via the floating
         overlay toggle. Both stay mounted (v-show) so the hex body keeps
         its dig state and the shader preview keeps its camera between
         toggles. -->
    <div class="view-stack">
      <PaneToggles />
      <ShaderPane
        v-show="activePane === 'shader'"
        :type="bodyType"
        :params="shaderParams"
        :config="bodyConfig"
        :tile-size="tileSize"
        :rebuild-key="rebuildKey"
        :active="activePane === 'shader'"
      />
      <HexaPane
        v-show="activePane === 'hexa'"
        :config="bodyConfig"
        :tile-size="tileSize"
        :rebuild-key="rebuildKey"
        :active="activePane === 'hexa'"
      />
    </div>

    <!-- RIGHT sidebar: body params -->
    <aside class="panel panel-body">
      <div v-if="warning" class="warn">{{ warning }}</div>
      <h2>Body parameters</h2>
      <DigControls />
      <BodyControls :config="bodyConfig" />
    </aside>
  </div>
</template>
