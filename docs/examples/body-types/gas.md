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

Corps entièrement gazeux à bandes latitudinales procédurales. Pas de relief sol — la surface visible est la coquille atmosphérique.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <BodyTypeGasDemo />
  </DemoBlock>
</ClientOnly>

## BodyConfig

| Prop | Type | Description |
|------|------|-------------|
| `type` | `'gaseous'` | Discriminant obligatoire |
| `name` / `radius` | `string` / `number` | Identité + rayon de la silhouette totale (gaz couvre tout) |
| `rotationSpeed` | `number` | Vitesse de rotation (rad/s) |
| `axialTilt` | `number` | Inclinaison de l'axe (rad) |
| `atmosphereThickness` | `number` 0–1 | Fraction radiale de `radius` occupée par l'enveloppe gazeuse — défaut typique géante : `0.6` |
| `coreRadiusRatio` | `number` 0–1 | Rayon noyau / `radius` (silhouette totale) — défaut `0.55` |
| `gasMassFraction` | `number` 0–1 | Fraction massique de l'enveloppe — alternative à `coreRadiusRatio` (cf. [Noyau & coquilles](/examples/core/core-and-shells)) |
| `bandColors` | `{ colorA, colorB, colorC, colorD }` | Quatre stops de la palette de bandes (clair → foncé → accent → secondaire) |
| `hasRings` | `boolean` | Active un système d'anneaux (déterministe depuis le seed) |

## Paramètres shader

Tous mutables en runtime via `body.planetMaterial.setParams({ … })`.

### Bandes

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `bandCount` | 2 – 24 | 8 | Nombre de bandes latitudinales |
| `bandSharpness` | 0 – 1 | 0.3 | Netteté des transitions |
| `bandWarp` | 0 – 1 | 0.3 | Déformation sinusoïdale |
| `turbulence` | 0 – 1 | 0.5 | Turbulence générale |
| `cloudDetail` | 0 – 1 | 0.4 | Détail des masses nuageuses intra-bandes |
| `jetStream` | 0 – 1 | 0.4 | Intensité des courants-jets équatoriaux |

### Couleurs

| Paramètre | Type | Défaut |
|-----------|------|--------|
| `colorA` | couleur | `#e8c090` — bande claire |
| `colorB` | couleur | `#a05030` — bande foncée |
| `colorC` | couleur | `#d4844a` — accent |
| `colorD` | couleur | `#c8784a` — secondaire |

### Couche supérieure & animation

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `cloudAmount` | 0 – 1 | 0.0 | Opacité de la couche nuageuse haute |
| `cloudColor` | couleur | `#e8eaf0` | Teinte des nuages |
| `animSpeed` | 0 – 2 | 0.3 | Vitesse d'animation des bandes |
