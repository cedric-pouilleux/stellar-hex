<script setup>
import { gasGiantThreeCode } from '../../.vitepress/theme/code/gas-giant-three'
import GasGiantVue from '../../.vitepress/theme/demos/GasGiantVue.vue'
import GasGiantVueRaw from '../../.vitepress/theme/demos/GasGiantVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: gasGiantThreeCode, lang: 'ts'  },
  { label: 'Vue',      code: GasGiantVueRaw,    lang: 'vue' },
]
</script>

# Géante & ses anneaux

Recette complète : géante gazeuse à bandes + anneau procédural + ombre projetée. C'est un cas classique pour un simulateur ou une vignette de galerie.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <GasGiantVue />
  </DemoBlock>
</ClientOnly>

## Configuration

```ts
import { useBody, DEFAULT_TILE_SIZE, Body, type BodyConfig } from '@cedric-pouilleux/stellex-js'

const config: BodyConfig = {
  type:           'planetary',
  surfaceLook:    'bands',
  name:           'Jovian',
  radius:          1.4,
  rotationSpeed:   0.003,
  axialTilt:       0.18,
  // bandColors:    {…} optionnel — couleurs Jupiter-like
  hasRings:       true,
}

const body = useBody(config, DEFAULT_TILE_SIZE)
```

## Branchement Vue + TresJS

```vue
<TresCanvas :clear-color="'#08080f'">
  <TresPerspectiveCamera :position="[0, 1.2, 6.5]" />
  <TresAmbientLight :intensity="0.2" />
  <TresDirectionalLight :position="[6, 0.5, 0]" :intensity="2.5" />
  <Body :body="body" :preview-mode="true" />
</TresCanvas>
```

C'est tout. `<Body>` détecte que `body.variation.rings` est défini, mount `<BodyRings>`, et la lib injecte les uniforms d'ombre dans les deux sens (cf. [Ombres planète ↔ anneaux](/examples/rings/shadows)).

## Personnaliser les bandes

```ts
const config: BodyConfig = {
  type: 'planetary',
  surfaceLook: 'bands',
  name: 'Saturnian',
  // ...
  bandColors: {
    colorA: '#e8c98c',  // bande pâle dominante
    colorB: '#a07033',  // bande sombre
    colorC: '#d4a060',  // accent
    colorD: '#7a4f24',  // secondaire
  },
}
```

`buildGasPalette` distribue automatiquement les bandes en zones et fuseaux ; le seed donne une variation déterministe (différente entre Saturne et Jupiter rien qu'en changeant le `name`).

## Forcer un archétype d'anneau

Cf. [Archétypes](/examples/rings/archetypes) :

```ts
import { ARCHETYPE_PROFILES } from '@cedric-pouilleux/stellex-js/core'

if (body.variation.rings) {
  body.variation.rings = {
    ...body.variation.rings,
    archetype: 'broad',
    profile:   ARCHETYPE_PROFILES.broad,
  }
}
```

À faire **avant** que `<Body>` ne mount `<BodyRings>`.
