<script setup>
import BodyTypeRockyDemo    from '../../.vitepress/theme/demos/BodyTypeRockyDemo.vue'
import BodyTypeRockyDemoRaw from '../../.vitepress/theme/demos/BodyTypeRockyDemo.vue?raw'
import BodyTypeRockyVueRaw  from '../../.vitepress/theme/demos/BodyTypeRockyVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: BodyTypeRockyDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: BodyTypeRockyVueRaw,  lang: 'vue' },
]
</script>

# Planète rocheuse

Corps tellurique à terrain procédural FBM. La densité des cratères, les fissures et la lave sont dérivées automatiquement de la plage de température, de la couverture d'eau et de l'épaisseur atmosphérique.

## Info métier

Les planètes rocheuses sont les corps telluriques — composées principalement de silicates et de métaux ferreux. Le moteur de simulation dérive les biomes (désert, toundra, forêt, glace) depuis `temperatureMin`/`temperatureMax` et `liquidCoverage`. L'atmosphère érode les cratères et les fissures : un monde habitable (−20 °C → 50 °C) aura une surface lissée, tandis qu'un monde aride et volcanique (T > 200 °C) présentera de la lave active.

**Exemples réels** : Terre, Mars, Vénus, Mercure.

## BodyConfig

| Prop | Type | Description |
|------|------|-------------|
| `type` | `'rocky'` | Discriminant obligatoire |
| `temperatureMin` | `number` | Température min de surface (°C) |
| `temperatureMax` | `number` | Température max de surface (°C) |
| `liquidCoverage` | `number` 0–1 | Fraction de la surface couverte de liquide |
| `atmosphereThickness` | `number` 0–1 | Épaisseur de l'atmosphère — érode cratères et fissures |
| `mass` | `number` | Masse en M⊕ — influence le relief |
| `hasCracks` | `boolean` | Force l'activation du réseau de fissures |
| `hasLava` | `boolean` | Force l'activation de la lave dans les fissures |
| `hasRings` | `boolean` | Ajoute un anneau visuel |
| `palette` | `TerrainLevel[]` | Palette terrain personnalisée (override procédural) |

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <BodyTypeRockyDemo />
  </DemoBlock>
</ClientOnly>

## Paramètres shader

Groupés par section du panneau de contrôle. Tous sont mis à jour en temps réel via `planetMaterial.setParams()`.

### Terrain

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `seed` | 0 – 1000 | 42 | Graine du bruit procédural |
| `noiseFreq` | 0.5 – 2.0 | 1.0 | Fréquence du bruit FBM |
| `roughness` | 0 – 1 | 0.7 | Rugosité de la surface |
| `heightScale` | 0 – 1 | 0.6 | Amplitude du relief |
| `craterDensity` | 1.0 – 1.5 | 1.2 | Densité spatiale des cratères |
| `craterCount` | 0 – 9 | 5 | Nombre de cratères |

### Couleurs

| Paramètre | Type | Défaut |
|-----------|------|--------|
| `colorA` | couleur | `#5c3d2e` — teinte foncée |
| `colorB` | couleur | `#b08060` — teinte claire |

### Fissures

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `crackAmount` | 0.50 – 1.00 | 0.50 | Intensité du réseau de fissures |
| `crackScale` | 1.0 – 4.0 | 2.0 | Échelle spatiale des fissures |
| `crackWidth` | 0.10 – 0.50 | 0.20 | Largeur des fissures |
| `crackDepth` | 0.50 – 1.00 | 0.70 | Profondeur visuelle |
| `crackColor` | couleur | `#1a0f08` | Couleur de remplissage |
| `crackBlend` | select | Mix | Mode de fusion |

### Lave

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `lavaAmount` | 0 – 1 | 0.0 | Quantité de lave dans les fissures |
| `lavaColor` | couleur | `#ff3300` | Couleur de la lave |
| `lavaEmissive` | 0 – 3 | 1.5 | Intensité d'émission lumineuse |

### Vagues (liquide)

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `waveAmount` | 0 – 1 | 0.0 | Intensité de la couche liquide |
| `waveColor` | couleur | `#d0d8e8` | Couleur du liquide |
| `waveScale` | 0.5 – 2.5 | 1.2 | Échelle des vagues |
