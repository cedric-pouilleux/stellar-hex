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

Corps tellurique à terrain procédural FBM. Le relief est quantifié en bandes entières par `initBodySimulation` ; les cratères, les fissures et la lave sont des couches visuelles indépendantes pilotées par les flags `hasCracks` / `hasLava` et les paramètres shader.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <BodyTypeRockyDemo />
  </DemoBlock>
</ClientOnly>

## Comportement

La lib est **agnostique du climat** : elle ne lit aucun champ de température et ne dérive ni couleur ni phase à partir d'un modèle thermique. Tout ce qui dépend du climat (couleur de surface, présence d'un océan, lave) est résolu côté caller et poussé dans `BodyConfig` :

- présence d'un océan → `liquidState !== 'none'`
- couleur du liquide → `liquidColor` (votre catalogue substance → couleur)
- couleur de surface → `terrainColorLow` / `terrainColorHigh` (ancres de la rampe)
- effets visuels → flags `hasLava` / `hasCracks` + intensités passées via `BodyVariation`

`atmosphereThickness` règle l'épaisseur radiale du shell atmo, `atmosphereOpacity` son opacité en mode shader.

## BodyConfig

| Prop | Type | Description |
|------|------|-------------|
| `type` | `'planetary'` | Discriminant obligatoire |
| `surfaceLook` | `'terrain'` | Famille de rendu — terrain hex à relief |
| `name` | `string` | Seed déterministe — même nom = même planète |
| `radius` | `number` | Rayon de la silhouette totale (sol + atmo, unités monde) |
| `liquidState` | `'liquid' \| 'frozen' \| 'none'` | État physique du liquide de surface (défaut `'none'`) |
| `liquidCoverage` | `number` 0–1 | Fraction initiale de tuiles immergées (défaut `0.5`) |
| `liquidColor` | `ColorInput` | Couleur opaque du liquide — requise si `liquidState !== 'none'` |
| `atmosphereThickness` | `number` 0–1 | Fraction radiale de `radius` occupée par l'atmo — sol = `radius × (1 - thickness)` |
| `atmosphereOpacity` | `number` 0–1 | Opacité de l'atmo en vue shader |
| `coreRadiusRatio` | `number` 0–1 | Rayon du noyau interne (override) |
| `mass` | `number` | Masse en M⊕ — métadonnée |
| `hasCracks` | `boolean` | Active le réseau de fissures |
| `hasLava` | `boolean` | Active la lave dans les bandes basses |
| `hasRings` | `boolean` | Ajoute un anneau visuel |
| `terrainColorLow` / `terrainColorHigh` | `ColorInput` | Ancres de la rampe terrain par défaut |

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
