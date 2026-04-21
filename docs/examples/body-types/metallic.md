<script setup>
import BodyTypeMetallicDemo    from '../../.vitepress/theme/demos/BodyTypeMetallicDemo.vue'
import BodyTypeMetallicDemoRaw from '../../.vitepress/theme/demos/BodyTypeMetallicDemo.vue?raw'
import BodyTypeMetallicVueRaw  from '../../.vitepress/theme/demos/BodyTypeMetallicVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: BodyTypeMetallicDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: BodyTypeMetallicVueRaw,  lang: 'vue' },
]
</script>

# Planète métallique

Corps à haute densité métallique avec surface PBR réflective, réseau de fissures thermiques et veines de lave incandescentese.

## Info métier

Les planètes métalliques sont composées principalement de fer et de nickel — des corps de type M dans la classification des astéroïdes. La couleur de surface est dérivée de la plage de température : basses températures → gris sidéral froid, hautes températures → teintes bleues oxydées. Les fissures (`hasCracks`) résultent de chocs thermiques violents. La lave (`hasLava`) est activée quand `temperatureMax > 150 °C` et reflète la composition minérale dominante (couleur dérivée du matériau de base chauffé à incandescence).

**Exemples réels** : astéroïdes de type M (16 Psyché), proto-planètes à fort gradient thermique.

## BodyConfig

| Prop | Type | Description |
|------|------|-------------|
| `type` | `'metallic'` | Discriminant obligatoire |
| `temperatureMin` | `number` | Température min (°C) — dérive la palette |
| `temperatureMax` | `number` | Température max (°C) — active la lave si > 150 °C |
| `hasCracks` | `boolean` | Force le réseau de fissures thermiques |
| `hasLava` | `boolean` | Force les veines de lave incandescente |
| `hasRings` | `boolean` | Ajoute un anneau visuel |
| `mass` | `number` | Masse en M⊕ |

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <BodyTypeMetallicDemo />
  </DemoBlock>
</ClientOnly>

## Paramètres shader

### Surface

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `noiseFreq` | 0.5 – 2.0 | 1.0 | Fréquence du bruit de surface |
| `metalness` | 0 – 1 | 0.9 | Facteur PBR de métalicité |
| `roughness` | 0.50 – 1.00 | 0.65 | Rugosité PBR |

### Couleurs

| Paramètre | Type | Défaut |
|-----------|------|--------|
| `colorA` | couleur | `#1a1a20` — métal base (foncé) |
| `colorB` | couleur | `#606880` — métal accent (bleuté) |

### Fissures

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `crackAmount` | 0.50 – 1.00 | 0.50 | Densité du réseau de fissures |
| `crackScale` | 1.60 – 5.00 | 2.0 | Échelle spatiale des fissures |
| `crackWidth` | 0.10 – 0.40 | 0.15 | Largeur des fissures |
| `crackDepth` | 0.50 – 1.00 | 0.70 | Profondeur visuelle |
| `crackColor` | couleur | `#606880` | Couleur de remplissage |
| `crackBlend` | select | Mix | Mode de fusion |

### Lave

| Paramètre | Plage | Défaut | Description |
|-----------|-------|--------|-------------|
| `lavaAmount` | 0.10 – 0.50 | 0.20 | Quantité de lave dans les veines |
| `lavaScale` | 0.30 – 1.00 | 0.60 | Largeur des canaux de lave |
| `lavaWidth` | 0.02 – 0.30 | 0.08 | Finesse des filaments de lave |
| `lavaColor` | couleur | `#ff6600` | Couleur incandescente |
| `lavaEmissive` | 0.80 – 2.80 | 1.5 | Intensité d'émission |
