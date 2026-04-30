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
| `body.interactive.queryHover(raycaster)` | `BoardTileRef \| null` — `{ layer: 'sol' \| 'liquid' \| 'atmo', tileId }` sous le rayon |
| `body.hover.setBoardTile(ref)`        | Dispatch hover sur le bon layer (ring + emissive + column si liquid) |
| `body.hover.useCursor(name)`          | Switch entre presets de curseur enregistrés au build |
| `body.hover.updateCursor(partial)`    | Mutation live des params (couleur, opacité, intensité) |
| `body.view.set('surface'|'atmosphere')` | Toggle terrain / vue atmosphère |
| `body.tiles.applyTileOverlay(layer, colors)` | Stamp couleurs RGB par tuile sans rebuild |
| `body.liquid.setSeaLevel(worldRadius)` | Déplace le shell liquide en runtime |
| `body.liquid.setVisible(true|false)`  | Cache/montre l'océan |

::: tip Curseur de survol
La lib gère **ring + emissive + column** automatiquement à partir du dispatch `setBoardTile`. Pour personnaliser couleur / taille / presets, voir le [guide dédié](/guides/hover-cursor).
:::

Les namespaces `view`, `liquid` et la version étendue de `tiles` (incl. `applyTileOverlay`, `updateTileSolHeight`, …) ne sont présents que sur **`PlanetBody`** (`kind: 'planet'`). Sur une étoile (`StarBody`), TS rejette directement ces accès — narrow le union avant : `if (body.kind === 'planet') { body.view.set(...) }`.

## Pattern Three.js (vanille)

```ts
const body = useBody(config, DEFAULT_TILE_SIZE, {
  // Optionnel — déclare ici les presets de curseur que tu veux activer en jeu
  hoverCursors: {
    default: { ring: { color: 0xffffff }, column: { color: 0xffffff } },
    attack:  { ring: { color: 0xff2244 }, emissive: { color: 0xff4400, intensity: 3 } },
    build:   { ring: { color: 0x00ff88 }, column: { color: 0x00ff88 } },
  },
})
scene.add(body.group)

// Activer / désactiver le mode hex
let hexOn = false
function toggleHex() {
  hexOn = !hexOn
  if (hexOn) body.interactive.activate()
  else       body.interactive.deactivate()
}

// Hover par frame — un seul appel, le dispatch est dans la lib
const raycaster = new THREE.Raycaster()
function tickHover() {
  if (!hexOn) return
  raycaster.setFromCamera(pointer, camera)
  body.hover.setBoardTile(body.interactive.queryHover(raycaster))
}

// Switch de cursor selon l'intent gameplay
function onAttackMode() { body.hover.useCursor('attack') }
function onBuildMode()  { body.hover.useCursor('build')  }

// Click pour peindre une tuile en or (sol uniquement)
function onClick() {
  if (!hexOn) return
  raycaster.setFromCamera(pointer, camera)
  const ref = body.interactive.queryHover(raycaster)
  if (ref?.layer === 'sol') {
    body.tiles.sol.writeTileColor(ref.tileId, { r: 1, g: 0.76, b: 0.29 })
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
</script>

<template>
  <TresCanvas>
    <Body
      :body="body"
      :interactive="hexMode"
      :hovered-tile-id="hoveredTileId"
    />
  </TresCanvas>
  <button @click="hexMode = !hexMode">Mode hex</button>
</template>
```

Pour le hover, vous avez besoin d'un composant utilitaire qui tourne dans `<TresCanvas>` (accès au contexte caméra/renderer) — voir `HexRaycaster.vue` dans le repo pour une implémentation complète.

## Trois modes de vue

`body.view.set(mode)` accepte trois valeurs mutuellement exclusives :

| Mode | Sol mesh | Atmo board | Smooth sphere | Atmo halo | Cas d'usage |
| ---- | -------- | ---------- | ------------- | --------- | ----------- |
| `'surface'` | **visible** (cliquable) | masqué | masqué | masqué | Vue gameplay sol — relief + liquide cliquables |
| `'atmosphere'` | masqué | **visible** (cliquable) | visible (fallback) | masqué | Vue gameplay atmo — pollution, météo, secteurs d'air |
| `'shader'` | masqué | masqué | **visible** | superposé selon `atmosphereOpacity` | Vue d'ensemble — système solaire, scrolling multi-corps |

Le mode `'shader'` est **non-interactif** (`queryHover` retourne `null`) — c'est ce qui permet de garder un corps lointain en mode draw-call minimal sans BVH ni mesh hex. Le passer en `'shader'` est l'optimisation principale pour les vues système avec beaucoup de corps.

```ts
// Vue système — tout le monde en shader
for (const body of allBodies) {
  if (body.kind === 'planet') body.view.set('shader')
}

// Focus sur un corps — passe en surface, active le hex
focusBody.view.set('surface')
focusBody.interactive.activate()
```

### Vue atmosphère — détail

Ce que fait `body.view.set('atmosphere')` côté lib :

1. Cache le mesh sol (les prismes hexagonaux du terrain).
2. Affiche la **smooth sphere de fallback** (même shader procédural que la vue d'ensemble) au rayon de surface, juste sous le shell atmo.
3. Le noyau (`buildCoreMesh`) reste visible à `radius × coreRadiusRatio` — utile en gameplay pour visualiser jusqu'où on peut creuser.

Adapté à : visualisation de coupe géologique, vue interne pendant excavation, prévisualisation de la composition du noyau.

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
