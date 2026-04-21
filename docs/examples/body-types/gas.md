<script setup>
import BodyTypeGasDemo    from '../../.vitepress/theme/demos/BodyTypeGasDemo.vue'
import BodyTypeGasDemoRaw from '../../.vitepress/theme/demos/BodyTypeGasDemo.vue?raw'
import BodyTypeGasVueRaw  from '../../.vitepress/theme/demos/BodyTypeGasVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: BodyTypeGasDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: BodyTypeGasVueRaw,  lang: 'vue' },
]
</script>

# Géante gazeuse

Corps entièrement gazeux à bandes latitudinales procédurales. Le nombre de bandes, la turbulence et les courants-jets sont calculés depuis la vitesse de rotation et la composition atmosphérique.

## Info métier

Les géantes gazeuses sont composées principalement d'hydrogène (H₂/He) avec des traces de méthane (CH₄), d'ammoniac (NH₃) et d'eau (H₂O). La composition `gasComposition` détermine la palette de couleur : CH₄ élevé → teintes bleues (géante de glace type Neptune), NH₃ → bandes pâles jaunâtres (Jupiter). La vitesse de rotation (`rotationSpeed`) influe directement sur le nombre de bandes et la vitesse d'animation. Un noyau rocheux interne (`coreRadiusRatio`) est modélisé en simulation.

**Exemples réels** : Jupiter, Saturne, Uranus, Neptune.

## BodyConfig

| Prop | Type | Description |
|------|------|-------------|
| `type` | `'gaseous'` | Discriminant obligatoire |
| `temperatureMin` | `number` | Température min (°C) — influence la turbulence |
| `temperatureMax` | `number` | Température max (°C) |
| `rotationSpeed` | `number` | Vitesse de rotation (rad/s) — dérive le nombre de bandes |
| `gasComposition` | `object` | Fractions molaires H₂He / CH₄ / NH₃ / H₂O / sulfure |
| `coreRadiusRatio` | `number` 0–1 | Ratio noyau / rayon total (défaut 0.55) |
| `hasRings` | `boolean` | Ajoute un système d'anneaux visuel |
| `mass` | `number` | Masse en M⊕ — influence la structure des bandes |

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <BodyTypeGasDemo />
  </DemoBlock>
</ClientOnly>

## Paramètres shader

### Base

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `seed` | 0 – 1000 | 123 | Graine du bruit procédural |
| `noiseFreq` | 0.5 – 2.0 | 1.0 | Fréquence du bruit de base |

### Bandes

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `bandCount` | 2 – 24 | 8 | Nombre de bandes latitudinales |
| `bandSharpness` | 0 – 1 | 0.3 | Netteté des transitions entre bandes |
| `bandWarp` | 0 – 1 | 0.3 | Déformation sinusoïdale des bandes |
| `turbulence` | 0 – 1 | 0.5 | Turbulence générale de l'atmosphère |
| `cloudDetail` | 0 – 1 | 0.4 | Détail des masses nuageuses intra-bandes |
| `jetStream` | 0 – 1 | 0.4 | Intensité des courants-jets équatoriaux |

### Couleurs

| Paramètre | Type | Défaut |
|-----------|------|--------|
| `colorA` | couleur | `#e8c090` — bande claire |
| `colorB` | couleur | `#a05030` — bande foncée |
| `colorC` | couleur | `#d4844a` — accent/tempête |
| `colorD` | couleur | `#c8784a` — bande intermédiaire |

### Animation

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `animSpeed` | 0 – 2 | 0.3 | Vitesse d'animation des bandes |

### Nuages haute altitude

| Paramètre | Plage / Type | Défaut | Description |
|-----------|--------------|--------|-------------|
| `cloudAmount` | 0 – 1 | 0.0 | Opacité de la couche nuageuse haute |
| `cloudColor` | couleur | `#e8eaf0` | Teinte des nuages |
| `cloudBlend` | select | Mix | Mode de fusion nuages/bandes |
