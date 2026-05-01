<script setup>
import NeighborsBfsDemo    from '../../.vitepress/theme/demos/NeighborsBfsDemo.vue'
import NeighborsBfsDemoRaw from '../../.vitepress/theme/demos/NeighborsBfsDemo.vue?raw'
import NeighborsBfsVueRaw  from '../../.vitepress/theme/demos/NeighborsBfsVue.vue?raw'

const tabs = [
  { label: 'Three.js', code: NeighborsBfsDemoRaw, lang: 'vue' },
  { label: 'Vue',      code: NeighborsBfsVueRaw,  lang: 'vue' },
]
</script>

# Voisinage & BFS

Chaque tuile hex a **6 voisins** (sauf les 12 pentagones, qui en ont 5). `buildNeighborMap` retourne un graphe `Map<id, id[]>` que vous pouvez parcourir librement.

<ClientOnly>
  <DemoBlock :tabs="tabs">
    <NeighborsBfsDemo />
  </DemoBlock>
</ClientOnly>

Cliquez une tuile pour relancer un BFS coloré depuis ce point. Chaque anneau de voisins prend une teinte différente.

## API

```ts
import { buildNeighborMap, getNeighbors } from '@cedric-pouilleux/stellex-js/sim'

const nMap = buildNeighborMap(tiles) // O(n) une fois
const six  = getNeighbors(tileId, nMap) // 5 ou 6 ids
```

`buildNeighborMap` se base sur les arêtes du Goldberg polyhedron (chaque tuile partage une arête avec exactement 5 ou 6 autres). Le graphe est **non-orienté** : `b ∈ getNeighbors(a)` ⇔ `a ∈ getNeighbors(b)`.

## BFS classique

```ts
function bfs(start: number, maxDepth: number) {
  const visited = new Map<number, number>() // id → depth
  const queue: Array<{ id: number, depth: number }> = [{ id: start, depth: 0 }]

  while (queue.length) {
    const { id, depth } = queue.shift()!
    if (visited.has(id)) continue
    visited.set(id, depth)
    if (depth >= maxDepth) continue
    for (const n of getNeighbors(id, nMap)) {
      if (!visited.has(n)) queue.push({ id: n, depth: depth + 1 })
    }
  }
  return visited
}
```

## Repeindre les tuiles

`body.tiles.sol.applyOverlay(map)` pousse des couleurs per-tile dans le buffer du mesh hex sans rebuild. Les ids absents de la map gardent leur couleur de palette :

```ts
if (body.kind === 'planet') {
  body.tiles.sol.applyOverlay(new Map([
    [42, { r: 1.0, g: 0.33, b: 0.40 }],
  ]))

  // pour effacer : repush avec la couleur de palette d'origine via `tileBaseVisual`
  const base = body.tiles.sol.tileBaseVisual(42)
  if (base) {
    body.tiles.sol.applyOverlay(new Map([
      [42, { r: base.r, g: base.g, b: base.b }],
    ]))
  }
}
```

Combiné avec un BFS, c'est tout ce qu'il faut pour visualiser une zone d'influence, un domaine, une diffusion (peste, climat, propagation de feu).

## Cas d'usage

- **Pathfinding A*** — `getNeighbors` est la fonction d'expansion.
- **Diffusion** (températures, ressources) — itérer le voisinage par tick.
- **Cluster detection** — composantes connexes via BFS.
- **UI overlays** — surligner la zone de capture d'une unité posée.
