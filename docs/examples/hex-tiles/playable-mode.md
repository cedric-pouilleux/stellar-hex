<script setup>
import PlayableModeDemo    from '../../.vitepress/theme/demos/PlayableModeDemo.vue'
import PlayableModeDemoRaw from '../../.vitepress/theme/demos/PlayableModeDemo.vue?raw'
import PlayableModeVueRaw  from '../../.vitepress/theme/demos/PlayableModeVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: PlayableModeDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: PlayableModeVueRaw,  lang: 'vue' },
]
</script>

# Mode jouable

La lib expose **deux modes de rendu** orthogonaux qui combinés couvrent les besoins d'une UI de jeu : la **smooth sphere** (économique, parfaite pour les vues d'ensemble) et le **mesh hex interactif** (cliquable, peignable, échelonnable). On peut basculer de l'un à l'autre à chaud, et chacun expose une **vue atmosphère** qui transparise la couche solide pour révéler le noyau.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <PlayableModeDemo />
  </DemoBlock>
</ClientOnly>

Drag pour orbiter, scroll pour zoomer. Active **« Mode hex »** pour basculer le mesh, puis survole et clique les tuiles. **« Vue atmosphère »** masque le sol pour exposer le noyau (utile pour visualiser une excavation).

## API en jeu

| Méthode | Effet |
| ------- | ----- |
| `body.interactive.activate()`         | Swap smooth → hex mesh + active raycast |
| `body.interactive.deactivate()`       | Retour au smooth mesh (le hex reste en mémoire) |
| `body.interactive.queryHover(raycaster)` | ID de la tuile sous le rayon, ou `null` |
| `body.hover.setTile(id)`              | Highlight tuile (overlay + couleur) |
| `body.hover.setPinnedTile(id)`        | Épingle persistante (popover qui suit la planète) |
| `body.view.set('surface'|'atmosphere')` | Toggle terrain / vue atmosphère |
| `body.tiles.applyTileOverlay(layer, colors)` | Stamp couleurs RGB par tuile sans rebuild |
| `body.liquid.setSeaLevel(worldRadius)` | Déplace le shell liquide en runtime (rayon monde — combiner avec `getCoreRadius()`/`getSurfaceRadius()` pour rester dans la bande) |
| `body.liquid.setVisible(true|false)`  | Cache/montre l'océan |

Les namespaces `view`, `liquid` et la version étendue de `tiles` (incl. `applyTileOverlay`, `updateTileSolHeight`, …) ne sont présents que sur **`PlanetBody`** (`kind: 'planet'`). Sur une étoile (`StarBody`), TS rejette directement ces accès — narrow le union avant : `if (body.kind === 'planet') { body.view.set(...) }`.

## Pattern Three.js (vanille)

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)
scene.add(body.group)

// Activer / désactiver le mode hex
let hexOn = false
function toggleHex() {
  hexOn = !hexOn
  if (hexOn) body.interactive.activate()
  else       body.interactive.deactivate()
}

// Hover par frame
const raycaster = new THREE.Raycaster()
function tickHover() {
  if (!hexOn) return
  raycaster.setFromCamera(pointer, camera)
  const id = body.interactive.queryHover(raycaster)
  body.hover.setTile(id) // null désactive le highlight
}

// Click pour peindre une tuile en or
function onClick() {
  if (!hexOn) return
  raycaster.setFromCamera(pointer, camera)
  const id = body.interactive.queryHover(raycaster)
  if (id != null) {
    body.tiles.applyTileOverlay('sol', new Map([[id, new THREE.Color('#ffc34a')]]))
  }
}

// Vue atmosphère
function showAtmosphereView() {
  body.view.set('atmosphere')  // sol caché, smooth sphere de fallback affichée
}
```

## Pattern Vue / TresJS

`<Body>` accepte des props **réactives** qui pilotent toute l'interactivité. Pas besoin d'appels impératifs depuis le composant parent — bind un ref et changez sa valeur :

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { useBody, DEFAULT_TILE_SIZE, Body } from '@cedric-pouilleux/stellar-hex'

const body          = useBody(config, DEFAULT_TILE_SIZE)
const hexMode       = ref(false)
const hoveredTileId = ref<number | null>(null)
const pinnedTileId  = ref<number | null>(null)
</script>

<template>
  <TresCanvas>
    <Body
      :body="body"
      :interactive="hexMode"
      :hovered-tile-id="hoveredTileId"
      :pinned-tile-id="pinnedTileId"
    />
  </TresCanvas>
  <button @click="hexMode = !hexMode">Mode hex</button>
</template>
```

Pour le hover, vous avez besoin d'un composant utilitaire qui tourne dans `<TresCanvas>` (accès au contexte caméra/renderer) — voir `HexRaycaster.vue` dans le repo pour une implémentation complète.

## Vue atmosphère vs vue surface

Ce que fait `body.view.set('atmosphere')` côté lib :

1. Cache le mesh sol (les prismes hexagonaux du terrain).
2. Affiche la **smooth sphere de fallback** (même shader procédural que la vue d'ensemble) au rayon de surface, juste sous le shell atmo.
3. Le noyau (`buildCoreMesh`) reste visible à `radius × coreRadiusRatio` — utile en gameplay pour visualiser jusqu'où on peut creuser.

C'est le mode adapté à : visualisation de coupe géologique, vue interne pendant excavation, prévisualisation de la composition du noyau.

## Lien avec la simulation

Le mode jouable n'invente rien — toutes les valeurs viennent de `body.sim` qui est calculé une seule fois au build :

```ts
const state = body.sim.tileStates.get(tileId)
state.elevation              // 0 à N-1 (bandes entières)
body.sim.seaLevelElevation   // bande du niveau de la mer (peut être fractionnaire)
body.sim.hasLiquidSurface    // true si liquidState !== 'none'
const submerged = state.elevation < body.sim.seaLevelElevation
```

La doctrine est minimaliste : `TileState` ne contient **que** `tileId` et `elevation`. Pas de biome, pas de ressource, pas de température baked. Tout ce qui est métier (biome, dépôt minéral, label) reste dans votre catalogue applicatif et se branche par-dessus via le même `tileId`. Couplé avec `buildNeighborMap` pour le voisinage (cf. [Voisinage & BFS](/examples/hex-tiles/neighbors)), vous avez tout ce qu'il faut pour : pathfinding, diffusion, score d'habitabilité, peinture de zone d'influence.

## Performance

Le mesh hex n'est construit qu'au **premier** appel à `activate()` (lazy). Une fois en mémoire, `activate`/`deactivate` ne fait plus que swap visibility + (dés)activer le raycast. Pour 5 000 tuiles standards :

- BVH (auto-construit) → raycast en `O(log n)` (~0.1 ms par hover sur CPU mobile).
- `applyTileOverlay` mute le buffer de couleur sans recompiler les shaders.
- `body.view.set('atmosphere')` ne réalloue rien — juste un toggle de visibility.

Pour des centaines de planètes en système, gardez le mode hex désactivé sur les corps non-focus (cf. [Performance](/guides/performance)).
