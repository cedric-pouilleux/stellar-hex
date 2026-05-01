<script setup>
import AtmospherePlayableDemo    from '../../.vitepress/theme/demos/AtmospherePlayableDemo.vue'
import AtmospherePlayableDemoRaw from '../../.vitepress/theme/demos/AtmospherePlayableDemo.vue?raw'
import AtmospherePlayableVueRaw  from '../../.vitepress/theme/demos/AtmospherePlayableVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: AtmospherePlayableDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: AtmospherePlayableVueRaw,  lang: 'vue' },
]
</script>

# Atmosphère jouable

À côté de la coquille **visuelle** lissée par le shader (cf. [Aspect visuel](/examples/atmosphere/basic)), la lib expose une **bande atmosphérique jouable** : les hexagones de la couche atmo du `LayeredInteractiveMesh`. C'est cette bande qui apparaît quand on appelle `body.view.set('atmosphere')` en mode interactif — chaque hex est une tuile cliquable, peignable, raycastable.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <AtmospherePlayableDemo />
  </DemoBlock>
</ClientOnly>

Survol d'un hex pour son `tileId` + élévation. Clic pour le « polluer » (overlay rose stamp sur la couche atmo). Le toggle bascule entre la vue **Atmosphère** (sol caché, hex atmo visibles) et la vue **Sol** (relief visible) — les ids sont les mêmes, donc les peintures atmo restent distinctes des peintures sol.

## Deux faces du même mesh

Le mesh interactif a **deux bandes** dans la même géométrie merged :

```
                ┌──────────────┐  ← atmo band (vue 'atmosphere')
                │   prismes    │
                │   atmo       │
        ┌───────┴──────────────┴───────┐
        │   prismes sol (relief)       │  ← sol band (vue 'surface')
        └──────────────────────────────┘
                ↑ noyau (caché par défaut)
```

| Vue | `body.view.set(...)` | Visible |
| --- | -------------------- | ------- |
| **'surface'**    | hex sol affiché, atmo masqué | Le relief de tuiles, le noyau s'il y a des hex minés à elev 0 |
| **'atmosphere'** | hex sol masqué, smooth sphere fallback affichée + atmo visible | Le shell atmosphérique en bandes hex |

::: warning Sol et atmo sont deux hexaspheres distinctes
Les deux boards ont leur **propre subdivision** : un id sol `42` et un id atmo `42` ne désignent pas la même verticale. Pour relier une tuile sol à la tuile atmo « au-dessus », faites un raycast vertical caller-side, ou consommez `body.tiles.atmo.getTilePosition(id)` côté atmo et faites un nearest-neighbour sur les centres sol.
:::

## Peindre l'atmosphère

Le namespace `body.tiles.atmo` (présent uniquement quand `atmosphereThickness > 0`) expose `applyOverlay(colors)` — stamp les couleurs sur la couche atmosphérique sans toucher au sol :

```ts
if (body.kind === 'planet' && body.tiles.atmo) {
  body.tiles.atmo.applyOverlay(new Map([
    [42,  { r: 0.95, g: 0.45, b: 0.85 }],   // overlay rose
    [108, { r: 0.20, g: 0.80, b: 0.35 }],   // overlay vert
  ]))
}
```

Cas d'usage typiques :

- **Pollution / nuages toxiques** — tint des secteurs atmo pour visualiser une diffusion.
- **Couverture nuageuse statique** — peint une carte d'opacité sur l'atmosphère (la lib n'expose plus de couche de nuages procédurale séparée — le shader gaz, `buildAtmoShell` et les uniforms `cloudAmount` / `cloudColor` couvrent les autres besoins).
- **Zones contestées** — overlay de territoire affiché *au-dessus* de la planète sans masquer le sol quand on switch en vue surface.

## Raycaster atmo vs sol

`body.interactive.queryHover(raycaster)` retourne l'id du hex sous le rayon **dans la vue active**. Le contrôleur interne sélectionne automatiquement le bon raycast proxy (atmo en vue atmosphère, sol en vue surface) — pas besoin de l'aiguiller.

```ts
// En vue 'atmosphere' :
body.interactive.queryHover(raycaster)
// → tile id de l'atmosphère

body.view.set('surface')

// Même position curseur :
body.interactive.queryHover(raycaster)
// → même tile id, mais c'est maintenant le hex sol qui répond
```

C'est cette unicité d'id qui permet de coordonner facilement gameplay sol et gameplay atmo : un secteur « pollué » est le même territoire qu'on regarde par le haut ou par le bas.

## Pattern Vue / TresJS

Pour la version Vue, `<Body>` accepte `:interactive="true"` et un watch sur la vue suffit :

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'

const view = ref<'surface' | 'atmosphere'>('atmosphere')
watch(view, v => body.view.set(v))
</script>

<template>
  <Body :body="body" :interactive="true" />
  <button @click="view = view === 'atmosphere' ? 'surface' : 'atmosphere'">
    Vue : {{ view }}
  </button>
</template>
```

Le raycast/peinture nécessite un composant utilitaire dans `<TresCanvas>` — voir [`HexPlanetVue.vue`](https://github.com/cedric-pouilleux/stellar-hex/blob/main/docs/.vitepress/theme/demos/HexPlanetVue.vue) pour une référence complète avec `useTresContext`.

## Quand préférer quoi

| Besoin | Couche |
| ------ | ------ |
| Halo Rayleigh, terminateur soft | **Visuelle** (`atmosphereThickness`) |
| Couleur dérivée de la température | **Visuelle** |
| Zones cliquables, paint, hover | **Jouable** (mode interactif + vue `'atmosphere'`) |
| Exposer le noyau via excavation | Vue **'surface'** + `updateTileSolHeight` |
