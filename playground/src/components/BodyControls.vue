<script setup lang="ts">
import { computed } from 'vue'
import type { SpectralType } from '@lib'
import type { PlaygroundBodyConfig } from '../lib/state'
import {
  DEFAULT_CORE_RADIUS_RATIO,
  DEFAULT_TERRAIN_LOW_COLOR,
  DEFAULT_TERRAIN_HIGH_COLOR,
} from '@lib'
import { tileSize, coronaHeadroom, atmoTileColorMix, liquidCoronaOpacity } from '../lib/state'
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
const isRocky   = computed(() => props.config.type === 'rocky')
const isStar    = computed(() => props.config.type === 'star')
const needsTemp = computed(() => props.config.type !== 'star')
/** Rocky body with a non-`'none'` liquid surface — gates the liquid corona slider. */
const hasLiquid = computed(() => isRocky.value && (props.config.liquidState ?? 'none') !== 'none')

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
function setInt(key: keyof PlaygroundBodyConfig, evt: Event) {
  set(key as any, parseInt((evt.target as HTMLInputElement).value) as any)
}
</script>

<template>
  <details class="group" open>
    <summary>Identity</summary>
    <div class="group-body">
      <div class="row" style="grid-template-columns: 110px 1fr;">
        <label>Name (seed)</label>
        <input type="text" :value="config.name" @change="set('name', ($event.target as HTMLInputElement).value)" />
      </div>
      <p class="hint">The name is the deterministic seed driving noise, variation and resource distribution.</p>
    </div>
  </details>

  <details class="group" open>
    <summary>Geometry</summary>
    <div class="group-body">
      <div class="row">
        <label>Radius</label>
        <input type="range" min="0.5" max="8" step="0.1" :value="config.radius" @input="setNum('radius', $event)" />
        <span class="val">{{ config.radius.toFixed(1) }}</span>
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
      <div class="row" v-if="!isStar">
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

  <details class="group" v-if="isRocky" open>
    <summary>Turbulence</summary>
    <div class="group-body">
      <div class="row">
        <label>Atmo size</label>
        <input
          type="range" min="0.02" max="0.5" step="0.01"
          :value="coronaHeadroom"
          @input="coronaHeadroom = parseFloat(($event.target as HTMLInputElement).value)"
        />
        <span class="val">+{{ (coronaHeadroom * 100).toFixed(0) }}%</span>
      </div>
      <div class="row">
        <label>Atmo opacity</label>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="config.atmosphereOpacity ?? 0.55"
          @input="setNum('atmosphereOpacity', $event)"
        />
        <span class="val">{{ (config.atmosphereOpacity ?? 0.55).toFixed(2) }}</span>
      </div>
      <div class="row">
        <label>Atmo color mix</label>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="atmoTileColorMix"
          @input="atmoTileColorMix = parseFloat(($event.target as HTMLInputElement).value)"
        />
        <span class="val">{{ atmoTileColorMix.toFixed(2) }}</span>
      </div>
      <div class="row" v-if="hasLiquid">
        <label>Liquid corona</label>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="liquidCoronaOpacity"
          @input="liquidCoronaOpacity = parseFloat(($event.target as HTMLInputElement).value)"
        />
        <span class="val">{{ liquidCoronaOpacity.toFixed(2) }}</span>
      </div>
      <p class="hint">
        <code>Size</code> : rayon du halo (rebuild). <code>opacity</code> : alpha global.
        <code>color mix</code> : 0 = tint procédural, 1 = couleurs de tuiles dominantes.
        <code v-if="hasLiquid">Liquid corona</code><span v-if="hasLiquid"> : halo extérieur teinté de la couleur du liquide.</span>
      </p>
    </div>
  </details>

  <details class="group" v-if="needsTemp" open>
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

  <details class="group" v-if="isRocky" open>
    <summary>Liquid</summary>
    <LiquidControls :config="config" />
  </details>

  <details class="group" v-if="isRocky" open>
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

  <details class="group" v-if="isStar" open>
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
    </div>
  </details>

  <details class="group" open>
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

