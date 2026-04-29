<script setup lang="ts">
import { computed } from 'vue'
import type { LibBodyType, SpectralType } from '@lib'
import type { PlaygroundBodyConfig } from '../lib/state'
import {
  DEFAULT_CORE_RADIUS_RATIO,
  DEFAULT_TERRAIN_LOW_COLOR,
  DEFAULT_TERRAIN_HIGH_COLOR,
} from '@lib'
import { BODY_TYPE_CHIPS } from '../lib/paramLabels'
import {
  tileSize,
  bodyType, configFromUiMode,
} from '../lib/state'
import {
  TERRAIN_PRESETS,
  applyTerrainPreset,
  findMatchingPreset,
  getTerrainPreset,
  type TerrainPresetId,
} from '../lib/terrainPresets'
import RingControls from './RingControls.vue'
import TemperatureControls from './TemperatureControls.vue'
import LiquidControls from './LiquidControls.vue'

/** Hex string for the lib-provided default low-terrain colour. */
const DEFAULT_LOW_HEX  = `#${DEFAULT_TERRAIN_LOW_COLOR.getHexString()}`
/** Hex string for the lib-provided default high-terrain colour. */
const DEFAULT_HIGH_HEX = `#${DEFAULT_TERRAIN_HIGH_COLOR.getHexString()}`

/**
 * Coerces a `THREE.ColorRepresentation` override to a `#rrggbb` string suitable
 * for the native `<input type="color">` control. Falls back to the provided
 * default when the override is absent or unparseable.
 */
function toHex(value: unknown, fallback: string): string {
  if (value == null) return fallback
  if (typeof value === 'string') return value.startsWith('#') ? value : `#${value}`
  if (typeof value === 'number') return `#${value.toString(16).padStart(6, '0')}`
  return fallback
}

const props = defineProps<{ config: PlaygroundBodyConfig }>()

/** Whether a field is meaningful for the current body type. */
const isStar         = computed(() => props.config.type === 'star')
const isPlanet       = computed(() => props.config.type !== 'star')
const isTerrainLook  = computed(() => isPlanet.value && (props.config.surfaceLook ?? 'terrain') === 'terrain')
/**
 * `true` when the body is configured with an atmosphere (positive
 * thickness). Mirrors `hasAtmosphere(config)` exposed by the lib — the
 * single switch driving the visible halo, the playable atmo layer and
 * the matching UI panels.
 */
const atmoEnabled    = computed(() => isPlanet.value && (props.config.atmosphereThickness ?? 0) > 0)

/**
 * Whether the user is allowed to toggle the atmosphere off. Gas-like
 * bodies (`surfaceLook === 'bands'`) ARE their atmosphere — the smooth
 * sphere itself plays the role of the gas envelope. Disabling the atmo
 * leaves the body in a degenerate state (hollow shell with collapsed
 * prisms), so the toggle is hidden for that look. The user can still
 * tweak `Atmo thickness` once the slider is exposed (always-on for bands).
 */
const canToggleAtmo  = computed(() => isPlanet.value && (props.config.surfaceLook ?? 'terrain') !== 'bands')

/**
 * Toggle handler — flipping ON restores the archetype defaults from
 * `configFromUiMode(bodyType)` (atmoThickness + atmoOpacity); flipping
 * OFF zeroes both fields so the lib skips every atmo-related allocation.
 */
function setAtmoEnabled(on: boolean): void {
  if (on) {
    const { atmosphereThickness, atmosphereOpacity } = configFromUiMode(bodyType.value)
    props.config.atmosphereThickness = atmosphereThickness > 0 ? atmosphereThickness : 0.20
    props.config.atmosphereOpacity   = atmosphereOpacity   > 0 ? atmosphereOpacity   : 0.45
  } else {
    props.config.atmosphereThickness = 0
    props.config.atmosphereOpacity   = 0
  }
}

