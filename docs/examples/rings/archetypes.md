<script setup>
import RingArchetypesDemo    from '../../.vitepress/theme/demos/RingArchetypesDemo.vue'
import RingArchetypesDemoRaw from '../../.vitepress/theme/demos/RingArchetypesDemo.vue?raw'
import RingArchetypesVueRaw  from '../../.vitepress/theme/demos/RingArchetypesVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: RingArchetypesDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: RingArchetypesVueRaw,  lang: 'vue' },
]
</script>

# Archétypes d'anneaux

`RING_ARCHETYPES` liste **12 formes** prédéfinies. Chaque archétype a un profil radial fixe (8 samples d'opacité) que le shader interpole + jitter au build pour produire des centaines de variations.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <RingArchetypesDemo />
  </DemoBlock>
</ClientOnly>

## Catalogue

| Archétype     | Forme |
| ------------- | ----- |
| `broad`       | Large enveloppe type Saturne |
| `double`      | Deux bandes brillantes, gap sombre central |
| `narrow`      | Une seule bande brillante avec épaules douces |
| `dusty`       | Halo nébulaire diffus |
| `triple`      | Trois bandes brillantes |
| `outer`       | Bord extérieur lumineux, intérieur faible |
| `shepherd`    | Pic très fin (style Uranus) |
| `quadruple`   | Quatre bandes alternées |
| `skewedIn`    | Brillant à l'intérieur, fade vers l'extérieur |
| `skewedOut`   | Faible à l'intérieur, brillant vers l'extérieur |
| `dense`       | Bande quasi-uniforme pleine |
| `sparse`      | Pics épars irréguliers |

## Forcer un archétype

Le seed pousse un archétype par défaut, mais vous pouvez l'override :

```ts
import { ARCHETYPE_PROFILES } from '@cedric-pouilleux/stellex-js/core'

const body = useBody(config, DEFAULT_TILE_SIZE)

if (body.variation.rings) {
  body.variation.rings = {
    ...body.variation.rings,
    archetype: 'shepherd',
    profile:   ARCHETYPE_PROFILES.shepherd,
  }
}
// puis seulement après cette mutation : <Body :body="body" /> ou buildBodyRings(...)
```

L'override doit être fait **avant** que `<Body>` ne mount le ring (i.e. dans le même tick que `useBody`).

## Profil radial

Chaque archétype expose `Profile8` — un tuple de 8 floats `[0..1]` interpolés du bord intérieur (`t=0`) au bord extérieur (`t=1`) :

```ts
import { ARCHETYPE_PROFILES } from '@cedric-pouilleux/stellex-js/core'

ARCHETYPE_PROFILES.broad
// [0.05, 0.45, 0.85, 0.95, 0.95, 0.85, 0.5, 0.1]

ARCHETYPE_PROFILES.shepherd
// [0.0, 0.0, 0.05, 0.95, 0.95, 0.05, 0.0, 0.0]
```

Pour une forme custom, il suffit de fournir un tuple de 8 floats à la place de `profile` :

```ts
body.variation.rings.profile = [0.0, 0.2, 0.6, 0.9, 0.9, 0.6, 0.2, 0.0]
```
