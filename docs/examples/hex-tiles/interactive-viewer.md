<script setup>
import HexPlanetDemo    from '../../.vitepress/theme/demos/HexPlanetDemo.vue'
import HexPlanetDemoRaw from '../../.vitepress/theme/demos/HexPlanetDemo.vue?raw'
import HexPlanetVueRaw  from '../../.vitepress/theme/demos/HexPlanetVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: HexPlanetDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: HexPlanetVueRaw,  lang: 'vue' },
]
</script>

# Visualiseur interactif

Survolez les tuiles hexagonales pour lire leur `tileId` et leur élévation (bande entière `[0, N-1]`). Drag pour orbiter, scroll pour zoomer.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <HexPlanetDemo />
  </DemoBlock>
</ClientOnly>

## Pipeline raycasting

```ts
const body = useBody(config, DEFAULT_TILE_SIZE)
body.interactive.activate()   // swap smooth mesh → hex mesh
scene.add(body.group)

// par frame :
raycaster.setFromCamera(pointer, camera)
const tileId = body.interactive.queryHover(raycaster)
body.hover.setTile(tileId)

// lecture de l'état :
const state = body.sim.tileStates.get(tileId)
const h     = resolveTileHeight(config, state.elevation)
```

## Trois APIs en jeu

| API | Rôle |
| --- | ---- |
| `body.interactive.activate()`     | Active le mesh hex (sinon : sphère lisse, pas raycastable) |
| `body.interactive.queryHover(r)`  | Renvoie l'id de la tuile sous le rayon (ou `null`) |
| `body.hover.setTile(id)`          | Pose le surlignage visuel (overlay + couleur de tuile) |

Le découpage **query / set** sert à laisser le caller décider de la politique de hover (debounce, multi-hover, hover sticky, etc.).

## Coût

L'activation interactive **construit** le mesh hex et son BVH. Sur un corps standard (`tileSize=0.05`, ~5 000 tuiles), c'est ~10 ms one-shot. Une fois activé, chaque hover est en `O(log n)` grâce au BVH.

`body.interactive.deactivate()` swap retour vers la sphère lisse — le mesh hex reste en mémoire pour réactivation rapide.

## Avec Vue / TresJS

```vue
<Body
  :body="body"
  :interactive="true"
  :hovered-tile-id="hoveredTileId"
/>
<HexRaycaster :body="body" @hover="hoveredTileId = $event" />
```

`HexRaycaster` est un composant utilitaire qui consomme le contexte TresJS pour récupérer caméra et renderer, fait le raycast par frame et émet l'id survolé. Voir le code Vue de la démo pour l'implémentation complète.
