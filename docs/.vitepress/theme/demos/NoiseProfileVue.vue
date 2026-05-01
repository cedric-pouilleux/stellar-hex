<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'
import type { BodyConfig } from '@cedric-pouilleux/stellar-hex/sim'
import OrbitControlsBridge from './OrbitControlsBridge.vue'

/**
 * Vue / TresJS — corps avec un profil de bruit hybride (ridge 0.5, 4 octaves).
 *
 * Pour comparer un autre profil, modifie le bloc `noise*` dans `config` —
 * tout le reste de la lib reste insensible au choix.
 */

const config: BodyConfig = {
  type:                'planetary',
  surfaceLook:         'terrain',
  name:                'gaia',
  radius:               1,
  rotationSpeed:        0.005,
  axialTilt:            0.3,
  // Sea level off — relief lisible jusqu'au noyau.
  liquidState:         'none',
  atmosphereThickness:  0.0,
  // ── Profil de bruit ─────────────────────────────────────
  // Hybride : `ridge` à 0.5 = plaines en dunes + sommets en crêtes.
  // Tweak `noiseRidge` (0..1) pour passer de fBm pur à crêtes pures.
  noiseRidge:           0.5,
  noiseOctaves:         4,
  noisePersistence:     0.5,
  noiseLacunarity:      2.0,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
</script>

<template>
  <TresCanvas class="vue-demo" :clear-color="'#08080f'">
    <TresPerspectiveCamera :position="[0, 0, 3.4]" />
    <TresAmbientLight :intensity="0.3" />
    <TresDirectionalLight :position="[5, 3, 4]" :intensity="2.2" />
    <OrbitControlsBridge :auto-rotate="true" />
    <Body :body="body" :preview-mode="true" />
  </TresCanvas>
</template>

<style scoped>
.vue-demo { width: 100%; height: 400px; }
</style>