const spectralTypes: SpectralType[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M']

/**
 * Terrain-noise preset currently matching the six tracked knobs on the config
 * (five fBm parameters + reliefFlatness) — or `null` when the user has tweaked
 * one slider manually and no canonical preset corresponds anymore. Drives the
 * "Personnalisé" option in the picker and the hint line below it.
 */
const activePresetId = computed<TerrainPresetId | null>(() => findMatchingPreset(props.config))

/** One-line pitch for the active preset, if any. */
const activePresetHint = computed(() => {
  const id = activePresetId.value
  return id ? getTerrainPreset(id)?.hint ?? null : null
})

function onTerrainPresetChange(evt: Event) {
  const id = (evt.target as HTMLSelectElement).value as TerrainPresetId | ''
  if (!id) return   // "Personnalisé" is a no-op — keep the current tweak.
  const preset = getTerrainPreset(id)
  if (preset) applyTerrainPreset(props.config, preset)
}

/** Hex string of the low terrain colour currently in effect (override or default). */
const lowHex  = computed(() => toHex(props.config.terrainColorLow,  DEFAULT_LOW_HEX))
/** Hex string of the high terrain colour currently in effect (override or default). */
const highHex = computed(() => toHex(props.config.terrainColorHigh, DEFAULT_HIGH_HEX))

function setLowColor(evt: Event)  { props.config.terrainColorLow  = (evt.target as HTMLInputElement).value }
function setHighColor(evt: Event) { props.config.terrainColorHigh = (evt.target as HTMLInputElement).value }
function resetLowColor()  { props.config.terrainColorLow  = undefined }
function resetHighColor() { props.config.terrainColorHigh = undefined }

function set<K extends keyof PlaygroundBodyConfig>(key: K, value: PlaygroundBodyConfig[K]) {
  ;(props.config as any)[key] = value
}

function setNum(key: keyof PlaygroundBodyConfig, evt: Event) {
  set(key as any, parseFloat((evt.target as HTMLInputElement).value) as any)
}

/**
 * Effective sol surface radius in world units — derived from
 * `Planet radius × (1 - atmosphereThickness)`. Exposes the sol surface
 * directly so the user reads world units (alongside `Planet radius`)
 * rather than an abstract atmospheric fraction. Bidirectional: writing
 * it back computes the matching `atmosphereThickness` at constant
 * silhouette and stores it on the config.
 */
const solRadius = computed(() => {
  const atmoFraction = Math.max(0, Math.min(1, props.config.atmosphereThickness ?? 0))
  return props.config.radius * (1 - atmoFraction)
})

/**
 * Allowed range for the `Sol radius` slider. The minimum keeps a non-
 * collapsed sol band (`MIN_SOL_BAND_FRACTION = 5%` of `Planet radius`);
 * the maximum is `Planet radius` itself (atmospheric thickness = 0).
 */
const solRadiusMin = computed(() => props.config.radius * 0.05)
const solRadiusMax = computed(() => props.config.radius)

function setSolRadius(evt: Event): void {
  const next = parseFloat((evt.target as HTMLInputElement).value)
  if (!Number.isFinite(next)) return
  const clamped = Math.max(solRadiusMin.value, Math.min(solRadiusMax.value, next))
  const atmoFraction = 1 - clamped / props.config.radius
  set('atmosphereThickness', Math.max(0, Math.min(1, atmoFraction)) as never)
}
function setInt(key: keyof PlaygroundBodyConfig, evt: Event) {
  set(key as any, parseInt((evt.target as HTMLInputElement).value) as any)
}

/**
 * Switch the active archetype. Mutates the shared `bodyType` ref + config
 * fields driven by `configFromUiMode` (type, surfaceLook + atmosphere
 * defaults so the silhouette and halo land at sane values for the new
 * archetype). Resync and rebuild are picked up by the deep watcher and
 * the `bodyConfig.type` watcher in `App.vue` — no explicit calls needed.
 */
function setType(t: LibBodyType): void {
  if (bodyType.value === t) return
  bodyType.value = t
  const { type, surfaceLook, atmosphereThickness, atmosphereOpacity } = configFromUiMode(t)
  set('type', type as never)
  set('surfaceLook', surfaceLook as never)
  set('atmosphereThickness', atmosphereThickness as never)
  set('atmosphereOpacity', atmosphereOpacity as never)
}
</script>

<template>
  <details class="group">
    <summary>Type</summary>
    <div class="group-body">
      <div class="type-switch">
        <button
          v-for="t in BODY_TYPE_CHIPS" :key="t.id"
          type="button"
          :class="{ active: bodyType === t.id }"
          @click="setType(t.id)"
        >{{ t.icon }} {{ t.label }}</button>
      </div>
    </div>
  </details>

  <details class="group">
    <summary>Identity</summary>
    <div class="group-body">
      <div class="row" style="grid-template-columns: 110px 1fr;">
        <label>Name (seed)</label>
        <input type="text" :value="config.name" @change="set('name', ($event.target as HTMLInputElement).value)" />
      </div>
      <p class="hint">The name is the deterministic seed driving noise, variation and resource distribution.</p>
    </div>
  </details>

  <details class="group">
    <summary>Geometry ground</summary>
    <div class="group-body">
      <div class="row">
        <label>{{ isStar ? 'Radius' : 'Planet radius' }}</label>
        <input type="range" min="0.5" max="8" step="0.1" :value="config.radius" @input="setNum('radius', $event)" />
        <span class="val">{{ config.radius.toFixed(1) }}</span>
      </div>
      <div class="row" v-if="isPlanet && atmoEnabled">
        <label>Sol radius</label>
        <input
          type="range"
          :min="solRadiusMin" :max="solRadiusMax" step="0.05"
          :value="solRadius"
          @input="setSolRadius"
        />
        <span class="val">{{ solRadius.toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Tile size</label>
        <input type="range" min="0.05" max="0.5" step="0.01" :value="tileSize" @input="tileSize = parseFloat(($event.target as HTMLInputElement).value)" />
        <span class="val">{{ tileSize.toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Axial tilt</label>
        <input type="range" min="0" max="1.57" step="0.01" :value="config.axialTilt" @input="setNum('axialTilt', $event)" />
        <span class="val">{{ config.axialTilt.toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Rotation speed</label>
        <input type="range" min="0" max="0.2" step="0.001" :value="config.rotationSpeed" @input="setNum('rotationSpeed', $event)" />
        <span class="val">{{ config.rotationSpeed.toFixed(3) }}</span>
      </div>
    </div>
  </details>

  <details class="group" v-if="!isStar">
    <summary>Geometry core</summary>
    <div class="group-body">
      <div class="row">
        <label>Core ratio</label>
        <input
          type="range" min="0.1" max="0.9" step="0.01"
          :value="config.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO"
          @input="setNum('coreRadiusRatio', $event)"
        />
        <span class="val">{{ (config.coreRadiusRatio ?? DEFAULT_CORE_RADIUS_RATIO).toFixed(2) }}</span>
      </div>
    </div>
  </details>

  <details class="group" v-if="isPlanet">
    <summary>Geometry atmosphere</summary>
    <div class="group-body">
      <div class="row" v-if="canToggleAtmo" style="grid-template-columns: 110px 1fr auto;">
        <label>Atmosphère</label>
        <span></span>
        <input
          type="checkbox"
          :checked="atmoEnabled"
          @change="setAtmoEnabled(($event.target as HTMLInputElement).checked)"
        />
      </div>
      <p v-if="atmoEnabled" class="hint">
        <code>Planet radius</code> reste constant : l'atmosphère occupe
        l'espace entre <code>Sol radius</code> et <code>Planet radius</code>.
        Augmenter <code>Sol radius</code> réduit l'épaisseur d'atmo à
        silhouette constante. Décocher <em>Atmosphère</em> retire
        intégralement le halo et la couche jouable. La couleur du halo
        se règle dans <em>Shader parameters → Halo</em>.
      </p>
    </div>
  </details>

  <details class="group" v-if="isPlanet">
    <summary>Climate</summary>
    <div class="group-body">
      <div class="row" style="grid-template-columns: 110px 1fr;">
        <label>Temperature</label>
        <TemperatureControls :config="config" />
      </div>
      <div class="row">
        <label>Mass (M⊕)</label>
        <input type="range" min="0.01" max="50" step="0.01" :value="config.mass ?? 1" @input="setNum('mass', $event)" />
        <span class="val">{{ (config.mass ?? 1).toFixed(2) }}</span>
      </div>
    </div>
  </details>

  <details class="group" v-if="isPlanet">
    <summary>Liquid</summary>
    <LiquidControls :config="config" />
  </details>

  <details class="group" v-if="isTerrainLook">
    <summary>Terrain colour</summary>
    <div class="group-body">
      <div class="row" style="grid-template-columns: 110px 1fr auto auto;">
        <label>Low</label>
        <input type="color" :value="lowHex" @input="setLowColor" />
        <span class="val" style="font-family: monospace;">{{ lowHex }}</span>
        <button
          type="button"
          class="pill"
          style="border:0; cursor:pointer; font-size:10px;"
          :disabled="config.terrainColorLow === undefined"
          @click="resetLowColor"
        >Reset</button>
      </div>
      <div class="row" style="grid-template-columns: 110px 1fr auto auto;">
        <label>High</label>
        <input type="color" :value="highHex" @input="setHighColor" />
        <span class="val" style="font-family: monospace;">{{ highHex }}</span>
        <button
          type="button"
          class="pill"
          style="border:0; cursor:pointer; font-size:10px;"
          :disabled="config.terrainColorHigh === undefined"
          @click="resetHighColor"
        >Reset</button>
      </div>
      <p class="hint">
        Rampe linéaire appliquée à la palette rocky par défaut : `Low` à l'élévation 1, `High` au sommet.
        Reset rétablit le défaut lib (noir → blanc). Ignoré si un `BodyRenderOptions.palette` est fourni au render factory.
      </p>
    </div>
  </details>

  <details class="group" v-if="isStar">
    <summary>Spectral</summary>
    <div class="group-body">
      <div class="row">
        <label>Spectral type</label>
        <select :value="config.spectralType ?? 'G'" @change="set('spectralType', ($event.target as HTMLSelectElement).value as SpectralType)">
          <option v-for="s in spectralTypes" :key="s" :value="s">{{ s }}</option>
        </select>
        <span></span>
      </div>
    </div>
  </details>

  <details class="group" v-if="!isStar">
    <summary>Terrain noise</summary>
    <div class="group-body">
      <div class="row">
        <label>Preset</label>
        <select :value="activePresetId ?? ''" @change="onTerrainPresetChange">
          <option value="">Personnalisé</option>
          <option v-for="p in TERRAIN_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
        <span></span>
      </div>
      <p v-if="activePresetHint" class="hint">{{ activePresetHint }}</p>
      <div class="row">
        <label>Scale (freq)</label>
        <input type="range" min="0.1" max="8" step="0.1" :value="config.noiseScale ?? 1.4" @input="setNum('noiseScale', $event)" />
        <span class="val">{{ (config.noiseScale ?? 1.4).toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Octaves</label>
        <input type="range" min="1" max="8" step="1" :value="config.noiseOctaves ?? 1" @input="setInt('noiseOctaves', $event)" />
        <span class="val">{{ config.noiseOctaves ?? 1 }}</span>
      </div>
      <div class="row">
        <label>Persistence</label>
        <input type="range" min="0" max="1" step="0.01" :value="config.noisePersistence ?? 0.5" @input="setNum('noisePersistence', $event)" />
        <span class="val">{{ (config.noisePersistence ?? 0.5).toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Lacunarity</label>
        <input type="range" min="1" max="4" step="0.05" :value="config.noiseLacunarity ?? 2" @input="setNum('noiseLacunarity', $event)" />
        <span class="val">{{ (config.noiseLacunarity ?? 2).toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Power</label>
        <input type="range" min="0.2" max="4" step="0.05" :value="config.noisePower ?? 1" @input="setNum('noisePower', $event)" />
        <span class="val">{{ (config.noisePower ?? 1).toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Ridge</label>
        <input type="range" min="0" max="1" step="0.01" :value="config.noiseRidge ?? 0" @input="setNum('noiseRidge', $event)" />
        <span class="val">{{ (config.noiseRidge ?? 0).toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Flatness</label>
        <input type="range" min="0" max="1" step="0.01" :value="config.reliefFlatness ?? 0" @input="setNum('reliefFlatness', $event)" />
        <span class="val">{{ (config.reliefFlatness ?? 0).toFixed(2) }}</span>
      </div>
      <p class="hint">
        Aplatit le relief visible tout en conservant la shell d'extraction complète (N bandes) — idéal pour des planètes plates à gros noyau.
      </p>
      <div class="row">
        <label>Continents</label>
        <input type="range" min="0" max="1" step="0.01" :value="config.continentAmount ?? 0" @input="setNum('continentAmount', $event)" />
        <span class="val">{{ (config.continentAmount ?? 0).toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Échelle continents</label>
        <input type="range" min="1" max="3" step="0.05" :value="config.continentScale ?? 1" @input="setNum('continentScale', $event)" />
        <span class="val">{{ (config.continentScale ?? 1).toFixed(2) }}</span>
      </div>
      <p class="hint">
        Ajoute un voronoï basse fréquence sur l'élévation : <code>0</code> = comportement classique (moiré d'îles),
        <code>0.5–1</code> produit des masses terrestres discrètes (Pangée / archipels). L'échelle pilote le nombre de continents.
      </p>
    </div>
  </details>

  <details class="group" v-if="isPlanet">
    <summary>Rings</summary>
    <div class="group-body">
      <div class="row" style="grid-template-columns: 110px 1fr auto;">
        <label>Enabled</label>
        <span></span>
        <input type="checkbox" :checked="config.hasRings ?? false" @change="set('hasRings', ($event.target as HTMLInputElement).checked)" />
      </div>
    </div>
    <RingControls v-if="config.hasRings" />
  </details>
</template>

